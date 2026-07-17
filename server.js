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
const SESSION_TTL_MS = 1000 * 60 * 5;
const PASSWORD_SETUP_TTL_MS = 1000 * 60 * 60 * 24;
const ROLES = ["Admin TI", "Head Comercial", "Supervisor Comercial", "Diretoria", "Corretor"];
const DEFAULT_TAG_DEFINITIONS = [
  { id: "tag-quente", name: "Quente", color: "#d92d20" },
  { id: "tag-morno", name: "Morno", color: "#f79009" },
  { id: "tag-frio", name: "Frio", color: "#1570ef" },
  { id: "tag-retorno", name: "Retorno", color: "#7f56d9" },
  { id: "tag-visita", name: "Visita", color: "#039855" },
  { id: "tag-documentacao", name: "Documentação", color: "#475467" }
];
const DATABASE_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.INITIAL_ADMIN_PASSWORD || "local-dev-session-secret";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Pipeline Mauad <onboarding@resend.dev>";
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || "";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const META_DEFAULT_ASSIGNED_TO = process.env.META_DEFAULT_ASSIGNED_TO || "";
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

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    tagDefinitions: DEFAULT_TAG_DEFINITIONS,
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
    integrationLog: [],
    accessLog: [],
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

async function saveAccessLog(db) {
  if (!DATABASE_URL) {
    writeDb(db);
    return;
  }
  const sql = await getSql();
  await sql`
    UPDATE app_state
    SET data = jsonb_set(data, '{accessLog}', ${JSON.stringify(db.accessLog || [])}::jsonb, true),
        updated_at = now()
    WHERE id = 'main'
  `;
}

