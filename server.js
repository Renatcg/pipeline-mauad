const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join("/tmp", "pipeline-leads-data") : path.join(__dirname, "data"));
const DB_PATH = path.join(DATA_DIR, "db.json");
const SEED_PATH = path.join(DATA_DIR, "seed.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const ROLES = ["Admin TI", "Head Comercial", "Supervisor Comercial", "Diretoria", "Corretor"];
const LEGACY_ODYSSEIA_STATUSES = new Set([
  "Resgatado",
  "Novo Lead",
  "Encaminhado ao Corretor",
  "Interesse Definido",
  "Simulação de Financiamento",
  "Desqualificado",
  "Arquivado (Permanentemente)",
  "Sem status"
]);
const DATABASE_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.INITIAL_ADMIN_PASSWORD || "local-dev-session-secret";
let sqlClientPromise = null;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

function buildDefaultDb() {
  if (fs.existsSync(DB_PATH)) {
    const db = migrateDb(readJson(DB_PATH));
    if (db.__dirty) {
      delete db.__dirty;
      writeDb(db);
    }
    return db;
  }
  const seed = fs.existsSync(SEED_PATH)
    ? readJson(SEED_PATH)
    : {
        roles: ROLES,
        pipelineStatuses: ["Novo Lead", "Encaminhado ao Corretor", "Interesse Definido", "Simulação de Financiamento", "Desqualificado", "Arquivado (Permanentemente)", "Sem status"],
        users: [],
        leads: [],
        integrations: {
          metaForms: { enabled: false, forms: [] },
          whatsapp: { enabled: false, provider: "", tokenSet: false },
          email: { enabled: false, sender: "", smtpHost: "" },
          proprietaryEndpoints: []
        },
        importSummary: { origin: "EMPTY", leadCount: 0, inactiveBrokerCount: 0 }
      };
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "Admin@12345";
  const now = new Date().toISOString();
  const db = {
    roles: seed.roles || ROLES,
    pipelineStatuses: [],
    users: [
      {
        id: "admin-ti",
        name: "Administrador TI",
        username: "admin",
        role: "Admin TI",
        active: true,
        passwordHash: hashPassword(adminPassword),
        createdAt: now,
        updatedAt: now
      },
      ...seed.users.map((user) => ({
        ...user,
        passwordHash: null,
        createdAt: now,
        updatedAt: now
      }))
    ],
    leads: seed.leads.map((lead) => ({
      ...lead,
      odysseiaStatus: lead.status,
      inPipeline: false
    })),
    integrations: seed.integrations,
    auditLog: [
      {
        at: now,
        actor: "system",
        action: "IMPORT_ODYSSEIA",
        details: seed.importSummary
      }
    ]
  };
  writeDb(db);
  return db;
}

async function getSql() {
  if (!DATABASE_URL) return null;
  if (!sqlClientPromise) {
    sqlClientPromise = import("@neondatabase/serverless").then(({ neon }) => neon(DATABASE_URL));
  }
  return sqlClientPromise;
}

async function ensurePostgresState() {
  const sql = await getSql();
  if (!sql) return null;
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const rows = await sql`SELECT data FROM app_state WHERE id = 'main' LIMIT 1`;
  if (rows.length) {
    const db = migrateDb(rows[0].data);
    if (db.__dirty) {
      delete db.__dirty;
      await sql`
        INSERT INTO app_state (id, data, updated_at)
        VALUES ('main', ${JSON.stringify(db)}::jsonb, now())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
    }
    return db;
  }
  const db = buildDefaultDb();
  await sql`INSERT INTO app_state (id, data) VALUES ('main', ${JSON.stringify(db)}::jsonb)`;
  return db;
}

async function loadDb() {
  if (DATABASE_URL) return ensurePostgresState();
  return buildDefaultDb();
}

async function saveDb(db) {
  if (!DATABASE_URL) {
    writeDb(db);
    return;
  }
  const sql = await getSql();
  await sql`
    INSERT INTO app_state (id, data, updated_at)
    VALUES ('main', ${JSON.stringify(db)}::jsonb, now())
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
}

function migrateDb(db) {
  let changed = false;
  if (!Array.isArray(db.auditLog)) {
    db.auditLog = [];
    changed = true;
  }
  if (!Array.isArray(db.pipelineStatuses)) {
    db.pipelineStatuses = [];
    changed = true;
  }
  const statusesInUse = new Set(db.leads.filter((lead) => lead.inPipeline).map((lead) => lead.status));
  const commercialStatuses = db.pipelineStatuses.filter((status) => !LEGACY_ODYSSEIA_STATUSES.has(status) || statusesInUse.has(status));
  if (commercialStatuses.length !== db.pipelineStatuses.length) {
    db.pipelineStatuses = commercialStatuses;
    changed = true;
  }
  for (const lead of db.leads) {
    if (!Array.isArray(lead.comments)) {
      lead.comments = [];
      changed = true;
    }
    if (!Array.isArray(lead.tags)) {
      lead.tags = [];
      changed = true;
    }
    if (lead.source === "ODYSSEIA" && lead.odysseiaStatus == null) {
      lead.odysseiaStatus = lead.status;
      changed = true;
    }
    if (lead.source !== "ODYSSEIA" && !lead.inPipeline && lead.sourceStatus == null) {
      lead.sourceStatus = lead.status;
      changed = true;
    }
    if (lead.inPipeline == null) {
      lead.inPipeline = lead.source !== "ODYSSEIA";
      changed = true;
    }
  }
  if (changed) Object.defineProperty(db, "__dirty", { value: true, enumerable: false, configurable: true });
  return db;
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, body, { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function notFound(res) {
  sendJson(res, 404, { error: "Não encontrado" });
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readSession(req) {
  const token = parseCookies(req).sid;
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.expiresAt || payload.expiresAt < Date.now()) return null;
  return payload;
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function requireAuth(req, res, db) {
  const session = readSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Login necessário" });
    return null;
  }
  const user = db.users.find((item) => item.id === session.userId && item.active);
  if (!user) {
    sendJson(res, 401, { error: "Usuário inativo" });
    return null;
  }
  return user;
}

function canManageSettings(user) {
  return user.role === "Admin TI";
}

function canManageLeads(user) {
  return ["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(user.role);
}

function visibleLeads(db, user) {
  if (user.role === "Corretor") return db.leads.filter((lead) => lead.inPipeline && lead.assignedTo === user.id);
  return db.leads;
}

function canEditLead(user, lead) {
  return canManageLeads(user) || (user.role === "Corretor" && lead.assignedTo === user.id);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function audit(db, actor, action, details) {
  db.auditLog.unshift({
    at: new Date().toISOString(),
    actor: actor.username,
    action,
    details
  });
  db.auditLog = db.auditLog.slice(0, 200);
}

function mergeImportedLeads(db, importedLeads, pipelineStatuses = []) {
  const now = new Date().toISOString();
  const existingById = new Map(db.leads.map((lead) => [lead.id, lead]));
  let created = 0;
  let updated = 0;

  for (const status of pipelineStatuses.map((item) => String(item || "").trim()).filter(Boolean)) {
    if (!db.pipelineStatuses.includes(status)) db.pipelineStatuses.push(status);
  }

  for (const item of importedLeads) {
    const id = String(item.id || "").trim();
    const name = String(item.name || "").trim();
    if (!id || !name) continue;
    const previous = existingById.get(id);
    const lead = {
      ...previous,
      ...item,
      id,
      name,
      phone: String(item.phone || previous?.phone || "").trim(),
      assistant: String(item.assistant || previous?.assistant || "").trim(),
      assignedName: String(item.assignedName || previous?.assignedName || "").trim(),
      source: String(item.source || previous?.source || "IMPORTADO").trim().toUpperCase(),
      favorite: previous?.favorite ?? Boolean(item.favorite),
      order: item.order ?? previous?.order ?? Date.now(),
      createdAt: previous?.createdAt || item.createdAt || now,
      updatedAt: now,
      inPipeline: Boolean(item.inPipeline)
    };
    if (!lead.inPipeline) {
      lead.sourceStatus = item.sourceStatus || previous?.sourceStatus || item.status || "Base";
      if (lead.source === "ODYSSEIA") lead.odysseiaStatus = lead.odysseiaStatus || lead.sourceStatus;
    }
    if (lead.inPipeline && !db.pipelineStatuses.includes(lead.status)) db.pipelineStatuses.push(lead.status);
    if (previous) {
      Object.assign(previous, lead);
      updated += 1;
    } else {
      db.leads.push(lead);
      existingById.set(id, lead);
      created += 1;
    }
  }

  return { created, updated, total: created + updated };
}

function routeStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const routedRequest = path.extname(requested) ? requested : "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, routedRequest));
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return notFound(res);
  const ext = path.extname(filePath);
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  }[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}

async function routeApi(req, res, db) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const user = db.users.find((item) => item.username === String(body.username || "").trim());
    if (!user || !user.active || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      return sendJson(res, 401, { error: "Usuário ou senha inválidos" });
    }
    const sid = signSession({ userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(res, 200, { user: publicUser(user) }, {
      "Set-Cookie": `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
    });
  }

  if (method === "POST" && url.pathname === "/api/logout") {
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  const user = requireAuth(req, res, db);
  if (!user) return;

  if (method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, {
      user: publicUser(user),
      roles: db.roles,
      pipelineStatuses: db.pipelineStatuses,
      users: db.users.map(publicUser),
      leads: visibleLeads(db, user),
      integrations: canManageSettings(user) ? db.integrations : null,
      auditLog: canManageSettings(user) ? db.auditLog.slice(0, 25) : []
    });
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && method === "PATCH") {
    const lead = db.leads.find((item) => item.id === leadMatch[1]);
    if (!lead) return notFound(res);
    if (user.role === "Corretor" && lead.assignedTo !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const detailFields = ["name", "phone", "assistant", "desiredProject", "desiredUnit", "unitValue", "notes", "tags"];
    const allowed = canManageLeads(user) && lead.inPipeline
      ? ["status", "favorite", "assignedTo", "order", ...detailFields]
      : canEditLead(user, lead) && lead.inPipeline
        ? ["favorite", ...detailFields]
      : ["favorite"];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (key === "tags") {
        lead.tags = Array.isArray(body.tags)
          ? [...new Set(body.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 12)
          : [];
      } else if (key === "assignedTo") {
        lead.assignedTo = body.assignedTo || null;
        lead.assignedName = lead.assignedTo ? db.users.find((item) => item.id === lead.assignedTo)?.name || lead.assignedName || "" : "";
      } else {
        lead[key] = body[key];
      }
    }
    lead.updatedAt = new Date().toISOString();
    audit(db, user, "UPDATE_LEAD", { leadId: lead.id, changes: body });
    await saveDb(db);
    return sendJson(res, 200, { lead });
  }

  const commentMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/comments$/);
  if (commentMatch && method === "POST") {
    const lead = db.leads.find((item) => item.id === commentMatch[1]);
    if (!lead) return notFound(res);
    if (!canEditLead(user, lead) || !lead.inPipeline) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, 400, { error: "Comentário obrigatório" });
    const comment = {
      id: `comment-${crypto.randomUUID()}`,
      text,
      createdAt: new Date().toISOString(),
      authorId: user.id,
      authorName: user.name
    };
    if (!Array.isArray(lead.comments)) lead.comments = [];
    lead.comments.unshift(comment);
    lead.updatedAt = comment.createdAt;
    audit(db, user, "COMMENT_LEAD", { leadId: lead.id });
    await saveDb(db);
    return sendJson(res, 201, { lead, comment });
  }

  const rescueMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rescue$/);
  if (rescueMatch && method === "POST") {
    if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const lead = db.leads.find((item) => item.id === rescueMatch[1]);
    if (!lead) return notFound(res);
    if (lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está no pipeline" });
    if (!db.pipelineStatuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de resgatar leads" });
    lead.inPipeline = true;
    lead.status = db.pipelineStatuses[0];
    lead.order = Date.now();
    lead.rescuedAt = new Date().toISOString();
    lead.updatedAt = lead.rescuedAt;
    audit(db, user, "RESCUE_BASE_LEAD", { leadId: lead.id, source: lead.source });
    await saveDb(db);
    return sendJson(res, 200, { lead });
  }

  if (url.pathname === "/api/users" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    if (!username || db.users.some((item) => item.username === username)) {
      return sendJson(res, 400, { error: "Usuário inválido ou já existente" });
    }
    if (!ROLES.includes(body.role)) return sendJson(res, 400, { error: "Perfil inválido" });
    const now = new Date().toISOString();
    const newUser = {
      id: `user-${crypto.randomUUID()}`,
      name: String(body.name || username).trim(),
      username,
      role: body.role,
      active: Boolean(body.active),
      passwordHash: body.password ? hashPassword(String(body.password)) : null,
      createdAt: now,
      updatedAt: now
    };
    db.users.push(newUser);
    audit(db, user, "CREATE_USER", { userId: newUser.id, role: newUser.role });
    await saveDb(db);
    return sendJson(res, 201, { user: publicUser(newUser) });
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const target = db.users.find((item) => item.id === userMatch[1]);
    if (!target) return notFound(res);
    const body = await readBody(req);
    for (const key of ["name", "role", "active"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) target[key] = body[key];
    }
    if (body.password) target.passwordHash = hashPassword(String(body.password));
    target.updatedAt = new Date().toISOString();
    audit(db, user, "UPDATE_USER", { userId: target.id, changes: { ...body, password: body.password ? "***" : undefined } });
    await saveDb(db);
    return sendJson(res, 200, { user: publicUser(target) });
  }

  if (userMatch && method === "DELETE") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const targetIndex = db.users.findIndex((item) => item.id === userMatch[1]);
    if (targetIndex < 0) return notFound(res);
    if (db.users[targetIndex].id === user.id) return sendJson(res, 400, { error: "Não é possível excluir o próprio usuário" });
    const [deleted] = db.users.splice(targetIndex, 1);
    for (const lead of db.leads) {
      if (lead.assignedTo === deleted.id) {
        lead.assignedTo = null;
        lead.assignedName = "";
      }
    }
    audit(db, user, "DELETE_USER", { userId: deleted.id });
    await saveDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === "/api/integrations" && method === "PUT") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    db.integrations = body.integrations;
    audit(db, user, "UPDATE_INTEGRATIONS", {});
    await saveDb(db);
    return sendJson(res, 200, { integrations: db.integrations });
  }

  if (url.pathname === "/api/statuses" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if (db.pipelineStatuses.includes(name)) return sendJson(res, 400, { error: "Status já existe" });
    db.pipelineStatuses.push(name);
    audit(db, user, "CREATE_STATUS", { name });
    await saveDb(db);
    return sendJson(res, 201, { pipelineStatuses: db.pipelineStatuses });
  }

  if (url.pathname === "/api/statuses/reorder" && method === "PUT") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const statuses = Array.isArray(body.statuses) ? body.statuses.map((status) => String(status).trim()).filter(Boolean) : [];
    if (statuses.length !== db.pipelineStatuses.length || new Set(statuses).size !== db.pipelineStatuses.length) {
      return sendJson(res, 400, { error: "Sequência inválida" });
    }
    for (const status of db.pipelineStatuses) {
      if (!statuses.includes(status)) return sendJson(res, 400, { error: "Sequência inválida" });
    }
    db.pipelineStatuses = statuses;
    audit(db, user, "REORDER_STATUS", { statuses });
    await saveDb(db);
    return sendJson(res, 200, { pipelineStatuses: db.pipelineStatuses });
  }

  const statusMatch = url.pathname.match(/^\/api\/statuses\/(\d+)$/);
  if (statusMatch && method === "PATCH") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = Number(statusMatch[1]);
    const oldName = db.pipelineStatuses[index];
    if (!oldName) return notFound(res);
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if (db.pipelineStatuses.some((status, idx) => status === name && idx !== index)) {
      return sendJson(res, 400, { error: "Status já existe" });
    }
    db.pipelineStatuses[index] = name;
    for (const lead of db.leads) {
      if (lead.inPipeline && lead.status === oldName) lead.status = name;
    }
    audit(db, user, "UPDATE_STATUS", { oldName, name });
    await saveDb(db);
    return sendJson(res, 200, { pipelineStatuses: db.pipelineStatuses });
  }

  if (statusMatch && method === "DELETE") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = Number(statusMatch[1]);
    const status = db.pipelineStatuses[index];
    if (!status) return notFound(res);
    if (db.leads.some((lead) => lead.inPipeline && lead.status === status)) {
      return sendJson(res, 400, { error: "Não é possível excluir status usado por leads" });
    }
    db.pipelineStatuses.splice(index, 1);
    audit(db, user, "DELETE_STATUS", { status });
    await saveDb(db);
    return sendJson(res, 200, { pipelineStatuses: db.pipelineStatuses });
  }

  if (url.pathname === "/api/admin/import-db" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    if (!body.db || !Array.isArray(body.db.users) || !Array.isArray(body.db.leads)) {
      return sendJson(res, 400, { error: "Base inválida" });
    }
    const imported = migrateDb(body.db);
    audit(imported, user, "IMPORT_DATABASE", { leads: imported.leads.length, users: imported.users.length });
    await saveDb(imported);
    return sendJson(res, 200, {
      ok: true,
      leads: imported.leads.length,
      users: imported.users.length,
      source: DATABASE_URL ? "postgres" : "file"
    });
  }

  if (url.pathname === "/api/admin/import-leads" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    if (!Array.isArray(body.leads)) return sendJson(res, 400, { error: "Lista de leads inválida" });
    const result = mergeImportedLeads(db, body.leads, Array.isArray(body.pipelineStatuses) ? body.pipelineStatuses : []);
    audit(db, user, "IMPORT_LEADS", {
      leads: result.total,
      created: result.created,
      updated: result.updated,
      sources: [...new Set(body.leads.map((lead) => lead.source).filter(Boolean))]
    });
    await saveDb(db);
    return sendJson(res, 200, {
      ok: true,
      ...result,
      statuses: db.pipelineStatuses.length,
      source: DATABASE_URL ? "postgres" : "file"
    });
  }

  notFound(res);
}

async function handleRequest(req, res) {
  if (req.url.startsWith("/api/")) {
    const db = await loadDb();
    routeApi(req, res, db).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "Erro interno" });
    });
  } else {
    routeStatic(req, res);
  }
}

if (require.main === module) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "Erro interno" });
    });
  });
  server.listen(PORT, HOST, () => {
    console.log(`Pipeline de leads disponível em http://${HOST}:${PORT}`);
    console.log("Login inicial: admin / Admin@12345");
  });
}

module.exports = handleRequest;