function migrateDb(db) {
  let changed = false;
  if (!Array.isArray(db.auditLog)) {
    db.auditLog = [];
    changed = true;
  }
  if (!Array.isArray(db.accessLog)) {
    db.accessLog = [];
    changed = true;
  }
  if (!Array.isArray(db.integrationLog)) {
    db.integrationLog = [];
    changed = true;
  }
  if (!Array.isArray(db.pipelineStatuses)) {
    db.pipelineStatuses = [];
    changed = true;
  }
  if (!Array.isArray(db.tagDefinitions)) {
    db.tagDefinitions = DEFAULT_TAG_DEFINITIONS.map((tag) => ({ ...tag }));
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
    if (!lead.favoritesByUser || typeof lead.favoritesByUser !== "object" || Array.isArray(lead.favoritesByUser)) {
      lead.favoritesByUser = {};
      changed = true;
    }
    for (const tag of lead.tags) {
      if (!db.tagDefinitions.some((item) => item.name === tag)) {
        db.tagDefinitions.push({
          id: `tag-${crypto.randomUUID()}`,
          name: tag,
          color: "#475467"
        });
        changed = true;
      }
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
  if (db.integrations?.metaForms && !Array.isArray(db.integrations.metaForms.mappings)) {
    db.integrations.metaForms.mappings = [];
    changed = true;
  }
  if (changed) Object.defineProperty(db, "__dirty", { value: true, enumerable: false, configurable: true });
  return db;
}

function cleanColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#475467";
}

function registeredTagNames(db) {
  return new Set((db.tagDefinitions || []).map((tag) => tag.name));
}

function validatePasswordPolicy(password) {
  const value = String(password || "");
  if (value.length < 8) return "A senha deve ter no mínimo 8 caracteres";
  if (!/[a-z]/.test(value)) return "A senha precisa ter uma letra minúscula";
  if (!/[A-Z]/.test(value)) return "A senha precisa ter uma letra maiúscula";
  if (!/[0-9]/.test(value)) return "A senha precisa ter um número";
  if (!/[^A-Za-z0-9]/.test(value)) return "A senha precisa ter um caractere especial";
  return "";
}

function publicBaseUrl(req) {
  const configured = String(process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (configured) return configured.startsWith("http") ? configured.replace(/\/$/, "") : `https://${configured.replace(/\/$/, "")}`;
  const protocol = req.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${req.headers.host}`;
}

function createPasswordSetup(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  user.passwordSetup = {
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_SETUP_TTL_MS).toISOString(),
    sentAt: now.toISOString()
  };
  user.passwordHash = null;
  return token;
}

function findUserByPasswordSetupToken(db, token) {
  const tokenHash = hashToken(String(token || ""));
  const now = Date.now();
  return db.users.find((item) => item.passwordSetup?.tokenHash === tokenHash && new Date(item.passwordSetup.expiresAt).getTime() > now);
}

async function sendPasswordSetupEmail(req, user, token) {
  const link = `${publicBaseUrl(req)}/definir-senha?token=${encodeURIComponent(token)}`;
  if (!RESEND_API_KEY) return { sent: false, link, reason: "RESEND_API_KEY ausente" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: user.username,
      subject: "Crie sua senha no Pipeline Comercial | Construtora Mauad",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17202a">
          <h1 style="font-size:22px">Acesso ao Pipeline Comercial</h1>
          <p>Olá, ${escapeHtml(user.name)}.</p>
          <p>Você foi cadastrado no Pipeline Comercial da Construtora Mauad. Clique no botão abaixo para criar sua senha.</p>
          <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Criar minha senha</a></p>
          <p>Este link expira em 24 horas e só pode ser usado uma vez.</p>
          <p style="font-size:12px;color:#657382">Se você não reconhece este convite, ignore este e-mail.</p>
        </div>
      `
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, link, reason: data.message || "Falha no envio do Resend" };
  return { sent: true, id: data.id };
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

function sessionCookie(userId) {
  const sid = signSession({ userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
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
  const { passwordHash, passwordSetup, ...safe } = user;
  return {
    ...safe,
    passwordConfigured: Boolean(passwordHash),
    invitePending: Boolean(passwordSetup && !passwordHash && new Date(passwordSetup.expiresAt).getTime() > Date.now()),
    inviteExpiresAt: passwordSetup?.expiresAt || null
  };
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
  res.setHeader("Set-Cookie", sessionCookie(user.id));
  return user;
}

function canManageSettings(user) {
  return user.role === "Admin TI";
}

function canManagePipelineSettings(user) {
  return ["Admin TI", "Head Comercial"].includes(user.role);
}

function canManageUsers(user) {
  return ["Admin TI", "Head Comercial"].includes(user.role);
}

function manageableRoles(user) {
  if (user.role === "Admin TI") return ROLES;
  if (user.role === "Head Comercial") return ["Supervisor Comercial", "Corretor"];
  return [];
}

function canManageLeads(user) {
  return ["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(user.role);
}

function visibleLeads(db, user) {
  if (user.role === "Corretor") {
    return db.leads.filter((lead) => lead.assignedTo === user.id || !lead.inPipeline || lead.sourceStatus || lead.odysseiaStatus);
  }
  return db.leads;
}

function canEditLead(user, lead) {
  return canManageLeads(user) || (user.role === "Corretor" && lead.assignedTo === user.id);
}

function publicLead(lead, user) {
  return {
    ...lead,
    favorite: Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite),
    favoritesByUser: undefined
  };
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readBody(req) {
  const raw = await readRawBody(req);
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

function integrationEvent(db, provider, action, details = {}) {
  db.integrationLog.unshift({
    at: new Date().toISOString(),
    provider,
    action,
    details
  });
  db.integrationLog = db.integrationLog.slice(0, 200);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
}

function access(db, actor, action, details, req) {
  db.accessLog.unshift({
    at: new Date().toISOString(),
    actor: actor.username,
    actorName: actor.name,
    role: actor.role,
    action,
    details,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 220)
  });
  db.accessLog = db.accessLog.slice(0, 500);
}

function verifyMetaSignature(req, rawBody) {
  if (!META_APP_SECRET) return { ok: false, status: 500, error: "META_APP_SECRET ausente" };
  const signature = String(req.headers["x-hub-signature-256"] || "");
  if (!signature.startsWith("sha256=")) return { ok: false, status: 401, error: "Assinatura ausente" };
  const expected = `sha256=${crypto.createHmac("sha256", META_APP_SECRET).update(rawBody).digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return { ok: false, status: 401, error: "Assinatura inválida" };
  if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return { ok: false, status: 401, error: "Assinatura inválida" };
  return { ok: true };
}

function metaFieldValue(fields, names) {
  const normalizedNames = names.map((name) => name.toLowerCase());
  const field = fields.find((item) => normalizedNames.includes(String(item.name || "").toLowerCase()));
  return String(field?.values?.[0] || "").trim();
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function normalizeMetaLeadData(data) {
  const fields = Array.isArray(data.field_data) ? data.field_data : [];
  const name = metaFieldValue(fields, ["full_name", "nome", "name", "first_name"]) || "Lead Meta";
  const phone = normalizePhone(metaFieldValue(fields, ["phone_number", "telefone", "celular", "whatsapp", "phone"]));
  const email = metaFieldValue(fields, ["email", "e-mail", "email_address"]);
  const desiredProject = metaFieldValue(fields, ["empreendimento", "empreendimento_desejado", "project", "produto"]);
  return {
    name,
    phone,
    email,
    desiredProject,
    rawFields: fields.reduce((acc, item) => {
      acc[item.name] = Array.isArray(item.values) ? item.values.join(", ") : "";
      return acc;
    }, {})
  };
}

function normalizeMetaMappingRules(integrations) {
  const rules = integrations?.metaForms?.mappings || integrations?.metaForms?.rules || [];
  return Array.isArray(rules)
    ? rules.map((rule) => ({
        type: String(rule.type || "").trim(),
        value: String(rule.value || "").trim(),
        project: String(rule.project || "").trim()
      })).filter((rule) => rule.type && rule.value && rule.project)
    : [];
}

function metaRuleMatches(rule, metaLead) {
  const value = String(rule.value || "").trim();
  const lowerValue = value.toLowerCase();
  const comparisons = {
    ad_id: metaLead.ad_id,
    form_id: metaLead.form_id,
    campaign_id: metaLead.campaign_id,
    ad_name_contains: metaLead.ad_name,
    campaign_name_contains: metaLead.campaign_name
  };
  const target = String(comparisons[rule.type] || "").trim();
  if (!target) return false;
  if (rule.type.endsWith("_contains")) return target.toLowerCase().includes(lowerValue);
  return target === value;
}

function mappedMetaProject(db, metaLead) {
  const match = normalizeMetaMappingRules(db.integrations)
    .find((rule) => metaRuleMatches(rule, metaLead));
  return match?.project || "";
}

async function fetchMetaLead(leadgenId) {
  if (!META_PAGE_ACCESS_TOKEN) throw new Error("META_PAGE_ACCESS_TOKEN ausente");
  const fields = [
    "created_time",
    "field_data",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "form_id",
    "platform",
    "is_organic"
  ].join(",");
  const endpoint = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}`);
  endpoint.searchParams.set("fields", fields);
  endpoint.searchParams.set("access_token", META_PAGE_ACCESS_TOKEN);
  const response = await fetch(endpoint);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Falha ao buscar lead na Graph API");
  }
  return data;
}

function defaultMetaAssignee(db) {
  if (!META_DEFAULT_ASSIGNED_TO) return null;
  return db.users.find((user) => user.id === META_DEFAULT_ASSIGNED_TO && user.role === "Corretor" && user.active) || null;
}

function createMetaLead(db, leadgenId, metaLead, webhookValue) {
  const externalId = `META-${leadgenId}`;
  const localId = `meta-${String(leadgenId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const existing = db.leads.find((lead) => lead.externalId === externalId || lead.metaLeadId === leadgenId || lead.id === localId);
  if (existing) return { status: "duplicate", lead: existing };
  if (!db.pipelineStatuses.length) db.pipelineStatuses.push("Novo Lead");
  const normalized = normalizeMetaLeadData(metaLead);
  const assignedUser = defaultMetaAssignee(db);
  const now = new Date().toISOString();
  const createdAt = metaLead.created_time || now;
  const lead = {
    id: localId,
    externalId,
    metaLeadId: leadgenId,
    name: normalized.name,
    phone: normalized.phone,
    email: normalized.email,
    assistant: "Meta Lead Ads",
    source: "META",
    status: db.pipelineStatuses[0],
    inPipeline: true,
    favorite: false,
    favoritesByUser: {},
    assignedTo: assignedUser?.id || null,
    assignedName: assignedUser?.name || "",
    desiredProject: mappedMetaProject(db, metaLead) || normalized.desiredProject,
    desiredUnit: "",
    unitValue: "",
    notes: "",
    tags: [],
    comments: [],
    order: Date.now(),
    createdAt,
    updatedAt: now,
    meta: {
      pageId: webhookValue.page_id || "",
      formId: metaLead.form_id || webhookValue.form_id || "",
      adId: metaLead.ad_id || webhookValue.ad_id || "",
      adName: metaLead.ad_name || "",
      adsetId: metaLead.adset_id || "",
      adsetName: metaLead.adset_name || "",
      campaignId: metaLead.campaign_id || "",
      campaignName: metaLead.campaign_name || "",
      platform: metaLead.platform || "",
      isOrganic: Boolean(metaLead.is_organic),
      rawFields: normalized.rawFields
    }
  };
  db.leads.push(lead);
  return { status: "created", lead };
}

async function processMetaWebhook(db, payload) {
  const changes = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) changes.push(change.value);
    }
  }
  const result = { received: changes.length, created: 0, duplicates: 0, errors: [] };
  for (const value of changes) {
    const leadgenId = String(value.leadgen_id || "").trim();
    try {
      const localId = `meta-${leadgenId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      const existing = db.leads.find((lead) => lead.externalId === `META-${leadgenId}` || lead.metaLeadId === leadgenId || lead.id === localId);
      if (existing) {
        result.duplicates += 1;
        integrationEvent(db, "META", "DUPLICATE_LEAD", { leadgenId });
        continue;
      }
      const metaLead = await fetchMetaLead(leadgenId);
      const created = createMetaLead(db, leadgenId, metaLead, value);
      if (created.status === "created") {
        result.created += 1;
        audit(db, { username: "meta-webhook" }, "CREATE_META_LEAD", { leadId: created.lead.id, leadgenId });
        integrationEvent(db, "META", "LEAD_IMPORTED", {
          leadId: created.lead.id,
          leadgenId,
          project: created.lead.desiredProject || "",
          adId: created.lead.meta?.adId || "",
          formId: created.lead.meta?.formId || ""
        });
        if (!created.lead.desiredProject) {
          integrationEvent(db, "META", "PROJECT_NOT_MAPPED", {
            leadId: created.lead.id,
            leadgenId,
            adId: created.lead.meta?.adId || "",
            formId: created.lead.meta?.formId || "",
            campaignId: created.lead.meta?.campaignId || "",
            adName: created.lead.meta?.adName || "",
            campaignName: created.lead.meta?.campaignName || ""
          });
        }
      } else {
        result.duplicates += 1;
        integrationEvent(db, "META", "DUPLICATE_LEAD", { leadgenId });
      }
    } catch (error) {
      result.errors.push({ leadgenId, error: error.message });
      integrationEvent(db, "META", "LEAD_ERROR", { leadgenId, error: error.message });
    }
  }
  if (!changes.length) integrationEvent(db, "META", "WEBHOOK_IGNORED", { reason: "sem leadgen" });
  return result;
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
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png"
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

  if (method === "GET" && url.pathname === "/api/webhooks/meta") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && META_VERIFY_TOKEN && token === META_VERIFY_TOKEN) {
      integrationEvent(db, "META", "WEBHOOK_VERIFIED", {});
      await saveDb(db);
      return send(res, 200, challenge || "", { "Content-Type": "text/plain; charset=utf-8" });
    }
    integrationEvent(db, "META", "WEBHOOK_VERIFY_FAILED", { mode });
    await saveDb(db);
    return send(res, 403, "Token inválido", { "Content-Type": "text/plain; charset=utf-8" });
  }

  if (method === "POST" && url.pathname === "/api/webhooks/meta") {
    const rawBody = await readRawBody(req);
    const signature = verifyMetaSignature(req, rawBody);
    if (!signature.ok) {
      integrationEvent(db, "META", "WEBHOOK_SIGNATURE_FAILED", { error: signature.error });
      await saveDb(db);
      return sendJson(res, signature.status, { error: signature.error });
    }
    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      integrationEvent(db, "META", "WEBHOOK_INVALID_JSON", {});
      await saveDb(db);
      return sendJson(res, 400, { error: "Payload inválido" });
    }
    const result = await processMetaWebhook(db, payload);
    await saveDb(db);
    return sendJson(res, result.errors.length ? 500 : 200, { ok: !result.errors.length, ...result });
  }

  if (method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const login = String(body.username || "").trim().toLowerCase();
    const user = db.users.find((item) => String(item.username || "").toLowerCase() === login);
    if (!user || !user.active) {
      return sendJson(res, 401, { error: "Usuário ou senha inválidos" });
    }
    if (!user.passwordHash) return sendJson(res, 403, { error: "Senha ainda não cadastrada. Use o link enviado por e-mail." });
    if (!verifyPassword(String(body.password || ""), user.passwordHash)) return sendJson(res, 401, { error: "Usuário ou senha inválidos" });
    access(db, user, "LOGIN", { path: "/login", view: "Login" }, req);
    await saveAccessLog(db);
    return sendJson(res, 200, { user: publicUser(user) }, {
      "Set-Cookie": sessionCookie(user.id)
    });
  }

  if (method === "POST" && url.pathname === "/api/logout") {
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (method === "POST" && url.pathname === "/api/password/setup/validate") {
    const body = await readBody(req);
    const target = findUserByPasswordSetupToken(db, body.token);
    if (!target) return sendJson(res, 400, { error: "Link inválido ou expirado" });
    return sendJson(res, 200, { user: { name: target.name, username: target.username } });
  }

  if (method === "POST" && url.pathname === "/api/password/setup") {
    const body = await readBody(req);
    const target = findUserByPasswordSetupToken(db, body.token);
    if (!target) return sendJson(res, 400, { error: "Link inválido ou expirado" });
    const password = String(body.password || "");
    if (password !== String(body.confirmPassword || "")) return sendJson(res, 400, { error: "As senhas não conferem" });
    const policyError = validatePasswordPolicy(password);
    if (policyError) return sendJson(res, 400, { error: policyError });
    target.passwordHash = hashPassword(password);
    target.passwordSetup = null;
    target.updatedAt = new Date().toISOString();
    audit(db, target, "SET_PASSWORD", { userId: target.id });
    await saveDb(db);
    return sendJson(res, 200, { ok: true });
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
      tagDefinitions: db.tagDefinitions || [],
      users: db.users.map(publicUser),
      leads: visibleLeads(db, user).map((lead) => publicLead(lead, user)),
      integrations: canManageSettings(user) ? db.integrations : null,
      integrationLog: canManageSettings(user) ? db.integrationLog.slice(0, 50) : [],
      auditLog: canManageSettings(user) ? db.auditLog.slice(0, 25) : [],
      accessLog: canManageSettings(user) ? db.accessLog.slice(0, 100) : []
    });
  }

  if (method === "POST" && url.pathname === "/api/access-log") {
    const body = await readBody(req);
    access(db, user, "VIEW", {
      path: String(body.path || "").slice(0, 160),
      view: String(body.view || "").slice(0, 80)
    }, req);
    await saveAccessLog(db);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "POST" && url.pathname === "/api/leads") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    if (!db.pipelineStatuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de adicionar leads" });
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    const requestedStatus = String(body.status || "").trim();
    const status = db.pipelineStatuses.includes(requestedStatus) ? requestedStatus : db.pipelineStatuses[0];
    const assignedUser = user.role === "Corretor"
      ? user
      : body.assignedTo
        ? db.users.find((item) => item.id === body.assignedTo && item.role === "Corretor" && item.active)
        : null;
    if (body.assignedTo && user.role !== "Corretor" && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
    const validTags = registeredTagNames(db);
    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.map((tag) => String(tag).trim()).filter((tag) => tag && validTags.has(tag)))].slice(0, 12)
      : [];
    const now = new Date().toISOString();
    const lead = {
      id: `lead-${crypto.randomUUID()}`,
      externalId: `MANUAL-${Date.now()}`,
      name,
      phone: String(body.phone || "").trim(),
      assistant: "",
      source: "MANUAL",
      status,
      inPipeline: true,
      favorite: false,
      favoritesByUser: {},
      assignedTo: assignedUser?.id || null,
      assignedName: assignedUser?.name || "",
      desiredProject: String(body.desiredProject || "").trim(),
      desiredUnit: String(body.desiredUnit || "").trim(),
      unitValue: String(body.unitValue || "").trim(),
      notes: String(body.notes || "").trim(),
      tags,
      comments: [],
      order: Date.now(),
      createdAt: now,
      updatedAt: now
    };
    db.leads.push(lead);
    audit(db, user, "CREATE_LEAD", { leadId: lead.id, source: lead.source });
    await saveDb(db);
    return sendJson(res, 201, { lead: publicLead(lead, user) });
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && method === "PATCH") {
    const lead = db.leads.find((item) => item.id === leadMatch[1]);
    if (!lead) return notFound(res);
    if (user.role === "Corretor" && lead.assignedTo !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const detailFields = ["name", "phone", "email", "assistant", "desiredProject", "desiredUnit", "unitValue", "notes", "tags"];
    const allowed = canManageLeads(user) && lead.inPipeline
      ? ["status", "favorite", "assignedTo", "order", ...detailFields]
      : canEditLead(user, lead) && lead.inPipeline
        ? ["favorite", ...detailFields]
      : ["favorite"];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (key === "tags") {
        const validTags = registeredTagNames(db);
        lead.tags = Array.isArray(body.tags)
          ? [...new Set(body.tags.map((tag) => String(tag).trim()).filter((tag) => tag && validTags.has(tag)))].slice(0, 12)
          : [];
      } else if (key === "favorite") {
        if (!lead.favoritesByUser || typeof lead.favoritesByUser !== "object") lead.favoritesByUser = {};
        lead.favoritesByUser[user.id] = Boolean(body.favorite);
        lead.favorite = Object.values(lead.favoritesByUser).some(Boolean);
      } else if (key === "assignedTo") {
        const assignedUser = body.assignedTo ? db.users.find((item) => item.id === body.assignedTo && item.role === "Corretor" && item.active) : null;
        if (body.assignedTo && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
        lead.assignedTo = assignedUser?.id || null;
        lead.assignedName = assignedUser?.name || "";
      } else {
        lead[key] = body[key];
      }
    }
    lead.updatedAt = new Date().toISOString();
    audit(db, user, "UPDATE_LEAD", { leadId: lead.id, changes: body });
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  if (leadMatch && method === "DELETE") {
    if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = db.leads.findIndex((item) => item.id === leadMatch[1]);
    if (index < 0) return notFound(res);
    const [deleted] = db.leads.splice(index, 1);
    audit(db, user, "DELETE_LEAD", { leadId: deleted.id, source: deleted.source });
    await saveDb(db);
    return sendJson(res, 200, { ok: true });
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
    return sendJson(res, 201, { lead: publicLead(lead, user), comment });
  }

  const rescueMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rescue$/);
  if (rescueMatch && method === "POST") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    const lead = db.leads.find((item) => item.id === rescueMatch[1]);
    if (!lead) return notFound(res);
    if (lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está no pipeline" });
    if (!db.pipelineStatuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de resgatar leads" });
    lead.inPipeline = true;
    lead.status = db.pipelineStatuses[0];
    if (user.role === "Corretor") {
      lead.assignedTo = user.id;
      lead.assignedName = user.name;
    }
    lead.order = Date.now();
    lead.rescuedAt = new Date().toISOString();
    lead.updatedAt = lead.rescuedAt;
    audit(db, user, "RESCUE_BASE_LEAD", { leadId: lead.id, source: lead.source });
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  const rollbackMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rollback$/);
  if (rollbackMatch && method === "POST") {
    const lead = db.leads.find((item) => item.id === rollbackMatch[1]);
    if (!lead) return notFound(res);
    if (!canManageLeads(user) && !(user.role === "Corretor" && lead.assignedTo === user.id)) return sendJson(res, 403, { error: "Sem permissão" });
    if (!lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está apenas na base" });
    lead.inPipeline = false;
    lead.status = lead.sourceStatus || lead.odysseiaStatus || "Base";
    lead.assignedTo = null;
    lead.assignedName = "";
    lead.rolledBackAt = new Date().toISOString();
    lead.updatedAt = lead.rolledBackAt;
    audit(db, user, "ROLLBACK_BASE_LEAD", { leadId: lead.id, source: lead.source });
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  if (url.pathname === "/api/users" && method === "POST") {
    if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || db.users.some((item) => item.username === username)) {
      return sendJson(res, 400, { error: "E-mail inválido ou já existente" });
    }
    if (!manageableRoles(user).includes(body.role)) return sendJson(res, 400, { error: "Perfil inválido" });
    const now = new Date().toISOString();
    const newUser = {
      id: `user-${crypto.randomUUID()}`,
      name: String(body.name || username).trim(),
      username,
      role: body.role,
      active: Boolean(body.active),
      passwordHash: null,
      createdAt: now,
      updatedAt: now
    };
    const token = createPasswordSetup(newUser);
    db.users.push(newUser);
    const invitation = await sendPasswordSetupEmail(req, newUser, token);
    audit(db, user, "CREATE_USER", { userId: newUser.id, role: newUser.role, invitationSent: invitation.sent });
    await saveDb(db);
    return sendJson(res, 201, { user: publicUser(newUser), invitation });
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH") {
    if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const target = db.users.find((item) => item.id === userMatch[1]);
    if (!target) return notFound(res);
    if (!manageableRoles(user).includes(target.role)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    if (Object.prototype.hasOwnProperty.call(body, "role") && !manageableRoles(user).includes(body.role)) {
      return sendJson(res, 400, { error: "Perfil inválido" });
    }
    const willDeactivateBroker = target.role === "Corretor" && target.active && body.active === false;
    const assignedLeads = willDeactivateBroker ? db.leads.filter((lead) => lead.inPipeline && lead.assignedTo === target.id) : [];
    if (assignedLeads.length) {
      const replacement = body.reassignTo
        ? db.users.find((item) => item.id === body.reassignTo && item.role === "Corretor" && item.active && item.id !== target.id)
        : null;
      if (!replacement) {
        return sendJson(res, 409, {
          error: "Escolha um corretor ativo para receber os leads antes de inativar este corretor",
          requiresReassignment: true,
          leadCount: assignedLeads.length
        });
      }
      for (const lead of assignedLeads) {
        lead.assignedTo = replacement.id;
        lead.assignedName = replacement.name;
        lead.updatedAt = new Date().toISOString();
      }
    }
    for (const key of ["name", "role", "active"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) target[key] = body[key];
    }
    target.updatedAt = new Date().toISOString();
    audit(db, user, "UPDATE_USER", { userId: target.id, changes: body, reassignedLeads: assignedLeads.length });
    await saveDb(db);
    return sendJson(res, 200, { user: publicUser(target) });
  }

  const inviteMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/invite$/);
  if (inviteMatch && method === "POST") {
    if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const target = db.users.find((item) => item.id === inviteMatch[1]);
    if (!target) return notFound(res);
    if (!manageableRoles(user).includes(target.role)) return sendJson(res, 403, { error: "Sem permissão" });
    if (!target.active) return sendJson(res, 400, { error: "Ative o usuário antes de enviar convite" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.username)) return sendJson(res, 400, { error: "Usuário sem e-mail válido" });
    const token = createPasswordSetup(target);
    target.updatedAt = new Date().toISOString();
    const invitation = await sendPasswordSetupEmail(req, target, token);
    audit(db, user, "SEND_PASSWORD_INVITE", { userId: target.id, invitationSent: invitation.sent });
    await saveDb(db);
    return sendJson(res, 200, { user: publicUser(target), invitation });
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
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
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
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
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
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
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
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
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

  if (url.pathname === "/api/tags" && method === "POST") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if (db.tagDefinitions.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      return sendJson(res, 400, { error: "Etiqueta já existe" });
    }
    const tag = {
      id: `tag-${crypto.randomUUID()}`,
      name,
      color: cleanColor(body.color)
    };
    db.tagDefinitions.push(tag);
    audit(db, user, "CREATE_TAG", { name });
    await saveDb(db);
    return sendJson(res, 201, { tagDefinitions: db.tagDefinitions });
  }

  const tagMatch = url.pathname.match(/^\/api\/tags\/([^/]+)$/);
  if (tagMatch && method === "PATCH") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const tag = db.tagDefinitions.find((item) => item.id === tagMatch[1]);
    if (!tag) return notFound(res);
    const body = await readBody(req);
    const oldName = tag.name;
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if (db.tagDefinitions.some((item) => item.id !== tag.id && item.name.toLowerCase() === name.toLowerCase())) {
      return sendJson(res, 400, { error: "Etiqueta já existe" });
    }
    tag.name = name;
    tag.color = cleanColor(body.color);
    for (const lead of db.leads) {
      if (Array.isArray(lead.tags)) lead.tags = lead.tags.map((item) => (item === oldName ? name : item));
    }
    audit(db, user, "UPDATE_TAG", { oldName, name });
    await saveDb(db);
    return sendJson(res, 200, { tagDefinitions: db.tagDefinitions });
  }

  if (tagMatch && method === "DELETE") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = db.tagDefinitions.findIndex((item) => item.id === tagMatch[1]);
    if (index < 0) return notFound(res);
    const [tag] = db.tagDefinitions.splice(index, 1);
    for (const lead of db.leads) {
      if (Array.isArray(lead.tags)) lead.tags = lead.tags.filter((item) => item !== tag.name);
    }
    audit(db, user, "DELETE_TAG", { name: tag.name });
    await saveDb(db);
    return sendJson(res, 200, { tagDefinitions: db.tagDefinitions });
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
    return routeApi(req, res, db);
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
