const app = document.querySelector("#app");
let knowledgeTypingTimer = null;
let pageSearchRenderTimer = null;
let pageSearchRequestSeq = 0;
let presencePollTimer = null;
let presencePollInFlight = false;
const MANUAL_BASE_SOURCES = ["Stand", "Lista RMeirelles"];
const PRESENCE_POLL_INTERVAL_MS = 30000;
const META_HEALTH_NOTIFICATION_ROLES = ["Admin TI", "Gestor de Tráfego", "Coordenador de Marketing"];

function canUseMetaHealthAlertsForRole(role) {
  return META_HEALTH_NOTIFICATION_ROLES.includes(role);
}

function canReorderKanbanColumns() {
  return ["Admin TI", "Head Comercial", "Coordenador de Marketing"].includes(state.user?.role);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

const state = {
  user: null,
  roles: [],
  statuses: [],
  projects: [],
  statusDefinitions: [],
  projectDefinitions: [],
  unitDefinitions: [],
  availabilitySettings: { architectureOptions: [], typologyOptions: [], statusMappings: [] },
  tagDefinitions: [],
  users: [],
  userPresence: [],
  leads: [],
  leadsLoaded: false,
  leadsScope: "",
  leadsQueryKey: "",
  leadsPage: { total: 0, pending: 0, rescued: 0, hasMore: false, limit: 150, offset: 0 },
  leadsLoading: false,
  leadsLoadError: "",
  integrations: null,
  baseAccess: null,
  permissions: null,
  currentPermissions: {},
  permissionResources: [],
  baseAccessSources: [],
  accessibleBaseSources: [],
  actionableBaseSources: [],
  auditLog: [],
  accessLog: [],
  fupLeadLog: [],
  integrationLog: [],
  metaConversionEvents: [],
  samEvents: [],
  levFinance: null,
  commercialSettings: {},
  levMauadEmailPreview: false,
  structuredDbDiagnostics: null,
  dataSources: {},
  knowledgeCategories: [],
  knowledgeArticles: [],
  knowledgeChatSessions: [],
  canManageKnowledge: false,
  canCreateKnowledge: false,
  metaDiagnostics: null,
  metaCapiDiagnostics: null,
  metaCapiResponseEventId: "",
  view: "kanban",
  leadId: null,
  selectedOpportunityId: "",
  previousView: "kanban",
  settingsTab: "users",
  settingsEditing: null,
  permissionsTab: "roles",
  settingsNotice: "",
  settingsLogSearch: "",
  settingsLogTab: "audit",
  knowledgeSearch: "",
  knowledgeCategory: "TODOS",
  knowledgeEditing: null,
  knowledgeAiQuestion: "",
  knowledgeAiMessages: [],
  knowledgeActiveChatId: "",
  knowledgeChatMenuOpen: false,
  knowledgeAiLoading: false,
  knowledgeOpenArticle: null,
  metaFormsTab: "active",
  selectedAvailabilityProject: "",
  selectedAvailabilityUnitId: "",
  masterplanZoom: 1,
  visualMapEditingHotspotId: "",
  visualMapNewUnitId: "",
  editUnitId: "",
  editBlockId: "",
  levFinanceSearch: "",
  levFinanceTab: "pending",
  levFinanceExtraction: null,
  levFinanceModal: null,
  backupSettings: null,
  dashboardStart: "",
  dashboardEnd: "",
  dashboardProject: "TODOS",
  dashboardFunnelStatus: "",
  salesReportMonth: "",
  salesReportProject: "TODOS",
  salesReportMode: "chart",
  mobileNavOpen: false,
  lastAccessLogKey: "",
  creatingLead: false,
  editingOwnProfile: false,
  profilePhotoDraft: null,
  createLeadDraft: null,
  createLeadDuplicate: null,
  createLeadImpactPrompt: false,
  creatingOpportunityForLeadId: "",
  baseSource: "TODOS",
  baseSort: { key: "name", direction: "asc" },
  basePageIndex: 0,
  basePageSize: 25,
  sheetSort: { key: "name", direction: "asc" },
  projectFilters: [],
  brokerFilters: [],
  tagFilters: [],
  dateFilterStart: "",
  dateFilterEnd: "",
  frequencyFilters: [],
  favoriteRequests: {},
  brokerMenuBound: false,
  inactivityTimer: null,
  loginMessage: "",
  favoritesOnly: false,
  search: ""
};

const profileAccess = {
  "Admin TI": ["kanban", "availability", "sheet", "odysseia", "dashboard", "salesReport", "finance", "settings", "knowledge"],
  "Head Comercial": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "settings", "knowledge"],
  "Supervisor Comercial": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "knowledge"],
  Diretoria: ["dashboard", "salesReport", "sheet", "odysseia", "kanban", "knowledge"],
  Corretor: ["kanban", "sheet", "odysseia", "knowledge"],
  "Gerente Financeiro": ["finance", "settings", "knowledge"],
  "Auxiliar Financeiro": ["finance", "settings", "knowledge"],
  "Gestor de Tráfego": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "knowledge"],
  "Coordenador de Marketing": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "knowledge"]
};

const routeByView = {
  kanban: "/kanban",
  availability: "/disponibilidade",
  sheet: "/planilha",
  odysseia: "/bases",
  dashboard: "/dashboard",
  salesReport: "/relatorio-comercial",
  finance: "/financeiro-lev",
  settings: "/configuracoes",
  knowledge: "/ajuda"
};

const viewByRoute = {
  "/": "kanban",
  "/kanban": "kanban",
  "/disponibilidade": "availability",
  "/planilha": "sheet",
  "/bases": "odysseia",
  "/dashboard": "dashboard",
  "/relatorio-comercial": "salesReport",
  "/financeiro-lev": "finance",
  "/configuracoes": "settings",
  "/ajuda": "knowledge"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const DEFAULT_LEV_EMAIL_TEMPLATE_HTML = `
  <p>Prezados,</p>
  <p>Segue o demonstrativo de comissões da Lev referente às vendas confirmadas no período, conforme relação abaixo.</p>
  <p>Solicitamos, por gentileza, o aprovisionamento dos valores para a data de <strong>{{data_pagamento}}</strong>, conforme calendário financeiro da Mauad.</p>
  <p>Tão logo confirmado o aprovisionamento, emitiremos a(s) respectiva(s) Nota(s) Fiscal(is).</p>
  <p>Quaisquer dúvidas, seguimos à disposição.</p>
  <p><strong>Total geral da NF de comissões:</strong> {{total_comissoes}}</p>
  {{tabela_vendas}}
  <p>Obrigado.</p>
`;

const LEV_EMAIL_TEMPLATE_VARIABLES = [
  { key: "data_pagamento", label: "Data de pagamento" },
  { key: "data_envio", label: "Data de envio" },
  { key: "total_comissoes", label: "Total comissões" },
  { key: "quantidade_vendas", label: "Qtd. vendas" },
  { key: "empreendimentos", label: "Empreendimentos" },
  { key: "tabela_vendas", label: "Tabela/lista de vendas" }
];

function sanitizeRichHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function normalizeLevEmailTemplateSettings(settings = {}) {
  const template = settings.emailTemplate || {};
  return {
    html: sanitizeRichHtml(template.html || DEFAULT_LEV_EMAIL_TEMPLATE_HTML),
    fontFamily: template.fontFamily || "Arial",
    fontSize: template.fontSize || "14px",
    color: template.color || "#101828",
    lineHeight: template.lineHeight || "1.5"
  };
}

function renderLevEmailTemplateHtml(settings = {}, variables = {}) {
  const template = normalizeLevEmailTemplateSettings(settings);
  const sourceHtml = template.html || DEFAULT_LEV_EMAIL_TEMPLATE_HTML;
  const hasSalesTableVariable = /\{\{\s*(tabela_vendas|lista_vendas)\s*\}\}/i.test(sourceHtml);
  let html = sourceHtml;
  Object.entries(variables).forEach(([key, value]) => {
    html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), String(value ?? ""));
  });
  if (!hasSalesTableVariable && variables.tabela_vendas) {
    html += `<p><strong>Total geral da NF de comissões:</strong> ${variables.total_comissoes || "-"}</p>${variables.tabela_vendas}`;
  }
  return `
    <div style="font-family:${escapeHtml(template.fontFamily)};font-size:${escapeHtml(template.fontSize)};color:${escapeHtml(template.color)};line-height:${escapeHtml(template.lineHeight)}">
      ${sanitizeRichHtml(html)}
    </div>
  `;
}

function renderChatText(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replaceAll("\n", "<br>");
}

function userInitials(user = state.user) {
  const name = String(user?.name || user?.username || "U").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}

function userPhotoSrc(user = state.user) {
  if (!user) return "";
  if (user.photoUrl) return user.photoUrl;
  if (user.hasPhoto && user.id) {
    const stamp = encodeURIComponent(user.photoUpdatedAt || user.updatedAt || "1");
    return `/api/users/${encodeURIComponent(user.id)}/photo?v=${stamp}`;
  }
  return "";
}

function userAvatarHtml(user = state.user, className = "user-avatar") {
  const photoSrc = userPhotoSrc(user);
  if (photoSrc) {
    return `<span class="${escapeHtml(className)}"><img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(user.name || "Usuário")}"></span>`;
  }
  return `<span class="${escapeHtml(className)}">${escapeHtml(userInitials(user))}</span>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

async function readOptimizedVisualMapImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Envie uma imagem válida para o mapa.");
  const lowerName = String(file.name || "").toLowerCase();
  if (file.type.includes("heic") || file.type.includes("heif") || /\.(heic|heif)$/i.test(lowerName)) {
    throw new Error("Esse formato não é compatível com o navegador. Envie o mapa em JPG, PNG ou WebP.");
  }

  const sourceUrl = window.URL?.createObjectURL ? URL.createObjectURL(file) : await readFileAsDataUrl(file);
  try {
    const image = await loadImageFromSource(sourceUrl);
    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("Imagem sem dimensão válida.");

    const maxWidth = 2200;
    const maxHeight = 1600;
    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const qualities = [0.86, 0.76, 0.66, 0.56];
    let best = "";
    for (const quality of qualities) {
      best = canvas.toDataURL("image/jpeg", quality);
      if (best.length <= 1800000) break;
    }
    return best;
  } finally {
    if (window.URL?.revokeObjectURL && sourceUrl.startsWith("blob:")) URL.revokeObjectURL(sourceUrl);
  }
}

function loadImageFromSource(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível decodificar a imagem."));
    image.src = source;
  });
}

function cropImageToDataUrl(image) {
  const size = 224;
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Imagem sem dimensão válida.");
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", 0.76);
}

async function resizeProfilePhoto(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Envie uma imagem válida.");
  const lowerName = String(file.name || "").toLowerCase();
  const supportedRawTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const isHeic = file.type.includes("heic") || file.type.includes("heif") || /\.(heic|heif)$/i.test(lowerName);
  if (isHeic) {
    throw new Error("Esse formato não é compatível com o navegador. Envie a foto em JPG ou PNG.");
  }

  if (window.createImageBitmap) {
    try {
      const bitmap = await createImageBitmap(file);
      const dataUrl = cropImageToDataUrl(bitmap);
      bitmap.close?.();
      return dataUrl;
    } catch {}
  }

  if (window.URL?.createObjectURL) {
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const image = await loadImageFromSource(url);
      return cropImageToDataUrl(image);
    } catch {
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  try {
    const image = await loadImageFromSource(dataUrl);
    return cropImageToDataUrl(image);
  } catch {
    if (supportedRawTypes.has(file.type) && String(dataUrl).length <= 620000) {
      return dataUrl;
    }
    throw new Error("Não foi possível ler a imagem. Envie a foto em JPG ou PNG.");
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro na operação");
  return data;
}

function allowedViews() {
  const screenByView = {
    kanban: "screen:kanban",
    availability: "screen:availability",
    sheet: "screen:sheet",
    odysseia: "screen:bases",
    dashboard: "screen:dashboard",
    salesReport: "screen:salesReport",
    finance: "screen:finance",
    settings: "screen:settings",
    knowledge: "screen:knowledge"
  };
  const roleViews = profileAccess[state.user?.role] || [];
  const userRules = state.currentPermissions && Object.keys(state.currentPermissions).length
    ? state.currentPermissions
    : state.permissions?.users?.[state.user?.id];
  const views = userRules
    ? Object.entries(screenByView).filter(([, resourceId]) => userRules[resourceId]?.access).map(([view]) => view)
    : roleViews;
  return views.filter((view) => {
    if (view === "salesReport") return canAccessCommercialSalesReport();
    if (view === "finance") return canAccessLevFinance();
    if (view === "odysseia") return canAccessBases();
    return true;
  });
}

function clearInactivityTimer() {
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
  state.inactivityTimer = null;
}

function resetInactivityTimer() {
  if (!state.user) return;
  clearInactivityTimer();
  const timeoutMinutes = Math.max(1, Number(state.commercialSettings?.sessionTimeoutMinutes || 15));
  state.inactivityTimer = setTimeout(async () => {
    state.user = null;
    state.loginMessage = "Sessão expirada por inatividade.";
    invalidateLeads();
    stopPresencePolling();
    try {
      await api("/api/logout", { method: "POST" });
    } catch {}
    history.replaceState({}, "", "/login");
    renderLogin("", state.loginMessage);
  }, timeoutMinutes * 60 * 1000);
}

["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, resetInactivityTimer, { passive: true });
});

function userName(id) {
  return state.users.find((user) => user.id === id)?.name || "";
}

function canManageLeads() {
  return ["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(state.user?.role);
}

function canAccessBases() {
  return state.user?.role === "Admin TI" || (state.accessibleBaseSources || []).length > 0;
}

function leadBaseSourcesForPermission(lead) {
  return [lead.source, lead.baseSourceBeforePipeline, lead.previousPipelineSource].filter(Boolean);
}

function baseSourceMatchesPermission(source, permissionSource) {
  const sourceAliases = baseSourceAliases(source).map((item) => item.toLocaleUpperCase("pt-BR"));
  const permissionAliases = baseSourceAliases(permissionSource).map((item) => item.toLocaleUpperCase("pt-BR"));
  return sourceAliases.some((alias) => permissionAliases.includes(alias));
}

function canActOnBaseLead(lead) {
  if (state.user?.role === "Admin TI") return true;
  const actionable = state.actionableBaseSources || [];
  return leadBaseSourcesForPermission(lead).some((source) => (
    actionable.some((permissionSource) => baseSourceMatchesPermission(source, permissionSource))
  ));
}

function canEditUserEmail() {
  return state.user?.role === "Admin TI";
}

function canAccessLevFinance() {
  return (state.user?.role === "Admin TI" && String(state.user?.username || "").toLowerCase() === "admin")
    || ["Gerente Financeiro", "Auxiliar Financeiro"].includes(state.user?.role);
}

function canAccessCommercialSalesReport() {
  return ["Admin TI", "Head Comercial", "Diretoria"].includes(state.user?.role);
}

function canResetLevFinance() {
  return state.user?.role === "Admin TI" && String(state.user?.username || "").toLowerCase() === "admin";
}

function canImportLevSalesToAvailability() {
  return state.user?.role === "Admin TI" && String(state.user?.username || "").toLowerCase() === "admin";
}

function canDeleteComments() {
  return ["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(state.user?.role);
}

function canManageUsers() {
  return ["Admin TI", "Head Comercial"].includes(state.user?.role);
}

function canManageSystemSettings() {
  return state.user?.role === "Admin TI";
}

function canManagePipelineSettings() {
  return ["Admin TI", "Head Comercial"].includes(state.user?.role);
}

function canManageLevFinanceSettings() {
  return canAccessLevFinance();
}

function canManageCommercialSettings() {
  return ["Admin TI", "Head Comercial"].includes(state.user?.role);
}

function editableRoles() {
  if (state.user?.role === "Admin TI") return state.roles;
  if (state.user?.role === "Head Comercial") return ["Supervisor Comercial", "Corretor"];
  return [];
}

function canCreateLeads() {
  return canManageLeads() || state.user?.role === "Corretor";
}

function currentUserCanOperateAsBroker() {
  return Boolean(state.user && isAssignableBrokerUser(state.user));
}

function canRollbackLead(lead) {
  return canManageLeads() || (state.user?.role === "Corretor" && lead.assignedTo === state.user.id);
}

function activeBrokerForLead(lead) {
  return state.users.find((user) => user.id === lead.assignedTo && isAssignableBrokerUser(user)) || null;
}

function isAssignableBrokerUser(user) {
  return Boolean(user?.active && (user.role === "Corretor" || (["Head Comercial", "Supervisor Comercial"].includes(user.role) && user.operatesAsBroker)));
}

function activeBrokers() {
  return state.users
    .filter(isAssignableBrokerUser)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function firstName(value = "") {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function formatDurationFromMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  if (safeMinutes < 60) return `${safeMinutes || 1} min`;
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function presenceStatusLabel(item = {}) {
  if (item.online) return "Online agora";
  if (item.lastAccessAt) return "Offline";
  return "Sem registro";
}

function userPresenceData() {
  const presenceByUser = new Map((state.userPresence || []).map((item) => [item.userId, item]));
  return (state.users || [])
    .filter((user) => user.active !== false)
    .map((user) => ({
      user,
      ...(presenceByUser.get(user.id) || {
        online: false,
        lastAccessAt: user.lastAccessAt || "",
        onlineSince: "",
        averageSessionMinutes: 0
      })
    }))
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.online && b.online) return new Date(a.onlineSince || a.lastAccessAt || 0) - new Date(b.onlineSince || b.lastAccessAt || 0);
      return new Date(b.lastAccessAt || 0) - new Date(a.lastAccessAt || 0);
    });
}

function renderUserPresenceList() {
  const users = userPresenceData();
  if (!users.length) return "";
  return `
    <section class="side-presence" aria-label="Usuários do sistema">
      <div class="side-presence-list">
        ${users.map((item) => {
          const name = item.user.name || item.user.username || "Usuário";
          const statusLabel = presenceStatusLabel(item);
          return `
            <div class="presence-user ${item.online ? "online" : "offline"}">
              ${userAvatarHtml(item.user, "presence-avatar")}
              <span class="presence-name">${escapeHtml(firstName(name))}</span>
              <i class="presence-dot" aria-label="${item.online ? "Online" : "Offline"}"></i>
              <div class="presence-popover">
                <div class="presence-card-hero">
                  ${userAvatarHtml(item.user, "presence-card-avatar")}
                  <span class="presence-card-badge">${item.online ? "Online" : "Offline"}</span>
                </div>
                <div class="presence-card-body">
                  <div class="presence-card-title">
                    <strong>${escapeHtml(firstName(name))}</strong>
                    <i class="presence-card-status ${item.online ? "online" : "offline"}"></i>
                  </div>
                  <span>${escapeHtml(item.user.role || "")}</span>
                </div>
                <div class="presence-card-stats">
                  <div><small>Último acesso</small><b>${item.lastAccessAt ? formatDateTime(item.lastAccessAt) : "Sem registro"}</b></div>
                  <div><small>Tempo médio</small><b>${formatDurationFromMinutes(item.averageSessionMinutes)}</b></div>
                  <div><small>Status</small><b>${escapeHtml(statusLabel)}</b></div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function updatePresenceSidebar() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const current = nav.querySelector(".side-presence");
  const markup = renderUserPresenceList();
  if (!markup) {
    current?.remove();
    return;
  }
  if (current) {
    current.outerHTML = markup;
  } else {
    nav.insertAdjacentHTML("beforeend", markup);
  }
}

async function refreshPresence({ silent = true } = {}) {
  if (!state.user || presencePollInFlight || document.hidden) return;
  presencePollInFlight = true;
  try {
    const data = await api("/api/presence");
    if (Array.isArray(data.users) && data.users.length) state.users = data.users;
    state.userPresence = data.userPresence || [];
    state.dataSources = { ...(state.dataSources || {}), ...(data.dataSources || {}) };
    updatePresenceSidebar();
  } catch (error) {
    if (!silent && /Login necessário|Usuário inativo/i.test(error.message)) {
      stopPresencePolling();
      state.user = null;
      history.pushState({}, "", "/login");
      renderLogin("", "Sessão expirada por inatividade.");
    }
  } finally {
    presencePollInFlight = false;
  }
}

function startPresencePolling() {
  if (presencePollTimer) return;
  presencePollTimer = setInterval(() => {
    refreshPresence().catch(() => {});
  }, PRESENCE_POLL_INTERVAL_MS);
}

function stopPresencePolling() {
  if (presencePollTimer) clearInterval(presencePollTimer);
  presencePollTimer = null;
  presencePollInFlight = false;
}

function syncRouteFromLocation() {
  const path = window.location.pathname;
  if (path === "/definir-senha") {
    state.view = "password-setup";
    state.leadId = null;
    return;
  }
  if (path.startsWith("/leads/")) {
    state.previousView = state.previousView || "kanban";
    state.view = "lead";
    state.leadId = decodeURIComponent(path.replace("/leads/", ""));
    state.selectedOpportunityId = new URLSearchParams(window.location.search).get("opportunity") || "";
    return;
  }
  state.view = viewByRoute[path] || "kanban";
  state.leadId = null;
  state.selectedOpportunityId = "";
}

function routeTo(view, leadId = null, options = {}) {
  state.view = view;
  state.leadId = leadId;
  state.selectedOpportunityId = view === "lead" ? options.opportunityId || "" : "";
  const path = view === "lead"
    ? `/leads/${encodeURIComponent(leadId)}${state.selectedOpportunityId ? `?opportunity=${encodeURIComponent(state.selectedOpportunityId)}` : ""}`
    : routeByView[view] || "/kanban";
  if (`${window.location.pathname}${window.location.search || ""}` !== path) history.pushState({}, "", path);
  renderApp();
  trackAccess();
}

function loginPathWithReturnTo() {
  const current = `${window.location.pathname}${window.location.search || ""}`;
  if (window.location.pathname === "/login" || window.location.pathname === "/definir-senha") return "/login";
  return `/login?returnTo=${encodeURIComponent(current)}`;
}

function currentViewLabel() {
  const labels = {
    kanban: "Kanban",
    availability: "Disponibilidade",
    sheet: "Planilha",
    odysseia: "Bases",
    dashboard: "Dashboard",
    salesReport: "Relatório Comercial",
    finance: "Financeiro Lev",
    settings: "Configurações",
    knowledge: "Ajuda",
    lead: "Detalhe do lead"
  };
  return labels[state.view] || state.view;
}

function trackAccess() {
  if (!state.user || state.view === "password-setup") return;
  const key = `${window.location.pathname}|${state.view}|${state.leadId || ""}`;
  if (state.lastAccessLogKey === key) return;
  state.lastAccessLogKey = key;
  api("/api/access-log", {
    method: "POST",
    body: JSON.stringify({ path: window.location.pathname, view: currentViewLabel(), leadId: state.view === "lead" ? state.leadId : "" })
  }).catch(() => {});
}

function filteredLeads() {
  const term = state.search.trim().toLowerCase();
  return state.leads.filter((lead) => {
    if (state.favoritesOnly && !lead.favorite) return false;
    if (!term) return true;
    const opportunityText = realLeadOpportunities(lead)
      .flatMap((opportunity) => [opportunity.project, opportunity.unit, opportunity.unitSamCode, opportunity.assignedName, opportunity.status])
      .join(" ");
    return [lead.name, lead.phone, lead.email, lead.assistant, lead.assignedName, lead.externalId, lead.status, opportunityText]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
}

function localDateOnly(value) {
  if (!value) return "";
  const raw = String(value);
  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = value instanceof Date
    ? value
    : isoDateOnly
      ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthBounds(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: localDateOnly(new Date(year, month, 1)),
    end: localDateOnly(new Date(year, month + 1, 0)),
    month: `${year}-${String(month + 1).padStart(2, "0")}`
  };
}

function ensureReportDefaults() {
  const bounds = currentMonthBounds();
  if (!state.dashboardStart) state.dashboardStart = bounds.start;
  if (!state.dashboardEnd) state.dashboardEnd = bounds.end;
  if (!state.salesReportMonth) state.salesReportMonth = bounds.month;
}

function parseFlexibleDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  const isoDateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const date = new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseFlexibleDate(value);
  if (!date) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).replace(",", "");
}

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numberPt(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dateIsInRange(value, start, end) {
  const date = localDateOnly(parseFlexibleDate(value) || value);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function monthRange(monthValue) {
  const [yearText, monthText] = String(monthValue || currentMonthBounds().month).split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(month)) return currentMonthBounds();
  return {
    start: localDateOnly(new Date(year, month, 1)),
    end: localDateOnly(new Date(year, month + 1, 0)),
    month: `${year}-${String(month + 1).padStart(2, "0")}`
  };
}

function saleSignedAt(sale) {
  return sale?.signedAt
    || sale?.signatureDate
    || sale?.contractSignedAt
    || sale?.samLastEvent?.eventDatetime
    || sale?.payload?.signedAt
    || "";
}

function leadContractSignedAt(lead) {
  const history = Array.isArray(lead?.manualSamStatusHistory) ? lead.manualSamStatusHistory : [];
  const historical = history.find((item) => isContractSignedStatus(item.status) && item.statusAt);
  if (historical?.statusAt) return historical.statusAt;
  if (lead?.contractSignedAt) return lead.contractSignedAt;
  if (lead?.signedAt) return lead.signedAt;
  if (lead?.samLastEvent?.eventDatetime && (isContractSignedStatus(lead.samLastEvent.nextStatus) || isContractSignedStatus(lead.status))) {
    return lead.samLastEvent.eventDatetime;
  }
  return "";
}

function numericMoneyValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/[^\d,.-]/g, "").trim();
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function saleContractValue(sale) {
  return numericMoneyValue(sale?.contractValue ?? sale?.unitValue ?? sale?.value ?? sale?.valorContrato ?? 0);
}

function saleProjectName(sale) {
  const direct = sale?.project || sale?.desiredProject || "";
  if (direct) return direct;
  const unit = String(sale?.unit || "");
  const match = (state.projectDefinitions || []).find((project) => (project.unitPrefixes || []).some((prefix) => unit.toUpperCase().startsWith(String(prefix || "").toUpperCase())));
  return match?.name || "Sem empreendimento";
}

function isContractSignedStatus(status) {
  const normalized = String(status || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ["contrato_assinado", "contrato_100_assinado", "venda_finalizada", "contract_signed", "sale_completed"].includes(normalized);
}

function allCommercialSales() {
  const byUnit = new Map();
  const add = (sale) => {
    if (!sale) return;
    const unit = String(sale.unit || sale.desiredUnit || sale.id || "").trim();
    const key = unit || sale.leadId || sale.id;
    if (!key) return;
    const current = byUnit.get(key) || {};
    const merged = { ...current };
    for (const [key, value] of Object.entries(sale)) {
      if (value !== "" && value !== null && value !== undefined) merged[key] = value;
    }
    byUnit.set(key, merged);
  };
  (state.leads || []).forEach((lead) => {
    const opportunities = realLeadOpportunities(lead);
    const items = opportunities.length ? opportunities : [implicitLeadOpportunity(lead)];
    items
      .filter((item) => lead.inPipeline && isContractSignedStatus(item.status || lead.status))
      .forEach((item) => add({
        ...lead,
        ...item,
        id: item.id || lead.id,
        leadId: lead.id,
        leadName: lead.name,
        unit: item.unitSamCode || item.unit || lead.unit || lead.desiredUnit || "",
        desiredUnit: item.unit || item.unitSamCode || lead.desiredUnit || "",
        project: item.project || leadProjectValue(lead),
        contractValue: item.contractValue || item.unitValue || lead.contractValue || lead.unitValue || lead.value || "",
        signedAt: item.contractSignedAt || item.signedAt || leadContractSignedAt(lead) || item.updatedAt
      }));
  });
  return [...byUnit.values()].filter((sale) => saleSignedAt(sale));
}

function salesInRange(start, end, project = "TODOS") {
  return allCommercialSales().filter((sale) => {
    if (!dateIsInRange(saleSignedAt(sale), start, end)) return false;
    if (project !== "TODOS" && saleProjectName(sale) !== project) return false;
    return true;
  });
}

function leadForSale(sale) {
  const unit = String(sale?.unit || "").toUpperCase();
  return state.leads.find((lead) => sale.leadId && lead.id === sale.leadId)
    || state.leads.find((lead) => unit && [lead.unit, lead.desiredUnit].some((value) => String(value || "").toUpperCase() === unit))
    || null;
}

function weekdayLabel(value) {
  const date = parseFlexibleDate(value);
  if (!date) return "Sem data";
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][date.getDay()];
}

function leadMatchesDateFilter(lead) {
  const leadDate = localDateOnly(lead.createdAt || lead.meta?.createdTime || lead.rescuedAt || lead.updatedAt);
  if (!leadDate) return !state.dateFilterStart && !state.dateFilterEnd;
  if (state.dateFilterStart && leadDate < state.dateFilterStart) return false;
  if (state.dateFilterEnd && leadDate > state.dateFilterEnd) return false;
  return true;
}

function interactionAgeDays(lead) {
  const value = lead.lastInteractionAt || lead.updatedAt || lead.createdAt || lead.meta?.createdTime;
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return Infinity;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function frequencyBucketForLead(lead) {
  const days = interactionAgeDays(lead);
  if (days <= 1) return "1";
  if (days <= 7) return "7";
  if (days <= 14) return "14";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  return "60plus";
}

function leadMatchesFrequencyFilter(lead) {
  return !state.frequencyFilters.length || state.frequencyFilters.includes(frequencyBucketForLead(lead));
}

function realLeadOpportunities(lead) {
  return Array.isArray(lead?.opportunities) ? lead.opportunities.filter((item) => item?.id) : [];
}

function implicitLeadOpportunity(lead) {
  return {
    id: "",
    leadId: lead.id,
    implicit: true,
    status: lead.status,
    assignedTo: lead.assignedTo,
    assignedName: lead.assignedName,
    project: leadProjectValue(lead),
    unit: lead.desiredUnit || lead.unit || "",
    unitSamCode: lead.unit || lead.desiredUnit || "",
    unitValue: lead.unitValue || lead.value || "",
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    source: lead.source
  };
}

function pipelineItemFromOpportunity(lead, opportunity, allOpportunities = []) {
  const project = opportunity.project || leadProjectValue(lead);
  return {
    ...lead,
    parentLeadId: lead.id,
    opportunityId: opportunity.id || "",
    pipelineItemId: opportunity.id ? `${lead.id}::${opportunity.id}` : lead.id,
    isOpportunityItem: Boolean(opportunity.id),
    opportunity,
    opportunityCount: allOpportunities.length,
    opportunityList: allOpportunities,
    status: opportunity.status || lead.status,
    assignedTo: opportunity.assignedTo || "",
    assignedName: opportunity.assignedName || "",
    project,
    desiredProject: project,
    unit: opportunity.unitSamCode || opportunity.unit || lead.unit || "",
    desiredUnit: opportunity.unit || opportunity.unitSamCode || lead.desiredUnit || "",
    unitValue: opportunity.unitValue || lead.unitValue || "",
    source: opportunity.source || lead.source,
    createdAt: opportunity.createdAt || lead.createdAt,
    updatedAt: opportunity.updatedAt || lead.updatedAt
  };
}

function pipelineItemsFromLead(lead) {
  const opportunities = realLeadOpportunities(lead);
  if (!opportunities.length) return [pipelineItemFromOpportunity(lead, implicitLeadOpportunity(lead), [])];
  const items = opportunities
    .filter((opportunity) => opportunity.inPipeline !== false)
    .map((opportunity) => pipelineItemFromOpportunity(lead, opportunity, opportunities));
  const implicit = implicitLeadOpportunity(lead);
  const implicitUnit = availabilityNormalizeUnit(implicit.unitSamCode || implicit.unit);
  const implicitHasOwnUnit = Boolean(implicitUnit) && !opportunities.some((opportunity) => {
    const opportunityUnits = [opportunity.unitSamCode, opportunity.unit, opportunity.desiredUnit]
      .map(availabilityNormalizeUnit)
      .filter(Boolean);
    return opportunityUnits.includes(implicitUnit);
  });
  if (implicitHasOwnUnit) {
    const opportunityList = [implicit, ...opportunities];
    return [pipelineItemFromOpportunity(lead, implicit, opportunityList), ...items.map((item) => ({
      ...item,
      opportunityCount: opportunityList.length,
      opportunityList
    }))];
  }
  return items;
}

function pipelineLeads() {
  return filteredLeads().flatMap((lead) => pipelineItemsFromLead(lead)).filter((item) => {
    if (!item.inPipeline) return false;
    if (state.user?.role === "Corretor" && item.assignedTo !== state.user.id) return false;
    if (state.projectFilters.length && !state.projectFilters.includes(leadProjectValue(item) || "__none__")) return false;
    if (state.brokerFilters.length && !state.brokerFilters.includes(item.assignedTo || "__none__")) return false;
    if (!leadMatchesTagFilter(item)) return false;
    if (!leadMatchesDateFilter(item)) return false;
    if (!leadMatchesFrequencyFilter(item)) return false;
    return true;
  });
}

function odysseiaLeads() {
  return filteredLeads().filter((lead) => lead.source === "ODYSSEIA");
}

function hasBaseHistory(lead) {
  return Boolean(lead.sourceStatus || lead.odysseiaStatus || lead.baseSourceBeforePipeline || lead.previousPipelineSource);
}

function isAvailableBaseLead(lead) {
  if (!lead.inPipeline) return true;
  return hasBaseHistory(lead) && !lead.assignedTo;
}

function baseSourcesForLead(lead) {
  return [lead.source, lead.baseSourceBeforePipeline, lead.previousPipelineSource].filter(Boolean);
}

function baseSourceAliases(source) {
  const value = String(source || "").trim();
  const aliases = {
    "Vinhos na Serra": ["Vinhos na Serra", "VINHOS NA SERRA"],
    "VINHOS NA SERRA": ["Vinhos na Serra", "VINHOS NA SERRA"],
    "Pipeline GDrive": ["Pipeline GDrive", "PIPELINE MAUAD"],
    "PIPELINE MAUAD": ["Pipeline GDrive", "PIPELINE MAUAD"],
    "RD Station": ["RD Station", "RD STATION"],
    "RD STATION": ["RD Station", "RD STATION"]
  }[value] || [value];
  return [...new Set(aliases.filter(Boolean))];
}

function leadMatchesBaseSource(lead, source) {
  if (source === "TODOS") return true;
  const selected = baseSourceAliases(source);
  return baseSourcesForLead(lead).some((leadSource) => selected.includes(leadSource));
}

function baseSources() {
  const allowed = new Set(state.accessibleBaseSources || []);
  let sources = (state.user?.role === "Admin TI" ? (state.baseAccessSources || state.accessibleBaseSources || []) : [...allowed])
    .filter(Boolean)
    .sort();
  for (const source of MANUAL_BASE_SOURCES) {
    if ((state.user?.role === "Admin TI" || allowed.has(source)) && !sources.includes(source)) sources.push(source);
  }
  if (sources.includes("ODYSSEIA")) sources.unshift(...sources.splice(sources.indexOf("ODYSSEIA"), 1));
  if (sources.includes("META")) sources.push(...sources.splice(sources.indexOf("META"), 1));
  return sources.length ? ["TODOS", ...sources.filter((source) => source !== "TODOS")] : [];
}

function baseLeads() {
  const sources = baseSources();
  if (!sources.includes(state.baseSource)) state.baseSource = sources[0] || "TODOS";
  if (state.leadsScope === "bases") return sortBaseLeads(state.leads || []);
  return sortBaseLeads(filteredLeads().filter((lead) => leadMatchesBaseSource(lead, state.baseSource)));
}

function sortStorageKey(scope) {
  return `pipeline-mauad-${scope}-sort-${state.user?.id || "default"}`;
}

function loadTableSortPreference(scope) {
  try {
    const parsed = JSON.parse(localStorage.getItem(sortStorageKey(scope)) || "null");
    if (parsed?.key && parsed?.direction) state[`${scope}Sort`] = parsed;
  } catch {}
}

function saveTableSortPreference(scope) {
  try {
    localStorage.setItem(sortStorageKey(scope), JSON.stringify(state[`${scope}Sort`]));
  } catch {}
}

function tableSortValue(lead, key, options = {}) {
  const values = {
    name: lead.name,
    phone: lead.phone,
    email: leadEmailForTable(lead),
    status: leadBaseStatus(lead, options),
    broker: lead.assignedName || userName(lead.assignedTo),
    source: lead.source,
    tags: leadTags(lead).join(", ")
  };
  return String(values[key] || "").trim().toLocaleLowerCase("pt-BR");
}

function sortLeadsForTable(leads, sort, options = {}) {
  const { key, direction } = sort || { key: "name", direction: "asc" };
  const factor = direction === "desc" ? -1 : 1;
  return [...leads].sort((a, b) => {
    const comparison = tableSortValue(a, key, options).localeCompare(tableSortValue(b, key, options), "pt-BR", { numeric: true, sensitivity: "base" });
    if (comparison !== 0) return comparison * factor;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" });
  });
}

function sortBaseLeads(leads) {
  return sortLeadsForTable(leads, state.baseSort, { blankHistoricalBaseStatus: true }).sort((a, b) => {
    if (Boolean(a.inPipeline) !== Boolean(b.inPipeline)) return a.inPipeline ? -1 : 1;
    return 0;
  });
}

function statusDefinitionFor(status) {
  return (state.statusDefinitions || []).find((item) => item.status === status) || {};
}

function isSamOnlyStatus(status) {
  return statusDefinitionFor(status).advanceMode === "sam_only";
}

function statusAdvanceLabel(status) {
  return isSamOnlyStatus(status) ? "Somente SAM" : "Manual";
}

function statusOptionsHtml(selectedStatus = "", options = {}) {
  const allowSamOnly = Boolean(options.allowSamOnly);
  return state.statuses.map((status, index) => {
    const selected = selectedStatus ? selectedStatus === status : index === 0;
    const samOnly = isSamOnlyStatus(status);
    const disabled = samOnly && !selected && !allowSamOnly;
    const suffix = samOnly ? " (somente SAM)" : "";
    return `<option value="${escapeHtml(status)}" ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHtml(status + suffix)}</option>`;
  }).join("");
}

function promptManualSamStatusDate(status) {
  const value = prompt(`Este status é controlado pelo SAM.\nInforme a data histórica em que o lead atingiu "${status}" (dd/mm/aaaa).`);
  if (value === null) return null;
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    alert("Informe a data do status.");
    return null;
  }
  return trimmed;
}

function baseSourcesForTotal(lead) {
  const sources = new Set();
  if (lead.source) sources.add(lead.source);
  if (lead.baseSourceBeforePipeline) sources.add(lead.baseSourceBeforePipeline);
  if (lead.previousPipelineSource && lead.previousPipelineSource !== "Pipeline GDrive") sources.add(lead.previousPipelineSource);
  return [...sources].filter(Boolean);
}

function baseLeadCount(source = "TODOS") {
  return state.leads.filter((lead) => {
    const sources = baseSourcesForTotal(lead);
    if (!sources.length) return false;
    return source === "TODOS" ? sources.length > 0 : leadMatchesBaseSource(lead, source);
  }).length;
}

function leadBaseStatus(lead, options = {}) {
  const source = String(lead.source || "").toUpperCase();
  if (options.blankHistoricalBaseStatus && (source.includes("RD") || source.includes("VINHOS") || source.includes("OAB"))) {
    return "";
  }
  return lead.sourceStatus || lead.odysseiaStatus || lead.status;
}

function leadEmailForTable(lead) {
  if (lead.email) return lead.email;
  const source = String(lead.source || "").toUpperCase();
  if (source.includes("RD") || source.includes("VINHOS") || source.includes("OAB")) return lead.assistant || "";
  return "";
}

function projectOptions(selected = "") {
  return (state.projects || [])
    .map((project) => `<option value="${escapeHtml(project)}" ${project === selected ? "selected" : ""}>${escapeHtml(project)}</option>`)
    .join("");
}

function metrics(leads = filteredLeads()) {
  const total = leads.length;
  const favorites = leads.filter((lead) => lead.favorite).length;
  const assigned = leads.filter((lead) => lead.assignedTo).length;
  const active = leads.filter((lead) => !["Desqualificado", "Arquivado (Permanentemente)"].includes(lead.status)).length;
  return { total, favorites, assigned, active };
}

function setButtonBusy(button, busy, label = "Aguarde...") {
  if (!button) return;
  if (busy) {
    button.dataset.previousText = button.textContent;
    button.textContent = label;
    button.disabled = true;
    button.classList.add("is-busy");
  } else {
    button.textContent = button.dataset.previousText || button.textContent;
    button.disabled = false;
    button.classList.remove("is-busy");
  }
}

function renderLogin(error = "", message = "") {
  const loginMessage = message || state.loginMessage || "";
  if (window.location.pathname !== "/login") history.replaceState({}, "", loginPathWithReturnTo());
  app.innerHTML = `
    <section class="login-page">
      <div class="login-frame">
        <section class="login-intro">
          <img src="/logo-mauad-branco.png" alt="Construtora Mauad">
          <span>Pipeline Comercial</span>
          <h1>Organize leads, atendimentos e negociações em um só lugar.</h1>
          <p>Acompanhe bases, resgates, corretores e conversões do funil comercial com segurança.</p>
          <small>Ambiente protegido para a equipe comercial da Construtora Mauad.</small>
        </section>
        <section class="login-panel">
          <form class="login-box" id="loginForm">
            <span class="eyebrow">Entrar</span>
            <h2>Acessar conta</h2>
            <p>Use seu usuário e senha para acessar o sistema.</p>
            <div class="field">
              <label for="username">E-mail ou usuário</label>
              <input id="username" name="username" autocomplete="username" value="admin" required>
            </div>
            <div class="field">
              <label for="password">Senha</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required>
            </div>
            ${loginMessage ? `<div class="success">${escapeHtml(loginMessage)}</div>` : ""}
            ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
            <div class="field">
              <button class="primary login-submit" type="submit">Entrar</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });
      state.user = result.user;
      state.loginMessage = "";
      state.leads = [];
      state.leadsLoaded = false;
      state.leadsLoadError = "";
      resetInactivityTimer();
      await loadState();
      startPresencePolling();
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      if (returnTo?.startsWith("/")) {
        history.replaceState({}, "", returnTo);
        syncRouteFromLocation();
      }
      if (state.view === "lead" && state.leadId) {
        routeTo("lead", state.leadId);
        return;
      }
      const nextView = state.view !== "lead" && allowedViews().includes(state.view) ? state.view : allowedViews()[0] || "kanban";
      routeTo(nextView);
    } catch (error) {
      renderLogin(error.message);
    }
  });
}

function passwordRuleList() {
  return `
    <ul class="password-rules">
      <li>mínimo de 8 caracteres</li>
      <li>letra maiúscula e minúscula</li>
      <li>número</li>
      <li>caractere especial</li>
    </ul>
  `;
}

function renderPasswordSetup(message = "", error = "") {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const invalidLink = !token;
  app.innerHTML = `
    <section class="login-page">
      <div class="login-frame">
        <section class="login-intro">
          <img src="/logo-mauad-branco.png" alt="Construtora Mauad">
          <span>Pipeline Comercial</span>
          <h1>Crie uma senha segura para acessar o sistema.</h1>
          <p>Este convite é individual, temporário e será invalidado depois do primeiro uso.</p>
          <small>Ambiente protegido para a equipe comercial da Construtora Mauad.</small>
        </section>
        <section class="login-panel">
          <form class="login-box" id="passwordSetupForm">
            <span class="eyebrow">Primeiro acesso</span>
            <h2>Definir senha</h2>
            <p>Use uma senha forte para concluir seu acesso.</p>
            ${passwordRuleList()}
            <div class="field">
              <label for="password">Senha</label>
              <input id="password" name="password" type="password" autocomplete="new-password" ${invalidLink ? "disabled" : "required"}>
            </div>
            <div class="field">
              <label for="confirmPassword">Confirmar senha</label>
              <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" ${invalidLink ? "disabled" : "required"}>
            </div>
            ${message ? `<div class="success">${escapeHtml(message)}</div>` : ""}
            ${invalidLink ? '<div class="error">Link inválido ou sem token.</div>' : ""}
            ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
            <div class="field">
              <button class="primary login-submit" type="submit" ${invalidLink ? "disabled" : ""}>Salvar senha</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  `;
  if (invalidLink) return;
  document.querySelector("#passwordSetupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/password/setup", {
        method: "POST",
        body: JSON.stringify({
          token,
          password: form.get("password"),
          confirmPassword: form.get("confirmPassword")
        })
      });
      history.replaceState({}, "", "/login");
      renderLogin("", "Senha criada com sucesso. Faça login para continuar.");
    } catch (setupError) {
      renderPasswordSetup("", setupError.message);
    }
  });
}

async function loadState() {
  const data = await api("/api/state");
  state.user = data.user;
  loadTableSortPreference("base");
  loadTableSortPreference("sheet");
  state.roles = data.roles;
  state.statuses = data.pipelineStatuses;
  state.projects = data.projects || ["Reserva Guinle", "Golf Club Resort"];
  state.projectDefinitions = data.projectDefinitions || state.projects.map((name, position) => ({ name, position, unitPrefixes: [] }));
  state.unitDefinitions = Array.isArray(data.unitDefinitions) ? data.unitDefinitions : [];
  state.availabilitySettings = normalizeAvailabilitySettingsClient(data.availabilitySettings || {});
  const firstAvailabilityProject = availabilityProjects()[0]?.name;
  if ((!state.selectedAvailabilityProject || !availabilityProjects().some((project) => project.name === state.selectedAvailabilityProject)) && firstAvailabilityProject) {
    state.selectedAvailabilityProject = firstAvailabilityProject;
  }
  state.statusDefinitions = (data.statusDefinitions || state.statuses.map((status, position) => ({ status, position, samCodes: [] })))
    .map((item, position) => ({ ...item, position, advanceMode: item.advanceMode || "manual" }));
  state.tagDefinitions = data.tagDefinitions || [];
  state.users = data.users;
  state.userPresence = data.userPresence || [];
  if (Array.isArray(data.leads) && data.leads.length) {
    state.leads = data.leads;
    state.leadsLoaded = true;
  }
  state.integrations = data.integrations;
  state.baseAccess = data.baseAccess || null;
  state.permissions = data.permissions || null;
  state.currentPermissions = data.currentPermissions || {};
  state.permissionResources = data.permissionResources || [];
  state.baseAccessSources = data.baseAccessSources || [];
  state.accessibleBaseSources = data.accessibleBaseSources || [];
  state.actionableBaseSources = data.actionableBaseSources || [];
  state.integrationLog = data.integrationLog || [];
  state.metaConversionEvents = data.metaConversionEvents || [];
  state.samEvents = data.samEvents || [];
  state.auditLog = data.auditLog;
  state.accessLog = data.accessLog || [];
  state.fupLeadLog = data.fupLeadLog || [];
  state.levFinance = data.levFinance || null;
  state.commercialSettings = data.commercialSettings || {};
  resetInactivityTimer();
  state.backupSettings = data.backupSettings || state.backupSettings || null;
  state.dataSources = { ...(state.dataSources || {}), ...(data.dataSources || {}) };
  state.knowledgeCategories = data.knowledgeCategories || [];
  state.knowledgeArticles = data.knowledgeArticles || [];
  state.knowledgeChatSessions = data.knowledgeChatSessions || [];
  state.canManageKnowledge = Boolean(data.canManageKnowledge);
  state.canCreateKnowledge = Boolean(data.canCreateKnowledge);
  if (state.view !== "lead" && !allowedViews().includes(state.view)) state.view = allowedViews()[0];
}

function viewNeedsLeads(view = state.view) {
  return ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "availability"].includes(view);
}

function leadScopeForView(view = state.view) {
  if (["kanban", "sheet", "dashboard", "salesReport", "availability"].includes(view)) return "pipeline";
  if (view === "odysseia") return "bases";
  return "";
}

function leadQueryKeyForView(view = state.view) {
  const scope = leadScopeForView(view);
  if (scope !== "bases") return scope;
  return JSON.stringify({
    scope,
    source: state.baseSource || "TODOS",
    search: state.search || "",
    favoritesOnly: Boolean(state.favoritesOnly),
    sort: state.baseSort || { key: "name", direction: "asc" },
    pageIndex: state.basePageIndex || 0,
    pageSize: state.basePageSize || 25
  });
}

function hasLoadedLeadsForView(view = state.view) {
  const scope = leadScopeForView(view);
  return !scope || (state.leadsLoaded && state.leadsScope === scope && state.leadsQueryKey === leadQueryKeyForView(view));
}

async function loadLeads(force = false, options = {}) {
  const scope = leadScopeForView();
  if (!scope) return;
  const queryKey = leadQueryKeyForView();
  const append = Boolean(options.append && scope === "bases");
  if (state.leadsLoading) return;
  if (!append && state.leadsLoaded && state.leadsScope === scope && state.leadsQueryKey === queryKey && !force) return;
  state.leadsLoading = true;
  state.leadsLoadError = "";
  try {
    const params = new URLSearchParams({ scope });
    if (scope === "bases") {
      params.set("source", state.baseSource || "TODOS");
      params.set("search", state.search || "");
      params.set("favorite", state.favoritesOnly ? "1" : "0");
      params.set("sort", state.baseSort?.key || "name");
      params.set("direction", state.baseSort?.direction || "asc");
      params.set("limit", String(state.basePageSize || 25));
      params.set("offset", String((state.basePageIndex || 0) * (state.basePageSize || 25)));
    }
    const data = await api(`/api/leads?${params.toString()}`);
    state.leads = data.leads || [];
    state.leadsScope = data.scope || scope;
    state.leadsQueryKey = queryKey;
    state.leadsPage = data.page || {
      total: state.leads.length,
      pending: 0,
      rescued: 0,
      hasMore: false,
      limit: state.basePageSize || 25,
      offset: state.leads.length
    };
    state.dataSources = { ...(state.dataSources || {}), ...(data.dataSources || {}) };
    state.leadsLoaded = true;
  } catch (error) {
    state.leadsLoadError = error.message || "Erro ao carregar leads.";
  } finally {
    state.leadsLoading = false;
  }
}

async function loadLeadsForCurrentView(force = true) {
  await loadLeads(force);
}

function invalidateLeads() {
  state.leadsLoaded = false;
  state.leadsScope = "";
  state.leadsQueryKey = "";
  state.leadsPage = { total: 0, pending: 0, rescued: 0, hasMore: false, limit: state.basePageSize || 25, offset: 0 };
}

function resetBasePagination() {
  state.basePageIndex = 0;
  invalidateLeads();
}

function navButton(view, icon, label) {
  if (!allowedViews().includes(view)) return "";
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}" title="${label}"><span>${icon}</span>${label}</button>`;
}

function renderShell(content) {
  const usesLegacyData = Object.values(state.dataSources || {}).includes("legacy");
  app.innerHTML = `
    <section class="shell">
      <aside class="side">
        <div class="side-head">
          <div class="brand">
            <img src="/logo-mauad-branco.png" alt="Construtora Mauad">
            <div>
              <strong>Pipeline Comercial</strong>
              <span>Construtora Mauad</span>
            </div>
          </div>
          <button class="mobile-menu-button" type="button" data-mobile-menu aria-expanded="${state.mobileNavOpen ? "true" : "false"}">Menu</button>
        </div>
        <nav class="nav ${state.mobileNavOpen ? "open" : ""}">
          <div class="nav-main">
            ${navButton("kanban", "▦", "Kanban")}
            ${navButton("availability", "▩", "Disponibilidade")}
            ${navButton("sheet", "▤", "Planilha")}
            ${navButton("odysseia", "◎", "Bases")}
            ${navButton("dashboard", "◫", "Dashboard")}
            ${navButton("salesReport", "▥", "Relatório Comercial")}
            ${navButton("finance", "▣", "Financeiro Lev")}
            ${navButton("settings", "⚙", "Configurações")}
            ${navButton("knowledge", "?", "Ajuda")}
            <button id="logout" class="logout-nav" type="button">Sair</button>
          </div>
          ${renderUserPresenceList()}
        </nav>
      </aside>
      <section class="main">
        <header class="topbar">
          <button class="user-pill user-pill-button" type="button" data-edit-own-profile title="Editar meu perfil">
            ${userAvatarHtml(state.user)}
            <span class="user-pill-text">
              <strong>${escapeHtml(state.user.name)}</strong>
              <em>${escapeHtml(state.user.role)}</em>
            </span>
          </button>
        </header>
        <div class="content">
          ${usesLegacyData ? '<div class="legacy-data-notice">Dados recuperados de base legada.</div>' : ""}
          ${content}
        </div>
      </section>
    </section>
    ${state.creatingLead ? renderCreateLeadModal() : ""}
    ${state.creatingOpportunityForLeadId ? renderOpportunityModal() : ""}
    ${state.editingOwnProfile ? renderOwnProfileModal() : ""}
  `;
  document.body.classList.toggle("modal-open", Boolean(document.querySelector(".modal-backdrop")));
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileNavOpen = false;
      routeTo(button.dataset.view);
    });
  });
  document.querySelector("[data-mobile-menu]")?.addEventListener("click", () => {
    state.mobileNavOpen = !state.mobileNavOpen;
    renderApp();
  });
  bindPageFilters();
  bindCreateLeadModal();
  bindOpportunityModal();
  bindOwnProfileModal();
  document.querySelector("[data-edit-own-profile]")?.addEventListener("click", () => {
    state.profilePhotoDraft = null;
    state.editingOwnProfile = true;
    renderApp();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    clearInactivityTimer();
    stopPresencePolling();
    state.user = null;
    await api("/api/logout", { method: "POST" });
    history.pushState({}, "", "/login");
    renderLogin();
  });
}

function renderOwnProfileModal() {
  const user = state.user || {};
  const notifications = user.notifications || {};
  const photoUrl = state.profilePhotoDraft !== null ? state.profilePhotoDraft : userPhotoSrc(user);
  return `
    <div class="modal-backdrop" data-own-profile-backdrop>
      <section class="modal-card profile-modal" role="dialog" aria-modal="true" aria-labelledby="ownProfileTitle">
        <div class="panel-head">
          <h2 id="ownProfileTitle">Meu perfil</h2>
          <button type="button" class="icon" data-close-own-profile title="Fechar">×</button>
        </div>
        <form id="ownProfileForm" class="form-grid">
          <div class="field full">
            <label>Foto de perfil</label>
            <div class="profile-photo-row">
              <div class="profile-photo-preview" data-profile-photo-preview>
                ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(user.name || "Usuário")}">` : `<span>${escapeHtml(userInitials(user))}</span>`}
              </div>
              <div class="profile-photo-actions">
                <label class="file-choice" for="ownProfilePhoto">Escolher foto</label>
                <input id="ownProfilePhoto" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">
                <small data-profile-photo-name>Nenhum arquivo escolhido</small>
                <button type="button" data-remove-own-photo>Retirar foto</button>
              </div>
            </div>
          </div>
          <div class="field full"><label>Nome de exibição</label><input name="name" value="${escapeHtml(user.name || "")}" required autofocus></div>
          <div class="field full"><label>Número de WhatsApp</label><input name="whatsappNumber" value="${escapeHtml(notifications.whatsappNumber || "")}" placeholder="Ex.: 5521999999999"><small>Use DDD. Se não informar o código do país, o sistema considera Brasil (+55).</small></div>
          <div class="field"><label>Notificação por e-mail</label><label class="checkline settings-check"><input type="checkbox" name="notifyEmail" ${notifications.email ? "checked" : ""}> Receber alertas</label></div>
          <div class="field"><label>Notificação por WhatsApp</label><label class="checkline settings-check"><input type="checkbox" name="notifyWhatsapp" ${notifications.whatsapp ? "checked" : ""}> Receber alertas</label></div>
          ${canUseMetaHealthAlertsForRole(user.role) ? `<div class="field full"><label>Monitoramento Meta</label><label class="checkline settings-check"><input type="checkbox" name="notifyMetaHealthWhatsapp" ${notifications.metaHealthWhatsapp ? "checked" : ""}> Receber alerta de queda/anomalia de leads Meta por WhatsApp</label></div>` : ""}
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-close-own-profile>Cancelar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function bindOwnProfileModal() {
  if (!state.editingOwnProfile) return;
  const close = () => {
    state.editingOwnProfile = false;
    state.profilePhotoDraft = null;
    renderApp();
  };
  document.querySelectorAll("[data-close-own-profile]").forEach((button) => button.addEventListener("click", close));
  document.querySelector("[data-own-profile-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  document.querySelector("#ownProfilePhoto")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const photoUrl = await resizeProfilePhoto(file);
      state.profilePhotoDraft = photoUrl;
      const preview = document.querySelector("[data-profile-photo-preview]");
      if (preview) preview.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(state.user?.name || "Usuário")}">`;
      const nameLabel = document.querySelector("[data-profile-photo-name]");
      if (nameLabel) nameLabel.textContent = file.name || "Foto selecionada";
    } catch (error) {
      alert(error.message);
    }
  });
  document.querySelector("[data-remove-own-photo]")?.addEventListener("click", () => {
    state.profilePhotoDraft = "";
    const preview = document.querySelector("[data-profile-photo-preview]");
    if (preview) preview.innerHTML = `<span>${escapeHtml(userInitials(state.user))}</span>`;
  });
  document.querySelector("#ownProfileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      notifications: {
        email: form.get("notifyEmail") === "on",
        whatsapp: form.get("notifyWhatsapp") === "on",
        whatsappNumber: form.get("whatsappNumber"),
        metaHealthWhatsapp: canUseMetaHealthAlertsForRole(state.user?.role) && form.get("notifyMetaHealthWhatsapp") === "on"
      },
      photoUrl: state.profilePhotoDraft !== null ? state.profilePhotoDraft : undefined
    };
    try {
      setButtonBusy(submitButton, true, "Salvando...");
      const data = await api("/api/profile", { method: "PATCH", body: JSON.stringify(payload) });
      state.user = data.user;
      state.users = (state.users || []).map((item) => item.id === data.user.id ? data.user : item);
      state.editingOwnProfile = false;
      state.profilePhotoDraft = null;
      renderApp();
    } catch (error) {
      setButtonBusy(submitButton, false);
      alert(error.message);
    }
  });
}

function renderViewHead(title, subtitle = "", options = {}) {
  const showAddLead = Boolean(options.addLead && canCreateLeads());
  const pipelineFilters = options.pipelineFilters ? renderPipelineFilterControls() : "";
  const filters = options.filters ? `
    <div class="page-filters ${showAddLead ? "with-add-lead" : ""}">
      ${pipelineFilters}
      <input id="pageSearch" value="${escapeHtml(state.search)}" placeholder="Buscar lead, telefone, fase ou corretor">
      <button id="pageFavoriteToggle" class="${state.favoritesOnly ? "primary" : ""}" title="Filtrar favoritos">★</button>
      ${showAddLead ? '<button id="addLeadButton" class="primary add-lead-button">Adicionar Lead</button>' : ""}
    </div>
  ` : "";
  const actions = options.actions ? `<div class="view-head-actions">${options.actions}</div>` : "";
  const className = options.className ? ` ${escapeHtml(options.className)}` : "";
  return `
    <div class="view-head${className}">
      <div class="view-title">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${filters || actions}
    </div>
  `;
}

function filterSummary(selected, fallback) {
  if (!selected.length) return fallback;
  if (selected.length === 1) return "1 selecionado";
  return `${selected.length} selecionados`;
}

function renderMultiFilter(id, label, selected, options) {
  const allChecked = !selected.length || options.every((option) => selected.includes(option.value));
  return `
    <details class="multi-filter" id="${escapeHtml(id)}">
      <summary>${escapeHtml(label)} <strong>${escapeHtml(filterSummary(selected, "Todos"))}</strong></summary>
      <div class="multi-filter-menu">
        <div class="multi-filter-options">
          <label class="multi-filter-all">
            <input type="checkbox" data-multi-filter-all="${escapeHtml(id)}" ${allChecked ? "checked" : ""}>
            <span>Todos <em>(${options.reduce((total, option) => total + Number(option.count || 0), 0)})</em></span>
          </label>
          ${options.map((option) => `
            <label>
              <input type="checkbox" data-multi-filter-option="${escapeHtml(id)}" value="${escapeHtml(option.value)}" ${selected.includes(option.value) ? "checked" : ""}>
              <span>${escapeHtml(option.label)} <em>(${Number(option.count || 0)})</em></span>
            </label>
          `).join("")}
        </div>
        <div class="multi-filter-actions">
          <button type="button" data-multi-filter-clear="${escapeHtml(id)}">Limpar</button>
          <button type="button" class="primary tiny" data-multi-filter-apply="${escapeHtml(id)}">Aplicar</button>
        </div>
      </div>
    </details>
  `;
}

function availabilityStatusKey(status) {
  return String(status || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function availabilityDefaultStatusMappings() {
  return [
    { id: "available", label: "Disponível", color: "#22c55e", pipelineStatuses: ["Disponível", "Livre"], samCodes: [] },
    { id: "reserved", label: "Reservada", color: "#f59e0b", pipelineStatuses: ["Reservado", "Reserva", "Reserva criada"], samCodes: ["reservation_created", "reserva"] },
    { id: "contract_issued", label: "Contrato emitido", color: "#00a8ff", pipelineStatuses: ["Contrato Emitido"], samCodes: ["contract_issued", "contrato_emitido"] },
    { id: "sold", label: "Vendida", color: "#dc2626", pipelineStatuses: ["Contrato Assinado", "Venda Finalizada"], samCodes: ["contract_signed", "contrato_assinado", "venda_finalizada"] },
    { id: "blocked", label: "Bloqueada", color: "#64748b", pipelineStatuses: ["Bloqueada"], samCodes: ["bloqueada"] },
    { id: "exchange", label: "Permutante", color: "#7c3aed", pipelineStatuses: ["Permutante"], samCodes: ["permutante"] }
  ];
}

function listFromTextClient(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAvailabilitySettingsClient(input = {}) {
  const defaults = availabilityDefaultStatusMappings();
  const incoming = Array.isArray(input.statusMappings) ? input.statusMappings : [];
  const byId = new Map(defaults.map((item, index) => [item.id, { ...item, position: index }]));
  incoming.forEach((item, index) => {
    const label = String(item?.label || "").trim();
    const id = String(item?.id || label || `availability-status-${index}`).trim();
    if (!id || !label) return;
    byId.set(id, {
      ...(byId.get(id) || {}),
      id,
      label,
      color: String(item.color || byId.get(id)?.color || "#e5e7eb").trim(),
      pipelineStatuses: [...new Set(listFromTextClient(item.pipelineStatuses))],
      samCodes: [...new Set(listFromTextClient(item.samCodes))],
      position: Number(item.position ?? index) || index
    });
  });
  return {
    architectureOptions: [...new Set(listFromTextClient(input.architectureOptions))],
    typologyOptions: [...new Set(listFromTextClient(input.typologyOptions))],
    statusMappings: [...byId.values()]
      .filter((item) => item.label)
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  };
}

function availabilityStatusMappings() {
  return normalizeAvailabilitySettingsClient(state.availabilitySettings || {}).statusMappings;
}

function availabilityMappingMatches(mapping = {}, value = "") {
  const key = availabilityStatusKey(value);
  if (!key) return false;
  const candidates = [
    mapping.label,
    ...(mapping.pipelineStatuses || []),
    ...(mapping.samCodes || [])
  ];
  return candidates.some((candidate) => availabilityStatusKey(candidate) === key);
}

function availabilityMappingForStatus(value) {
  return availabilityStatusMappings().find((mapping) => availabilityMappingMatches(mapping, value)) || null;
}

function availabilityAvailableLabel() {
  return availabilityStatusMappings().find((mapping) => availabilityStatusKey(mapping.label) === availabilityStatusKey("Disponível"))?.label || "Disponível";
}

function unitStatusStyle(status) {
  return availabilityMappingForStatus(status)?.color || "#e5e7eb";
}

function unitFloorLabel(value) {
  const floor = String(value || "").trim();
  return floor ? `${floor}xx` : "Sem andar";
}

function unitColumnLabel(value) {
  const column = String(value || "").trim();
  return column ? `x${column.padStart(2, "0")}` : "Sem coluna";
}

function sortAlphaNumeric(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true, sensitivity: "base" });
}

function unitsForAvailabilityProject(project) {
  return (state.unitDefinitions || []).filter((unit) => unit.project === project);
}

function padUnitPart(value, size = 2) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(size, "0").slice(-size) : "";
}

function projectDefinitionByName(projectName) {
  return (state.projectDefinitions || []).find((project) => project.name === projectName) || {};
}

function availabilityProjects() {
  return (state.projectDefinitions || []).filter((project) => project.name && project.availabilityEnabled !== false);
}

function primaryProjectPrefix(projectName) {
  const definition = projectDefinitionByName(projectName);
  const prefix = (definition.unitPrefixes || []).find(Boolean);
  return String(prefix || projectName || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3);
}

function generatedUnitCodes(projectName, block, floor, column) {
  const blockCode = padUnitPart(block, 2);
  const floorRaw = String(floor || "").replace(/\D/g, "");
  const columnCode = padUnitPart(column, 2);
  if (!projectName || !blockCode || !floorRaw || !columnCode) return { unit: "", samCode: "" };
  const floorDisplay = String(Number.parseInt(floorRaw, 10) || floorRaw);
  const floorSam = padUnitPart(floorRaw, 2);
  const unitNumber = `${floorDisplay}${columnCode}`;
  return {
    unit: `${blockCode}-${unitNumber}`,
    samCode: `${primaryProjectPrefix(projectName)}${blockCode}${floorSam}${columnCode}`
  };
}

function blockLayoutType(block = {}) {
  return normalizeText(block.layoutType || block.unitLayout || block.blockLayout || "").includes("horizontal")
    ? "Horizontal"
    : "Vertical";
}

function horizontalUnitNumber(value, size = 2) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(size, "0") : "";
}

function horizontalUnitCodes(projectName, block = {}, number) {
  const start = String(block.numberStart || "").replace(/\D/g, "");
  const end = String(block.numberEnd || "").replace(/\D/g, "");
  const width = Math.max(2, start.length, end.length, String(number || "").replace(/\D/g, "").length);
  const numberCode = horizontalUnitNumber(number, width);
  const unitPrefix = String(block.unitPrefix || "").trim().replace(/\s+/g, "");
  const suffix = `${unitPrefix}${numberCode}`.toUpperCase();
  return {
    unit: suffix,
    samCode: `${primaryProjectPrefix(projectName)}${suffix}`.replace(/[^a-z0-9]/gi, "").toUpperCase()
  };
}

function availabilityUnitSamCandidates(unit = {}, projectName = unit.project || "") {
  const candidates = [unit.samCode, unit.unitSamCode];
  const generated = generatedUnitCodes(projectName, unit.block, unit.floor, unit.column);
  candidates.push(generated.samCode);
  const blockDefinition = blockDefinitionsForProject(projectName).find((item) => blockKey(item.block) === blockKey(unit.block)) || {};
  if (blockLayoutType(unit) === "Horizontal" || blockLayoutType(blockDefinition) === "Horizontal") {
    const horizontalNumber = unit.number || unit.unitNumber || unit.column || unit.unit || unit.samCode;
    const horizontalGenerated = horizontalUnitCodes(projectName, { ...blockDefinition, ...unit }, horizontalNumber);
    candidates.push(horizontalGenerated.samCode, horizontalGenerated.unit);
  }
  const visualMatch = String(unit.unit || "").match(/(\d+)\D+(\d+)/);
  if (visualMatch) {
    const [, block, unitNumber] = visualMatch;
    const blockCode = padUnitPart(block, 2);
    const unitDigits = String(unitNumber || "").replace(/\D/g, "");
    const floor = unitDigits.length > 2 ? unitDigits.slice(0, -2) : unit.floor;
    const column = unitDigits.slice(-2) || unit.column;
    candidates.push(generatedUnitCodes(projectName, blockCode, floor, column).samCode);
  }
  return [...new Set(candidates.map(availabilityNormalizeUnit).filter(Boolean))];
}

function availabilityNormalizeUnit(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function canViewAvailabilitySaleValue() {
  return ["Admin TI", "Head Comercial", "Diretoria"].includes(state.user?.role);
}

function availabilityStatusLabel(unit = {}) {
  const mappings = availabilityStatusMappings();
  const soldMapping = mappings.find((mapping) => availabilityStatusKey(mapping.label) === availabilityStatusKey("Vendida"));
  const availableMapping = mappings.find((mapping) => availabilityStatusKey(mapping.label) === availabilityStatusKey("Disponível"));
  const directMapping = availabilityMappingForStatus(unit.status);
  if (directMapping) return directMapping.label;
  const normalized = availabilityStatusKey(unit.status);
  if (normalized.includes("vend") || normalized.includes("contrato assinado")) return soldMapping?.label || "Vendida";
  if (normalized.includes("reserv")) return availabilityMappingForStatus("Reservada")?.label || "Reservada";
  if (normalized.includes("bloque")) return availabilityMappingForStatus("Bloqueada")?.label || "Bloqueada";
  if (normalized.includes("permut")) return availabilityMappingForStatus("Permutante")?.label || "Permutante";
  if (unit.purchaseBuyerName || unit.purchaseSignedAt || Number(unit.purchaseValue || 0) > 0) return soldMapping?.label || "Vendida";
  return availableMapping?.label || "Disponível";
}

function availabilityStatusSummary(units = []) {
  const labels = availabilityStatusMappings().map((mapping) => mapping.label);
  const counts = Object.fromEntries(labels.map((label) => [label, 0]));
  units.forEach((unit) => {
    const label = availabilityStatusLabel(unit);
    counts[label] = (counts[label] || 0) + 1;
  });
  return labels.map((label) => `
    <span class="availability-status-chip" style="--chip-color:${escapeHtml(unitStatusStyle(label))}">
      <i></i>${escapeHtml(label)} <strong>${counts[label] || 0}</strong>
    </span>
  `).join("");
}

function availabilityBlockLabel(projectName, blockCode) {
  const block = blockDefinitionsForProject(projectName).find((item) => blockKey(item.block) === blockKey(blockCode));
  return block?.structureType || "Bloco";
}

function blockKey(value) {
  return String(value || "").trim().replace(/^0+(\d+)$/, "$1").toUpperCase();
}

function blockDisplayName(block = {}) {
  return String(block.block || block.name || block.code || "").trim();
}

function expectedUnitsForBlock(block = {}) {
  if (blockLayoutType(block) === "Horizontal") {
    const start = Number.parseInt(block.numberStart || 0, 10) || 0;
    const end = Number.parseInt(block.numberEnd || 0, 10) || 0;
    return start && end && end >= start ? end - start + 1 : 0;
  }
  const totalFloors = Number(block.floorCount || 0) + (block.hasPenthouse ? 1 : 0);
  return totalFloors * Number(block.columnCount || 0);
}

function blockDefinitionsForProject(projectName) {
  return (projectDefinitionByName(projectName).blockDefinitions || []).slice().sort((a, b) => sortAlphaNumeric(a.block, b.block));
}

function availabilityLeadUnitSnapshots(projectName) {
  const snapshots = new Map();
  (state.leads || []).forEach((lead) => {
    pipelineItemsFromLead(lead).forEach((item) => {
      const itemProject = leadProjectValue(item);
      if (projectName && itemProject && itemProject !== projectName) return;
      const samCode = availabilityNormalizeUnit(item.unitSamCode || item.unit || item.desiredUnit);
      if (!samCode) return;
      snapshots.set(samCode, {
        leadId: lead.id,
        leadName: lead.name,
        status: item.status,
        project: itemProject,
        unitValue: availabilityStatusKey(item.status).includes("contrato assinado") || availabilityStatusKey(item.status).includes("vend")
          ? item.unitValue || lead.unitValue || lead.value || ""
          : "",
        signedAt: availabilityStatusKey(item.status).includes("contrato assinado") || availabilityStatusKey(item.status).includes("vend")
          ? item.contractSignedAt || lead.contractSignedAt || ""
          : "",
        purchaseBuyerName: lead.name
      });
    });
  });
  return snapshots;
}

function mergeAvailabilityUnitSnapshot(unit, snapshot) {
  if (!snapshot) return unit;
  return {
    ...unit,
    status: snapshot.status || unit.status,
    leadId: snapshot.leadId || unit.leadId,
    buyerName: snapshot.leadName || unit.buyerName,
    purchaseBuyerName: snapshot.purchaseBuyerName || unit.purchaseBuyerName,
    purchaseSignedAt: snapshot.signedAt || unit.purchaseSignedAt,
    purchaseValue: snapshot.unitValue || unit.purchaseValue
  };
}

function virtualUnitsForProject(projectName) {
  const existingByKey = new Map();
  unitsForAvailabilityProject(projectName).forEach((unit) => {
    existingByKey.set(`${blockKey(unit.block)}:${String(unit.floor || "")}:${String(unit.column || "").trim().toUpperCase()}`, unit);
    const horizontalToken = String(unit.unit || unit.samCode || unit.column || "").trim().toUpperCase();
    if (horizontalToken) existingByKey.set(`${blockKey(unit.block)}::${horizontalToken}`, unit);
  });
  const unitStatusBySamCode = availabilityLeadUnitSnapshots(projectName);
  const snapshotForUnit = (unit) => availabilityUnitSamCandidates(unit, projectName)
    .map((candidate) => unitStatusBySamCode.get(candidate))
    .find(Boolean);
  const virtualUnits = [];
  blockDefinitionsForProject(projectName).forEach((block) => {
    if (blockLayoutType(block) === "Horizontal") {
      const start = Number.parseInt(block.numberStart || 0, 10) || 0;
      const end = Number.parseInt(block.numberEnd || 0, 10) || 0;
      for (let number = start; number && number <= end; number += 1) {
        const generated = horizontalUnitCodes(projectName, block, number);
        const key = `${blockKey(block.block)}::${String(generated.unit || "").toUpperCase()}`;
        const existing = existingByKey.get(key) || {};
        const unit = existing.id ? existing : {
          id: `virtual:${projectName}:${key}`,
          project: projectName,
          unit: generated.unit,
          samCode: generated.samCode,
          block: blockDisplayName(block),
          floor: "",
          column: generated.unit,
          status: "",
          virtual: true,
          floorKind: "",
          structureType: block.structureType || "Quadra",
          layoutType: "Horizontal"
        };
        virtualUnits.push(mergeAvailabilityUnitSnapshot(unit, snapshotForUnit(unit)));
      }
      return;
    }
    const floorCount = Number(block.floorCount || 0);
    const totalFloors = floorCount + (block.hasPenthouse ? 1 : 0);
    const columnCount = Number(block.columnCount || 0);
    for (let floor = 1; floor <= totalFloors; floor += 1) {
      for (let column = 1; column <= columnCount; column += 1) {
        const columnCode = padUnitPart(column, 2);
        const blockCode = blockKey(block.block);
        const key = `${blockCode}:${floor}:${columnCode}`;
        const generated = generatedUnitCodes(projectName, block.block, floor, column);
        const existing = existingByKey.get(key) || {};
        const unit = existing.id ? existing : {
          id: `virtual:${projectName}:${key}`,
          project: projectName,
          unit: generated.unit,
          samCode: generated.samCode,
          block: blockDisplayName(block) || blockCode,
          floor: String(floor),
          column: columnCode,
          status: "",
          virtual: true,
          floorKind: block.hasPenthouse && floor === totalFloors ? "Cobertura" : "Tipo",
          structureType: block.structureType || "Bloco",
          layoutType: "Vertical"
        };
        virtualUnits.push(mergeAvailabilityUnitSnapshot(unit, snapshotForUnit(unit)));
      }
    }
  });
  if (virtualUnits.length) return virtualUnits;
  return unitsForAvailabilityProject(projectName).map((unit) => (
    mergeAvailabilityUnitSnapshot(unit, snapshotForUnit(unit))
  ));
}

function selectedAvailabilityUnit() {
  const selectedProject = state.selectedAvailabilityProject || state.projectDefinitions?.[0]?.name || "";
  return virtualUnitsForProject(selectedProject).find((unit) => unit.id === state.selectedAvailabilityUnitId) || null;
}

function visualMapForProject(project = {}) {
  const visualMap = project?.visualMap && typeof project.visualMap === "object" ? project.visualMap : {};
  return {
    image: String(visualMap.image || "").trim(),
    hotspots: normalizeVisualMapHotspots(visualMap.hotspots || [])
  };
}

function normalizeVisualMapPoint(point = {}) {
  const rawX = Number(point.x);
  const rawY = Number(point.y);
  const x = clamp(Number.isFinite(rawX) ? rawX : 0, 0, 100);
  const y = clamp(Number.isFinite(rawY) ? rawY : 0, 0, 100);
  return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
}

function normalizeVisualMapHotspots(hotspots = []) {
  return (Array.isArray(hotspots) ? hotspots : []).map((hotspot, index) => ({
    id: String(hotspot.id || `hotspot-${Date.now()}-${index}`),
    unitId: String(hotspot.unitId || ""),
    unitSamCode: String(hotspot.unitSamCode || ""),
    unit: String(hotspot.unit || ""),
    points: (Array.isArray(hotspot.points) ? hotspot.points : []).map(normalizeVisualMapPoint)
  })).filter((hotspot) => hotspot.unitId || hotspot.unitSamCode || hotspot.unit || hotspot.points.length);
}

function normalizeVisualUnitCode(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function unitForVisualHotspot(hotspot = {}, units = []) {
  return units.find((unit) => (
    (hotspot.unitId && unit.id === hotspot.unitId) ||
    (hotspot.unitSamCode && normalizeVisualUnitCode(unit.samCode || "") === normalizeVisualUnitCode(hotspot.unitSamCode)) ||
    (hotspot.unit && normalizeVisualUnitCode(unit.unit || "") === normalizeVisualUnitCode(hotspot.unit))
  )) || null;
}

function visualMapHotspotCentroid(points = []) {
  const validPoints = (points || []).map(normalizeVisualMapPoint);
  if (!validPoints.length) return { x: 50, y: 50 };
  const total = validPoints.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / validPoints.length, y: total.y / validPoints.length };
}

function visualMapSvgPoints(points = []) {
  return (points || []).map(normalizeVisualMapPoint).map((point) => `${point.x},${point.y}`).join(" ");
}

function renderAvailability() {
  const projects = availabilityProjects();
  const selectedProject = state.selectedAvailabilityProject || projects[0]?.name || "";
  if (selectedProject && !projects.some((project) => project.name === selectedProject)) {
    state.selectedAvailabilityProject = projects[0]?.name || "";
    return renderAvailability();
  }
  const projectUnits = virtualUnitsForProject(selectedProject);
  const selectedUnit = selectedAvailabilityUnit();
  const blocks = [...new Set(projectUnits.map((unit) => unit.block || "1"))].sort(sortAlphaNumeric);
  const leadById = new Map((state.leads || []).map((lead) => [lead.id, lead]));
  const projectCards = projects.map((project) => {
    const units = virtualUnitsForProject(project.name);
    const busy = units.filter((unit) => availabilityStatusLabel(unit) !== availabilityAvailableLabel()).length;
    return `
      <button type="button" class="availability-project-card ${selectedProject === project.name ? "active" : ""}" data-availability-project="${escapeHtml(project.name)}">
        <strong>${escapeHtml(project.name)}</strong>
        <span>${units.length} unidade(s)</span>
        <em>${busy} com status</em>
      </button>
    `;
  }).join("");
  const tables = blocks.map((block) => {
    const units = projectUnits.filter((unit) => (unit.block || "1") === block);
    const blockDefinition = blockDefinitionsForProject(selectedProject).find((item) => blockKey(item.block) === blockKey(block)) || {};
    const floors = [...new Set(units.map((unit) => unit.floor || ""))].sort(sortAlphaNumeric);
    const columns = [...new Set(units.map((unit) => unit.column || ""))].sort(sortAlphaNumeric);
    const structureLabel = availabilityBlockLabel(selectedProject, block);
    const isHorizontalBlock = blockLayoutType(blockDefinition) === "Horizontal" || units.some((unit) => blockLayoutType(unit) === "Horizontal");
    if (isHorizontalBlock) {
      const cells = [...units].sort((a, b) => sortAlphaNumeric(a.unit || a.samCode || a.column, b.unit || b.samCode || b.column)).map((unit) => {
        const label = availabilityStatusLabel(unit);
        const color = unitStatusStyle(label);
        return `
          <button type="button" class="availability-unit-cell ${unit.virtual ? "virtual" : ""} ${state.selectedAvailabilityUnitId === unit.id ? "active" : ""}" style="--unit-status-color:${escapeHtml(color)}" data-availability-unit="${escapeHtml(unit.id)}">
            <span>${escapeHtml(unit.unit || unit.samCode || "-")}</span>
          </button>
        `;
      }).join("");
      return `
        <section class="availability-block">
          <div class="availability-block-head">
            <h2>${escapeHtml(structureLabel)} ${escapeHtml(block)}</h2>
            <div class="availability-status-summary">${availabilityStatusSummary(units)}</div>
          </div>
          <div class="availability-horizontal-grid">
            ${cells || '<p class="empty">Nenhuma unidade prevista para esta estrutura.</p>'}
          </div>
        </section>
      `;
    }
    return `
      <section class="availability-block">
        <div class="availability-block-head">
          <h2>${escapeHtml(structureLabel)} ${escapeHtml(block)}</h2>
          <div class="availability-status-summary">${availabilityStatusSummary(units)}</div>
        </div>
        <div class="availability-grid-wrap">
          <table class="availability-grid">
            <thead><tr><th>Andar</th>${columns.map((column) => `<th>${escapeHtml(unitColumnLabel(column))}</th>`).join("")}</tr></thead>
            <tbody>
              ${floors.map((floor) => `
                <tr>
                  <th>${escapeHtml(unitFloorLabel(floor))}</th>
                  ${columns.map((column) => {
                    const unit = units.find((item) => (item.floor || "") === floor && (item.column || "") === column);
                    if (!unit) return "<td></td>";
                    const label = availabilityStatusLabel(unit);
                    const color = unitStatusStyle(label);
                    return `<td><button type="button" class="availability-unit-cell ${unit.virtual ? "virtual" : ""} ${state.selectedAvailabilityUnitId === unit.id ? "active" : ""}" style="--unit-status-color:${escapeHtml(color)}" data-availability-unit="${escapeHtml(unit.id)}">${escapeHtml(unit.unit)}</button></td>`;
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");
  const linkedLead = selectedUnit?.leadId ? leadById.get(selectedUnit.leadId) : null;
  const purchaseValue = Number(selectedUnit?.purchaseValue || 0);
  const saleValue = purchaseValue
    ? canViewAvailabilitySaleValue() ? money(purchaseValue) : "XXXXXX"
    : "-";
  renderShell(`
    ${renderViewHead("Disponibilidade", "Quadro de unidades por empreendimento", {
      actions: ""
    })}
    <section class="availability-layout">
      <div class="availability-main">
        <section class="availability-projects">${projectCards || '<p class="empty">Cadastre empreendimentos para montar o quadro.</p>'}</section>
        ${tables || '<section class="panel empty">Cadastre blocos para montar o quadro deste empreendimento.</section>'}
      </div>
      <aside class="availability-detail">
        ${selectedUnit ? `
          <h2>${escapeHtml(selectedUnit.unit)}</h2>
          ${selectedUnit.virtual ? '<p class="chip chip-warning">Unidade prevista pelo bloco</p>' : ""}
          <p class="muted-copy">${escapeHtml(selectedUnit.project)} · ${escapeHtml(availabilityBlockLabel(selectedUnit.project, selectedUnit.block))} ${escapeHtml(selectedUnit.block || "-")}</p>
          <dl class="unit-detail-list">
            <div><dt>Status</dt><dd>${escapeHtml(availabilityStatusLabel(selectedUnit))}</dd></div>
            ${blockLayoutType(selectedUnit) === "Horizontal"
              ? '<div><dt>Modelo</dt><dd>Horizontal</dd></div>'
              : `<div><dt>Andar</dt><dd>${escapeHtml(unitFloorLabel(selectedUnit.floor))} · ${escapeHtml(selectedUnit.floorKind || "Tipo")}</dd></div>`}
            <div><dt>Cliente/lead</dt><dd>${escapeHtml(selectedUnit.buyerName || linkedLead?.name || "-")}</dd></div>
            <div><dt>Comprador</dt><dd>${escapeHtml(selectedUnit.purchaseBuyerName || selectedUnit.buyerName || "-")}</dd></div>
            <div><dt>Data da compra</dt><dd>${escapeHtml(dateTimeLabel(selectedUnit.purchaseSignedAt) || "-")}</dd></div>
            <div><dt>Valor da compra</dt><dd>${escapeHtml(saleValue)}</dd></div>
            <div><dt>Código SAM</dt><dd>${escapeHtml(selectedUnit.samCode || "-")}</dd></div>
            <div><dt>Área útil</dt><dd>${escapeHtml(selectedUnit.usefulArea || "-")}</dd></div>
            <div><dt>Área privativa</dt><dd>${escapeHtml(selectedUnit.privateArea || "-")}</dd></div>
            <div><dt>Posição</dt><dd>${escapeHtml(selectedUnit.sunPosition || "-")}</dd></div>
            <div><dt>Tipo</dt><dd>${escapeHtml(selectedUnit.unitType || "-")}</dd></div>
            <div><dt>Arquitetura</dt><dd>${escapeHtml(selectedUnit.architecture || "-")}</dd></div>
            <div><dt>Tipologia</dt><dd>${escapeHtml(selectedUnit.typology || "-")}</dd></div>
            <div><dt>Fração ideal</dt><dd>${escapeHtml(selectedUnit.idealFraction || "-")}</dd></div>
            <div><dt>Vista</dt><dd>${escapeHtml(selectedUnit.view || "-")}</dd></div>
          </dl>
          ${selectedUnit.floorPlanDataUrl ? `<a class="unit-plan-link" href="${escapeHtml(selectedUnit.floorPlanDataUrl)}" target="_blank" rel="noopener">Abrir planta</a>` : ""}
          ${selectedUnit.leadId ? `<button type="button" class="secondary full-width" data-open-linked-lead="${escapeHtml(selectedUnit.leadId)}">Abrir lead</button>` : ""}
        ` : '<div class="empty">Clique em uma unidade para ver os detalhes.</div>'}
      </aside>
    </section>
  `);
  document.querySelectorAll("[data-availability-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAvailabilityProject = button.dataset.availabilityProject;
      state.selectedAvailabilityUnitId = "";
      renderAvailability();
    });
  });
  document.querySelectorAll("[data-availability-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAvailabilityUnitId = button.dataset.availabilityUnit;
      renderAvailability();
    });
  });
  document.querySelector("[data-open-linked-lead]")?.addEventListener("click", (event) => {
    routeTo("lead", event.currentTarget.dataset.openLinkedLead);
  });
}

function isReservaGuinleProject(projectName) {
  return normalizeText(projectName).includes("reserva guinle");
}

function masterplanPinPosition(unit, index, total) {
  const source = String(unit.unit || unit.samCode || "");
  const digits = source.match(/\d+/g)?.join("") || String(index + 1);
  const number = Number(digits.slice(-4)) || index + 1;
  const row = Math.floor(index / 12);
  const col = index % 12;
  const rows = Math.max(1, Math.ceil(Math.max(total, 1) / 12));
  const leftByCol = 9 + (col / 11) * 82;
  const topByRow = 45 + (row / Math.max(1, rows - 1)) * 42;
  const left = clamp(leftByCol + ((number % 5) - 2) * 0.8, 7, 93);
  const top = clamp(topByRow + ((number % 7) - 3) * 0.7, 42, 90);
  return `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;`;
}

function enableMasterplanPan(viewport) {
  if (!viewport) return;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, input, a")) return;
    isDragging = true;
    viewport.classList.add("dragging");
    startX = event.clientX;
    startY = event.clientY;
    startLeft = viewport.scrollLeft;
    startTop = viewport.scrollTop;
    viewport.setPointerCapture?.(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    viewport.scrollLeft = startLeft - (event.clientX - startX);
    viewport.scrollTop = startTop - (event.clientY - startY);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    viewport.addEventListener(type, (event) => {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("dragging");
      viewport.releasePointerCapture?.(event.pointerId);
    });
  });
}

function renderAvailabilityMasterplan(projectName, units = []) {
  const project = projectDefinitionByName(projectName);
  const visualMap = visualMapForProject(project);
  const image = visualMap.image || (isReservaGuinleProject(projectName) ? "/reserva-guinle-masterplan.jpeg" : "");
  if (!image) return "";
  const sortedUnits = [...units].sort((a, b) => String(a.samCode || a.unit || "").localeCompare(String(b.samCode || b.unit || ""), "pt-BR", { numeric: true, sensitivity: "base" }));
  const zoom = clamp(Number(state.masterplanZoom || 1), 1, 3);
  const zoomPercent = Math.round(zoom * 100);
  const hotspots = visualMap.hotspots.map((hotspot) => {
    const unit = unitForVisualHotspot(hotspot, sortedUnits);
    return unit ? { hotspot, unit } : null;
  }).filter(Boolean);
  return `
    <section class="availability-masterplan-card">
      <div class="availability-masterplan-head">
        <div>
          <h2>Mapa visual ${escapeHtml(projectName)}</h2>
          <small>Visão visual de lotes e casas do empreendimento.</small>
        </div>
        <div class="availability-masterplan-actions">
          <div class="availability-status-summary">${availabilityStatusSummary(units)}</div>
          <div class="masterplan-zoom-controls" aria-label="Zoom da masterplan">
            <button type="button" class="masterplan-zoom-button" data-masterplan-zoom="out">-</button>
            <input id="masterplanZoomRange" class="masterplan-zoom-range" type="range" min="100" max="300" step="20" value="${zoomPercent}">
            <button type="button" class="masterplan-zoom-button" data-masterplan-zoom="in">+</button>
            <button type="button" class="masterplan-zoom-reset" data-masterplan-zoom="reset">${zoomPercent}%</button>
          </div>
        </div>
      </div>
      <div class="availability-masterplan-viewport" data-masterplan-viewport>
        <div class="availability-masterplan-canvas" style="width:${zoomPercent}%">
          <img class="availability-masterplan-image" src="${escapeHtml(image)}" alt="Mapa visual ${escapeHtml(projectName)}">
          <svg class="visual-map-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Hotspots do mapa visual">
            ${hotspots.map(({ hotspot, unit }) => {
              const label = availabilityStatusLabel(unit);
              const color = unitStatusStyle(label);
              const centroid = visualMapHotspotCentroid(hotspot.points);
              const points = visualMapSvgPoints(hotspot.points);
              return `
                ${points ? `<polygon class="visual-map-hotspot-shape ${state.selectedAvailabilityUnitId === unit.id ? "active" : ""}" points="${escapeHtml(points)}" style="--unit-status-color:${escapeHtml(color)}" data-availability-unit="${escapeHtml(unit.id)}"></polygon>` : ""}
                <circle class="visual-map-hotspot-dot ${state.selectedAvailabilityUnitId === unit.id ? "active" : ""}" cx="${centroid.x}" cy="${centroid.y}" r="1.4" style="--unit-status-color:${escapeHtml(color)}" data-availability-unit="${escapeHtml(unit.id)}"></circle>
              `;
            }).join("")}
          </svg>
        </div>
      </div>
      <div class="masterplan-unit-grid" aria-label="Lotes e casas cadastrados">
        ${sortedUnits.map((unit) => {
          const label = availabilityStatusLabel(unit);
          const color = unitStatusStyle(label);
          return `
            <button type="button" class="masterplan-unit-chip ${state.selectedAvailabilityUnitId === unit.id ? "active" : ""}" style="--unit-status-color:${escapeHtml(color)}" data-availability-unit="${escapeHtml(unit.id)}">
              <strong>${escapeHtml(unit.unit || unit.samCode || "-")}</strong>
              <span>${escapeHtml(label)}</span>
            </button>
          `;
        }).join("") || '<p class="empty">Cadastre as unidades para ativar os lotes da masterplan.</p>'}
      </div>
    </section>
  `;
}

function pipelineFilterBaseLeads(skipKey = "") {
  return filteredLeads().flatMap((lead) => pipelineItemsFromLead(lead)).filter((lead) => {
    if (!lead.inPipeline) return false;
    if (state.user?.role === "Corretor" && lead.assignedTo !== state.user.id) return false;
    if (skipKey !== "projectFilters" && state.projectFilters.length && !state.projectFilters.includes(leadProjectValue(lead) || "__none__")) return false;
    if (skipKey !== "brokerFilters" && state.brokerFilters.length && !state.brokerFilters.includes(lead.assignedTo || "__none__")) return false;
    if (skipKey !== "tagFilters" && !leadMatchesTagFilter(lead)) return false;
    if (skipKey !== "dateFilters" && !leadMatchesDateFilter(lead)) return false;
    if (skipKey !== "frequencyFilters" && !leadMatchesFrequencyFilter(lead)) return false;
    return true;
  });
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || "__none__";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function renderPipelineFilterControls() {
  const projectCounts = countBy(pipelineFilterBaseLeads("projectFilters"), (lead) => leadProjectValue(lead));
  const brokerCounts = countBy(pipelineFilterBaseLeads("brokerFilters"), (lead) => lead.assignedTo);
  const tagCounts = countBy(pipelineFilterBaseLeads("tagFilters").flatMap((lead) => {
    const tags = leadTags(lead);
    return tags.length ? tags : ["__none__"];
  }), (tag) => tag);
  const frequencyCounts = countBy(pipelineFilterBaseLeads("frequencyFilters"), (lead) => frequencyBucketForLead(lead));
  const projectOptions = state.projects
    .map((project) => ({ value: project, label: project, count: projectCounts[project] || 0 }))
    .filter((option) => option.value)
    .concat({ value: "__none__", label: "Sem vínculo", count: projectCounts.__none__ || 0 });
  const brokerOptions = [
    ...activeBrokers().map((broker) => ({ value: broker.id, label: broker.name, count: brokerCounts[broker.id] || 0 })),
    { value: "__none__", label: "Sem vínculo", count: brokerCounts.__none__ || 0 }
  ];
  const tagOptions = [
    ...availableTags().map((tag) => ({ value: tag.name, label: tag.name, count: tagCounts[tag.name] || 0 })),
    { value: "__none__", label: "Sem etiqueta", count: tagCounts.__none__ || 0 }
  ];
  const frequencyOptions = [
    { value: "1", label: "Com interação há 1 dia", count: frequencyCounts["1"] || 0 },
    { value: "7", label: "Com interação há 7 dias", count: frequencyCounts["7"] || 0 },
    { value: "14", label: "Com interação há 14 dias", count: frequencyCounts["14"] || 0 },
    { value: "30", label: "Com interação há 30 dias", count: frequencyCounts["30"] || 0 },
    { value: "60", label: "Com interação há 60 dias", count: frequencyCounts["60"] || 0 },
    { value: "60plus", label: "Sem interação há +60 dias", count: frequencyCounts["60plus"] || 0 }
  ];
  return `
    <div class="pipeline-filter-row">
      ${renderMultiFilter("projectFilters", "Empreendimento", state.projectFilters, projectOptions)}
      ${canManageLeads() ? renderMultiFilter("brokerFilters", "Corretor", state.brokerFilters, brokerOptions) : ""}
    </div>
    <div class="pipeline-filter-row secondary">
      <details class="date-filter">
        <summary>
          <span>Data</span>
          <strong>${state.dateFilterStart || state.dateFilterEnd ? "Filtrada" : "Todos"}</strong>
        </summary>
        <div class="date-filter-menu">
          <label>
            <span>Início</span>
            <input id="dateFilterStart" type="date" value="${escapeHtml(state.dateFilterStart)}" aria-label="Data inicial">
          </label>
          <label>
            <span>Fim</span>
            <input id="dateFilterEnd" type="date" value="${escapeHtml(state.dateFilterEnd)}" aria-label="Data final">
          </label>
          <div class="date-filter-actions">
            <button type="button" class="tiny primary" data-date-filter-apply>Aplicar</button>
            <button type="button" class="tiny" data-date-filter-clear>Limpar</button>
          </div>
        </div>
      </details>
      ${renderMultiFilter("tagFilters", "Etiqueta", state.tagFilters, tagOptions)}
      ${renderMultiFilter("frequencyFilters", "Frequência", state.frequencyFilters, frequencyOptions)}
    </div>
  `;
}

function pageSearchSnapshot(input) {
  if (!input) return null;
  return {
    start: input.selectionStart,
    end: input.selectionEnd
  };
}

function restorePageSearchFocus(snapshot) {
  requestAnimationFrame(() => {
    const nextSearch = document.querySelector("#pageSearch");
    if (!nextSearch) return;
    nextSearch.focus({ preventScroll: true });
    if (!snapshot) return;
    const start = typeof snapshot.start === "number" ? snapshot.start : nextSearch.value.length;
    const end = typeof snapshot.end === "number" ? snapshot.end : start;
    try {
      nextSearch.setSelectionRange(start, end);
    } catch {}
  });
}

function renderSearchView(view) {
  if (view === "odysseia") return renderLeadBases();
  if (view === "sheet") return renderSheet();
  return renderApp();
}

async function refreshSearchView(view, sequence, snapshot) {
  if (view === "odysseia") {
    while (state.leadsLoading) await new Promise((resolve) => setTimeout(resolve, 80));
    if (sequence !== pageSearchRequestSeq || state.view !== view) return;
    await loadLeadsForCurrentView(true);
    if (sequence !== pageSearchRequestSeq || state.view !== view) return;
  }
  renderSearchView(view);
  restorePageSearchFocus(snapshot);
}

function bindPageFilters() {
  const search = document.querySelector("#pageSearch");
  const favoriteToggle = document.querySelector("#pageFavoriteToggle");
  const addLeadButton = document.querySelector("#addLeadButton");
  let composingSearch = false;
  const scheduleSearchRender = (snapshot) => {
    const view = state.view;
    const sequence = ++pageSearchRequestSeq;
    if (pageSearchRenderTimer) clearTimeout(pageSearchRenderTimer);
    pageSearchRenderTimer = setTimeout(() => {
      pageSearchRenderTimer = null;
      refreshSearchView(view, sequence, snapshot).catch(() => {
        if (sequence === pageSearchRequestSeq && state.view === view) {
          renderSearchView(view);
          restorePageSearchFocus(snapshot);
        }
      });
    }, 320);
  };
  search?.addEventListener("compositionstart", () => {
    composingSearch = true;
  });
  search?.addEventListener("compositionend", (event) => {
    composingSearch = false;
    state.search = event.target.value;
    if (state.view === "odysseia") resetBasePagination();
    scheduleSearchRender(pageSearchSnapshot(event.target));
  });
  search?.addEventListener("input", (event) => {
    state.search = event.target.value;
    if (state.view === "odysseia") resetBasePagination();
    if (!composingSearch) scheduleSearchRender(pageSearchSnapshot(event.target));
  });
  search?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (pageSearchRenderTimer) clearTimeout(pageSearchRenderTimer);
    pageSearchRenderTimer = null;
    const view = state.view;
    const sequence = ++pageSearchRequestSeq;
    refreshSearchView(view, sequence, pageSearchSnapshot(event.target)).catch(() => renderSearchView(view));
  });
  favoriteToggle?.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    if (state.view === "odysseia") resetBasePagination();
    renderApp();
  });
  document.querySelectorAll(".multi-filter-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  document.querySelectorAll("[data-multi-filter-all]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.multiFilterAll;
      document.querySelectorAll(`[data-multi-filter-option="${key}"]`).forEach((option) => {
        option.checked = event.currentTarget.checked;
      });
    });
  });
  document.querySelectorAll("[data-multi-filter-option]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.multiFilterOption;
      const options = [...document.querySelectorAll(`[data-multi-filter-option="${key}"]`)];
      const all = document.querySelector(`[data-multi-filter-all="${key}"]`);
      if (all) all.checked = options.every((option) => option.checked);
    });
  });
  document.querySelectorAll("[data-multi-filter-clear]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const key = event.currentTarget.dataset.multiFilterClear;
      if (!["projectFilters", "brokerFilters", "tagFilters", "frequencyFilters"].includes(key)) return;
      document.querySelectorAll(`[data-multi-filter-option="${key}"]`).forEach((checkbox) => {
        checkbox.checked = false;
      });
      const all = document.querySelector(`[data-multi-filter-all="${key}"]`);
      if (all) all.checked = false;
    });
  });
  document.querySelectorAll("[data-multi-filter-apply]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const key = event.currentTarget.dataset.multiFilterApply;
      if (!["projectFilters", "brokerFilters", "tagFilters", "frequencyFilters"].includes(key)) return;
      const options = [...document.querySelectorAll(`[data-multi-filter-option="${key}"]`)];
      const selectedValues = options.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      state[key] = selectedValues.length === options.length ? [] : selectedValues;
      if (state.view === "odysseia") resetBasePagination();
      renderApp();
    });
  });
  document.querySelector("[data-date-filter-apply]")?.addEventListener("click", () => {
    state.dateFilterStart = document.querySelector("#dateFilterStart")?.value || "";
    state.dateFilterEnd = document.querySelector("#dateFilterEnd")?.value || "";
    if (state.view === "odysseia") resetBasePagination();
    renderApp();
  });
  document.querySelector("[data-date-filter-clear]")?.addEventListener("click", () => {
    state.dateFilterStart = "";
    state.dateFilterEnd = "";
    if (state.view === "odysseia") resetBasePagination();
    renderApp();
  });
  addLeadButton?.addEventListener("click", () => {
    state.creatingLead = true;
    state.createLeadDraft = null;
    state.createLeadDuplicate = null;
    state.createLeadImpactPrompt = false;
    renderApp();
  });
}

function renderCreateLeadModal() {
  if (state.createLeadDuplicate) return renderDuplicateLeadModal();
  if (state.createLeadImpactPrompt) return renderLeadImpactModal();
  const draft = state.createLeadDraft || {};
  const value = (key) => escapeHtml(draft[key] || "");
  const statusOptions = statusOptionsHtml(draft.status || state.statuses[0] || "");
  const brokerOptions = state.user?.role === "Corretor"
    ? `<option value="${escapeHtml(state.user.id)}" selected>${escapeHtml(state.user.name)}</option>`
    : `<option value="">Sem corretor</option>${activeBrokers().map((broker) => `<option value="${escapeHtml(broker.id)}" ${draft.assignedTo === broker.id ? "selected" : ""}>${escapeHtml(broker.name)}</option>`).join("")}`;
  return `
    <div class="modal-backdrop" data-close-create-lead>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="createLeadTitle">
        <div class="panel-head">
          <h2 id="createLeadTitle">Adicionar Lead</h2>
          <button type="button" class="icon" data-close-create-lead title="Fechar">×</button>
        </div>
        <form id="createLeadForm" class="form-grid">
          <div class="field"><label>Nome <span class="required-mark">*</span></label><input name="name" value="${value("name")}" required autofocus></div>
          <div class="field"><label>Telefone <span class="required-mark">*</span></label><input name="phone" value="${value("phone")}" required></div>
          <div class="field"><label>E-mail <span class="required-mark">*</span></label><input name="email" type="email" value="${value("email")}" required></div>
          <div class="field"><label>Origem do novo lead <span class="required-mark">*</span></label><select name="source" required>
            <option value="">Selecione</option>
            <option value="Stand" ${draft.source === "Stand" ? "selected" : ""}>Stand</option>
            <option value="Lista RMeirelles" ${draft.source === "Lista RMeirelles" ? "selected" : ""}>Lista RMeirelles</option>
          </select></div>
          <div class="field"><label>Status do pipeline</label><select name="status" ${state.statuses.length ? "" : "disabled"}>${statusOptions || '<option value="">Cadastre um status</option>'}</select></div>
          <div class="field"><label>Corretor</label><select name="assignedTo">${brokerOptions}</select></div>
          <div class="field"><label>Empreendimento desejado <span class="required-mark">*</span></label><select name="desiredProject" required>
            <option value="">Selecione</option>
            <option value="Não informado" ${draft.desiredProject === "Não informado" ? "selected" : ""}>Não informado</option>
            ${projectOptions(draft.desiredProject || "")}
          </select></div>
          <div class="field"><label>Unidade</label><input name="desiredUnit" value="${value("desiredUnit")}"></div>
          <div class="field"><label>Valor da unidade</label><input name="unitValue" value="${value("unitValue")}"></div>
          <div class="field full"><label>Observações internas</label><textarea name="notes">${value("notes")}</textarea></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar lead</button><button type="button" data-close-create-lead>Cancelar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function duplicateLeadRows(lead = {}) {
  return [
    ["Nome", lead.name],
    ["Telefone", lead.phone],
    ["E-mail", lead.email || leadEmailForTable(lead)],
    ["Empreendimento", lead.desiredProject],
    ["Origem", lead.source],
    ["Fase atual", leadBaseStatus(lead, { blankHistoricalBaseStatus: true })]
  ].map(([label, value]) => `
    <div class="compare-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Não informado")}</strong>
    </div>
  `).join("");
}

function renderDuplicateLeadModal() {
  const duplicate = state.createLeadDuplicate?.duplicate || {};
  const baseName = state.createLeadDuplicate?.baseName || duplicate.source || "base";
  return `
    <div class="modal-backdrop" data-close-create-lead>
      <section class="modal-card wide-modal" role="dialog" aria-modal="true" aria-labelledby="duplicateLeadTitle">
        <div class="panel-head">
          <div>
            <h2 id="duplicateLeadTitle">Lead já existente na base ${escapeHtml(baseName)}</h2>
            <p class="modal-subtitle">Compare as informações antes de trazer este lead para o pipeline.</p>
          </div>
          <button type="button" class="icon" data-close-create-lead title="Fechar">×</button>
        </div>
        <div class="duplicate-compare">
          <section class="compare-card">
            <h3>Dados inseridos agora</h3>
            ${duplicateLeadRows(state.createLeadDraft || {})}
          </section>
          <section class="compare-card">
            <h3>Dados encontrados na base</h3>
            ${duplicateLeadRows(duplicate)}
          </section>
        </div>
        <div class="row-actions modal-actions">
          <button type="button" class="primary" data-resolve-duplicate="overwrite">Sobrescrever com novas infos</button>
          <button type="button" data-resolve-duplicate="rescue">Resgatar com infos da base</button>
          <button type="button" data-edit-manual-lead>Voltar e editar</button>
        </div>
      </section>
    </div>
  `;
}

function renderLeadImpactModal() {
  return `
    <div class="modal-backdrop" data-close-create-lead>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="impactLeadTitle">
        <div class="panel-head">
          <div>
            <h2 id="impactLeadTitle">Impacto nas redes sociais</h2>
            <p class="modal-subtitle">Antes de concluir, informe se este lead foi impactado pela empresa ou por algum empreendimento nas redes sociais.</p>
          </div>
          <button type="button" class="icon" data-close-create-lead title="Fechar">×</button>
        </div>
        <form id="leadImpactForm" class="form-grid">
          <div class="field full"><label>Foi impactado nas redes sociais?</label><select name="impactedBySocial" required autofocus>
            <option value="">Selecione</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
            <option value="Não sei informar">Não sei informar</option>
          </select></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Concluir cadastro</button><button type="button" data-edit-manual-lead>Voltar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function resetCreateLeadFlow() {
  state.creatingLead = false;
  state.createLeadDraft = null;
  state.createLeadDuplicate = null;
  state.createLeadImpactPrompt = false;
}

function upsertLeadInState(lead) {
  const index = state.leads.findIndex((item) => item.id === lead.id);
  if (index >= 0) state.leads[index] = lead;
  else state.leads.push(lead);
}

function openCreatedLead(lead) {
  resetCreateLeadFlow();
  state.previousView = state.view;
  routeTo("lead", lead.id);
}

function bindCreateLeadModal() {
  document.querySelectorAll("[data-close-create-lead]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.classList.contains("modal-backdrop")) return;
      resetCreateLeadFlow();
      renderApp();
    });
  });
  document.querySelector("[data-edit-manual-lead]")?.addEventListener("click", () => {
    state.createLeadDuplicate = null;
    state.createLeadImpactPrompt = false;
    renderApp();
  });
  document.querySelectorAll("[data-resolve-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setButtonBusy(button, true, "Salvando...");
        const result = await api("/api/leads/resolve-manual-duplicate", {
          method: "POST",
          body: JSON.stringify({
            duplicateId: state.createLeadDuplicate?.duplicate?.id,
            mode: button.dataset.resolveDuplicate,
            lead: state.createLeadDraft || {}
          })
        });
        upsertLeadInState(result.lead);
        openCreatedLead(result.lead);
      } catch (error) {
        alert(error.message);
        setButtonBusy(button, false);
      }
    });
  });
  document.querySelector("#leadImpactForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { ...(state.createLeadDraft || {}), ...Object.fromEntries(form.entries()) };
    const button = event.currentTarget.querySelector("button[type='submit']");
    try {
      setButtonBusy(button, true, "Salvando...");
      const result = await api("/api/leads", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      upsertLeadInState(result.lead);
      openCreatedLead(result.lead);
    } catch (error) {
      alert(error.message);
      setButtonBusy(button, false);
    }
  });
  document.querySelector("#createLeadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const button = event.currentTarget.querySelector("button[type='submit']");
    try {
      setButtonBusy(button, true, "Verificando...");
      const duplicateResult = await api("/api/leads/check-duplicate", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.createLeadDraft = payload;
      if (duplicateResult.duplicate) {
        state.createLeadDuplicate = duplicateResult;
        renderApp();
      } else {
        state.createLeadImpactPrompt = true;
        renderApp();
      }
    } catch (error) {
      alert(error.message);
      setButtonBusy(button, false);
    }
  });
}

function renderMetrics(leads = filteredLeads()) {
  const data = metrics(leads);
  return `
    <section class="metrics">
      <div class="metric"><span>Leads</span><strong>${data.total}</strong></div>
      <div class="metric"><span>Ativos no funil</span><strong>${data.active}</strong></div>
      <div class="metric"><span>Favoritos</span><strong>${data.favorites}</strong></div>
      <div class="metric"><span>Com corretor</span><strong>${data.assigned}</strong></div>
    </section>
  `;
}

function leadTags(lead) {
  return Array.isArray(lead.tags) ? lead.tags.filter(Boolean) : [];
}

function leadMatchesTagFilter(lead) {
  if (!state.tagFilters.length) return true;
  const tags = leadTags(lead);
  if (!tags.length && state.tagFilters.includes("__none__")) return true;
  return tags.some((tag) => state.tagFilters.includes(tag));
}

function leadTemperatureStage(lead) {
  const tags = leadTags(lead).map((tag) => normalizeText(tag));
  if (tags.includes("quente")) return "Quente";
  if (tags.includes("morno")) return "Morno";
  if (tags.includes("frio")) return "Frio";
  return "Sem qualificação";
}

function tagDefinition(name) {
  return state.tagDefinitions.find((tag) => tag.name === name) || { name, color: "#475467" };
}

function availableTags() {
  return [...state.tagDefinitions].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function renderLeadTags(lead, editable = false) {
  const tags = leadTags(lead);
  const unusedTags = availableTags().filter((tag) => !tags.includes(tag.name));
  return `
    <div class="lead-tags">
      ${tags.map((tagName) => {
        const tag = tagDefinition(tagName);
        return `<button class="tag" style="--tag-color:${escapeHtml(tag.color)}" data-remove-tag="${escapeHtml(lead.id)}" data-tag="${escapeHtml(tagName)}" title="Remover etiqueta">${escapeHtml(tagName)}</button>`;
      }).join("")}
      ${editable && unusedTags.length ? `
        <div class="tag-menu" data-tag-menu="${escapeHtml(lead.id)}">
          <button class="tag-menu-button" data-toggle-tag-menu="${escapeHtml(lead.id)}" title="Adicionar etiqueta">+ Etiqueta</button>
          <div class="tag-menu-list">
            ${unusedTags.map((tag) => `<button data-assign-tag="${escapeHtml(lead.id)}" data-tag="${escapeHtml(tag.name)}"><span class="tag static-tag" style="--tag-color:${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span></button>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

async function patchLead(leadId, payload) {
  const result = await api(`/api/leads/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  const lead = state.leads.find((item) => item.id === leadId);
  if (lead) Object.assign(lead, result.lead);
  return result.lead;
}

async function patchPipelineItem(item, payload) {
  if (item?.opportunityId) {
    const result = await api(`/api/leads/${encodeURIComponent(item.id)}/opportunities/${encodeURIComponent(item.opportunityId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    const lead = state.leads.find((leadItem) => leadItem.id === item.id);
    if (lead) Object.assign(lead, result.lead);
    return result.lead;
  }
  return patchLead(item.id, payload);
}

async function fetchLeadDetail(leadId) {
  const result = await api(`/api/leads/${encodeURIComponent(leadId)}`);
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index >= 0) {
    state.leads[index] = result.lead;
  } else {
    state.leads.push(result.lead);
  }
  return result.lead;
}

function refreshFavoriteButtons(lead) {
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    if (button.dataset.favorite !== lead.id) return;
    button.textContent = lead.favorite ? "★" : "☆";
    button.classList.toggle("primary", Boolean(lead.favorite));
  });
}

function brokerRedirectControl(lead) {
  const canAssign = canManageLeads();
  if (!canAssign) return "";
  const brokers = activeBrokers();
  return `
    <div class="broker-menu" data-assign-menu="${escapeHtml(lead.pipelineItemId || lead.id)}">
      <button class="broker-menu-button" data-toggle-assign-menu="${escapeHtml(lead.pipelineItemId || lead.id)}" title="Ações do lead" ${brokers.length ? "" : "disabled"}>⋮</button>
      <div class="broker-menu-list">
        ${canAssign ? `<button data-assign-broker="${escapeHtml(lead.id)}" data-opportunity-id="${escapeHtml(lead.opportunityId || "")}" data-broker-id="" ${lead.assignedTo ? "" : "disabled"}>Sem corretor</button>` : ""}
        ${canAssign ? brokers.map((broker) => `<button data-assign-broker="${escapeHtml(lead.id)}" data-opportunity-id="${escapeHtml(lead.opportunityId || "")}" data-broker-id="${escapeHtml(broker.id)}" ${broker.id === lead.assignedTo ? "disabled" : ""}>${escapeHtml(broker.name)}</button>`).join("") : ""}
      </div>
    </div>
  `;
}

function cardInfoIconSvg(type) {
  if (type === "message") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path></svg>`;
}

function leadCardInfoActions(lead) {
  const comments = [...(Array.isArray(lead.comments) ? lead.comments : [])]
    .filter((comment) => !comment.deletedAt || currentUser()?.role === "Admin TI")
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const commentCount = Math.max(Number(lead.commentCount || 0), comments.length);
  const notes = String(lead.notes || "").trim();
  if (!commentCount && !notes) return "";
  const commentPreview = comments.slice(0, 3).map((comment) => `
    <div class="card-info-preview-item">
      <strong>${escapeHtml(comment.fromLead ? lead.name : comment.userName || comment.user || "Sistema")}</strong>
      <span>${escapeHtml(dateTimeLabel(comment.createdAt))}</span>
      <p>${escapeHtml(comment.deletedAt ? "Mensagem excluída" : comment.text || "")}</p>
    </div>
  `).join("");
  return `
    <div class="card-info-actions">
      ${commentCount ? `
        <span class="card-info-action" data-card-info="message" tabindex="0" title="Comentários">
          ${cardInfoIconSvg("message")}
          <span class="card-info-popover">
            <strong>Comentários</strong>
            ${commentPreview || "<p>Há comentários neste lead.</p>"}
            ${commentCount > comments.length ? `<em>Existem mais ${commentCount - comments.length} comentário(s).</em>` : ""}
          </span>
        </span>
      ` : ""}
      ${notes ? `
        <span class="card-info-action" data-card-info="document" tabindex="0" title="Observações">
          ${cardInfoIconSvg("document")}
          <span class="card-info-popover">
            <strong>Observações</strong>
            <p>${escapeHtml(notes)}</p>
          </span>
        </span>
      ` : ""}
    </div>
  `;
}

function leadCard(lead) {
  const broker = activeBrokerForLead(lead);
  const project = leadProjectValue(lead) || "Sem empreendimento";
  const opportunities = Array.isArray(lead.opportunityList) ? lead.opportunityList : [];
  const opportunityNumber = opportunities.findIndex((opportunity) => opportunity.id && opportunity.id === lead.opportunityId) + 1;
  const opportunityPopover = opportunities.length > 1 ? `
    <span class="opportunity-badge" tabindex="0">#${opportunityNumber || 1}
      <span class="opportunity-popover">
        <strong>Oportunidades</strong>
        ${opportunities.map((opportunity, index) => `
          <span class="${opportunity.id === lead.opportunityId ? "current" : ""}">
            <b>${escapeHtml(opportunity.project || "Sem empreendimento")}</b>
            #${index + 1} · ${escapeHtml(opportunity.unitSamCode || opportunity.unit || "Sem unidade")} · ${escapeHtml(opportunity.assignedName || "Sem corretor")}
          </span>
        `).join("")}
      </span>
    </span>
  ` : "";
  return `
    <article class="card" draggable="true" data-lead="${escapeHtml(lead.pipelineItemId || lead.id)}" data-open-lead="${escapeHtml(lead.id)}" data-open-opportunity="${escapeHtml(lead.opportunityId || "")}">
      <div class="card-title">
        <button class="favorite-inline" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button>
        <strong>${escapeHtml(lead.name)}${opportunityPopover}</strong>
        <div class="card-right-actions">
          ${brokerRedirectControl(lead)}
          ${leadCardInfoActions(lead)}
        </div>
      </div>
      <div class="meta">
        <span>${escapeHtml(lead.phone || "Sem telefone")}</span>
        <strong class="card-project">${escapeHtml(project)}</strong>
        <span>${escapeHtml(broker?.name || "Sem corretor")}</span>
      </div>
      ${renderLeadTags(lead, true)}
    </article>
  `;
}

function renderKanban() {
  const leads = pipelineLeads();
  const canReorderColumns = canReorderKanbanColumns();
  const byStatus = Object.groupBy ? Object.groupBy(leads, (lead) => lead.status) : leads.reduce((acc, lead) => {
    (acc[lead.status] ||= []).push(lead);
    return acc;
  }, {});
  const columns = state.statuses.map((status, index) => {
    const items = (byStatus[status] || []).sort((a, b) => {
      const orderDiff = (b.order ?? 0) - (a.order ?? 0);
      if (orderDiff) return orderDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return `
      <section class="column" data-status="${escapeHtml(status)}" data-status-index="${index}">
        <div class="column-head" ${canReorderColumns ? `draggable="true" data-column-drag="${index}" title="Arraste para ordenar"` : ""}>
          <strong>${escapeHtml(status)}</strong>
          <span class="count">${items.length}</span>
        </div>
        <div class="cards">${items.map(leadCard).join("") || '<div class="empty">Vazio</div>'}</div>
      </section>
    `;
  }).join("");
  const empty = !state.statuses.length ? '<section class="panel"><div class="empty">Cadastre o primeiro status em Configurações para começar o pipeline.</div></section>' : "";
  renderShell(`${renderViewHead("Kanban", "Leads ativos no pipeline", { filters: true, addLead: true, pipelineFilters: true })}${renderMetrics(leads)}${empty}<section class="kanban">${columns}</section>`);
  bindLeadActions();
  bindDragDrop();
  bindColumnDragDrop();
}

function bindLeadActions() {
  document.querySelectorAll("[data-open-lead]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target.closest("button, select, input, textarea, a, [data-assign-menu], [data-tag-menu], .card-info-action")) return;
      state.previousView = state.view === "lead" ? state.previousView : state.view;
      routeTo("lead", element.dataset.openLead, { opportunityId: element.dataset.openOpportunity || "" });
    });
  });
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const lead = state.leads.find((item) => item.id === button.dataset.favorite);
      if (!lead) return;
      const previous = Boolean(lead.favorite);
      const next = !previous;
      const requestId = `${Date.now()}-${Math.random()}`;
      state.favoriteRequests[lead.id] = requestId;
      lead.favorite = next;
      if (state.favoritesOnly) {
        renderApp();
      } else {
        refreshFavoriteButtons(lead);
      }
      try {
        const result = await api(`/api/leads/${encodeURIComponent(lead.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ favorite: next })
        });
        if (state.favoriteRequests[lead.id] !== requestId) return;
        Object.assign(lead, result.lead);
        refreshFavoriteButtons(lead);
      } catch (error) {
        if (state.favoriteRequests[lead.id] !== requestId) return;
        lead.favorite = previous;
        if (state.favoritesOnly) {
          renderApp();
        } else {
          refreshFavoriteButtons(lead);
        }
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-toggle-assign-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      document.querySelectorAll(".tag-menu.open").forEach((menu) => menu.classList.remove("open"));
      document.querySelectorAll(".broker-menu.open").forEach((menu) => {
        if (menu !== button.closest(".broker-menu")) menu.classList.remove("open");
      });
      button.closest(".broker-menu")?.classList.toggle("open");
    });
  });
  document.querySelectorAll("[data-assign-broker]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const lead = state.leads.find((item) => item.id === button.dataset.assignBroker);
      if (!lead) return;
      const item = button.dataset.opportunityId
        ? pipelineItemsFromLead(lead).find((candidate) => candidate.opportunityId === button.dataset.opportunityId) || lead
        : lead;
      const assignedTo = button.dataset.brokerId || null;
      const previous = { assignedTo: item.assignedTo, assignedName: item.assignedName };
      const broker = state.users.find((user) => user.id === assignedTo);
      item.assignedTo = assignedTo;
      item.assignedName = broker?.name || "";
      try {
        setButtonBusy(button, true, "Direcionando...");
        await patchPipelineItem(item, { assignedTo });
        renderApp();
      } catch (error) {
        Object.assign(item, previous);
        alert(error.message);
        renderApp();
      }
    });
  });
  document.querySelectorAll("[data-toggle-tag-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      document.querySelectorAll(".broker-menu.open").forEach((menu) => menu.classList.remove("open"));
      document.querySelectorAll(".tag-menu.open").forEach((menu) => {
        if (menu !== button.closest(".tag-menu")) menu.classList.remove("open");
      });
      button.closest(".tag-menu")?.classList.toggle("open");
    });
  });
  document.querySelectorAll("[data-assign-tag]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const lead = state.leads.find((item) => item.id === button.dataset.assignTag);
      const tag = button.dataset.tag;
      if (!lead || !tag) return;
      const previous = leadTags(lead);
      lead.tags = [...new Set([...previous, tag])];
      renderApp();
      try {
        await patchLead(lead.id, { tags: lead.tags });
      } catch (error) {
        lead.tags = previous;
        alert(error.message);
        renderApp();
      }
    });
  });
  if (!state.brokerMenuBound) {
    document.addEventListener("click", () => {
      document.querySelectorAll(".broker-menu.open").forEach((menu) => menu.classList.remove("open"));
      document.querySelectorAll(".tag-menu.open").forEach((menu) => menu.classList.remove("open"));
    });
    state.brokerMenuBound = true;
  }
  document.querySelectorAll("[data-remove-tag]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const lead = state.leads.find((item) => item.id === button.dataset.removeTag);
      const previous = leadTags(lead);
      lead.tags = previous.filter((tag) => tag !== button.dataset.tag);
      renderApp();
      try {
        await patchLead(lead.id, { tags: lead.tags });
      } catch (error) {
        lead.tags = previous;
        alert(error.message);
        renderApp();
      }
    });
  });
}

function bindDragDrop() {
  let draggedId = null;
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedId = card.dataset.lead;
      card.style.opacity = "0.55";
    });
    card.addEventListener("dragend", () => {
      card.style.opacity = "";
    });
  });
  document.querySelectorAll(".column").forEach((column) => {
    column.addEventListener("dragover", (event) => event.preventDefault());
    column.addEventListener("drop", async (event) => {
      if (!draggedId) return;
      event.preventDefault();
      const currentItems = pipelineLeads();
      const lead = currentItems.find((item) => (item.pipelineItemId || item.id) === draggedId);
      const status = column.dataset.status;
      if (!lead) return;
      let manualSamStatusDate = "";
      if (status !== lead.status && isSamOnlyStatus(status)) {
        if (!canManageLeads()) {
          alert("Este status só pode ser alcançado pelo retorno do SAM.");
          return;
        }
        manualSamStatusDate = promptManualSamStatusDate(status);
        if (!manualSamStatusDate) return;
      }
      const cards = [...column.querySelectorAll(".card")]
        .filter((card) => card.dataset.lead !== draggedId);
      const beforeCard = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });
      const insertIndex = beforeCard ? cards.indexOf(beforeCard) : cards.length;
      const orderedIds = cards.map((card) => card.dataset.lead);
      orderedIds.splice(insertIndex, 0, draggedId);
      const aboveLead = insertIndex > 0 ? currentItems.find((item) => (item.pipelineItemId || item.id) === orderedIds[insertIndex - 1]) : null;
      const belowLead = insertIndex < orderedIds.length - 1 ? currentItems.find((item) => (item.pipelineItemId || item.id) === orderedIds[insertIndex + 1]) : null;
      const aboveOrder = Number(aboveLead?.order || 0);
      const belowOrder = Number(belowLead?.order || 0);
      let nextOrder = Date.now();
      if (aboveLead && belowLead) nextOrder = (aboveOrder + belowOrder) / 2;
      else if (aboveLead) nextOrder = aboveOrder - 1000;
      else if (belowLead) nextOrder = Math.max(Date.now(), belowOrder + 1000);
      await patchPipelineItem(lead, { status, order: nextOrder, movementSource: "kanban", ...(manualSamStatusDate ? { manualSamStatusDate } : {}) });
      renderApp();
    });
  });
}

function bindColumnDragDrop() {
  if (!canReorderKanbanColumns()) return;
  let draggedIndex = null;
  document.querySelectorAll("[data-column-drag]").forEach((head) => {
    head.addEventListener("dragstart", (event) => {
      draggedIndex = Number(head.dataset.columnDrag);
      event.dataTransfer.effectAllowed = "move";
      head.closest(".column")?.classList.add("dragging-column");
    });
    head.addEventListener("dragend", () => {
      document.querySelectorAll(".dragging-column").forEach((column) => column.classList.remove("dragging-column"));
    });
  });
  document.querySelectorAll(".column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      if (draggedIndex != null) event.preventDefault();
    });
    column.addEventListener("drop", async (event) => {
      if (draggedIndex == null) return;
      event.preventDefault();
      const targetIndex = Number(column.dataset.statusIndex);
      if (targetIndex === draggedIndex) return;
      const statuses = [...state.statuses];
      const [moved] = statuses.splice(draggedIndex, 1);
      statuses.splice(targetIndex, 0, moved);
      const result = await api("/api/statuses/reorder", { method: "PUT", body: JSON.stringify({ statuses }) });
      state.statuses = result.pipelineStatuses;
      renderKanban();
    });
  });
}

function leadRows(leads, options = {}) {
  return leads.map((lead) => `
    <tr data-open-lead="${escapeHtml(lead.id)}" data-open-opportunity="${escapeHtml(lead.opportunityId || "")}">
      <td><button class="icon favorite" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button></td>
      <td>${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.phone)}</td>
      <td>${escapeHtml(leadEmailForTable(lead))}</td>
      <td>
        ${(options.readOnlyStatus || options.textStatus) ? escapeHtml(leadBaseStatus(lead, options)) : `<select data-status-select="${escapeHtml(lead.id)}">
          ${statusOptionsHtml(lead.status, { allowSamOnly: canManageLeads() })}
        </select>`}
      </td>
      <td>${escapeHtml(lead.assignedName || userName(lead.assignedTo))}</td>
      <td>${escapeHtml(lead.source)}</td>
      <td>${renderLeadTags(lead, !options.withRescue)}</td>
      <td>${
        options.withRollback && lead.inPipeline && canRollbackLead(lead)
          ? `<button data-rollback="${escapeHtml(lead.id)}">Rollback</button>`
          : options.withRescue
            ? (lead.inPipeline ? (canRollbackLead(lead) ? `<button data-rollback="${escapeHtml(lead.id)}">Rollback</button>` : '<span class="chip">No pipeline</span>') : (canActOnBaseLead(lead) ? `<button class="primary" data-rescue="${escapeHtml(lead.id)}">Resgatar</button>` : '<span class="chip">Acessar</span>'))
            : ""
      }</td>
    </tr>
  `).join("");
}

function renderLeadsTable(rows, options = {}) {
  const sortState = options.sortScope ? state[`${options.sortScope}Sort`] : state.baseSort;
  const sortableHeader = (key, label) => {
    if (!options.sortable) return `<th>${label}</th>`;
    const active = sortState.key === key;
    const arrow = active ? (sortState.direction === "asc" ? " ↑" : " ↓") : "";
    return `<th><button class="table-sort ${active ? "active" : ""}" data-table-sort="${key}" data-sort-scope="${escapeHtml(options.sortScope || "base")}">${label}${arrow}</button></th>`;
  };
  const headers = [
    "<th>★</th>",
    sortableHeader("name", "Nome"),
    sortableHeader("phone", "Celular"),
    sortableHeader("email", "E-mail"),
    sortableHeader("status", "Fase atual"),
    sortableHeader("broker", "Corretor"),
    sortableHeader("source", "Origem"),
    sortableHeader("tags", "Etiquetas"),
    "<th>Ação</th>"
  ].join("");
  const columnCount = [
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true
  ].filter(Boolean).length;
  return `
    <div class="table-wrap">
      <table class="leads-table">
        <colgroup>
          <col class="lead-col-favorite">
          <col class="lead-col-name">
          <col class="lead-col-phone">
          <col class="lead-col-email">
          <col class="lead-col-status">
          <col class="lead-col-broker">
          <col class="lead-col-source">
          <col class="lead-col-tags">
          <col class="lead-col-action">
        </colgroup>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${columnCount}" class="empty">Nenhum lead nesta visão</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function bindTableSortControls(renderFn) {
  document.querySelectorAll("[data-table-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const scope = button.dataset.sortScope || "base";
      const key = button.dataset.tableSort;
      const stateKey = `${scope}Sort`;
      const current = state[stateKey] || { key: "name", direction: "asc" };
      state[stateKey] = {
        key,
        direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
      };
      saveTableSortPreference(scope);
      if (scope === "base") {
        resetBasePagination();
        renderApp();
        return;
      }
      renderFn();
    });
  });
}

function bindRollbackControls(renderFn) {
  document.querySelectorAll("[data-rollback]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Enviar este lead para a base Pipeline GDrive?")) return;
      const scrollY = window.scrollY;
      try {
        setButtonBusy(button, true, "Voltando...");
        const result = await api(`/api/leads/${button.dataset.rollback}/rollback`, { method: "POST", body: JSON.stringify({ movementSource: "base" }) });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderFn();
        requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
}

function renderSheet() {
  const leads = sortLeadsForTable(pipelineLeads(), state.sheetSort);
  const tableOptions = { textStatus: true };
  const rows = leadRows(leads, tableOptions);
  renderShell(`
    ${renderViewHead("Planilha", "Leads vindos do Meta, importações de pipeline e resgates das bases", { filters: true, addLead: true, pipelineFilters: true })}
    ${renderMetrics(leads)}
    ${renderLeadsTable(rows, { ...tableOptions, sortable: true, sortScope: "sheet" })}
  `);
  bindLeadActions();
  bindTableSortControls(renderSheet);
  bindRollbackControls(renderSheet);
}

function renderBaseSources(sources) {
  return `
    <div class="tabs base-tabs">
      ${sources.map((source) => `<button class="${state.baseSource === source ? "active" : ""}" data-base-source="${escapeHtml(source)}">${escapeHtml(baseSourceLabel(source).toLocaleUpperCase("pt-BR"))}</button>`).join("")}
    </div>
  `;
}

function baseSourceLabel(source) {
  return {
    TODOS: "Todos",
    META: "META",
    Stand: "STAND",
    "Lista RMeirelles": "LISTA RMEIRELLES",
    "Pipeline GDrive": "PIPELINE GDRIVE"
  }[source] || source;
}

function renderLeadBases() {
  const sources = baseSources();
  const leads = baseLeads();
  const rows = leadRows(leads, { readOnlyStatus: true, withRescue: true, blankHistoricalBaseStatus: true });
  const pending = Number(state.leadsPage?.pending ?? leads.filter((lead) => !lead.inPipeline).length);
  const rescued = Number(state.leadsPage?.rescued ?? leads.filter((lead) => lead.inPipeline).length);
  const totalBase = Number(state.leadsPage?.total ?? baseLeadCount(state.baseSource));
  renderShell(`
    ${renderViewHead("Bases de Leads", "Bases importadas separadas do pipeline comercial", { filters: true })}
    ${sources.length ? renderBaseSources(sources) : ""}
    <section class="metrics">
      <div class="metric"><span>Total da base</span><strong>${totalBase}</strong></div>
      <div class="metric"><span>A resgatar</span><strong>${pending}</strong></div>
      <div class="metric"><span>Resgatados</span><strong>${rescued}</strong></div>
      <div class="metric"><span>Origem</span><strong>${escapeHtml(baseSourceLabel(state.baseSource))}</strong></div>
    </section>
    ${renderLeadsTable(rows, { withRescue: true, sortable: true, sortScope: "base" })}
    ${renderBasePagination(totalBase)}
  `);
  bindLeadActions();
  bindTableSortControls(renderLeadBases);
  bindBasePagination();
  document.querySelectorAll("[data-base-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.baseSource = button.dataset.baseSource;
      resetBasePagination();
      renderApp();
    });
  });
  document.querySelectorAll("[data-rescue]").forEach((button) => {
    button.addEventListener("click", async () => {
      const scrollY = window.scrollY;
      try {
        setButtonBusy(button, true, "Resgatando...");
        let assignToSelf = false;
        if (["Head Comercial", "Supervisor Comercial"].includes(state.user?.role) && currentUserCanOperateAsBroker()) {
          assignToSelf = confirm("Deseja resgatar este lead vinculado a você como corretor?\n\nOK: resgatar vinculado a você.\nCancelar: resgatar sem corretor para vincular depois.");
        }
        const result = await api(`/api/leads/${button.dataset.rescue}/rescue`, { method: "POST", body: JSON.stringify({ assignToSelf, movementSource: "base" }) });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderLeadBases();
        requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  bindRollbackControls(renderLeadBases);
}

function renderBasePagination(totalBase) {
  const pageSize = Number(state.basePageSize || 25);
  const pageCount = Math.max(1, Math.ceil(Number(totalBase || 0) / pageSize));
  const pageIndex = Math.min(Number(state.basePageIndex || 0), pageCount - 1);
  const from = totalBase ? pageIndex * pageSize + 1 : 0;
  const to = Math.min((pageIndex + 1) * pageSize, Number(totalBase || 0));
  return `
    <div class="table-pagination">
      <div class="pagination-summary">Mostrando ${from.toLocaleString("pt-BR")} a ${to.toLocaleString("pt-BR")} de ${Number(totalBase || 0).toLocaleString("pt-BR")} registros</div>
      <label>
        <span>Registros por página</span>
        <select data-base-page-size>
          ${[25, 50, 100, 200, 300].map((size) => `<option value="${size}" ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <div class="pagination-actions">
        <button type="button" data-base-page="first" ${pageIndex <= 0 ? "disabled" : ""}>Primeira</button>
        <button type="button" data-base-page="prev" ${pageIndex <= 0 ? "disabled" : ""}>Anterior</button>
        <span>Página ${Number(pageIndex + 1).toLocaleString("pt-BR")} de ${Number(pageCount).toLocaleString("pt-BR")}</span>
        <button type="button" data-base-page="next" ${pageIndex >= pageCount - 1 ? "disabled" : ""}>Próxima</button>
        <button type="button" data-base-page="last" ${pageIndex >= pageCount - 1 ? "disabled" : ""}>Última</button>
      </div>
    </div>
  `;
}

function bindBasePagination() {
  document.querySelector("[data-base-page-size]")?.addEventListener("change", (event) => {
    state.basePageSize = Number(event.currentTarget.value || 25);
    resetBasePagination();
    renderApp();
  });
  document.querySelectorAll("[data-base-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const totalBase = Number(state.leadsPage?.total || 0);
      const pageSize = Number(state.basePageSize || 25);
      const pageCount = Math.max(1, Math.ceil(totalBase / pageSize));
      const action = button.dataset.basePage;
      if (action === "first") state.basePageIndex = 0;
      if (action === "prev") state.basePageIndex = Math.max(0, Number(state.basePageIndex || 0) - 1);
      if (action === "next") state.basePageIndex = Math.min(pageCount - 1, Number(state.basePageIndex || 0) + 1);
      if (action === "last") state.basePageIndex = pageCount - 1;
      invalidateLeads();
      renderApp();
    });
  });
}

function leadProjectValue(lead) {
  if (lead.desiredProject) return lead.desiredProject;
  if (lead.project) return lead.project;
  const metaProject = metaFormConfigForLead(lead).project;
  if (metaProject) return metaProject;
  const rawMetaText = metaLabelKey([
    ...Object.entries(lead.meta?.rawFields || {}).flat(),
    ...(Array.isArray(lead.meta?.rawFieldKeys) ? lead.meta.rawFieldKeys : [])
  ].join(" "));
  const rawProject = (state.projects || []).find((project) => rawMetaText.includes(metaLabelKey(project)));
  if (rawProject) return rawProject;
  const project = String(lead.project || "");
  if (project.toLowerCase().includes("guinle")) return "Reserva Guinle";
  if (project.toLowerCase().includes("golf")) return "Golf Club Resort";
  return "";
}

function metaAdUrlForLead(lead) {
  if (lead.meta?.adUrl) return lead.meta.adUrl;
  const form = metaFormConfigForLead(lead);
  const adId = String(lead.meta?.adId || "").trim();
  const adLink = (form?.adLinks || []).find((item) => String(item.id || "").trim() === adId);
  return String(adLink?.url || form?.adUrl || "").trim();
}

function metaFormConfigForLead(lead) {
  const formId = metaIdText(lead.meta?.formId || lead.meta?.form_id || lead.formId || lead.form_id);
  const forms = state.integrations?.metaForms?.forms || [];
  if (formId) {
    const matched = forms.find((item) => metaIdText(item.id || item.formId || item.form_id) === formId);
    if (matched) return matched;
  }
  const rawQuestionKeys = [
    ...Object.keys(lead.meta?.rawFields || {}),
    ...(Array.isArray(lead.meta?.rawFieldKeys) ? lead.meta.rawFieldKeys : [])
  ].map(metaLabelKey).filter(Boolean);
  if (!rawQuestionKeys.length) return {};
  return forms.find((form) => {
    const labelKeys = Object.keys(form.questionLabels || {}).map(metaLabelKey);
    return rawQuestionKeys.some((key) => labelKeys.includes(key));
  }) || {};
}

function metaIdText(value) {
  if (value && typeof value === "object") return String(value.id || value.value || "").trim();
  return String(value || "").trim();
}

function metaLabelKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "_")
    .replace(/[.。]+$/g, "")
    .replace(/^_+|_+$/g, "");
}

function friendlyMetaValue(value, labels = {}) {
  const text = String(value || "");
  if (labels[text]) return labels[text];
  const target = metaLabelKey(text);
  const match = Object.entries(labels || {})
    .find(([key]) => metaLabelKey(key) === target);
  return match?.[1] || text;
}

function renderMetaLeadInfo(lead) {
  const manualImpact = String(lead.impactedBySocial || "").trim();
  if ((lead.source !== "META" || !lead.meta) && !manualImpact) return "";
  const formConfig = metaFormConfigForLead(lead);
  const ignoredFields = new Set(["email", "full_name", "phone_number", "nome", "telefone", "celular"]);
  const answerRows = lead.meta ? Object.entries(lead.meta.rawFields || {})
    .filter(([question]) => !ignoredFields.has(String(question || "").toLowerCase()))
    .map(([question, answer]) => `
    <article class="answer-item">
      <span>${escapeHtml(friendlyMetaValue(question, formConfig.questionLabels))}</span>
      <strong>${escapeHtml(friendlyMetaValue(answer, formConfig.answerLabels))}</strong>
    </article>
  `).join("") : `
    <article class="answer-item">
      <span>Foi impactado pelas redes sociais?</span>
      <strong>${escapeHtml(manualImpact)}</strong>
    </article>
  `;
  const adUrl = metaAdUrlForLead(lead);
  return `
    <section class="panel meta-detail-panel">
      <h2>Respostas do formulário</h2>
      <div class="answers-list">${answerRows || '<div class="empty">Nenhuma resposta recebida.</div>'}</div>
      ${lead.meta ? `<div class="meta-ad-link">
        <span>URL do anúncio</span>
        ${adUrl ? `<a href="${escapeHtml(adUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(adUrl)}</a>` : "<strong>Não cadastrada</strong>"}
      </div>` : ""}
    </section>
  `;
}

function renderCommentBubble(comment, lead) {
  const deleted = Boolean(comment.deletedAt);
  const incoming = Boolean(comment.fromUser);
  const canOpenDeleted = deleted && state.user?.role === "Admin TI" && comment.deletedText;
  const displayName = incoming ? lead.name : (comment.authorName || "Usuário");
  const text = deleted
    ? "Mensagem excluída"
    : comment.text;
  return `
    <article class="chat-message ${incoming ? "incoming" : "outgoing"} ${deleted ? "deleted" : ""}">
      <div class="chat-bubble ${canOpenDeleted ? "clickable" : ""}" ${canOpenDeleted ? `data-show-deleted-comment="${escapeHtml(comment.id)}"` : ""}>
        <div class="chat-meta">
          <strong>${escapeHtml(displayName)}</strong>
          <span>${escapeHtml(dateTimeLabel(comment.createdAt))}</span>
          ${canDeleteComments() && (!deleted || state.user?.role === "Admin TI") ? renderSettingsActionMenu(`comment-${comment.id}`, [
            `<button type="button" class="danger-menu-item" data-delete-comment="${escapeHtml(comment.id)}">${state.user?.role === "Admin TI" ? "Excluir permanentemente" : "Excluir mensagem"}</button>`
          ]) : ""}
        </div>
        <p>${escapeHtml(text)}</p>
        ${deleted && comment.deletedByName ? `<small>Excluída por ${escapeHtml(comment.deletedByName)}</small>` : ""}
      </div>
    </article>
  `;
}

function renderLeadComments(comments, lead) {
  return `
    <div class="panel">
      <h2>Comentários</h2>
      <div class="chat-timeline">
        ${comments.map((comment) => renderCommentBubble(comment, lead)).join("") || '<div class="empty">Nenhum comentário ainda</div>'}
      </div>
    </div>
  `;
}

function renderCommentComposer() {
  return `
    <div class="panel comment-composer-panel">
      <h2>Novo comentário</h2>
      <form id="commentForm" class="comment-form">
        <textarea name="text" placeholder="Adicionar comentário"></textarea>
        <div class="comment-actions">
          <button class="primary" type="submit">Comentar</button>
          <label class="checkline"><input type="checkbox" name="fromUser"> Mensagem do usuário</label>
        </div>
      </form>
    </div>
  `;
}

function renderLeadInterest(project, lead) {
  const opportunities = realLeadOpportunities(lead);
  const displayed = opportunities.length ? opportunities : [implicitLeadOpportunity(lead)];
  const opportunityFields = (opportunity) => `
    <div class="opportunity-fields">
      <div class="field"><label>Empreendimento</label><input readonly value="${escapeHtml(opportunity.project || project || "Sem empreendimento")}"></div>
      <div class="field"><label>Unidade</label><input readonly value="${escapeHtml(opportunity.unitSamCode || opportunity.unit || "Sem unidade")}"></div>
      <div class="field"><label>Valor da unidade</label><input readonly value="${escapeHtml(opportunity.unitValue || "")}"></div>
      <div class="field"><label>Status</label><input readonly value="${escapeHtml(opportunity.status || lead.status || "Sem status")}"></div>
      <div class="field"><label>Corretor</label><input readonly value="${escapeHtml(opportunity.assignedName || "Sem corretor")}"></div>
    </div>
  `;
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>${opportunities.length ? "Oportunidades" : "Interesse"}</h2>
        <button type="button" class="tiny primary" data-add-opportunity="${escapeHtml(lead.id)}">Adicionar</button>
      </div>
      <div class="opportunity-list">
        ${displayed.map((opportunity, index) => `
          <article class="opportunity-row ${opportunity.implicit ? "implicit" : ""} ${opportunity.id && opportunity.id === state.selectedOpportunityId ? "selected" : ""}">
            <strong><span class="opportunity-index">#${index + 1}</span>${escapeHtml(opportunity.project || project || "Sem empreendimento")}</strong>
            <span>${escapeHtml(opportunity.unitSamCode || opportunity.unit || "Sem unidade")} · ${escapeHtml(opportunity.status || lead.status || "Sem status")}</span>
            <small>${escapeHtml(opportunity.assignedName || "Sem corretor")}${displayed.length > 1 ? ` · #${index + 1}` : ""}</small>
            ${opportunities.length ? opportunityFields(opportunity) : ""}
          </article>
        `).join("")}
      </div>
      ${opportunities.length ? "" : `<div class="interest-grid">
        <div class="field"><label>Empreendimento desejado</label><select name="desiredProject" form="leadDetailForm">
          <option value="">Selecione</option>
          ${projectOptions(project)}
        </select></div>
        <div class="field"><label>Unidade</label><input name="desiredUnit" form="leadDetailForm" value="${escapeHtml(lead.desiredUnit || lead.unit || "")}"></div>
        <div class="field"><label>Valor da unidade</label><input name="unitValue" form="leadDetailForm" value="${escapeHtml(lead.unitValue || lead.value || "")}"></div>
      </div>`}
    </div>
  `;
}

function renderOpportunityModal() {
  const lead = state.leads.find((item) => item.id === state.creatingOpportunityForLeadId);
  if (!lead) return "";
  const brokerOptions = `<option value="">Sem corretor</option>${activeBrokers().map((broker) => `<option value="${escapeHtml(broker.id)}">${escapeHtml(broker.name)}</option>`).join("")}`;
  return `
    <div class="modal-backdrop" data-opportunity-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="opportunityModalTitle">
        <div class="panel-head">
          <div>
            <h2 id="opportunityModalTitle">Adicionar oportunidade</h2>
            <p class="modal-subtitle">${escapeHtml(lead.name || "")}</p>
          </div>
          <button type="button" class="icon" data-close-opportunity-modal title="Fechar">×</button>
        </div>
        <form id="opportunityForm" class="form-grid">
          <div class="field"><label>Empreendimento</label><select name="project" required>
            <option value="">Selecione</option>
            ${projectOptions("")}
          </select></div>
          <div class="field"><label>Status</label><select name="status">${statusOptionsHtml(state.statuses[0] || lead.status || "", { allowSamOnly: canManageLeads() })}</select></div>
          <div class="field"><label>Unidade</label><input name="unit"></div>
          <div class="field"><label>Valor da unidade</label><input name="unitValue"></div>
          <div class="field"><label>Corretor</label><select name="assignedTo">${brokerOptions}</select></div>
          <div class="field full"><div class="row-actions modal-actions"><button class="secondary" type="button" data-close-opportunity-modal>Cancelar</button><button class="primary" type="submit">Salvar oportunidade</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function bindOpportunityModal() {
  document.querySelectorAll("[data-add-opportunity]").forEach((button) => {
    button.addEventListener("click", () => {
      state.creatingOpportunityForLeadId = button.dataset.addOpportunity;
      renderApp();
    });
  });
  document.querySelectorAll("[data-close-opportunity-modal], [data-opportunity-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.hasAttribute("data-opportunity-backdrop")) return;
      state.creatingOpportunityForLeadId = "";
      renderApp();
    });
  });
  document.querySelector("#opportunityForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const leadId = state.creatingOpportunityForLeadId;
    const button = event.currentTarget.querySelector("button[type='submit']");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      setButtonBusy(button, true, "Salvando...");
      const result = await api(`/api/leads/${encodeURIComponent(leadId)}/opportunities`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      upsertLeadInState(result.lead);
      state.creatingOpportunityForLeadId = "";
      renderLeadDetail();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
}

function renderLeadDetail() {
  const lead = state.leads.find((item) => item.id === state.leadId);
  if (!lead) {
    renderShell(`
      ${renderViewHead("Carregando lead", "Buscando os detalhes do registro")}
      <div class="panel"><div class="empty">Carregando detalhes...</div></div>
    `);
    fetchLeadDetail(state.leadId)
      .then(() => renderLeadDetail())
      .catch(() => {
        renderShell(`
          ${renderViewHead("Lead não encontrado", "Este registro não está disponível para o seu perfil")}
          <button data-back-lead>Voltar</button>
        `);
        document.querySelector("[data-back-lead]")?.addEventListener("click", () => routeTo(state.previousView || "kanban"));
      });
    return;
  }

  if (lead.detailLoaded === false) {
    renderShell(`
      ${renderViewHead(lead.name || "Carregando lead", "Buscando comentários e respostas do formulário")}
      <div class="panel"><div class="empty">Carregando detalhes...</div></div>
    `);
    fetchLeadDetail(lead.id)
      .then(() => renderLeadDetail())
      .catch((error) => {
        alert(error.message);
        routeTo(state.previousView || "kanban");
      });
    return;
  }

  const comments = [...(Array.isArray(lead.comments) ? lead.comments : [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const project = leadProjectValue(lead);
  const statusField = lead.inPipeline ? `
    <select name="status" ${canManageLeads() ? "" : "disabled"}>
      ${statusOptionsHtml(lead.status, { allowSamOnly: canManageLeads() })}
    </select>
  ` : `<input value="${escapeHtml(lead.sourceStatus || lead.odysseiaStatus || lead.status)}" disabled>`;
  const brokerField = `
    <select name="assignedTo" ${canManageLeads() ? "" : "disabled"}>
      <option value="">Sem corretor</option>
      ${state.users.filter(isAssignableBrokerUser).map((user) => `<option value="${escapeHtml(user.id)}" ${user.id === lead.assignedTo ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
    </select>
  `;

  renderShell(`
    <div class="view-head">
      <div class="view-title">
        <h1>${escapeHtml(lead.name)}</h1>
        <p>${escapeHtml(lead.source)} · ${escapeHtml(lead.status)}</p>
      </div>
      <div class="actions">
        <button data-back-lead>Voltar</button>
        ${canManageLeads() ? `<button class="danger-button" data-delete-lead="${escapeHtml(lead.id)}">Excluir lead</button>` : ""}
        <button class="icon favorite ${lead.favorite ? "primary" : ""}" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button>
      </div>
    </div>
    <section class="lead-detail">
      <div class="lead-main-panels">
        <div class="panel">
          <div class="panel-head">
            <h2>Dados do lead</h2>
            ${renderLeadTags(lead, true)}
          </div>
          <form id="leadDetailForm" class="form-grid lead-data-form">
            <div class="field"><label>Origem</label><input value="${escapeHtml(lead.source || "")}" disabled></div>
            <div class="field"><label>ID importado</label><input value="${escapeHtml(lead.externalId || "")}" disabled></div>
            <div class="field"><label>Criado em</label><input value="${escapeHtml(dateTimeLabel(lead.createdAt))}" disabled></div>
            <div class="field"><label>Nome</label><input name="name" value="${escapeHtml(lead.name)}" required></div>
            <div class="field"><label>Telefone</label><input name="phone" value="${escapeHtml(lead.phone || "")}"></div>
            <div class="field"><label>E-mail</label><input name="email" type="email" value="${escapeHtml(lead.email || "")}"></div>
            <div class="field"><label>Status do pipeline</label>${statusField}</div>
            <div class="field"><label>Corretor</label>${brokerField}</div>
            ${canManageLeads() && isSamOnlyStatus(lead.status) ? `<div class="field full"><button type="button" data-set-sam-status-date="${escapeHtml(lead.id)}">Informar data histórica SAM</button></div>` : ""}
            <div class="field full"><label>Observações internas</label><textarea name="notes">${escapeHtml(lead.notes || "")}</textarea></div>
            <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar detalhes</button></div></div>
          </form>
        </div>
        ${renderLeadComments(comments, lead)}
      </div>
      <div class="lead-side-panels">
        ${renderMetaLeadInfo(lead)}
        ${renderLeadInterest(project, lead)}
        ${renderCommentComposer()}
      </div>
    </section>
  `);

  document.querySelector("[data-back-lead]")?.addEventListener("click", () => routeTo(state.previousView || "kanban"));
  document.querySelector("[data-delete-lead]")?.addEventListener("click", async (event) => {
    if (!confirm("Excluir este lead definitivamente?")) return;
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Excluindo...");
      await api(`/api/leads/${encodeURIComponent(lead.id)}`, { method: "DELETE" });
      state.leads = state.leads.filter((item) => item.id !== lead.id);
      routeTo(state.previousView || "kanban");
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  bindLeadActions();
  bindSettingsActionMenus();
  document.querySelector("[data-set-sam-status-date]")?.addEventListener("click", async (event) => {
    const manualSamStatusDate = promptManualSamStatusDate(lead.status);
    if (!manualSamStatusDate) return;
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Salvando...");
      const result = await patchLead(lead.id, { status: lead.status, manualSamStatusDate, movementSource: "lead_detail" });
      Object.assign(lead, result.lead);
      alert("Data histórica SAM salva com sucesso.");
      renderLeadDetail();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelectorAll("[data-delete-comment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const message = state.user?.role === "Admin TI"
        ? "Excluir este comentário permanentemente?"
        : "Excluir esta mensagem? Ela aparecerá como mensagem excluída.";
      if (!confirm(message)) return;
      const result = await api(`/api/leads/${encodeURIComponent(lead.id)}/comments/${encodeURIComponent(button.dataset.deleteComment)}`, { method: "DELETE" });
      Object.assign(lead, result.lead);
      renderLeadDetail();
    });
  });
  document.querySelectorAll("[data-show-deleted-comment]").forEach((bubble) => {
    bubble.addEventListener("click", () => {
      const comment = (lead.comments || []).find((item) => item.id === bubble.dataset.showDeletedComment);
      if (comment?.deletedText) alert(comment.deletedText);
    });
  });
  document.querySelector("#leadDetailForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      phone: form.get("phone"),
      email: form.get("email"),
      desiredProject: form.get("desiredProject"),
      desiredUnit: form.get("desiredUnit"),
      unitValue: form.get("unitValue"),
      notes: form.get("notes")
    };
    if (canManageLeads()) {
      payload.status = form.get("status");
      payload.assignedTo = form.get("assignedTo");
      if (payload.status !== lead.status && isSamOnlyStatus(payload.status)) {
        const manualSamStatusDate = promptManualSamStatusDate(payload.status);
        if (!manualSamStatusDate) return;
        payload.manualSamStatusDate = manualSamStatusDate;
      }
    }
    payload.movementSource = "lead_detail";
    await patchLead(lead.id, payload);
    alert("Detalhes do lead salvos com sucesso.");
    renderLeadDetail();
  });
  document.querySelector("#commentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("text") || "").trim();
    if (!text) return;
    const result = await api(`/api/leads/${encodeURIComponent(lead.id)}/comments`, {
      method: "POST",
      body: JSON.stringify({ text, fromUser: Boolean(form.get("fromUser")) })
    });
    Object.assign(lead, result.lead);
    renderLeadDetail();
  });
}

function renderDashboard() {
  ensureReportDefaults();
  const leads = pipelineLeads().filter((lead) => dateIsInRange(lead.createdAt || lead.meta?.createdTime || lead.rescuedAt || lead.updatedAt, state.dashboardStart, state.dashboardEnd));
  const data = metrics(leads);
  const max = Math.max(...state.statuses.map((status) => leads.filter((lead) => lead.status === status).length), 1);
  const dashboardSales = salesInRange(`${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`, state.dashboardProject);
  const brokerCounts = state.users
    .filter((user) => user.role === "Corretor")
    .map((user) => ({ name: user.name, count: leads.filter((lead) => lead.assignedTo === user.id).length, active: user.active }))
    .sort((a, b) => b.count - a.count);
  const funnel = state.statuses.map((status) => {
    const count = leads.filter((lead) => lead.status === status).length;
    return `
      <div class="bar-row">
        <span>${escapeHtml(status)}</span>
        <div class="bar"><span style="width:${(count / max) * 100}%"></span></div>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
  const brokers = brokerCounts.map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${item.count}</td>
      <td class="${item.active ? "status-active" : "status-inactive"}">${item.active ? "Ativo" : "Inativo"}</td>
    </tr>
  `).join("");
  renderShell(`
    ${renderViewHead("Dashboard", "Indicadores de volume de lead, vendas e funil", { actions: renderDashboardControls() })}
    <section class="metrics">
      <div class="metric"><span>Volume total</span><strong>${data.total}</strong></div>
      <div class="metric"><span>Ativos</span><strong>${data.active}</strong></div>
      <div class="metric"><span>Favoritos</span><strong>${data.favorites}</strong></div>
      <div class="metric"><span>Em bases</span><strong>${baseLeadCount()}</strong></div>
    </section>
    ${renderMonthlySalesChart(dashboardSales)}
    ${renderTemperatureFunnel(leads)}
    ${renderFunnelInfographic(leads)}
    <section class="dashboard-grid">
      <div class="panel"><h2>Funil</h2>${funnel}</div>
      <div class="panel">
        <h2>Corretores</h2>
        <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Leads</th><th>Status</th></tr></thead><tbody>${brokers}</tbody></table></div>
      </div>
    </section>
    ${state.dashboardFunnelStatus ? renderDashboardFunnelModal(leads) : ""}
  `);
  if (state.dashboardFunnelStatus && Number.isFinite(state.dashboardModalScrollTop)) {
    requestAnimationFrame(() => {
      const content = document.querySelector(".content");
      if (content) content.scrollTop = state.dashboardModalScrollTop;
    });
  }
  bindDashboardControls(leads);
}

function renderTemperatureFunnel(leads = []) {
  const stages = [
    { name: "Sem qualificação", position: 1, color: "#94a3b8", width: 100 },
    { name: "Frio", position: 2, color: "#00a8ff", width: 86 },
    { name: "Morno", position: 3, color: "#f59e0b", width: 72 },
    { name: "Quente", position: 4, color: "#ef4444", width: 58 }
  ];
  const counts = countBy(leads, leadTemperatureStage);
  const total = leads.length || 1;
  const rows = stages.map((stage) => {
    const count = counts[stage.name] || 0;
    const pct = Math.round((count / total) * 100);
    return `
      <div class="temperature-stage" style="--temperature-color:${stage.color};--temperature-width:${stage.width}%">
        <span>${stage.position}</span>
        <strong>${escapeHtml(stage.name)}</strong>
        <em>${count} lead(s) · ${pct}%</em>
      </div>
    `;
  }).join("");
  return `
    <section class="panel temperature-funnel-panel">
      <div class="panel-head compact-head">
        <div>
          <h2>Funil por temperatura</h2>
          <small>Qualificação por etiquetas comerciais.</small>
        </div>
      </div>
      <div class="temperature-funnel">${rows}</div>
    </section>
  `;
}

function renderFunnelInfographic(leads) {
  const counts = state.statuses.map((status) => ({
    status,
    count: leads.filter((lead) => lead.status === status).length
  }));
  if (!counts.length) {
    return '<section class="panel funnel-panel"><h2>Conversão do funil</h2><div class="empty">Cadastre status do pipeline para visualizar o funil.</div></section>';
  }
  const palette = ["#0f9f6e", "#58b957", "#b8b84b", "#dc8c2f", "#d9572a", "#c9342d"];
  const totalStages = Math.max(counts.length - 1, 1);
  const stages = counts.map((item, index) => {
    const next = counts[index + 1];
    const conversion = next && item.count ? Math.round((next.count / item.count) * 100) : null;
    const width = 100 - (index / totalStages) * 46;
    const color = palette[Math.min(index, palette.length - 1)];
    return `
      <div class="funnel-stage">
        <button class="funnel-bar" type="button" data-dashboard-funnel="${escapeHtml(item.status)}" style="--funnel-width:${width}%; --funnel-color:${color}">
          <span>${escapeHtml(item.status)}</span>
          <strong>${item.count}</strong>
        </button>
        ${next ? `<div class="funnel-conversion">${conversion == null ? "0%" : `${conversion}%`} para ${escapeHtml(next.status)}</div>` : ""}
      </div>
    `;
  }).join("");
  return `<section class="panel funnel-panel"><h2>Conversão do funil</h2><div class="funnel-visual">${stages}</div></section>`;
}

function renderDashboardControls() {
  ensureReportDefaults();
  return `
    <div class="dashboard-controls">
      <details class="date-filter">
        <summary><span>Período</span><strong>${escapeHtml(state.dashboardStart)} a ${escapeHtml(state.dashboardEnd)}</strong></summary>
        <div class="date-filter-menu">
          <label><span>Início</span><input id="dashboardStart" type="date" value="${escapeHtml(state.dashboardStart)}"></label>
          <label><span>Fim</span><input id="dashboardEnd" type="date" value="${escapeHtml(state.dashboardEnd)}"></label>
          <div class="date-filter-actions">
            <button type="button" class="tiny primary" data-dashboard-period-apply>Aplicar</button>
            <button type="button" class="tiny" data-dashboard-period-clear>Mês atual</button>
          </div>
        </div>
      </details>
      <label class="compact-select">
        <span>Vendas</span>
        <select id="dashboardProject">
          <option value="TODOS" ${state.dashboardProject === "TODOS" ? "selected" : ""}>Todos</option>
          ${(state.projects || []).map((project) => `<option value="${escapeHtml(project)}" ${state.dashboardProject === project ? "selected" : ""}>${escapeHtml(project)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderMonthlySalesChart(sales) {
  const year = new Date().getFullYear();
  const projects = (state.dashboardProject === "TODOS" ? state.projects : [state.dashboardProject]).filter(Boolean);
  const months = Array.from({ length: 12 }, (_, index) => ({ index, label: new Date(year, index, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") }));
  const totals = months.map(({ index }) => sales.filter((sale) => parseFlexibleDate(saleSignedAt(sale))?.getFullYear() === year && parseFlexibleDate(saleSignedAt(sale))?.getMonth() === index));
  const totalValues = totals.map((items) => items.reduce((sum, sale) => sum + saleContractValue(sale), 0));
  const maxValue = Math.max(...totalValues, 1);
  const linePoints = totalValues.map((value, index) => {
    const x = ((index + 0.5) / months.length) * 1200;
    const y = 100 - Math.max(6, (value / maxValue) * 100);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const hasRealSales = sales.some((sale) => saleContractValue(sale) > 0 && parseFlexibleDate(saleSignedAt(sale)));
  return `
    <section class="panel sales-chart-panel">
      <div class="panel-title-row">
        <div>
          <h2>Curva de Vendas</h2>
          <p class="muted-copy">Fonte: leads do pipeline em Contrato Assinado, pela data de assinatura do contrato.</p>
        </div>
        <span>${escapeHtml(String(year))}</span>
      </div>
      ${hasRealSales ? `
      <div class="sales-chart">
        <svg class="sales-line-svg" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${escapeHtml(linePoints)}"></polyline>
        </svg>
        ${months.map((month, monthIndex) => {
          const monthSales = totals[monthIndex];
          const totalValue = totalValues[monthIndex];
          return `
            <div class="sales-month">
              <div class="sales-bars">
                ${projects.map((project, projectIndex) => {
                  const value = monthSales.filter((sale) => saleProjectName(sale) === project).reduce((sum, sale) => sum + saleContractValue(sale), 0);
                  const height = Math.max(4, (value / maxValue) * 100);
                  return `<span title="${escapeHtml(project)}: ${escapeHtml(brl(value))}" style="--bar-height:${height}%; --bar-color:${["#0f766e", "#2563eb", "#c2410c", "#7c3aed"][projectIndex % 4]}"></span>`;
                }).join("")}
                <i class="sales-line-dot" style="bottom:${Math.max(6, (totalValue / maxValue) * 100)}%"></i>
              </div>
              <strong>${escapeHtml(month.label)}</strong>
              <em>${numberPt(monthSales.length)} venda(s) · ${escapeHtml(brl(totalValue))}</em>
            </div>
          `;
        }).join("")}
      </div>
      <div class="chart-legend">${projects.map((project, index) => `<span><i style="background:${["#0f766e", "#2563eb", "#c2410c", "#7c3aed"][index % 4]}"></i>${escapeHtml(project)}</span>`).join("")}</div>
      ` : '<div class="empty">Nenhuma venda assinada registrada no período para montar a curva.</div>'}
    </section>
  `;
}

function renderDashboardFunnelModal(leads) {
  const status = state.dashboardFunnelStatus;
  const rows = leads.filter((lead) => lead.status === status).map((lead) => `
    <tr data-open-lead="${escapeHtml(lead.id)}">
      <td>${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.phone || "")}</td>
      <td>${escapeHtml(leadProjectValue(lead) || "")}</td>
      <td>${escapeHtml(userName(lead.assignedTo) || "Sem corretor")}</td>
    </tr>
  `).join("");
  return `
    <div class="modal-backdrop">
      <div class="modal wide-modal">
        <button class="modal-close" data-close-dashboard-funnel>×</button>
        <h2>${escapeHtml(status)}</h2>
        <div class="table-wrap"><table><thead><tr><th>Lead</th><th>Telefone</th><th>Empreendimento</th><th>Corretor</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum lead nesta etapa.</td></tr>'}</tbody></table></div>
      </div>
    </div>
  `;
}

function bindDashboardControls(leads) {
  document.querySelector("[data-dashboard-period-apply]")?.addEventListener("click", () => {
    state.dashboardStart = document.querySelector("#dashboardStart")?.value || "";
    state.dashboardEnd = document.querySelector("#dashboardEnd")?.value || "";
    renderDashboard();
  });
  document.querySelector("[data-dashboard-period-clear]")?.addEventListener("click", () => {
    const bounds = currentMonthBounds();
    state.dashboardStart = bounds.start;
    state.dashboardEnd = bounds.end;
    renderDashboard();
  });
  document.querySelector("#dashboardProject")?.addEventListener("change", (event) => {
    state.dashboardProject = event.currentTarget.value;
    renderDashboard();
  });
  document.querySelectorAll("[data-dashboard-funnel]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dashboardModalScrollTop = document.querySelector(".content")?.scrollTop || 0;
      state.dashboardFunnelStatus = button.dataset.dashboardFunnel;
      renderDashboard();
    });
  });
  document.querySelector("[data-close-dashboard-funnel]")?.addEventListener("click", () => {
    state.dashboardFunnelStatus = "";
    renderDashboard();
  });
  document.querySelectorAll("[data-open-lead]").forEach((row) => {
    row.addEventListener("click", () => routeTo("lead", row.dataset.openLead, { opportunityId: row.dataset.openOpportunity || "" }));
  });
}

function reportPeriod() {
  ensureReportDefaults();
  return monthRange(state.salesReportMonth);
}

function reportLeads(period) {
  return pipelineLeads().filter((lead) => dateIsInRange(lead.createdAt || lead.meta?.createdTime || lead.rescuedAt || lead.updatedAt, period.start, period.end));
}

function reportSales(period) {
  return salesInRange(period.start, period.end, state.salesReportProject);
}

function commercialMonthlyGoal() {
  return Math.max(0, Number(state.commercialSettings?.monthlySalesGoal || 0));
}

function salesReportPayload() {
  ensureReportDefaults();
  const period = reportPeriod();
  const leads = reportLeads(period);
  const sales = reportSales(period);
  const reportYear = parseFlexibleDate(`${period.month}-01`)?.getFullYear() || new Date().getFullYear();
  const monthlySalesValues = Array.from({ length: 12 }, (_, index) => {
    const label = new Date(reportYear, index, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const value = salesInRange(`${reportYear}-${String(index + 1).padStart(2, "0")}-01`, `${reportYear}-${String(index + 1).padStart(2, "0")}-${String(new Date(reportYear, index + 1, 0).getDate()).padStart(2, "0")}`, state.salesReportProject)
      .reduce((sum, sale) => sum + saleContractValue(sale), 0);
    return [label, value];
  });
  const totalSalesValue = sales.reduce((sum, sale) => sum + saleContractValue(sale), 0);
  const monthlyGoal = commercialMonthlyGoal();
  const achievement = monthlyGoal > 0 ? (totalSalesValue / monthlyGoal) * 100 : null;
  const interactions = (state.fupLeadLog || []).filter((log) => dateIsInRange(log.at, period.start, period.end));
  const monthLabel = parseFlexibleDate(`${period.month}-01`)?.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) || period.month;
  return {
    generatedAt: new Date().toISOString(),
    monthLabel,
    period,
    project: state.salesReportProject || "TODOS",
    metrics: {
      leads: leads.length,
      averageLeadsPerDay: averageLeadsPerDayText(leads),
      sales: sales.length,
      totalSalesValue,
      monthlyGoal,
      achievement
    },
    charts: {
      leadsByOrigin: groupRows(leads, (lead) => lead.source || "Não informado"),
      leadsByStatus: groupRows(leads, (lead) => lead.status || "Não informado"),
      leadsByWeekday: orderedWeekdayRows(groupRows(leads, (lead) => weekdayLabel(lead.createdAt || lead.meta?.createdTime))),
      brokerLeadRows: groupRows(leads, (lead) => userName(lead.assignedTo) || "Sem corretor"),
      interactionsByWeekday: orderedWeekdayRows(groupRows(interactions, (log) => weekdayLabel(log.at))),
      brokerInteractionRows: groupRows(interactions, (log) => log.userName || userName(log.userId) || log.username || "Não informado"),
      salesByBroker: groupRows(sales, (sale) => brokerForSale(sale)?.name || "Sem corretor"),
      salesByProjectCount: groupRows(sales, (sale) => saleProjectName(sale)),
      salesByProjectValue: groupRows(sales, (sale) => saleProjectName(sale), (sale) => saleContractValue(sale)),
      monthlySalesValues
    }
  };
}

function groupRows(items, getLabel, getValue = () => 1) {
  const grouped = new Map();
  for (const item of items) {
    const label = getLabel(item) || "Não informado";
    grouped.set(label, (grouped.get(label) || 0) + Number(getValue(item) || 0));
  }
  return [...grouped.entries()].sort((a, b) => b[1] - a[1]);
}

function renderSmallRanking(rows, options = {}) {
  const money = Boolean(options.money);
  return `
    <div class="table-wrap compact-table"><table>
      <thead><tr><th>${escapeHtml(options.label || "Item")}</th><th>${escapeHtml(options.valueLabel || "Total")}</th></tr></thead>
      <tbody>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${money ? escapeHtml(brl(value)) : numberPt(value)}</td></tr>`).join("") || '<tr><td colspan="2">Sem dados no período.</td></tr>'}</tbody>
    </table></div>
  `;
}

function brokerForLead(lead) {
  return state.users.find((user) => user.id === lead.assignedTo) || null;
}

function brokerForSale(sale) {
  const lead = leadForSale(sale);
  return lead ? brokerForLead(lead) : null;
}

function averageLeadsPerDayText(leads) {
  const dates = leads
    .map((lead) => parseFlexibleDate(lead.createdAt || lead.meta?.createdTime || lead.rescuedAt || lead.updatedAt))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!dates.length) return "0/dia";
  const first = parseFlexibleDate(localDateOnly(dates[0]));
  const last = parseFlexibleDate(localDateOnly(dates[dates.length - 1]));
  const days = first && last
    ? Math.max(1, Math.floor((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 1;
  return `${(leads.length / days).toFixed(1).replace(".", ",")}/dia`;
}

function renderSalesReportView() {
  const report = salesReportPayload();
  const { period, monthLabel } = report;
  const { leads, averageLeadsPerDay, sales, totalSalesValue, monthlyGoal, achievement } = report.metrics;
  const {
    brokerLeadRows,
    brokerInteractionRows,
    salesByBroker,
    salesByProjectCount,
    salesByProjectValue,
    leadsByOrigin,
    leadsByStatus,
    leadsByWeekday,
    interactionsByWeekday
  } = report.charts;
  renderShell(`
    ${renderViewHead("Relatório Comercial de Vendas", "Estatísticas comerciais do mês selecionado", {
      actions: `
        <div class="report-actions">
          <label class="compact-select"><span>Mês</span><input id="salesReportMonth" type="month" value="${escapeHtml(period.month)}"></label>
          <label class="compact-select"><span>Empreendimento</span><select id="salesReportProject"><option value="TODOS" ${state.salesReportProject === "TODOS" ? "selected" : ""}>Todos</option>${(state.projects || []).map((project) => `<option value="${escapeHtml(project)}" ${state.salesReportProject === project ? "selected" : ""}>${escapeHtml(project)}</option>`).join("")}</select></label>
        </div>
      `
    })}
    <section class="panel commercial-report" id="commercialReportPrintable">
      <div class="panel-title-row">
        <div>
          <h2>${escapeHtml(monthLabel)}</h2>
          <p class="muted-copy">Período de ${escapeHtml(period.start)} a ${escapeHtml(period.end)}</p>
        </div>
      </div>
      <section class="metrics">
        <div class="metric"><span>Leads</span><strong>${numberPt(leads)}</strong></div>
        <div class="metric"><span>Média de leads por dia</span><strong>${escapeHtml(averageLeadsPerDay)}</strong></div>
        <div class="metric"><span>Vendas</span><strong>${numberPt(sales)}</strong></div>
        <div class="metric"><span>Valor vendido</span><strong>${escapeHtml(brl(totalSalesValue))}</strong></div>
        <div class="metric"><span>Atingimento da meta</span><strong>${achievement == null ? "Sem meta" : `${achievement.toFixed(1).replace(".", ",")}%`}</strong><em>${monthlyGoal > 0 ? `Meta ${escapeHtml(brl(monthlyGoal))}` : "Configure em Configurações"}</em></div>
      </section>
      <div class="tabs report-view-tabs">
        <button class="${state.salesReportMode === "chart" ? "primary" : ""}" type="button" data-sales-report-mode="chart">Gráficos</button>
        <button class="${state.salesReportMode === "table" ? "primary" : ""}" type="button" data-sales-report-mode="table">Tabelas</button>
      </div>
      ${state.salesReportMode === "chart" ? `
        <section class="report-charts">
          ${renderReportBarChart("Leads por origem", leadsByOrigin)}
          ${renderReportBarChart("Leads por status", leadsByStatus)}
          ${renderReportBarChart("Cadastros por dia da semana", leadsByWeekday, { vertical: true })}
          ${renderReportBarChart("Cadastros por corretor", brokerLeadRows)}
          ${renderReportBarChart("Interações por dia da semana", interactionsByWeekday, { vertical: true })}
          ${renderReportBarChart("Interações por corretor", brokerInteractionRows)}
          ${renderReportBarChart("Vendas por corretor", salesByBroker)}
          ${renderReportBarChart("Vendas por empreendimento", salesByProjectValue, { money: true })}
        </section>
      ` : `
        <section class="report-grid">
        <div class="panel nested-panel"><h3>Leads por origem</h3>${renderSmallRanking(leadsByOrigin)}</div>
        <div class="panel nested-panel"><h3>Leads por status</h3>${renderSmallRanking(leadsByStatus)}</div>
        <div class="panel nested-panel"><h3>Cadastros por dia da semana</h3>${renderSmallRanking(leadsByWeekday)}</div>
        <div class="panel nested-panel"><h3>Cadastros por corretor</h3>${renderSmallRanking(brokerLeadRows)}</div>
        <div class="panel nested-panel"><h3>Interações por dia da semana</h3>${renderSmallRanking(interactionsByWeekday)}</div>
        <div class="panel nested-panel"><h3>Interações por corretor</h3>${renderSmallRanking(brokerInteractionRows)}</div>
        <div class="panel nested-panel"><h3>Ranking de vendas por corretor</h3>${renderBrokerSalesRanking(salesByBroker)}</div>
        <div class="panel nested-panel"><h3>Ranking de vendas por empreendimento</h3>${renderSmallRanking(salesByProjectCount)}</div>
        <div class="panel nested-panel wide"><h3>Total de vendas por empreendimento</h3>${renderProjectSalesTotals(salesByProjectCount, salesByProjectValue)}</div>
        </section>
      `}
    </section>
  `);
  bindSalesReportControls();
}

function orderedWeekdayRows(rows) {
  const order = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const values = Object.fromEntries(rows);
  return order.map((label) => [label, Number(values[label] || 0)]);
}

function renderReportBarChart(title, rows, options = {}) {
  const max = Math.max(...rows.map(([, value]) => Number(value || 0)), 1);
  if (options.vertical) {
    return `
      <div class="panel nested-panel report-bar-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="report-bars-vertical">
          ${rows.map(([label, value], index) => {
            const height = Math.max(4, (Number(value || 0) / max) * 100);
            return `
              <div class="report-vertical-item">
                <strong>${options.money ? escapeHtml(brl(value)) : numberPt(value)}</strong>
                <div class="report-vertical-bar"><i style="height:${height}%; background:${["#0f766e", "#2563eb", "#c2410c", "#7c3aed", "#0891b2", "#be123c"][index % 6]}"></i></div>
                <span>${escapeHtml(label)}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }
  return `
    <div class="panel nested-panel report-bar-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="report-bars">
        ${rows.slice(0, 8).map(([label, value], index) => {
          const width = Math.max(4, (Number(value || 0) / max) * 100);
          return `
            <div class="report-bar-row">
              <span>${escapeHtml(label)}</span>
              <div class="report-bar"><i style="width:${width}%; background:${["#0f766e", "#2563eb", "#c2410c", "#7c3aed", "#0891b2", "#be123c"][index % 6]}"></i></div>
              <strong>${options.money ? escapeHtml(brl(value)) : numberPt(value)}</strong>
            </div>
          `;
        }).join("") || '<div class="empty">Sem dados no período.</div>'}
      </div>
    </div>
  `;
}

function renderBrokerSalesRanking(rows) {
  return `
    <div class="broker-ranking">
      ${rows.map(([name, count], index) => {
        const user = state.users.find((item) => item.name === name);
        const initials = String(name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
        return `
          <div class="broker-rank-row">
            <span>${index + 1}</span>
            ${userPhotoSrc(user) ? `<img src="${escapeHtml(userPhotoSrc(user))}" alt="${escapeHtml(name)}">` : `<i>${escapeHtml(initials)}</i>`}
            <strong>${escapeHtml(name)}</strong>
            <em>${numberPt(count)} venda(s)</em>
          </div>
        `;
      }).join("") || '<div class="empty">Sem vendas no período.</div>'}
    </div>
  `;
}

function renderProjectSalesTotals(countRows, valueRows) {
  const values = Object.fromEntries(valueRows);
  return `
    <div class="table-wrap compact-table"><table>
      <thead><tr><th>Empreendimento</th><th>Qtde</th><th>Valor</th></tr></thead>
      <tbody>${countRows.map(([project, count]) => `<tr><td>${escapeHtml(project)}</td><td>${numberPt(count)}</td><td>${escapeHtml(brl(values[project] || 0))}</td></tr>`).join("") || '<tr><td colspan="3">Sem vendas no período.</td></tr>'}</tbody>
    </table></div>
  `;
}

function bindSalesReportControls() {
  document.querySelectorAll("[data-sales-report-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.salesReportMode = button.dataset.salesReportMode || "chart";
      renderSalesReportView();
    });
  });
  document.querySelector("#salesReportMonth")?.addEventListener("change", (event) => {
    state.salesReportMonth = event.currentTarget.value || currentMonthBounds().month;
    renderSalesReportView();
  });
  document.querySelector("#salesReportProject")?.addEventListener("change", (event) => {
    state.salesReportProject = event.currentTarget.value || "TODOS";
    renderSalesReportView();
  });
  document.querySelector("[data-print-report]")?.addEventListener("click", (event) => downloadSalesReportPdf(event.currentTarget));
}

async function downloadSalesReportPdf(button) {
  const report = salesReportPayload();
  try {
    setButtonBusy(button, true, "Gerando...");
    const response = await fetch("/api/sales-report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Não foi possível gerar o PDF.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-comercial-${report.period.month}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  } finally {
    setButtonBusy(button, false);
    if (button) button.textContent = "Gerar PDF";
  }
}

function settingsTabButton(tab, label) {
  return `<button class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}">${label}</button>`;
}

function settingsMainTabButton(group) {
  return `<button class="${group.tabs.some((tab) => tab.id === state.settingsTab) ? "active" : ""}" data-settings-main-tab="${group.id}">${group.label}</button>`;
}

function availableSettingsGroups() {
  const groups = [
    {
      id: "users",
      label: "Usuários",
      tabs: [
        ...(canManageUsers() ? [{ id: "users", label: "Usuários" }] : []),
        ...(canManagePipelineSettings() ? [{ id: "permissions", label: "Permissões" }] : [])
      ]
    },
    {
      id: "pipeline",
      label: "Pipeline",
      tabs: [
        ...(canManagePipelineSettings() ? [{ id: "statuses", label: "Status Pipeline" }] : []),
        ...(canManagePipelineSettings() ? [{ id: "tags", label: "Etiquetas" }] : []),
        ...(canManagePipelineSettings() ? [{ id: "projects", label: "Empreendimentos" }] : []),
        ...(canManagePipelineSettings() ? [{ id: "availabilityStatuses", label: "Status disponibilidade" }] : []),
        ...(canManagePipelineSettings() ? [{ id: "architectureOptions", label: "Arquitetura" }] : []),
        ...(canManagePipelineSettings() ? [{ id: "typologyOptions", label: "Tipologia" }] : []),
        ...(canManageCommercialSettings() ? [{ id: "commercial", label: "Configurações comerciais" }] : [])
      ]
    },
    {
      id: "integrations",
      label: "Integrações",
      tabs: canManageSystemSettings() ? [{ id: "integrations", label: "Integrações" }] : []
    },
    {
      id: "logs",
      label: "Logs",
      tabs: canManageSystemSettings() ? [{ id: "logs", label: "Logs" }] : []
    },
    {
      id: "levFinance",
      label: "Financeiro Lev",
      tabs: canManageLevFinanceSettings() ? [{ id: "levFinance", label: "Financeiro Lev" }] : []
    },
    {
      id: "backup",
      label: "Backup",
      tabs: canManageSystemSettings() ? [{ id: "backup", label: "Backup" }] : []
    },
    {
      id: "structuredDb",
      label: "Banco estruturado",
      tabs: canManageSystemSettings() ? [{ id: "structuredDb", label: "Banco estruturado" }] : []
    },
    {
      id: "knowledge",
      label: "Base de conhecimento",
      tabs: canManageSystemSettings() ? [{ id: "knowledge", label: "Base de conhecimento" }] : []
    }
  ].filter((group) => group.tabs.length);
  return groups;
}

function activeSettingsGroup(groups = availableSettingsGroups()) {
  return groups.find((group) => group.tabs.some((tab) => tab.id === state.settingsTab)) || groups[0] || null;
}

function settingsLayout(content) {
  const groups = availableSettingsGroups();
  const activeGroup = activeSettingsGroup(groups);
  renderShell(`
    ${renderViewHead("Configurações", "Cadastros administrativos do sistema")}
      <div class="tabs">
        ${groups.map(settingsMainTabButton).join("")}
      </div>
      ${activeGroup && activeGroup.tabs.length > 1 ? `
        <div class="tabs compact-tabs settings-subtabs">
          ${activeGroup.tabs.map((tab) => settingsTabButton(tab.id, tab.label)).join("")}
        </div>
      ` : ""}
    ${content}
  `);
  document.querySelectorAll("[data-settings-main-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = groups.find((item) => item.id === button.dataset.settingsMainTab);
      const firstTab = group?.tabs?.[0]?.id;
      if (!firstTab) return;
      state.settingsTab = firstTab;
      state.settingsEditing = null;
      state.settingsNotice = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsTab = button.dataset.settingsTab;
      state.settingsEditing = null;
      state.settingsNotice = "";
      renderSettings();
    });
  });
}

function renderSettings() {
  if (["integrations", "logs", "knowledge", "backup", "structuredDb"].includes(state.settingsTab) && !canManageSystemSettings()) state.settingsTab = "users";
  if (["statuses", "tags", "projects", "availabilityStatuses", "architectureOptions", "typologyOptions", "permissions"].includes(state.settingsTab) && !canManagePipelineSettings()) state.settingsTab = "users";
  if (state.settingsTab === "levFinance" && !canManageLevFinanceSettings()) state.settingsTab = "users";
  if (state.settingsTab === "commercial" && !canManageCommercialSettings()) state.settingsTab = "users";
  if (state.settingsTab === "users" && !canManageUsers()) {
    const fallbackGroup = activeSettingsGroup();
    state.settingsTab = fallbackGroup?.tabs?.[0]?.id || "knowledge";
  }
  if (state.settingsTab === "integrations") return renderIntegrationSettings();
  if (state.settingsTab === "statuses") return renderStatusSettings();
  if (state.settingsTab === "tags") return renderTagSettings();
  if (state.settingsTab === "permissions") return renderPermissionSettings();
  if (state.settingsTab === "logs") return renderLogSettings();
  if (state.settingsTab === "projects") return renderProjectSettings();
  if (state.settingsTab === "availabilityStatuses") return renderAvailabilityStatusSettings();
  if (state.settingsTab === "architectureOptions") return renderAvailabilityOptionSettings("architecture");
  if (state.settingsTab === "typologyOptions") return renderAvailabilityOptionSettings("typology");
  if (state.settingsTab === "levFinance") return renderLevFinanceSettings();
  if (state.settingsTab === "commercial") return renderCommercialSettings();
  if (state.settingsTab === "backup") return renderBackupSettings();
  if (state.settingsTab === "structuredDb") return renderStructuredDbSettings();
  if (state.settingsTab === "knowledge") return renderKnowledgeSettings();
  return renderUserSettings();
}

function renderSettingsActionMenu(menuId, actions, label = "⋮") {
  const isIconOnly = label === "⋮";
  return `
    <div class="action-menu">
      <button type="button" class="action-menu-button ${isIconOnly ? "" : "menu-label-button"}" data-settings-action-menu="${escapeHtml(menuId)}" title="${isIconOnly ? "Ações" : escapeHtml(label)}" aria-label="${isIconOnly ? "Ações" : escapeHtml(label)}">${escapeHtml(label)}</button>
      <div class="action-menu-list">
        ${actions.filter(Boolean).join("")}
      </div>
    </div>
  `;
}

function bindSettingsActionMenus() {
  document.querySelectorAll("[data-settings-action-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".action-menu");
      document.querySelectorAll(".action-menu.open").forEach((item) => {
        if (item !== menu) item.classList.remove("open");
      });
      const rect = button.getBoundingClientRect();
      const list = menu?.querySelector(".action-menu-list");
      if (menu && list) {
        menu.classList.add("measuring");
        const menuHeight = list.offsetHeight;
        menu.classList.remove("measuring");
        const bottomSpace = window.innerHeight - rect.bottom;
        const openUp = bottomSpace < menuHeight + 16 && rect.top > menuHeight;
        menu.classList.toggle("open-up", openUp);
        menu.style.setProperty("--menu-top", openUp ? "auto" : `${rect.bottom + 6}px`);
        menu.style.setProperty("--menu-bottom", openUp ? `${Math.max(12, window.innerHeight - rect.top + 6)}px` : "auto");
        menu.style.setProperty("--menu-right", `${Math.max(12, window.innerWidth - rect.right)}px`);
      }
      menu?.classList.toggle("open");
      if (menu?.classList.contains("open")) {
        setTimeout(() => document.addEventListener("click", closeUserActionMenus, { once: true }), 0);
      }
    });
  });
  document.querySelectorAll(".action-menu-list").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
}

function permissionResources() {
  const resources = Array.isArray(state.permissionResources) ? state.permissionResources : [];
  if (resources.length) {
    return resources.map((resource) => ({
      id: resource.id,
      label: resource.source ? baseSourceLabel(resource.source) : resource.label,
      type: resource.source ? "base" : "screen"
    }));
  }
  return [
    { id: "screen:kanban", label: "Kanban", type: "screen" },
    { id: "screen:availability", label: "Disponibilidade", type: "screen" },
    { id: "screen:sheet", label: "Planilha", type: "screen" },
    { id: "screen:bases", label: "Bases", type: "screen" },
    { id: "screen:dashboard", label: "Dashboard", type: "screen" },
    { id: "screen:salesReport", label: "Relatório Comercial", type: "screen" },
    { id: "screen:finance", label: "Financeiro Lev", type: "screen" },
    { id: "screen:settings", label: "Configurações", type: "screen" },
    { id: "screen:knowledge", label: "Ajuda", type: "screen" },
    ...(state.baseAccessSources || []).map((source) => ({ id: `base:${source}`, label: baseSourceLabel(source), type: "base" }))
  ];
}

function permissionCellValue(scope, ownerId, resourceId) {
  const permissions = state.permissions || { roles: {}, users: {} };
  const ownerRules = permissions[scope]?.[ownerId] || {};
  const user = scope === "users" ? state.users.find((item) => item.id === ownerId) : null;
  const fallback = user ? permissions.roles?.[user.role]?.[resourceId] : null;
  const cell = ownerRules[resourceId] || fallback || {};
  const action = Boolean(cell.action);
  return { access: Boolean(cell.access || action), action };
}

function permissionCell(scope, ownerId, resourceId, locked = false) {
  const cell = permissionCellValue(scope, ownerId, resourceId);
  const key = `${scope}:${ownerId}:${resourceId}`;
  return `
    <div class="permission-cell" data-permission-cell="${escapeHtml(key)}">
      <label><input type="checkbox" data-permission-access="${escapeHtml(key)}" ${cell.access ? "checked" : ""} ${locked ? "disabled" : ""}> Acessar</label>
      <label><input type="checkbox" data-permission-action="${escapeHtml(key)}" ${cell.action ? "checked" : ""} ${locked ? "disabled" : ""}> Agir</label>
    </div>
  `;
}

function permissionOwners(scope) {
  if (scope === "roles") return state.roles.map((role) => ({ id: role, label: role, locked: role === "Admin TI" }));
  return state.users
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((user) => ({ id: user.id, label: user.name, sublabel: user.role, locked: user.role === "Admin TI" }));
}

function renderPermissionSettings() {
  const scope = state.permissionsTab === "users" ? "users" : "roles";
  const owners = permissionOwners(scope);
  const resources = permissionResources();
  const rows = resources.map((resource) => `
    <tr>
      <th class="permission-row-head">
        <span>${escapeHtml(resource.label)}</span>
        <small>${resource.type === "base" ? "Base" : "Tela"}</small>
      </th>
      ${owners.map((owner) => `<td>${permissionCell(scope, owner.id, resource.id, owner.locked)}</td>`).join("")}
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Permissões</h2>
        <button class="primary" type="button" id="savePermissions">Salvar permissões</button>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <div class="tabs compact-tabs">
        <button class="${scope === "roles" ? "active" : ""}" data-permissions-tab="roles">Perfil</button>
        <button class="${scope === "users" ? "active" : ""}" data-permissions-tab="users">Usuários</button>
      </div>
      <p class="muted-copy">Em cada cruzamento, marque Acessar para permitir visualização e Agir para liberar ações da tela ou base. Agir sempre inclui Acessar.</p>
      <div class="table-wrap permission-matrix-wrap">
        <table class="permission-matrix">
          <thead>
            <tr>
              <th>Tela / Base</th>
              ${owners.map((owner) => `<th>${escapeHtml(owner.label)}${owner.sublabel ? `<small>${escapeHtml(owner.sublabel)}</small>` : ""}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `);
  bindSettingsCommon();
  bindPermissionControls(scope, owners, resources);
}

function bindPermissionControls(scope, owners, resources) {
  document.querySelectorAll("[data-permissions-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.permissionsTab = button.dataset.permissionsTab;
      state.settingsNotice = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-permission-action]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const access = document.querySelector(`[data-permission-access="${CSS.escape(input.dataset.permissionAction)}"]`);
      if (access) access.checked = true;
    });
  });
  document.querySelectorAll("[data-permission-access]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) return;
      const action = document.querySelector(`[data-permission-action="${CSS.escape(input.dataset.permissionAccess)}"]`);
      if (action) action.checked = false;
    });
  });
  document.querySelector("#savePermissions")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const payload = {};
    payload[scope] = {};
    owners.forEach((owner) => {
      payload[scope][owner.id] = {};
      resources.forEach((resource) => {
        const key = `${scope}:${owner.id}:${resource.id}`;
        const action = Boolean(document.querySelector(`[data-permission-action="${CSS.escape(key)}"]`)?.checked);
        const access = Boolean(document.querySelector(`[data-permission-access="${CSS.escape(key)}"]`)?.checked) || action;
        payload[scope][owner.id][resource.id] = { access, action };
      });
    });
    if (scope === "roles") {
      payload.applyToUsers = confirm("Aplicar essas permissões também aos usuários já cadastrados desses perfis?");
    }
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api("/api/permissions", { method: "PUT", body: JSON.stringify(payload) });
      state.permissions = data.permissions || state.permissions;
      state.currentPermissions = data.currentPermissions || state.currentPermissions;
      state.permissionResources = data.permissionResources || state.permissionResources;
      state.accessibleBaseSources = data.accessibleBaseSources || state.accessibleBaseSources;
      state.actionableBaseSources = data.actionableBaseSources || state.actionableBaseSources;
      state.leads = data.leads || state.leads;
      state.settingsNotice = "Permissões salvas.";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
}

function baseAccessSourceChecks(scope, id, selected = []) {
  const sources = state.baseAccessSources || [];
  const usesAll = !selected.length;
  return `
    <div class="source-checks" data-base-access-sources="${escapeHtml(scope)}:${escapeHtml(id)}">
      <label class="checkline settings-check">
        <input type="checkbox" data-base-access-all="${escapeHtml(scope)}:${escapeHtml(id)}" ${usesAll ? "checked" : ""}>
        Todas
      </label>
      ${sources.map((source) => `
        <label class="checkline settings-check">
          <input type="checkbox" data-base-access-source="${escapeHtml(scope)}:${escapeHtml(id)}" value="${escapeHtml(source)}" ${usesAll || selected.includes(source) ? "checked" : ""}>
          ${escapeHtml(baseSourceLabel(source))}
        </label>
      `).join("")}
    </div>
  `;
}

function renderBaseAccessSettings() {
  const access = state.baseAccess || { roles: {}, users: {} };
  const commercialUsers = state.users
    .filter((user) => !["Gerente Financeiro", "Auxiliar Financeiro"].includes(user.role))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const roleRows = state.roles.map((role) => {
    const rule = access.roles?.[role] || { enabled: false, sources: [] };
    const locked = role === "Admin TI";
    return `
      <tr data-base-role-row="${escapeHtml(role)}">
        <td>${escapeHtml(role)}</td>
        <td><label class="checkline settings-check"><input type="checkbox" data-base-role-enabled="${escapeHtml(role)}" ${rule.enabled ? "checked" : ""} ${locked ? "disabled" : ""}> Acessa Bases</label></td>
        <td>${baseAccessSourceChecks("role", role, rule.sources || [])}</td>
      </tr>
    `;
  }).join("");
  const userRows = commercialUsers.map((user) => {
    const rule = access.users?.[user.id] || { override: false, enabled: true, sources: [] };
    return `
      <tr data-base-user-row="${escapeHtml(user.id)}">
        <td><strong>${escapeHtml(user.name)}</strong><br><small>${escapeHtml(user.username)}</small></td>
        <td>${escapeHtml(user.role)}</td>
        <td><label class="checkline settings-check"><input type="checkbox" data-base-user-override="${escapeHtml(user.id)}" ${rule.override ? "checked" : ""}> Regra própria</label></td>
        <td><label class="checkline settings-check"><input type="checkbox" data-base-user-enabled="${escapeHtml(user.id)}" ${rule.enabled ? "checked" : ""}> Acessa Bases</label></td>
        <td>${baseAccessSourceChecks("user", user.id, rule.sources || [])}</td>
      </tr>
    `;
  }).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Permissões de Bases</h2>
        <button class="primary" type="button" id="saveBaseAccess">Salvar permissões</button>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <p class="muted-copy">Configure quem acessa a tela Bases e quais origens aparecem para cada perfil ou usuário. Se o usuário tiver regra própria, ela substitui a regra do perfil.</p>
      <h3 class="settings-subhead">Por perfil</h3>
      <div class="table-wrap"><table class="access-table base-access-table"><thead><tr><th>Perfil</th><th>Acesso</th><th>Bases permitidas</th></tr></thead><tbody>${roleRows}</tbody></table></div>
      <h3 class="settings-subhead">Por usuário</h3>
      <div class="table-wrap"><table class="access-table base-access-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Regra</th><th>Acesso</th><th>Bases permitidas</th></tr></thead><tbody>${userRows}</tbody></table></div>
    </section>
  `);
  bindSettingsCommon();
  bindBaseAccessControls();
}

function selectedBaseAccessSources(scope, id) {
  const key = `${scope}:${id}`;
  const all = document.querySelector(`[data-base-access-all="${CSS.escape(key)}"]`)?.checked;
  if (all) return [];
  return [...document.querySelectorAll(`[data-base-access-source="${CSS.escape(key)}"]:checked`)].map((input) => input.value);
}

function bindBaseAccessControls() {
  const syncSourceGroup = (key) => {
    const all = document.querySelector(`[data-base-access-all="${CSS.escape(key)}"]`);
    const sources = [...document.querySelectorAll(`[data-base-access-source="${CSS.escape(key)}"]`)];
    if (!all) return;
    if (all.checked) sources.forEach((input) => { input.checked = true; });
  };
  document.querySelectorAll("[data-base-access-all]").forEach((input) => {
    input.addEventListener("change", () => syncSourceGroup(input.dataset.baseAccessAll));
  });
  document.querySelectorAll("[data-base-access-source]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.baseAccessSource;
      const all = document.querySelector(`[data-base-access-all="${CSS.escape(key)}"]`);
      const sources = [...document.querySelectorAll(`[data-base-access-source="${CSS.escape(key)}"]`)];
      if (all) all.checked = sources.every((item) => item.checked);
    });
  });
  document.querySelector("#saveBaseAccess")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const roles = {};
    state.roles.forEach((role) => {
      roles[role] = {
        enabled: document.querySelector(`[data-base-role-enabled="${CSS.escape(role)}"]`)?.checked || role === "Admin TI",
        sources: selectedBaseAccessSources("role", role)
      };
    });
    const users = {};
    state.users.forEach((user) => {
      users[user.id] = {
        override: Boolean(document.querySelector(`[data-base-user-override="${CSS.escape(user.id)}"]`)?.checked),
        enabled: Boolean(document.querySelector(`[data-base-user-enabled="${CSS.escape(user.id)}"]`)?.checked),
        sources: selectedBaseAccessSources("user", user.id)
      };
    });
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api("/api/base-access", { method: "PUT", body: JSON.stringify({ roles, users }) });
      state.baseAccess = data.baseAccess;
      state.baseAccessSources = data.baseAccessSources || state.baseAccessSources;
      state.accessibleBaseSources = data.accessibleBaseSources || state.accessibleBaseSources;
      state.leads = data.leads || state.leads;
      state.settingsNotice = "Permissões de bases salvas.";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
}

function userPasswordChip(user) {
  if (user.passwordConfigured) return '<span class="chip">Senha criada</span>';
  if (user.invitePending) return '<span class="chip">Convite pendente</span>';
  if (user.inviteExpiresAt && new Date(user.inviteExpiresAt).getTime() <= Date.now()) {
    return '<span class="chip chip-warning">Convite expirado</span>';
  }
  return '<span class="chip">Sem senha</span>';
}

function userNotificationIcons(user) {
  const notifications = user.notifications || {};
  const icons = [];
  if (notifications.email) icons.push('<span class="notification-icon email" title="Notificação por e-mail" aria-label="Notificação por e-mail">✉</span>');
  if (notifications.whatsapp) icons.push('<span class="notification-icon whatsapp" title="Notificação por WhatsApp" aria-label="Notificação por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.86 9.86 0 0 0-8.44 14.94L2.35 22l5.17-1.2A9.9 9.9 0 1 0 12.04 2Zm0 1.74a8.16 8.16 0 1 1 0 16.32 8.08 8.08 0 0 1-4.16-1.14l-.34-.2-3.02.7.72-2.94-.22-.35a8.16 8.16 0 0 1 7.02-12.39Zm-3.3 4.37c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.27s.98 2.64 1.12 2.82c.14.18 1.9 3.04 4.72 4.14 2.34.92 2.82.74 3.33.69.51-.05 1.65-.67 1.88-1.32.23-.65.23-1.21.16-1.33-.07-.12-.25-.19-.53-.33-.28-.14-1.65-.81-1.9-.9-.25-.09-.44-.14-.63.14-.18.28-.72.9-.88 1.08-.16.18-.33.21-.6.07-.28-.14-1.17-.43-2.23-1.37-.82-.73-1.38-1.64-1.54-1.92-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.18-.28.28-.46.09-.18.05-.35-.02-.49-.07-.14-.63-1.52-.86-2.08-.23-.54-.46-.47-.63-.48h-.53Z"/></svg></span>');
  return icons.length ? `<div class="notification-icons">${icons.join("")}</div>` : '<span class="muted-cell">-</span>';
}

function renderUserActionMenu(user) {
  const userId = escapeHtml(user.id);
  const statusAction = user.id === state.user?.id
    ? ""
    : user.active
      ? `<button type="button" data-deactivate-user="${userId}">Inativar</button>`
      : `<button type="button" data-activate-user="${userId}">Ativar</button>`;
  const testActions = user.role === "Admin TI"
    ? [
      `<button type="button" data-test-notification-user="${userId}">Testar notificações</button>`,
      `<button type="button" data-test-assignment-notification-user="${userId}">Testar atribuição</button>`
    ]
    : [];
  return `
    ${renderSettingsActionMenu(`user-${userId}`, [
      `<button type="button" data-edit-user="${userId}">Editar</button>`,
      statusAction,
      `<button type="button" data-invite-user="${userId}">${user.passwordConfigured ? "Redefinir senha" : "Reenviar convite"}</button>`,
      ...testActions,
      canManageSystemSettings() ? `<button type="button" data-view-user-log="${userId}">Ver log</button>` : "",
      canManageSystemSettings() ? `<button type="button" class="danger-menu-item" data-delete-user="${userId}">Excluir</button>` : ""
    ])}
  `;
}

function closeUserActionMenus() {
  document.querySelectorAll(".action-menu.open").forEach((item) => item.classList.remove("open"));
}

function reassignPayloadForBrokerDeactivation(targetUser) {
  if (!isAssignableBrokerUser(targetUser) || !targetUser.active) return {};
  const assignedCount = state.leads.filter((lead) => lead.inPipeline && lead.assignedTo === targetUser.id).length;
  if (!assignedCount) return {};
  const brokers = activeBrokers().filter((broker) => broker.id !== targetUser.id);
  if (!brokers.length) {
    alert("Não há outro corretor ativo para receber os leads deste corretor.");
    return null;
  }
  const options = brokers.map((broker, index) => `${index + 1}. ${broker.name}`).join("\n");
  const choice = prompt(`Este corretor tem ${assignedCount} lead(s) vinculado(s). Para qual corretor deseja redirecionar?\n\n${options}`);
  if (!choice) return null;
  const selected = brokers[Number(choice) - 1] || brokers.find((broker) => broker.name.toLowerCase() === choice.trim().toLowerCase());
  if (!selected) {
    alert("Opção inválida. A inativação foi cancelada.");
    return null;
  }
  return { reassignTo: selected.id };
}

async function updateUserActive(button, userId, active) {
  const targetUser = state.users.find((user) => user.id === userId);
  if (!targetUser) return;
  const reassignment = active ? {} : reassignPayloadForBrokerDeactivation(targetUser);
  if (reassignment === null) return;
  try {
    setButtonBusy(button, true, active ? "Ativando..." : "Inativando...");
    await api(`/api/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ active, ...reassignment })
    });
    await loadState();
    renderSettings();
  } catch (error) {
    setButtonBusy(button, false);
    alert(error.message);
  }
}

function renderUserSettings() {
  const isCreating = state.settingsEditing === "new-user";
  const logUserId = state.settingsEditing?.startsWith("access:") ? state.settingsEditing.replace("access:", "") : null;
  const editUser = state.users.find((user) => user.id === state.settingsEditing);
  const formUser = editUser || {};
  const roleOptions = editableRoles();
  const manageableUserRows = state.user?.role === "Head Comercial"
    ? state.users.filter((user) => roleOptions.includes(user.role))
    : state.users;
  const users = manageableUserRows.map((user) => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td class="${user.active ? "status-active" : "status-inactive"}">${user.active ? "Ativo" : "Inativo"}</td>
      <td>${userPasswordChip(user)}</td>
      <td>${userNotificationIcons(user)}</td>
      <td>${renderUserActionMenu(user)}</td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Usuários</h2>
        <button class="primary" data-new-user>Cadastrar novo</button>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Senha</th><th>Notificações</th><th>Ações</th></tr></thead><tbody>${users}</tbody></table>
      </div>
    </section>
    ${(isCreating || editUser) ? renderUserEditorModal(formUser, Boolean(editUser), roleOptions) : ""}
    ${logUserId ? renderUserAccessLogModal(logUserId) : ""}
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  document.querySelector("[data-user-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    state.settingsEditing = null;
    state.settingsNotice = "";
    renderSettings();
  });
  document.querySelector("[data-new-user]")?.addEventListener("click", () => {
    state.settingsEditing = "new-user";
    state.settingsNotice = "";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = button.dataset.editUser;
      state.settingsNotice = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-view-user-log]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `access:${button.dataset.viewUserLog}`;
      state.settingsNotice = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-activate-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateUserActive(button, button.dataset.activateUser, true);
    });
  });
  document.querySelectorAll("[data-deactivate-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateUserActive(button, button.dataset.deactivateUser, false);
    });
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este usuário?")) return;
      try {
        setButtonBusy(button, true);
        await api(`/api/users/${button.dataset.deleteUser}`, { method: "DELETE" });
        await loadState();
        renderSettings();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-invite-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const invitedUser = state.users.find((user) => user.id === button.dataset.inviteUser);
      try {
        setButtonBusy(button, true, "Enviando...");
        const data = await api(`/api/users/${button.dataset.inviteUser}/invite`, { method: "POST" });
        const email = data.user?.username || invitedUser?.username || "";
        const invitationLabel = invitedUser?.passwordConfigured ? "Convite de redefinição enviado" : "Convite reenviado";
        state.settingsNotice = data.invitation?.sent
          ? `${invitationLabel} com sucesso para o usuário com e-mail ${email}.`
          : `Convite gerado para o usuário com e-mail ${email}. O envio por e-mail não foi confirmado.`;
        await loadState();
        renderSettings();
        if (!data.invitation?.sent && data.invitation?.link) {
          prompt("Resend ainda não está configurado. Use este link de convite para teste:", data.invitation.link);
        }
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-test-notification-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.users.find((user) => user.id === button.dataset.testNotificationUser);
      try {
        setButtonBusy(button, true, "Testando...");
        const data = await api(`/api/users/${button.dataset.testNotificationUser}/notification-test`, { method: "POST" });
        const sent = (data.results || []).filter((item) => item.sent).map((item) => item.channel);
        const failed = (data.results || []).filter((item) => item.sent === false).map((item) => `${item.channel}: ${item.reason || "falhou"}`);
        state.settingsNotice = sent.length
          ? `Teste enviado para ${target?.name || "usuário"} por ${sent.join(" e ")}${failed.length ? `. Falha em ${failed.join("; ")}.` : "."}`
          : `Nenhuma notificação enviada para ${target?.name || "usuário"}. ${failed.length ? failed.join("; ") : "Ative e-mail ou WhatsApp no perfil."}`;
        await loadState();
        renderSettings();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-test-assignment-notification-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.users.find((user) => user.id === button.dataset.testAssignmentNotificationUser);
      try {
        setButtonBusy(button, true, "Testando...");
        const data = await api(`/api/users/${button.dataset.testAssignmentNotificationUser}/assignment-notification-test`, { method: "POST" });
        const sent = (data.results || []).filter((item) => item.sent).map((item) => item.channel);
        const failed = (data.results || []).filter((item) => item.sent === false).map((item) => `${item.channel}: ${item.reason || "falhou"}`);
        state.settingsNotice = sent.length
          ? `Teste de atribuição enviado para ${target?.name || "usuário"} por ${sent.join(" e ")}${failed.length ? `. Falha em ${failed.join("; ")}.` : "."}`
          : `Nenhum teste de atribuição enviado para ${target?.name || "usuário"}. ${failed.length ? failed.join("; ") : "Ative e-mail ou WhatsApp no perfil."}`;
        await loadState();
        renderSettings();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  document.querySelector("#userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      role: form.get("role"),
      active: form.get("active") === "true",
      notifications: {
        email: form.get("notifyEmail") === "on",
        whatsapp: form.get("notifyWhatsapp") === "on",
        whatsappNumber: form.get("whatsappNumber"),
        metaHealthWhatsapp: canUseMetaHealthAlertsForRole(String(form.get("role") || "")) && form.get("notifyMetaHealthWhatsapp") === "on"
      },
      operatesAsBroker: form.get("operatesAsBroker") === "on"
    };
    if (form.has("username")) payload.username = form.get("username");
    if (isAssignableBrokerUser(editUser) && editUser.active && payload.active === false) {
      const reassignment = reassignPayloadForBrokerDeactivation(editUser);
      if (reassignment === null) return;
      Object.assign(payload, reassignment);
    }
    try {
      setButtonBusy(submitButton, true, "Salvando...");
      if (editUser) {
        await api(`/api/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        const data = await api("/api/users", {
          method: "POST",
          body: JSON.stringify({ ...payload, username: form.get("username") })
        });
        if (!data.invitation?.sent && data.invitation?.link) {
          prompt("Resend ainda não está configurado. Use este link de convite para teste:", data.invitation.link);
        }
      }
      state.settingsEditing = null;
      await loadState();
      renderSettings();
    } catch (error) {
      setButtonBusy(submitButton, false);
      alert(error.message);
    }
  });
}

function renderUserEditorModal(formUser, isEditing, roleOptions) {
  const emailDisabled = isEditing && !canEditUserEmail();
  return `
    <div class="modal-backdrop" data-user-modal-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="userModalTitle">
        <div class="panel-head">
          <h2 id="userModalTitle">${isEditing ? "Editar usuário" : "Cadastrar usuário"}</h2>
          <button type="button" class="icon" data-cancel-settings title="Fechar">×</button>
        </div>
        <form id="userForm" class="form-grid">
          <div class="field"><label>Nome</label><input name="name" value="${escapeHtml(formUser.name || "")}" required autofocus></div>
          <div class="field"><label>E-mail de acesso</label><input name="username" type="email" value="${escapeHtml(formUser.username || "")}" required ${emailDisabled ? "disabled" : ""}>${emailDisabled ? "<small>Apenas Admin TI pode alterar o e-mail de acesso.</small>" : ""}</div>
          <div class="field"><label>Perfil</label><select name="role">${roleOptions.map((role) => `<option ${role === formUser.role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}</select></div>
          <div class="field"><label>Status</label><select name="active"><option value="true" ${formUser.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${formUser.active === false ? "selected" : ""}>Inativo</option></select></div>
          <div class="field full"><label>Operação comercial</label><label class="checkline settings-check"><input type="checkbox" name="operatesAsBroker" ${formUser.operatesAsBroker ? "checked" : ""}> Operar também como corretor</label><small>Quando ativo para Head ou Supervisor, o usuário pode receber leads como corretor sem perder a visão gerencial.</small></div>
          <div class="field"><label>Notificar por e-mail</label><label class="checkline settings-check"><input type="checkbox" name="notifyEmail" ${formUser.notifications?.email ? "checked" : ""}> Receber novos leads</label></div>
          <div class="field"><label>Notificar por WhatsApp</label><label class="checkline settings-check"><input type="checkbox" name="notifyWhatsapp" ${formUser.notifications?.whatsapp ? "checked" : ""}> Receber novos leads</label></div>
          ${canUseMetaHealthAlertsForRole(formUser.role) ? `<div class="field full"><label>Monitoramento Meta</label><label class="checkline settings-check"><input type="checkbox" name="notifyMetaHealthWhatsapp" ${formUser.notifications?.metaHealthWhatsapp ? "checked" : ""}> Receber alerta de queda/anomalia de leads Meta por WhatsApp</label></div>` : ""}
          <div class="field full"><label>Número de WhatsApp</label><input name="whatsappNumber" value="${escapeHtml(formUser.notifications?.whatsappNumber || "")}" placeholder="Ex.: 5521999999999"><small>Use DDD. Se não informar o código do país, o sistema considera Brasil (+55).</small></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function renderUserAccessLogModal(userId) {
  const selectedUser = state.users.find((user) => user.id === userId);
  if (!selectedUser || !canManageSystemSettings()) return "";
  const actionLabel = {
    LOGIN: "Login",
    VIEW: "Abertura de tela"
  };
  const userKeys = new Set([selectedUser.id, selectedUser.username, selectedUser.name].filter(Boolean).map((value) => String(value).toLowerCase()));
  const rows = (state.accessLog || [])
    .filter((item) => [item.actor, item.actorName, item.userId].some((value) => userKeys.has(String(value || "").toLowerCase())))
    .map((item) => `
      <tr>
        <td>${escapeHtml(dateTimeLabel(item.at))}</td>
        <td>${escapeHtml(actionLabel[item.action] || item.action)}</td>
        <td>${escapeHtml(item.details?.view || "")}</td>
        <td>${escapeHtml(item.details?.path || "")}</td>
        <td>${escapeHtml(item.ip || "")}</td>
      </tr>
    `).join("");
  return `
    <div class="modal-backdrop" data-user-modal-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="userAccessLogTitle">
        <div class="panel-head">
          <div>
            <h2 id="userAccessLogTitle">Log de acesso</h2>
            <p class="modal-subtitle">${escapeHtml(selectedUser.name)} · ${escapeHtml(selectedUser.username)}</p>
          </div>
          <button type="button" class="icon" data-cancel-settings title="Fechar">×</button>
        </div>
        <div class="table-wrap">
          <table class="access-table"><thead><tr><th>Data e hora</th><th>Ação</th><th>Tela</th><th>Rota</th><th>IP</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">Nenhum acesso registrado para este usuário.</td></tr>'}</tbody></table>
        </div>
      </section>
    </div>
  `;
}

function renderMetaFormModal(formValue = {}, isEditing = false) {
  const formatMapping = (mapping = {}) => Object.entries(mapping || {})
    .map(([from, to]) => `${from} = ${to}`)
    .join("\n");
  const formatAdLinks = (links = []) => (Array.isArray(links) ? links : [])
    .map((item) => `${item.id || ""} = ${item.url || ""}`)
    .join("\n");
  return `
    <div class="modal-backdrop" data-meta-form-modal-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="metaFormModalTitle">
        <div class="panel-head">
          <h2 id="metaFormModalTitle">${isEditing ? "Editar Form Meta" : "Adicionar Form"}</h2>
          <button type="button" class="icon" data-cancel-settings title="Fechar">×</button>
        </div>
        <form id="metaFormMonitorForm" class="form-grid">
          <div class="field"><label>ID do formulário</label><input name="id" value="${escapeHtml(formValue.id || "")}" required autofocus placeholder="Ex.: 4475904736028264"></div>
          <div class="field"><label>Nome interno</label><input name="name" value="${escapeHtml(formValue.name || "")}" placeholder="Ex.: Golf Club - Julho"></div>
          <div class="field"><label>Empreendimento</label><select name="project" required><option value="">Selecione</option>${projectOptions(formValue.project || "")}</select><small>Usado para preencher automaticamente a obra desejada quando o lead entrar.</small></div>
          <div class="field"><label>URL padrão do anúncio</label><input name="adUrl" type="url" value="${escapeHtml(formValue.adUrl || "")}" placeholder="https://..."><small>Será usada quando o ID do anúncio não tiver uma URL específica cadastrada.</small></div>
          <div class="field full"><label>URLs por anúncio</label><textarea name="adLinks" placeholder="123456789 = https://www.instagram.com/p/...">${escapeHtml(formatAdLinks(formValue.adLinks))}</textarea><small>Uma linha por anúncio, no formato ID do anúncio = URL.</small></div>
          <div class="field full"><label>Perguntas amigáveis</label><textarea name="questionLabels" placeholder="quanto_você_pretende_investir? = Quanto pretende investir?">${escapeHtml(formatMapping(formValue.questionLabels))}</textarea></div>
          <div class="field full"><label>Respostas amigáveis</label><textarea name="answerLabels" placeholder="até_r$_600_mil_ = Até R$ 600 mil">${escapeHtml(formatMapping(formValue.answerLabels))}</textarea></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">${isEditing ? "Salvar form" : "Adicionar form"}</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function parseKeyValueLines(text) {
  return String(text || "").split(/\r?\n/).reduce((acc, line) => {
    const clean = line.trim();
    if (!clean) return acc;
    const separator = clean.includes("=>") ? "=>" : clean.includes("=") ? "=" : null;
    if (!separator) return acc;
    const [key, ...valueParts] = clean.split(separator);
    const from = key.trim();
    const to = valueParts.join(separator).trim();
    if (from && to) acc[from] = to;
    return acc;
  }, {});
}

function parseAdLinks(text) {
  const mapping = parseKeyValueLines(text);
  return Object.entries(mapping).map(([id, url]) => ({ id, url }));
}

function makeConfigId(prefix, value) {
  const base = String(value || prefix || "item")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${prefix}-${base || Date.now()}-${String(Date.now()).slice(-5)}`;
}

function defaultMetaConversionEvents() {
  return [
    { id: "lead_received", name: "Lead recebido", eventName: "Lead", description: "Lead entrou no Pipeline vindo do Meta.", active: true },
    { id: "lead_contacted", name: "Lead contatado", eventName: "Contact", description: "Primeiro contato comercial real.", active: true },
    { id: "qualified_lead", name: "Lead qualificado", eventName: "QualifiedLead", description: "Lead com qualidade comercial validada.", active: true },
    { id: "visit_scheduled", name: "Visita agendada", eventName: "Schedule", description: "Visita ou atendimento presencial/remoto agendado.", active: true },
    { id: "visit_done", name: "Visita realizada", eventName: "VisitDone", description: "Visita realizada.", active: true },
    { id: "proposal_sent", name: "Proposta enviada", eventName: "SubmitApplication", description: "Proposta ou simulação enviada.", active: true },
    { id: "contract_issued", name: "Contrato emitido", eventName: "ContractIssued", description: "Contrato emitido pelo SAM/ERP.", active: true },
    { id: "purchase", name: "Contrato assinado / venda", eventName: "Purchase", description: "Venda concluída com contrato assinado.", active: true }
  ];
}

function normalizeMetaConversions(integrations = {}) {
  const current = integrations.metaConversions || {};
  const currentEvents = Array.isArray(current.events) ? current.events : [];
  const currentIds = new Set(currentEvents.map((event) => event.id));
  const seeded = defaultMetaConversionEvents().filter((event) => !currentIds.has(event.id));
  return {
    enabled: Boolean(current.enabled),
    apiUrl: current.apiUrl || "https://graph.facebook.com/v25.0/{DATASET_ID}/events",
    datasetId: current.datasetId || "",
    tokenLabel: current.tokenLabel || "META_CAPI_ACCESS_TOKEN",
    testEventCode: current.testEventCode || "",
    events: [...currentEvents, ...seeded].map((event) => ({
      id: event.id || makeConfigId("meta-event", event.name || event.eventName || "evento"),
      name: event.name || event.eventName || "Evento",
      eventName: event.eventName || "",
      description: event.description || "",
      active: event.active !== false
    })),
    statusMappings: current.statusMappings || {},
    tagMappings: current.tagMappings || {}
  };
}

function metaConversionEventOptions(events = [], selected = "") {
  return [
    '<option value="">Não enviar</option>',
    ...events
      .filter((event) => event.active !== false)
      .map((event) => `<option value="${escapeHtml(event.id)}" ${event.id === selected ? "selected" : ""}>${escapeHtml(event.name)} · ${escapeHtml(event.eventName)}</option>`)
  ].join("");
}

function metaConversionEventLabel(events = [], eventId = "") {
  const event = (events || []).find((item) => item.id === eventId);
  return event ? `${event.name} · ${event.eventName}` : "-";
}

function renderMetaConversionEventModal(eventValue = {}, isEditing = false) {
  return `
    <div class="modal-backdrop" data-meta-conversion-modal-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="metaConversionModalTitle">
        <div class="panel-head">
          <h2 id="metaConversionModalTitle">${isEditing ? "Editar evento Meta" : "Novo evento Meta"}</h2>
          <button type="button" class="icon" data-cancel-settings title="Fechar">×</button>
        </div>
        <form id="metaConversionEventForm" class="form-grid">
          <div class="field"><label>Nome interno</label><input name="name" value="${escapeHtml(eventValue.name || "")}" required autofocus placeholder="Ex.: Lead qualificado"></div>
          <div class="field"><label>Evento na Meta</label><input name="eventName" value="${escapeHtml(eventValue.eventName || "")}" required placeholder="Ex.: QualifiedLead"></div>
          <div class="field full"><label>Descrição</label><textarea name="description" placeholder="Quando esse evento deve ser enviado">${escapeHtml(eventValue.description || "")}</textarea></div>
          <div class="field"><label>Status</label><select name="active"><option value="true" ${eventValue.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${eventValue.active === false ? "selected" : ""}>Inativo</option></select></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">${isEditing ? "Salvar evento" : "Adicionar evento"}</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function renderMetaConversionSettings(metaConversions) {
  const events = metaConversions.events || [];
  const editingId = state.settingsEditing?.startsWith("meta-conversion-event:")
    ? state.settingsEditing.replace("meta-conversion-event:", "")
    : "";
  const editingEvent = events.find((event) => event.id === editingId);
  const isCreatingEvent = state.settingsEditing === "new-meta-conversion-event";
  const isEventModalOpen = isCreatingEvent || Boolean(editingEvent);
  const eventRows = events.map((event) => `
    <tr>
      <td>${escapeHtml(event.name)}</td>
      <td>${escapeHtml(event.eventName)}</td>
      <td><span class="chip ${event.active === false ? "" : "ok"}">${event.active === false ? "Inativo" : "Ativo"}</span></td>
      <td>${escapeHtml(event.description || "")}</td>
      <td>
        ${renderSettingsActionMenu(`meta-conversion-${event.id}`, [
          `<button type="button" data-edit-meta-conversion-event="${escapeHtml(event.id)}">Editar</button>`,
          `<button type="button" data-toggle-meta-conversion-event="${escapeHtml(event.id)}">${event.active === false ? "Ativar" : "Inativar"}</button>`,
          `<button type="button" class="danger-menu-item" data-delete-meta-conversion-event="${escapeHtml(event.id)}">Excluir</button>`
        ])}
      </td>
    </tr>
  `).join("");
  return `
    <section class="integration-help">
      <div class="panel-head">
        <div>
          <h2>Qualidade de Leads / Meta CAPI</h2>
          <p class="muted">Configuração para retroalimentar o Meta com sinais de qualidade, status, etiquetas e vendas.</p>
        </div>
      </div>
      <form id="metaConversionConfigForm" class="form-grid compact-form">
        <div class="field"><label>Integração</label><select name="enabled"><option value="false" ${!metaConversions.enabled ? "selected" : ""}>Inativa</option><option value="true" ${metaConversions.enabled ? "selected" : ""}>Ativa</option></select></div>
        <div class="field"><label>Dataset / Pixel ID</label><input name="datasetId" value="${escapeHtml(metaConversions.datasetId || "")}" placeholder="Ex.: 1234567890"></div>
        <div class="field full"><label>URL de envio</label><input name="apiUrl" value="${escapeHtml(metaConversions.apiUrl || "")}" placeholder="https://graph.facebook.com/v25.0/{DATASET_ID}/events"><small>Use {DATASET_ID} para o sistema substituir pelo ID cadastrado.</small></div>
        <div class="field"><label>Token</label><input name="tokenLabel" value="${escapeHtml(metaConversions.tokenLabel || "")}" placeholder="META_CAPI_ACCESS_TOKEN"><small>Nome da variável segura configurada na Vercel.</small></div>
        <div class="field"><label>Código de teste</label><input name="testEventCode" value="${escapeHtml(metaConversions.testEventCode || "")}" placeholder="TEST12345"></div>
        <div class="field full"><button class="primary" type="submit">Salvar configuração Meta CAPI</button></div>
      </form>
    </section>
    <section class="integration-help">
      <div class="panel-head">
        <h2>Eventos Meta</h2>
        <button class="primary" type="button" data-new-meta-conversion-event>Novo evento</button>
      </div>
      <p class="muted">Cadastre aqui os códigos técnicos da Meta. Depois associe esses eventos diretamente em Status do pipeline e Etiquetas.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Nome interno</th><th>Evento Meta</th><th>Status</th><th>Descrição</th><th>Ações</th></tr></thead><tbody>${eventRows || '<tr><td colspan="5" class="empty">Nenhum evento cadastrado.</td></tr>'}</tbody></table>
      </div>
    </section>
    ${isEventModalOpen ? renderMetaConversionEventModal(editingEvent || {}, Boolean(editingEvent)) : ""}
  `;
}

function renderMetaDiagnostics() {
  if (!state.metaDiagnostics) {
    return '<div class="empty">Execute o diagnóstico para verificar token, Página, webhook e forms monitorados.</div>';
  }
  const statusLabel = {
    ok: "OK",
    warning: "Atenção",
    error: "Erro"
  };
  const checkRows = (state.metaDiagnostics.checks || []).map((check) => `
    <tr>
      <td><span class="diagnostic-pill ${escapeHtml(check.status)}">${escapeHtml(statusLabel[check.status] || check.status)}</span></td>
      <td>${escapeHtml(check.name)}</td>
      <td>${escapeHtml(check.detail || "")}</td>
    </tr>
  `).join("");
  const formRows = (state.metaDiagnostics.forms || []).map((form) => `
    <tr>
      <td><span class="diagnostic-pill ${escapeHtml(form.status)}">${escapeHtml(statusLabel[form.status] || form.status)}</span></td>
      <td>${escapeHtml(form.name || "Sem nome")}</td>
      <td>${escapeHtml(form.id || "")}</td>
      <td>${escapeHtml(form.detail || "")}</td>
    </tr>
  `).join("");
  return `
    <div class="diagnostic-grid">
      <div class="table-wrap">
        <table><thead><tr><th>Status</th><th>Item</th><th>Detalhe</th></tr></thead><tbody>${checkRows || '<tr><td colspan="3" class="empty">Nenhum diagnóstico retornado.</td></tr>'}</tbody></table>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Status</th><th>Form</th><th>ID</th><th>Detalhe</th></tr></thead><tbody>${formRows || '<tr><td colspan="4" class="empty">Nenhum form monitorado.</td></tr>'}</tbody></table>
      </div>
    </div>
  `;
}

function renderIntegrationSettings() {
  const integrations = state.integrations || {};
  const metaConversions = normalizeMetaConversions(integrations);
  const metaForms = integrations.metaForms?.forms || [];
  const editIndex = state.settingsEditing?.startsWith("meta-form:") ? Number(state.settingsEditing.replace("meta-form:", "")) : null;
  const isCreatingForm = state.settingsEditing === "new-meta-form";
  const isFormModalOpen = isCreatingForm || editIndex != null;
  const formValue = editIndex != null ? metaForms[editIndex] || {} : {};
  const visibleForms = metaForms
    .map((form, index) => ({ ...form, index }))
    .filter((form) => state.metaFormsTab === "archived" ? form.archived : !form.archived);
  const formRows = visibleForms.map((form) => `
    <tr>
      <td>${escapeHtml(form.name || "Sem nome")}</td>
      <td>${escapeHtml(form.id)}</td>
      <td>${escapeHtml(form.project || "Sem empreendimento")}</td>
      <td>
        ${renderSettingsActionMenu(`meta-form-${form.index}`, [
          !form.archived
            ? `<button type="button" data-sync-meta-form="${form.index}">Sincronizar este form</button>`
            : "",
          `<button type="button" data-edit-meta-form="${form.index}">Editar</button>`,
          form.archived
            ? `<button type="button" data-restore-meta-form="${form.index}">Restaurar</button>`
            : `<button type="button" data-archive-meta-form="${form.index}">Arquivar</button>`
        ].filter(Boolean))}
      </td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <h2>Integrações Meta</h2>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <section class="integration-help">
        <div class="panel-head">
          <h2>Formulários monitorados</h2>
          <div class="row-actions">
            <button class="primary" data-new-meta-form>Adicionar Form</button>
            <button class="primary" data-sync-meta-recent>Sincronizar Meta</button>
          </div>
        </div>
        <div class="tabs compact-tabs">
          <button class="${state.metaFormsTab === "active" ? "active" : ""}" data-meta-forms-tab="active">Ativos</button>
          <button class="${state.metaFormsTab === "archived" ? "active" : ""}" data-meta-forms-tab="archived">Arquivados</button>
        </div>
        <div class="table-wrap">
          <table class="mapping-table"><thead><tr><th>Nome</th><th>ID do formulário</th><th>Empreendimento</th><th>Ações</th></tr></thead><tbody>${formRows || `<tr><td colspan="4" class="empty">Nenhum formulário ${state.metaFormsTab === "archived" ? "arquivado" : "ativo"}.</td></tr>`}</tbody></table>
        </div>
      </section>
      <section class="integration-help">
        <div class="panel-head">
          <h2>Diagnóstico Meta</h2>
          <button data-diagnose-meta>Diagnosticar Meta</button>
        </div>
        ${renderMetaDiagnostics()}
      </section>
      <section class="integration-help">
        <div class="panel-head">
          <div>
            <h2>Teste de e-mail</h2>
            <p class="muted">Envia uma mensagem para renat.cg@gmail.com usando RESEND_API_KEY_TESTE e EMAIL_FROM_TESTE, sem alterar o envio em produção.</p>
          </div>
          <button type="button" data-test-email>Enviar teste</button>
        </div>
      </section>
      <section class="integration-help">
        <h2>Assinar webhook da Página</h2>
        <p class="muted">Use quando o app Mauad Pipeline não aparecer no teste de leads de uma Página. Informe o ID da Página, não o ID do formulário.</p>
        <form id="metaPageSubscribeForm" class="form-grid compact-form">
          <div class="field"><label>ID da Página Meta</label><input name="pageId" required placeholder="Ex.: 1729847061689789"></div>
          <div class="field"><label>&nbsp;</label><button class="primary" type="submit">Assinar leadgen</button></div>
        </form>
      </section>
      <section class="integration-help">
        <h2>Importar lead Meta por ID</h2>
        <form id="metaLeadImportForm" class="form-grid compact-form">
          <div class="field"><label>Leadgen ID</label><input name="leadgenId" required placeholder="Cole o leadgen_id do teste"></div>
          <div class="field"><label>&nbsp;</label><button class="primary" type="submit">Importar lead</button></div>
        </form>
      </section>
      ${renderMetaConversionSettings(metaConversions)}
    </section>
    ${isFormModalOpen ? renderMetaFormModal(formValue, editIndex != null) : ""}
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  const saveMetaConversions = async (nextMetaConversions, notice) => {
    const next = JSON.parse(JSON.stringify(state.integrations || {}));
    next.metaConversions = nextMetaConversions;
    state.settingsNotice = notice;
    await saveIntegrations(next);
  };
  document.querySelector("[data-new-meta-form]")?.addEventListener("click", () => {
    state.settingsEditing = "new-meta-form";
    renderSettings();
  });
  document.querySelector("[data-new-meta-conversion-event]")?.addEventListener("click", () => {
    state.settingsEditing = "new-meta-conversion-event";
    renderSettings();
  });
  document.querySelectorAll("[data-meta-forms-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.metaFormsTab = button.dataset.metaFormsTab;
      state.settingsEditing = null;
      renderSettings();
    });
  });
  document.querySelector("[data-meta-form-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    state.settingsEditing = null;
    renderSettings();
  });
  document.querySelector("[data-meta-conversion-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    state.settingsEditing = null;
    renderSettings();
  });
  document.querySelector("#metaConversionConfigForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextMetaConversions = normalizeMetaConversions({
      metaConversions: {
        ...metaConversions,
        enabled: form.get("enabled") === "true",
        apiUrl: String(form.get("apiUrl") || "").trim(),
        datasetId: String(form.get("datasetId") || "").trim(),
        tokenLabel: String(form.get("tokenLabel") || "").trim() || "META_CAPI_ACCESS_TOKEN",
        testEventCode: String(form.get("testEventCode") || "").trim()
      }
    });
    await saveMetaConversions(nextMetaConversions, "Configuração Meta CAPI salva.");
  });
  document.querySelector("#metaConversionEventForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const eventName = String(form.get("eventName") || "").trim();
    if (!name || !eventName) return;
    const editingId = state.settingsEditing?.startsWith("meta-conversion-event:")
      ? state.settingsEditing.replace("meta-conversion-event:", "")
      : "";
    const nextEvent = {
      id: editingId || makeConfigId("meta-event", name || eventName),
      name,
      eventName,
      description: String(form.get("description") || "").trim(),
      active: form.get("active") !== "false"
    };
    const nextMetaConversions = {
      ...metaConversions,
      events: editingId
        ? metaConversions.events.map((item) => item.id === editingId ? nextEvent : item)
        : [...metaConversions.events.filter((item) => item.id !== nextEvent.id), nextEvent]
    };
    state.settingsEditing = null;
    await saveMetaConversions(nextMetaConversions, editingId ? "Evento Meta atualizado." : "Evento Meta cadastrado.");
  });
  document.querySelectorAll("[data-edit-meta-conversion-event]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `meta-conversion-event:${button.dataset.editMetaConversionEvent}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-toggle-meta-conversion-event]").forEach((button) => {
    button.addEventListener("click", async () => {
      const eventId = button.dataset.toggleMetaConversionEvent;
      const nextMetaConversions = {
        ...metaConversions,
        events: metaConversions.events.map((item) => item.id === eventId ? { ...item, active: item.active === false } : item)
      };
      await saveMetaConversions(nextMetaConversions, "Status do evento Meta atualizado.");
    });
  });
  document.querySelectorAll("[data-delete-meta-conversion-event]").forEach((button) => {
    button.addEventListener("click", async () => {
      const eventId = button.dataset.deleteMetaConversionEvent;
      if (!confirm("Excluir este evento Meta?")) return;
      const nextMetaConversions = {
        ...metaConversions,
        events: metaConversions.events.filter((item) => item.id !== eventId),
        statusMappings: Object.fromEntries(Object.entries(metaConversions.statusMappings || {}).filter(([, mapping]) => mapping.eventId !== eventId)),
        tagMappings: Object.fromEntries(Object.entries(metaConversions.tagMappings || {}).filter(([, mapping]) => mapping.eventId !== eventId))
      };
      await saveMetaConversions(nextMetaConversions, "Evento Meta excluído.");
    });
  });
  document.querySelector("#metaFormMonitorForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "").trim();
    if (!id) return;
    const next = JSON.parse(JSON.stringify(state.integrations || {}));
    const metaForms = next.metaForms || { enabled: true, forms: [], mappings: [] };
    metaForms.enabled = true;
    const nextForm = {
      id,
      name: String(form.get("name") || "").trim(),
      project: String(form.get("project") || "").trim(),
      adUrl: String(form.get("adUrl") || "").trim(),
      adLinks: parseAdLinks(form.get("adLinks")),
      questionLabels: parseKeyValueLines(form.get("questionLabels")),
      answerLabels: parseKeyValueLines(form.get("answerLabels")),
      archived: Boolean(formValue.archived)
    };
    if (!nextForm.project) return;
    metaForms.forms = editIndex != null
      ? (metaForms.forms || []).map((item, index) => index === editIndex ? nextForm : item)
      : [...(metaForms.forms || []).filter((item) => item.id !== id), nextForm];
    next.metaForms = metaForms;
    state.settingsEditing = null;
    state.settingsNotice = editIndex != null ? "Formulário Meta atualizado." : "Formulário Meta adicionado ao monitoramento.";
    await saveIntegrations(next);
  });
  document.querySelectorAll("[data-edit-meta-form]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `meta-form:${button.dataset.editMetaForm}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-archive-meta-form], [data-restore-meta-form]").forEach((button) => {
    button.addEventListener("click", async () => {
      const next = JSON.parse(JSON.stringify(state.integrations || {}));
      const metaForms = next.metaForms || { enabled: true, forms: [], mappings: [] };
      const index = Number(button.dataset.archiveMetaForm ?? button.dataset.restoreMetaForm);
      metaForms.forms = (metaForms.forms || []).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, archived: Boolean(button.dataset.archiveMetaForm) };
      });
      next.metaForms = metaForms;
      state.settingsNotice = button.dataset.archiveMetaForm
        ? "Formulário Meta arquivado."
        : "Formulário Meta restaurado.";
      await saveIntegrations(next);
    });
  });
  document.querySelector("[data-diagnose-meta]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Diagnosticando...");
      const data = await api("/api/integrations/meta/diagnostics", { method: "POST" });
      state.metaDiagnostics = data.diagnostics;
      state.settingsNotice = "Diagnóstico Meta atualizado.";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("[data-test-email]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Enviando...");
      const data = await api("/api/integrations/email/test", { method: "POST", body: JSON.stringify({}) });
      state.settingsNotice = `E-mail de teste enviado para ${data.to}.`;
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("[data-sync-meta-recent]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Sincronizando...");
      const data = await api("/api/integrations/meta/sync-recent", {
        method: "POST",
        body: JSON.stringify({ days: 7 })
      });
      state.settingsNotice = `Sincronização concluída: ${data.created} novo(s), ${data.duplicates} já existente(s), ${data.errors.length} erro(s).`;
      if (data.created) invalidateLeads();
      await loadState();
      state.settingsTab = "integrations";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelectorAll("[data-sync-meta-form]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const index = Number(event.currentTarget.dataset.syncMetaForm);
      const formConfig = (state.integrations?.metaForms?.forms || [])[index];
      if (!formConfig?.id) return;
      const buttonLabel = event.currentTarget.textContent;
      try {
        setButtonBusy(event.currentTarget, true, "Sincronizando...");
        const data = await api("/api/integrations/meta/sync-recent", {
          method: "POST",
          body: JSON.stringify({ days: 7, formId: formConfig.id })
        });
        state.settingsNotice = `${formConfig.name || formConfig.id}: ${data.created} novo(s), ${data.duplicates} já existente(s), ${data.errors.length} erro(s).`;
        if (data.created) invalidateLeads();
        await loadState();
        state.settingsTab = "integrations";
        renderSettings();
      } catch (error) {
        setButtonBusy(event.currentTarget, false, buttonLabel);
        alert(error.message);
      }
    });
  });
  document.querySelector("#metaPageSubscribeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pageId = String(form.get("pageId") || "").trim();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    if (!pageId) return;
    try {
      setButtonBusy(submitButton, true, "Assinando...");
      const data = await api("/api/integrations/meta/subscribe-page", {
        method: "POST",
        body: JSON.stringify({ pageId })
      });
      const app = (data.subscribed?.data || []).find((item) => String(item.subscribed_fields || "").includes("leadgen"));
      state.settingsNotice = app
        ? `Página ${pageId} assinada para leadgen. Valide no Ads Leads Test.`
        : `Página ${pageId} assinada, mas confirme a lista de apps no diagnóstico.`;
      await loadState();
      state.settingsTab = "integrations";
      renderSettings();
    } catch (error) {
      setButtonBusy(submitButton, false);
      alert(error.message);
    }
  });
  document.querySelector("#metaLeadImportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    try {
      setButtonBusy(submitButton, true, "Importando...");
      const data = await api("/api/integrations/meta/import-lead", {
        method: "POST",
        body: JSON.stringify({ leadgenId: form.get("leadgenId") })
      });
      state.settingsNotice = data.status === "duplicate"
        ? "Lead Meta já existia no CRM."
        : "Lead Meta importado com sucesso.";
      if (data.status !== "duplicate") invalidateLeads();
      await loadState();
      state.settingsTab = "integrations";
      renderSettings();
    } catch (error) {
      setButtonBusy(submitButton, false);
      alert(error.message);
    }
  });
}

function fupActionLabel(action) {
  const labels = {
    VIEW_LEAD_DETAIL: "Entrou no detalhe",
    COMMENT_LEAD: "Comentou",
    ASSIGN_BROKER: "Atribuiu corretor",
    UNASSIGN_BROKER: "Desatribuiu corretor",
    CHANGE_STATUS: "Mudou status",
    CHANGE_ORDER_MANUAL: "Mudou ordem",
    FAVORITE_LEAD: "Favoritou",
    UNFAVORITE_LEAD: "Desfavoritou",
    DELETE_LEAD: "Excluiu lead",
    RESCUE_BASE_LEAD: "Resgatou da base",
    SAM_STATUS_LINKED: "Vinculou evento SAM"
  };
  return labels[action] || action || "";
}

function fupDetailsLabel(item) {
  const details = item.details || {};
  if (item.action === "CHANGE_STATUS") return `${details.from || ""} -> ${details.to || ""}`;
  if (item.action === "ASSIGN_BROKER") return `${details.from || "Sem corretor"} -> ${details.to || ""}`;
  if (item.action === "UNASSIGN_BROKER") return `${details.from || ""} -> Sem corretor`;
  if (item.action === "CHANGE_ORDER_MANUAL") return details.status ? `Status: ${details.status}` : "Ordem manual no Kanban";
  if (item.action === "RESCUE_BASE_LEAD") return details.source ? `Origem: ${details.source}` : "";
  if (item.action === "COMMENT_LEAD") return details.fromUser ? "Mensagem do usuário" : "Comentário interno";
  if (item.action === "DELETE_LEAD") return details.source ? `Origem: ${details.source}` : "";
  return JSON.stringify(details || {});
}

function samEventStatusLabel(status) {
  const labels = {
    matched: "Lead encontrado",
    unit_mismatch: "Unidade divergente",
    not_found: "Lead não encontrado",
    linked: "Vinculado",
    ignored: "Ignorado",
    opportunity_required: "Oportunidade pendente"
  };
  return labels[status] || status || "Pendente";
}

function samEventDetailLabel(event) {
  if (event.status === "matched") return `Pronto para vincular: ${event.nextStatus || "-"}`;
  if (event.status === "unit_mismatch" || event.status === "opportunity_required") {
    const opportunities = event.opportunityOptions || [];
    const units = (event.leadUnits || []).filter(Boolean);
    if (opportunities.length) {
      return `Unidade recebida: ${event.unit || "-"} · Oportunidades: ${opportunities.map((item) => `${item.unit || "Sem unidade"} (${item.project || "Sem empreendimento"})`).join(", ")}`;
    }
    return `Unidade recebida: ${event.unit || "-"} · Unidade no lead: ${units.join(", ") || "-"}`;
  }
  if (event.status === "not_found") return "Procure manualmente antes de vincular";
  if (event.status === "linked") return `Tratado por ${event.resolvedBy || "-"} em ${event.resolvedAt ? dateTimeLabel(event.resolvedAt) : "-"}`;
  if (event.status === "ignored") return `Ignorado por ${event.resolvedBy || "-"}`;
  return "";
}

function metaCapiStatusLabel(status) {
  const labels = {
    pending: "Pendente",
    sent: "Enviado",
    warning: "Atenção",
    error: "Erro",
    skipped: "Ignorado"
  };
  return labels[status] || status || "Pendente";
}

function metaCapiStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "sent") return "success-chip";
  if (normalized === "warning") return "chip-warning";
  if (normalized === "error") return "danger-chip";
  return "";
}

function metaCapiSourceLabel(event) {
  const sourceType = String(event.sourceType || "").toLowerCase();
  if (sourceType === "status") return `Status: ${event.sourceKey || "-"}`;
  if (sourceType === "tag") return `Etiqueta: ${event.sourceKey || "-"}`;
  if (sourceType === "manual_test") return "Teste manual";
  return event.sourceKey || event.sourceType || "-";
}

function metaCapiResponseSummary(event) {
  const response = event?.response || {};
  const received = response.events_received ?? response.eventsReceived;
  const messages = Array.isArray(response.messages) ? response.messages : [];
  const firstMessage = messages[0]?.message || messages[0]?.title || messages[0]?.code || "";
  if (received !== undefined && received !== null) {
    return `${Number(received || 0).toLocaleString("pt-BR")} recebido(s)${firstMessage ? ` · ${firstMessage}` : ""}`;
  }
  if (response.fbtrace_id) return `fbtrace_id: ${response.fbtrace_id}`;
  if (response.raw) return String(response.raw).slice(0, 120);
  return event?.sentAt ? "Sem retorno detalhado" : "-";
}

function renderMetaCapiResponseModal() {
  const event = (state.metaConversionEvents || []).find((item) => item.id === state.metaCapiResponseEventId);
  if (!event) return "";
  const payloadJson = JSON.stringify(event.payload || {}, null, 2);
  const responseJson = JSON.stringify(event.response || {}, null, 2);
  return `
    <div class="modal-backdrop" data-close-meta-capi-response>
      <section class="modal-card wide-modal" role="dialog" aria-modal="true" aria-labelledby="metaCapiResponseTitle">
        <div class="modal-head">
          <div>
            <h2 id="metaCapiResponseTitle">Resposta Meta CAPI</h2>
            <p class="modal-subtitle">${escapeHtml(event.leadName || event.leadId || "Sem lead")} · ${escapeHtml(event.eventName || "")}</p>
          </div>
          <button type="button" class="ghost-button" data-close-meta-capi-response>Fechar</button>
        </div>
        <div class="capi-response-grid">
          <div class="sub-panel">
            <h3>Resumo</h3>
            <p><strong>Status:</strong> ${escapeHtml(metaCapiStatusLabel(event.status))}</p>
            <p><strong>Retorno:</strong> ${escapeHtml(metaCapiResponseSummary(event))}</p>
            ${event.lastError ? `<p><strong>Mensagem:</strong> ${escapeHtml(event.lastError)}</p>` : ""}
            <p><strong>Tentativas:</strong> ${Number(event.attempts || 0).toLocaleString("pt-BR")}</p>
            <p><strong>Enviado em:</strong> ${escapeHtml(event.sentAt ? dateTimeLabel(event.sentAt) : "-")}</p>
          </div>
          <div class="sub-panel">
            <h3>Payload enviado</h3>
            <pre class="json-preview">${escapeHtml(payloadJson)}</pre>
          </div>
          <div class="sub-panel full">
            <h3>Resposta da Meta</h3>
            <pre class="json-preview">${escapeHtml(responseJson)}</pre>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderMetaCapiDiagnostics() {
  const diagnostics = state.metaCapiDiagnostics;
  if (!diagnostics) return "";
  const checks = (diagnostics.checks || []).map((check) => `
    <tr>
      <td>${escapeHtml(check.label)}</td>
      <td><span class="chip ${check.ok ? "success-chip" : ""}">${check.ok ? "OK" : "Atenção"}</span></td>
      <td>${escapeHtml(check.detail || "")}</td>
    </tr>
  `).join("");
  const queue = diagnostics.queue || {};
  const warningTotal = Number(queue.warning || 0);
  return `
    <div class="sub-panel">
      <h3>Diagnóstico Meta CAPI</h3>
      <p class="muted">Atualizado em ${escapeHtml(dateTimeLabel(diagnostics.checkedAt))} · Pendente ${Number(queue.pending || 0).toLocaleString("pt-BR")} · Atenção ${warningTotal.toLocaleString("pt-BR")} · Erro ${Number(queue.error || 0).toLocaleString("pt-BR")} · Enviado ${Number(queue.sent || 0).toLocaleString("pt-BR")}</p>
      <div class="table-wrap compact-table">
        <table><thead><tr><th>Item</th><th>Status</th><th>Detalhe</th></tr></thead><tbody>${checks || '<tr><td colspan="3" class="empty">Sem diagnóstico.</td></tr>'}</tbody></table>
      </div>
    </div>
  `;
}

async function refreshMetaCapiEvents() {
  const result = await api("/api/integrations/meta/capi-events");
  state.metaConversionEvents = result.events || [];
  return state.metaConversionEvents;
}

function renderLogSettings() {
  const term = state.settingsLogSearch.trim().toLowerCase();
  const matches = (value) => !term || String(value || "").toLowerCase().includes(term);
  const integrationRows = (state.integrationLog || [])
    .filter((item) => {
      if (String(item.provider || "").toUpperCase() === "META") return false;
      const details = JSON.stringify(item.details || {});
      return [item.provider, item.action, details, item.details?.leadgenId, item.details?.error].some(matches);
    })
    .map((item) => `
      <tr>
        <td>${escapeHtml(dateTimeLabel(item.at))}</td>
        <td>${escapeHtml(item.provider || "")}</td>
        <td>${escapeHtml(item.action || "")}</td>
        <td>${escapeHtml(item.details?.leadgenId || item.details?.formId || "")}</td>
        <td>${escapeHtml(item.details?.project || item.details?.error || "")}</td>
      </tr>
    `).join("");
  const metaRows = (state.integrationLog || [])
    .filter((item) => {
      if (String(item.provider || "").toUpperCase() !== "META") return false;
      const details = JSON.stringify(item.details || {});
      return [item.action, details, item.details?.leadgenId, item.details?.formId, item.details?.pageId, item.details?.error, item.details?.project].some(matches);
    })
    .map((item) => `
      <tr>
        <td>${escapeHtml(dateTimeLabel(item.at))}</td>
        <td>${escapeHtml(item.action || "")}</td>
        <td>${escapeHtml(item.details?.leadgenId || item.details?.formId || item.details?.pageId || "")}</td>
        <td>${escapeHtml(item.details?.project || item.details?.status || "")}</td>
        <td>${escapeHtml(item.details?.error || item.details?.message || "")}</td>
      </tr>
    `).join("");
  const metaCapiRows = (state.metaConversionEvents || [])
    .filter((event) => {
      const details = JSON.stringify(event.payload || {});
      const response = JSON.stringify(event.response || {});
      return [event.leadName, event.leadId, event.eventName, event.eventId, event.sourceType, event.sourceKey, event.status, event.lastError, metaCapiSourceLabel(event), metaCapiResponseSummary(event), details, response].some(matches);
    })
    .map((event) => {
      const canResend = ["pending", "error", "skipped", "warning"].includes(String(event.status || ""));
      return `
        <tr>
          <td>${escapeHtml(dateTimeLabel(event.createdAt))}</td>
          <td>${event.leadId ? `<button type="button" class="link-button" data-open-meta-capi-lead="${escapeHtml(event.leadId)}">${escapeHtml(event.leadName || event.leadId)}</button>` : '<span class="muted-cell">Sem lead</span>'}</td>
          <td>${escapeHtml(event.eventName || "")}</td>
          <td>${escapeHtml(metaCapiSourceLabel(event))}</td>
          <td><span class="chip ${metaCapiStatusClass(event.status)}">${escapeHtml(metaCapiStatusLabel(event.status))}</span></td>
          <td>${Number(event.attempts || 0).toLocaleString("pt-BR")}</td>
          <td>${escapeHtml(event.sentAt ? dateTimeLabel(event.sentAt) : "")}</td>
          <td>${escapeHtml(metaCapiResponseSummary(event))}</td>
          <td>${escapeHtml(event.lastError || "")}</td>
          <td>
            <div class="row-actions compact-row-actions">
              <button type="button" data-meta-capi-response="${escapeHtml(event.id)}">Ver resposta</button>
              ${canResend ? `<button type="button" data-meta-capi-resend="${escapeHtml(event.id)}">Reenviar</button>` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  const auditRows = (state.auditLog || [])
    .filter((item) => {
      const details = JSON.stringify(item.details || {});
      return [item.actor, item.action, details].some(matches);
    })
    .map((item) => `
      <tr>
        <td>${escapeHtml(dateTimeLabel(item.at))}</td>
        <td>${escapeHtml(item.actor || "")}</td>
        <td>${escapeHtml(item.action || "")}</td>
        <td>${escapeHtml(JSON.stringify(item.details || {}))}</td>
      </tr>
    `).join("");
  const fupRows = (state.fupLeadLog || [])
    .filter((item) => {
      const details = JSON.stringify(item.details || {});
      return [item.actor, item.actorName, item.leadName, item.leadId, item.action, fupActionLabel(item.action), fupDetailsLabel(item), details].some(matches);
    })
    .map((item) => `
      <tr>
        <td>${escapeHtml(dateTimeLabel(item.at))}</td>
        <td>${escapeHtml(item.leadName || "")}</td>
        <td>${escapeHtml(item.actorName || item.actor || "")}</td>
        <td>${escapeHtml(fupActionLabel(item.action))}</td>
        <td>${escapeHtml(fupDetailsLabel(item))}</td>
      </tr>
    `).join("");
  const samRows = (state.samEvents || [])
    .filter((event) => {
      return [event.eventId, event.eventType, event.email, event.phone, event.unit, event.nextStatus, event.status, event.leadName, samEventStatusLabel(event.status), samEventDetailLabel(event)].some(matches);
    })
    .map((event) => {
      const canAct = !["linked", "ignored"].includes(event.status);
      const canReopen = ["linked", "ignored"].includes(event.status);
      const leadCell = event.leadId
        ? `<button type="button" class="link-button" data-open-sam-lead="${escapeHtml(event.leadId)}">${escapeHtml(event.leadName || event.leadId)}</button>`
        : '<span class="muted-cell">Sem lead sugerido</span>';
      const opportunityActions = (event.opportunityOptions || [])
        .filter((opportunity) => opportunity.id)
        .map((opportunity) => `<button type="button" data-sam-link="${escapeHtml(event.id)}" data-sam-opportunity="${escapeHtml(opportunity.id)}">Vincular oportunidade: ${escapeHtml(opportunity.unit || "Sem unidade")} · ${escapeHtml(opportunity.project || "Sem empreendimento")}${opportunity.assignedName ? ` · ${escapeHtml(opportunity.assignedName)}` : ""}</button>`);
      const hasOpportunityOptions = opportunityActions.length > 0;
      const actions = canAct ? [
        ...opportunityActions,
        event.leadId && !hasOpportunityOptions ? `<button type="button" data-sam-link-lead="${escapeHtml(event.id)}">Vincular ao lead</button>` : "",
        event.leadId ? `<button type="button" data-sam-create-opportunity="${escapeHtml(event.id)}">Gerar nova oportunidade</button>` : "",
        `<button type="button" data-sam-find="${escapeHtml(event.id)}">${hasOpportunityOptions ? "Encontrar lead/oportunidade manualmente" : "Encontrar lead manualmente"}</button>`,
        `<button type="button" class="danger-menu-item" data-sam-ignore="${escapeHtml(event.id)}">Ignorar</button>`
      ] : canReopen ? [
        `<button type="button" data-sam-reprocess="${escapeHtml(event.id)}">Reprocessar com lógica atual</button>`,
        `<button type="button" data-sam-reopen="${escapeHtml(event.id)}">Reabrir para conferência</button>`
      ] : [];
      return `
        <tr>
          <td>${escapeHtml(dateTimeLabel(event.createdAt))}</td>
          <td>${escapeHtml(event.eventType || "")}</td>
          <td>${escapeHtml(event.unit || "")}</td>
          <td>${escapeHtml(event.email || "")}</td>
          <td>${escapeHtml(event.phone || "")}</td>
          <td><span class="chip">${escapeHtml(samEventStatusLabel(event.status))}</span></td>
          <td>${leadCell}</td>
          <td>${escapeHtml(samEventDetailLabel(event))}</td>
          <td>${actions.length ? renderSettingsActionMenu(`sam-${event.id}`, actions) : '<span class="muted-cell">Tratado</span>'}</td>
        </tr>
      `;
    }).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Logs</h2>
        <div class="row-actions">
          ${state.settingsLogTab === "fup" ? '<button class="danger-button" type="button" data-clear-fup-log>Limpar FUP Lead</button>' : ""}
          ${state.settingsLogTab === "metaCapi" ? '<button type="button" data-meta-capi-diagnose>Diagnosticar CAPI</button>' : ""}
          <input id="settingsLogSearch" class="settings-search" placeholder="Pesquisar nos logs" value="${escapeHtml(state.settingsLogSearch)}">
        </div>
      </div>
      <div class="tabs compact-tabs log-tabs">
        <button class="${state.settingsLogTab === "audit" ? "active" : ""}" data-log-tab="audit">Auditoria</button>
        <button class="${state.settingsLogTab === "fup" ? "active" : ""}" data-log-tab="fup">FUP Lead</button>
        <button class="${state.settingsLogTab === "sam" ? "active" : ""}" data-log-tab="sam">SAM</button>
        <button class="${state.settingsLogTab === "meta" ? "active" : ""}" data-log-tab="meta">Meta</button>
        <button class="${state.settingsLogTab === "metaCapi" ? "active" : ""}" data-log-tab="metaCapi">Fila Meta CAPI</button>
        <button class="${state.settingsLogTab === "integration" ? "active" : ""}" data-log-tab="integration">Eventos de integração</button>
      </div>
      ${state.settingsLogTab === "metaCapi" ? renderMetaCapiDiagnostics() : ""}
      <div class="table-wrap log-table-wrap">
        ${state.settingsLogTab === "integration"
          ? `<table><thead><tr><th>Data</th><th>Origem</th><th>Evento</th><th>ID</th><th>Detalhe</th></tr></thead><tbody>${integrationRows || '<tr><td colspan="5" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>`
          : state.settingsLogTab === "meta"
            ? `<table><thead><tr><th>Data</th><th>Evento</th><th>ID</th><th>Status/Projeto</th><th>Detalhe</th></tr></thead><tbody>${metaRows || '<tr><td colspan="5" class="empty">Nenhum log Meta encontrado.</td></tr>'}</tbody></table>`
          : state.settingsLogTab === "metaCapi"
            ? `<table><thead><tr><th>Criado em</th><th>Lead</th><th>Evento</th><th>Origem</th><th>Status</th><th>Tentativas</th><th>Enviado em</th><th>Retorno Meta</th><th>Erro</th><th>Ações</th></tr></thead><tbody>${metaCapiRows || '<tr><td colspan="10" class="empty">Nenhum evento CAPI encontrado.</td></tr>'}</tbody></table>`
          : state.settingsLogTab === "sam"
            ? `<table><thead><tr><th>Recebido em</th><th>Evento</th><th>Unidade</th><th>E-mail</th><th>Telefone</th><th>Status</th><th>Lead</th><th>Detalhe</th><th>Ações</th></tr></thead><tbody>${samRows || '<tr><td colspan="9" class="empty">Nenhum evento SAM encontrado.</td></tr>'}</tbody></table>`
          : state.settingsLogTab === "fup"
            ? `<table><thead><tr><th>Data</th><th>Lead</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${fupRows || '<tr><td colspan="5" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>`
          : `<table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>`}
      </div>
      ${renderMetaCapiResponseModal()}
    </section>
  `);
  document.querySelectorAll("[data-log-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.settingsLogTab = button.dataset.logTab;
      renderLogSettings();
      if (state.settingsLogTab === "metaCapi") {
        try {
          await refreshMetaCapiEvents();
          renderLogSettings();
        } catch (error) {
          alert(error.message);
        }
      }
    });
  });
  document.querySelector("#settingsLogSearch")?.addEventListener("input", (event) => {
    state.settingsLogSearch = event.target.value;
    renderLogSettings();
    requestAnimationFrame(() => {
      const input = document.querySelector("#settingsLogSearch");
      input?.focus();
      input?.setSelectionRange(state.settingsLogSearch.length, state.settingsLogSearch.length);
    });
  });
  document.querySelector("[data-clear-fup-log]")?.addEventListener("click", async (event) => {
    if (!confirm("Limpar todos os eventos de FUP Lead?")) return;
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Limpando...");
      await api("/api/logs/fup-lead", { method: "DELETE" });
      state.fupLeadLog = [];
      renderLogSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("[data-meta-capi-diagnose]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Diagnosticando...");
      const result = await api("/api/integrations/meta/capi-diagnostics", { method: "POST", body: JSON.stringify({}) });
      state.metaCapiDiagnostics = result.diagnostics || null;
      state.metaConversionEvents = result.events || state.metaConversionEvents || [];
      renderLogSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  bindSettingsActionMenus();
  document.querySelectorAll("[data-open-meta-capi-lead]").forEach((button) => {
    button.addEventListener("click", () => routeTo("lead", button.dataset.openMetaCapiLead));
  });
  document.querySelectorAll("[data-meta-capi-response]").forEach((button) => {
    button.addEventListener("click", () => {
      state.metaCapiResponseEventId = button.dataset.metaCapiResponse || "";
      renderLogSettings();
    });
  });
  document.querySelectorAll("[data-close-meta-capi-response]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.hasAttribute("data-close-meta-capi-response")) return;
      state.metaCapiResponseEventId = "";
      renderLogSettings();
    });
  });
  document.querySelectorAll("[data-meta-capi-resend]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setButtonBusy(button, true, "Reenviando...");
        const result = await api(`/api/integrations/meta/capi-events/${encodeURIComponent(button.dataset.metaCapiResend)}/resend`, { method: "POST", body: JSON.stringify({}) });
        if (result.event) {
          state.metaConversionEvents = (state.metaConversionEvents || []).map((event) => event.id === result.event.id ? result.event : event);
        } else {
          await loadState();
        }
        renderLogSettings();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-open-sam-lead]").forEach((button) => {
    button.addEventListener("click", () => routeTo("lead", button.dataset.openSamLead));
  });
  document.querySelectorAll("[data-sam-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Vincular este evento à oportunidade selecionada e aplicar a atualização de status?")) return;
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samLink)}/link`, {
          method: "POST",
          body: JSON.stringify({ opportunityId: button.dataset.samOpportunity || "" })
        });
        invalidateLeads();
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-sam-link-lead]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Vincular este evento diretamente ao lead encontrado e aplicar a atualização do SAM?")) return;
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samLinkLead)}/link`, {
          method: "POST",
          body: JSON.stringify({ linkLeadDirect: true })
        });
        invalidateLeads();
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-sam-create-opportunity]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Gerar uma nova oportunidade para a unidade recebida pelo SAM e aplicar a atualização?")) return;
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samCreateOpportunity)}/link`, {
          method: "POST",
          body: JSON.stringify({ createOpportunity: true })
        });
        invalidateLeads();
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-sam-reopen]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Reabrir este evento SAM para conferência? Isso não desfaz alterações já aplicadas no lead.")) return;
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samReopen)}/reopen`, { method: "POST", body: JSON.stringify({}) });
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-sam-reprocess]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Reprocessar este evento SAM com a regra atual de oportunidades?")) return;
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samReprocess)}/reprocess`, { method: "POST", body: JSON.stringify({}) });
        invalidateLeads();
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-sam-find]").forEach((button) => {
    button.addEventListener("click", async () => {
      const search = prompt("Digite ID, nome, e-mail ou telefone do lead para vincular:");
      if (!search) return;
      const createOpportunity = confirm("Se a unidade do SAM não existir nas oportunidades desse lead, deseja gerar uma nova oportunidade?");
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samFind)}/link`, { method: "POST", body: JSON.stringify({ search, createOpportunity }) });
        invalidateLeads();
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-sam-ignore]").forEach((button) => {
    button.addEventListener("click", async () => {
      const reason = prompt("Motivo para ignorar este evento:", "");
      if (reason === null) return;
      try {
        await api(`/api/sam-events/${encodeURIComponent(button.dataset.samIgnore)}/ignore`, { method: "POST", body: JSON.stringify({ reason }) });
        await loadState();
        renderLogSettings();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function canEditKnowledge() {
  return Boolean(state.canManageKnowledge);
}

function canCreateKnowledge() {
  return Boolean(state.canCreateKnowledge);
}

function knowledgeCategories() {
  const categories = new Set([...(state.knowledgeCategories || []), ...state.knowledgeArticles.map((article) => article.category).filter(Boolean)]);
  return ["TODOS", ...[...categories].sort((a, b) => a.localeCompare(b, "pt-BR"))];
}

function filteredKnowledgeArticles() {
  const term = state.knowledgeSearch.trim().toLowerCase();
  return state.knowledgeArticles
    .filter((article) => state.knowledgeCategory === "TODOS" || article.category === state.knowledgeCategory)
    .filter((article) => {
      if (!term) return true;
      return [article.title, article.summary, article.content, article.category, ...(article.keywords || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    })
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function knowledgeArticleForm(article = null) {
  const isNew = !article;
  const formArticle = article || {
    title: "",
    category: state.knowledgeCategories[0] || "Primeiros passos",
    summary: "",
    content: "",
    keywords: [],
    audienceRoles: state.roles,
    published: true
  };
  const categoryOptions = (state.knowledgeCategories || []).map((category) => `
    <option value="${escapeHtml(category)}" ${formArticle.category === category ? "selected" : ""}>${escapeHtml(category)}</option>
  `).join("");
  const roleOptions = state.roles.map((role) => `
    <label class="inline-check">
      <input type="checkbox" name="audienceRoles" value="${escapeHtml(role)}" ${(formArticle.audienceRoles || []).includes(role) ? "checked" : ""}>
      <span>${escapeHtml(role)}</span>
    </label>
  `).join("");
  return `
    <form id="knowledgeForm" class="editor knowledge-editor">
      <div class="form-grid">
        <div class="field"><label>Título</label><input name="title" value="${escapeHtml(formArticle.title)}" required></div>
        <div class="field"><label>Categoria</label><select name="category">${categoryOptions}</select></div>
        <div class="field full"><label>Resumo curto</label><input name="summary" value="${escapeHtml(formArticle.summary)}" placeholder="Uma frase para orientar o usuário"></div>
        <div class="field full"><label>Conteúdo do tutorial</label><textarea name="content" rows="8" required>${escapeHtml(formArticle.content)}</textarea></div>
        <div class="field full"><label>Palavras-chave</label><input name="keywords" value="${escapeHtml((formArticle.keywords || []).join(", "))}" placeholder="Ex.: meta, webhook, formulário"></div>
        <div class="field full"><label>Perfis que podem ver</label><div class="knowledge-role-grid">${roleOptions}</div></div>
        <div class="field full"><label class="inline-check"><input type="checkbox" name="published" ${formArticle.published !== false ? "checked" : ""}><span>Publicado</span></label></div>
      </div>
      <div class="row-actions">
        <button class="primary" type="submit">${isNew ? "Cadastrar tutorial" : "Salvar tutorial"}</button>
        <button type="button" data-cancel-knowledge>Cancelar</button>
      </div>
    </form>
  `;
}

function renderKnowledgeContent() {
  const categories = knowledgeCategories();
  if (!categories.includes(state.knowledgeCategory)) state.knowledgeCategory = "TODOS";
  const articles = filteredKnowledgeArticles();
  const editArticle = state.knowledgeEditing && state.knowledgeEditing !== "new"
    ? state.knowledgeArticles.find((article) => article.id === state.knowledgeEditing)
    : null;
  const openArticle = state.knowledgeOpenArticle
    ? state.knowledgeArticles.find((article) => article.id === state.knowledgeOpenArticle)
    : null;
  const categoryButtons = categories.map((category) => `
    <button class="${state.knowledgeCategory === category ? "active" : ""}" data-knowledge-category="${escapeHtml(category)}">
      ${escapeHtml(category === "TODOS" ? "Todos" : category)}
    </button>
  `).join("");
  const cards = articles.map((article) => `
    <article class="knowledge-card ${article.published === false ? "is-draft" : ""}">
      <div class="knowledge-card-head">
        <div>
          <span>${escapeHtml(article.category)}</span>
          <h3>${escapeHtml(article.title)}</h3>
        </div>
        ${canEditKnowledge() ? renderSettingsActionMenu(`knowledge-${article.id}`, [
          `<button type="button" data-edit-knowledge="${escapeHtml(article.id)}">Editar</button>`,
          `<button type="button" data-toggle-knowledge="${escapeHtml(article.id)}">${article.published === false ? "Publicar" : "Despublicar"}</button>`,
          `<button type="button" class="danger-menu-item" data-delete-knowledge="${escapeHtml(article.id)}">Excluir</button>`
        ]) : ""}
      </div>
      ${article.published === false ? '<span class="chip chip-warning">Rascunho</span>' : ""}
      <p>${escapeHtml(article.summary || "Tutorial sem resumo.")}</p>
      <details>
        <summary>Abrir tutorial</summary>
        <div class="knowledge-article-body">${escapeHtml(article.content).replaceAll("\n", "<br>")}</div>
      </details>
      ${(article.keywords || []).length ? `<div class="knowledge-keywords">${article.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}</div>` : ""}
      <small>Atualizado em ${escapeHtml(article.updatedAt ? dateTimeLabel(article.updatedAt) : "-")}${article.updatedBy ? ` por ${escapeHtml(article.updatedBy)}` : ""}</small>
    </article>
  `).join("");
  const messages = (state.knowledgeAiMessages || []).map((message) => {
    const sources = (!message.typing ? (message.sources || []) : []).map((source) => `
      <button type="button" data-open-knowledge-article="${escapeHtml(source.id)}">
        ${escapeHtml(source.title)}
      </button>
    `).join("");
    return `
      <div class="knowledge-chat-message ${message.role === "user" ? "is-user" : "is-assistant"}">
        <div class="knowledge-chat-bubble">${renderChatText(message.text)}${message.typing ? '<span class="knowledge-typing-cursor"></span>' : ""}</div>
        ${sources ? `<div class="knowledge-chat-sources"><span>Tutoriais relacionados</span>${sources}</div>` : ""}
      </div>
    `;
  }).join("");
  const emptyChat = !messages && !state.knowledgeAiLoading
    ? '<div class="knowledge-chat-empty">Pergunte algo sobre Kanban, Planilha, Bases, Meta, notificações, logs ou configurações.</div>'
    : "";
  const thinkingMessage = state.knowledgeAiLoading
    ? '<div class="knowledge-chat-message is-assistant"><div class="knowledge-chat-bubble">Pensando na resposta...</div></div>'
    : "";
  const articleModal = openArticle ? `
    <div class="modal-backdrop" data-knowledge-article-backdrop>
      <section class="modal-card knowledge-article-modal" role="dialog" aria-modal="true" aria-labelledby="knowledgeArticleTitle">
        <div class="panel-head">
          <div>
            <span class="muted-text">${escapeHtml(openArticle.category)}</span>
            <h2 id="knowledgeArticleTitle">${escapeHtml(openArticle.title)}</h2>
          </div>
          <button type="button" data-close-knowledge-article>Fechar</button>
        </div>
        <p class="muted-text">${escapeHtml(openArticle.summary || "")}</p>
        <div class="knowledge-article-body">${escapeHtml(openArticle.content || "").replaceAll("\n", "<br>")}</div>
      </section>
    </div>
  ` : "";
  return `
    <section class="panel knowledge-panel">
      <div class="knowledge-layout">
        <div class="knowledge-main">
          <div class="knowledge-tools">
            <input id="knowledgeSearch" placeholder="Pesquisar tutorial, tema ou palavra-chave" value="${escapeHtml(state.knowledgeSearch)}">
          </div>
          <div class="tabs compact-tabs knowledge-categories">${categoryButtons}</div>
          ${state.knowledgeEditing === "new" ? knowledgeArticleForm() : ""}
          ${editArticle ? knowledgeArticleForm(editArticle) : ""}
          <div class="knowledge-grid">${cards || '<div class="empty">Nenhum tutorial encontrado.</div>'}</div>
        </div>
        <aside class="knowledge-chat" aria-label="Assistente de IA">
          <div class="knowledge-chat-head">
            <div>
              <h3>Assistente IA</h3>
            </div>
          </div>
          <div class="knowledge-chat-scroll" id="knowledgeChatScroll">
            ${emptyChat}
            ${messages}
            ${thinkingMessage}
          </div>
          <form id="knowledgeAiForm" class="knowledge-chat-form">
            <textarea id="knowledgeAiQuestion" rows="3" maxlength="900" placeholder="Pergunte sobre o Pipeline">${escapeHtml(state.knowledgeAiQuestion)}</textarea>
            <button class="primary" type="submit" ${state.knowledgeAiLoading ? "disabled" : ""}>Enviar</button>
          </form>
        </aside>
      </div>
      ${articleModal}
    </section>
  `;
}

function scrollKnowledgeChatToBottom() {
  requestAnimationFrame(() => {
    const scroll = document.querySelector("#knowledgeChatScroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  });
}

function startKnowledgeTyping(messageId, fullText, sources, rerender) {
  if (knowledgeTypingTimer) clearTimeout(knowledgeTypingTimer);
  const text = String(fullText || "");
  const step = () => {
    const message = (state.knowledgeAiMessages || []).find((item) => item.id === messageId);
    if (!message) return;
    message.fullText = text;
    message.pendingSources = sources || [];
    const currentLength = String(message.text || "").length;
    const nextLength = Math.min(text.length, currentLength + 4);
    message.text = text.slice(0, nextLength);
    message.typing = nextLength < text.length;
    if (!message.typing) message.sources = sources || [];
    rerender();
    scrollKnowledgeChatToBottom();
    if (message.typing) {
      knowledgeTypingTimer = setTimeout(step, 18);
    } else {
      knowledgeTypingTimer = null;
    }
  };
  step();
}

function bindKnowledgeControls(renderFn) {
  const rerender = renderFn || renderKnowledgeView;
  const aiQuestion = document.querySelector("#knowledgeAiQuestion");
  aiQuestion?.addEventListener("input", (event) => {
    state.knowledgeAiQuestion = event.target.value;
  });
  aiQuestion?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.altKey) return;
    event.preventDefault();
    document.querySelector("#knowledgeAiForm")?.requestSubmit();
  });
  document.querySelector("#knowledgeAiForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (knowledgeTypingTimer) {
      clearTimeout(knowledgeTypingTimer);
      knowledgeTypingTimer = null;
      (state.knowledgeAiMessages || []).forEach((message) => {
        if (!message.typing) return;
        message.text = message.fullText || message.text;
        message.sources = message.pendingSources || message.sources || [];
        message.typing = false;
      });
    }
    const question = state.knowledgeAiQuestion.trim();
    if (!question) {
      state.knowledgeAiMessages = [
        ...(state.knowledgeAiMessages || []),
        { id: `msg-${Date.now()}`, role: "assistant", text: "Digite uma pergunta sobre o uso do sistema.", sources: [] }
      ];
      rerender();
      return;
    }
    state.knowledgeAiMessages = [
      ...(state.knowledgeAiMessages || []),
      { id: `msg-${Date.now()}-user`, role: "user", text: question, sources: [] }
    ];
    state.knowledgeAiQuestion = "";
    state.knowledgeAiLoading = true;
    rerender();
    try {
      const data = await api("/api/knowledge/ask", {
        method: "POST",
        body: JSON.stringify({ question, sessionId: state.knowledgeActiveChatId })
      });
      if (data.session) {
        state.knowledgeActiveChatId = data.session.id;
        const current = (state.knowledgeChatSessions || []).filter((session) => session.id !== data.session.id);
        state.knowledgeChatSessions = [data.session, ...current].slice(0, 20);
      }
      if (data.knowledgeChatSessions) state.knowledgeChatSessions = data.knowledgeChatSessions;
      if (data.knowledgeArticles) state.knowledgeArticles = data.knowledgeArticles;
      const messageId = `msg-${Date.now()}-assistant`;
      const answerText = data.tutorialDraft
        ? `${data.answer || "Não consegui montar uma resposta agora."}\n\n**Tutorial sugerido:** criei um rascunho chamado "${data.tutorialDraft.title}" para revisão na Central de ajuda.`
        : data.answer || "Não consegui montar uma resposta agora.";
      state.knowledgeAiMessages = [
        ...(state.knowledgeAiMessages || []),
        { id: messageId, role: "assistant", text: "", sources: [], typing: true }
      ];
      state.knowledgeAiLoading = false;
      rerender();
      startKnowledgeTyping(messageId, answerText, data.sources || [], rerender);
    } catch (error) {
      state.knowledgeAiMessages = [
        ...(state.knowledgeAiMessages || []),
        { id: `msg-${Date.now()}-error`, role: "assistant", text: error.message, sources: [] }
      ];
      state.knowledgeAiLoading = false;
      rerender();
      scrollKnowledgeChatToBottom();
    }
  });
  const search = document.querySelector("#knowledgeSearch");
  search?.addEventListener("input", (event) => {
    const cursorStart = event.target.selectionStart;
    const cursorEnd = event.target.selectionEnd;
    state.knowledgeSearch = event.target.value;
    rerender();
    requestAnimationFrame(() => {
      const nextSearch = document.querySelector("#knowledgeSearch");
      if (!nextSearch) return;
      nextSearch.focus();
      nextSearch.setSelectionRange(cursorStart, cursorEnd);
    });
  });
  document.querySelectorAll("[data-knowledge-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.knowledgeCategory = button.dataset.knowledgeCategory;
      rerender();
    });
  });
  document.querySelector("[data-new-knowledge]")?.addEventListener("click", () => {
    state.knowledgeEditing = "new";
    rerender();
  });
  document.querySelectorAll("[data-edit-knowledge]").forEach((button) => {
    button.addEventListener("click", () => {
      state.knowledgeEditing = button.dataset.editKnowledge;
      rerender();
    });
  });
  document.querySelector("[data-cancel-knowledge]")?.addEventListener("click", () => {
    state.knowledgeEditing = null;
    rerender();
  });
  document.querySelectorAll("[data-open-knowledge-article]").forEach((button) => {
    button.addEventListener("click", () => {
      state.knowledgeOpenArticle = button.dataset.openKnowledgeArticle;
      rerender();
    });
  });
  document.querySelector("[data-close-knowledge-article]")?.addEventListener("click", () => {
    state.knowledgeOpenArticle = null;
    rerender();
  });
  document.querySelector("[data-knowledge-article-backdrop]")?.addEventListener("click", (event) => {
    if (!event.target.classList.contains("modal-backdrop")) return;
    state.knowledgeOpenArticle = null;
    rerender();
  });
  document.querySelectorAll("[data-toggle-knowledge]").forEach((button) => {
    button.addEventListener("click", async () => {
      const article = state.knowledgeArticles.find((item) => item.id === button.dataset.toggleKnowledge);
      if (!article) return;
      const data = await api(`/api/knowledge/${article.id}`, { method: "PATCH", body: JSON.stringify({ published: article.published === false }) });
      state.knowledgeArticles = data.knowledgeArticles;
      rerender();
    });
  });
  document.querySelectorAll("[data-delete-knowledge]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este tutorial?")) return;
      const data = await api(`/api/knowledge/${button.dataset.deleteKnowledge}`, { method: "DELETE" });
      state.knowledgeArticles = data.knowledgeArticles;
      rerender();
    });
  });
  document.querySelector("#knowledgeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get("title"),
      category: form.get("category"),
      summary: form.get("summary"),
      content: form.get("content"),
      keywords: form.get("keywords"),
      audienceRoles: form.getAll("audienceRoles"),
      published: Boolean(form.get("published"))
    };
    const editingId = state.knowledgeEditing && state.knowledgeEditing !== "new" ? state.knowledgeEditing : "";
    const data = editingId
      ? await api(`/api/knowledge/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/api/knowledge", { method: "POST", body: JSON.stringify(payload) });
    state.knowledgeArticles = data.knowledgeArticles;
    state.knowledgeEditing = null;
    rerender();
  });
  bindSettingsActionMenus();
}

function renderKnowledgeView() {
  renderShell(`
    ${renderViewHead("Ajuda", "Tutoriais, busca e assistente de IA para usar o sistema", {
      actions: canCreateKnowledge() ? '<button class="primary" data-new-knowledge>Novo tutorial</button>' : "",
      className: "knowledge-view-head"
    })}
    ${renderKnowledgeContent()}
  `);
  bindKnowledgeControls(renderKnowledgeView);
}

function renderKnowledgeSettings() {
  const webhookUrl = `${window.location.origin}/api/webhooks/meta`;
  settingsLayout(`
    ${renderKnowledgeContent()}
    <section class="panel">
      <section class="integration-help compact-help">
        <h2>Webhook Meta</h2>
        <div class="meta">
          <span>URL de callback: <strong>${escapeHtml(webhookUrl)}</strong></span>
          <span>Variáveis na Vercel: <strong>META_VERIFY_TOKEN</strong>, <strong>META_APP_ID</strong>, <strong>META_APP_SECRET</strong>, <strong>META_PAGE_ACCESS_TOKEN</strong>, <strong>CRON_SECRET</strong></span>
          <span>Evento assinado no Meta: <strong>Page / leadgen</strong></span>
        </div>
      </section>
    </section>
  `);
  bindKnowledgeControls(renderSettings);
}

function renderAccessSettings() {
  const actionLabel = {
    LOGIN: "Login",
    VIEW: "Abertura de tela"
  };
  const rows = (state.accessLog || []).map((item) => `
    <tr>
      <td>${escapeHtml(dateTimeLabel(item.at))}</td>
      <td>${escapeHtml(item.actorName || item.actor)}</td>
      <td>${escapeHtml(item.actor || "")}</td>
      <td>${escapeHtml(item.role || "")}</td>
      <td>${escapeHtml(actionLabel[item.action] || item.action)}</td>
      <td>${escapeHtml(item.details?.view || "")}</td>
      <td>${escapeHtml(item.details?.path || "")}</td>
      <td>${escapeHtml(item.ip || "")}</td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Acessos recentes</h2>
      </div>
      <div class="table-wrap">
        <table class="access-table"><thead><tr><th>Data e hora</th><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Ação</th><th>Tela</th><th>Rota</th><th>IP</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">Nenhum acesso registrado ainda.</td></tr>'}</tbody></table>
      </div>
    </section>
  `);
}

async function saveIntegrations(integrations) {
  await api("/api/integrations", { method: "PUT", body: JSON.stringify({ integrations }) });
  state.settingsEditing = null;
  await loadState();
  renderSettings();
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value.includes("/") ? value.replace(/(\d{2})\/(\d{2})\/(\d{2,4}).*/, "$2/$1/$3") : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function dateTimeLabel(value) {
  if (!value) return "";
  const raw = String(value);
  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  const date = brDate
    ? new Date(Number(brDate[3].length === 2 ? `20${brDate[3]}` : brDate[3]), Number(brDate[2]) - 1, Number(brDate[1]), Number(brDate[4] || 0), Number(brDate[5] || 0), Number(brDate[6] || 0))
    : isoDate
      ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), Number(isoDate[4] || 0), Number(isoDate[5] || 0), Number(isoDate[6] || 0))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function levSettlementClass(status) {
  const normalized = levStatusKey(status);
  if (normalized.includes("paga")) return "status-active";
  if (normalized.includes("nf emitida")) return "chip chip-info";
  if (normalized.includes("confirmad") || normalized.includes("aguardando autorizacao")) return "chip chip-info";
  if (normalized.includes("nao contabilizada")) return "chip chip-warning";
  return "chip";
}

function levFinanceSearchText(item) {
  return [
    item.unit,
    item.client,
    item.signedAt,
    item.contractValue,
    item.commissionValue,
    item.realEstate,
    item.status,
    item.invoiceNumber,
    item.invoiceIssuedAt,
    item.paidAt,
    item.note,
    item.receivedAt
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
}

function renderLevFinanceSettings() {
  const settings = state.levFinance?.settings || {};
  const emailTemplate = normalizeLevEmailTemplateSettings(settings);
  const paymentSchedule = Array.isArray(settings.paymentSchedule) ? settings.paymentSchedule : [];
  const variableButtons = LEV_EMAIL_TEMPLATE_VARIABLES.map((variable) => `
    <button type="button" class="template-variable-button" data-lev-email-variable="${escapeHtml(variable.key)}">${escapeHtml(variable.label)}</button>
  `).join("");
  const sampleTable = `
    <section class="email-preview-project">
      <h3>Golf Club Resort</h3>
      <p><strong>Total da NF de comissões:</strong> ${money(2250)}</p>
      <div class="table-wrap"><table class="email-preview-table"><thead><tr><th>Unidade</th><th>Cliente</th><th>Assinatura</th><th>Valor contrato</th><th>Comissão Lev</th><th>Imobiliária</th></tr></thead><tbody><tr><td>GCR060107</td><td>Cliente exemplo</td><td>28/07/26 17:03:51</td><td>${money(450000)}</td><td>${money(2250)}</td><td>Imobiliária exemplo</td></tr></tbody></table></div>
    </section>
  `;
  const samplePreview = renderLevEmailTemplateHtml(settings, {
    data_pagamento: "21/08/2026",
    data_envio: new Date().toLocaleDateString("pt-BR"),
    total_comissoes: money(2250),
    quantidade_vendas: "1",
    empreendimentos: "Golf Club Resort",
    tabela_vendas: sampleTable,
    lista_vendas: sampleTable
  });
  const scheduleRows = paymentSchedule.map((item) => `
    <tr data-lev-schedule-row>
      <td><input type="date" data-lev-schedule-start value="${escapeHtml(item.start || "")}" required></td>
      <td><input type="date" data-lev-schedule-end value="${escapeHtml(item.end || "")}" required></td>
      <td><input type="date" data-lev-schedule-payment value="${escapeHtml(item.paymentDate || "")}" required></td>
      <td><button type="button" class="icon-button" data-remove-lev-schedule title="Remover faixa">×</button></td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Financeiro Lev</h2>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <form id="levFinanceSettingsForm" class="form-grid editor">
        <div class="field"><label>% comissão Lev</label><input name="commissionPercent" type="number" min="0" step="0.01" value="${escapeHtml(settings.commissionPercent || "")}" required></div>
        <div class="field"><label>E-mails Para</label><input name="provisionTo" value="${escapeHtml(settings.provisionTo || "")}" placeholder="financeiro@empresa.com.br" required></div>
        <div class="field full"><label>E-mails Cc</label><input name="provisionCc" value="${escapeHtml(settings.provisionCc || "")}" placeholder="email1@empresa.com.br, email2@empresa.com.br"></div>
        <div class="field full">
          <div class="panel-head compact-head">
            <div>
              <h3>Mensagem do e-mail Financeiro Lev</h3>
              <small>Edite o texto visualmente e insira variáveis no ponto do cursor.</small>
            </div>
          </div>
          <div class="email-template-builder">
            <section class="email-template-editor-pane">
              <div class="email-template-toolbar" aria-label="Ferramentas de formatação">
                <select id="levEmailFontFamily" title="Fonte">
                  ${["Arial", "Georgia", "Times New Roman", "Verdana", "Tahoma", "Courier New"].map((font) => `<option value="${escapeHtml(font)}" ${font === emailTemplate.fontFamily ? "selected" : ""}>${escapeHtml(font)}</option>`).join("")}
                </select>
                <select id="levEmailFontSize" title="Tamanho">
                  ${["12px", "13px", "14px", "15px", "16px", "18px", "20px"].map((size) => `<option value="${escapeHtml(size)}" ${size === emailTemplate.fontSize ? "selected" : ""}>${escapeHtml(size)}</option>`).join("")}
                </select>
                <select id="levEmailLineHeight" title="Espaçamento entre linhas">
                  ${["1", "1.15", "1.3", "1.5", "1.8", "2"].map((lineHeight) => `<option value="${escapeHtml(lineHeight)}" ${lineHeight === emailTemplate.lineHeight ? "selected" : ""}>${escapeHtml(lineHeight)}</option>`).join("")}
                </select>
                <input id="levEmailFontColor" type="color" value="${escapeHtml(emailTemplate.color)}" title="Cor da fonte">
                <span class="toolbar-separator" aria-hidden="true"></span>
                <button type="button" data-lev-email-command="bold" title="Negrito"><strong>B</strong></button>
                <button type="button" data-lev-email-command="italic" title="Itálico"><em>I</em></button>
                <button type="button" data-lev-email-command="underline" title="Sublinhado"><u>U</u></button>
                <span class="toolbar-separator" aria-hidden="true"></span>
                <button type="button" data-lev-email-command="insertUnorderedList" title="Marcadores">•</button>
                <button type="button" data-lev-email-list="decimal" title="Lista numerada">1.</button>
                <button type="button" data-lev-email-list="lower-alpha" title="Lista com letras">a.</button>
                <span class="toolbar-separator" aria-hidden="true"></span>
                <button type="button" data-lev-email-command="outdent" title="Diminuir recuo">&lt;</button>
                <button type="button" data-lev-email-command="indent" title="Aumentar recuo">&gt;</button>
                <span class="toolbar-separator" aria-hidden="true"></span>
                <button type="button" data-lev-email-command="justifyLeft" title="Alinhar à esquerda">Esq</button>
                <button type="button" data-lev-email-command="justifyCenter" title="Centralizar">C</button>
                <button type="button" data-lev-email-command="justifyRight" title="Alinhar à direita">Dir</button>
                <button type="button" data-lev-email-command="justifyFull" title="Justificar">Just</button>
              </div>
              <div class="template-variable-bar">
                <span>Variáveis</span>
                ${variableButtons}
              </div>
              <div id="levEmailTemplateEditor" class="rich-email-editor" contenteditable="true" style="font-family:${escapeHtml(emailTemplate.fontFamily)};font-size:${escapeHtml(emailTemplate.fontSize)};color:${escapeHtml(emailTemplate.color)};line-height:${escapeHtml(emailTemplate.lineHeight)}">${emailTemplate.html}</div>
            </section>
            <section class="email-template-preview-pane">
              <div class="preview-title">Prévia</div>
              <div id="levEmailTemplatePreview" class="email-preview-body template-preview-body">${samplePreview}</div>
            </section>
          </div>
        </div>
        <div class="field full">
          <div class="panel-head compact-head">
            <div>
              <h3>Calendário de pagamento Mauad</h3>
              <small>Define a data de pagamento usada no e-mail de aprovisionamento.</small>
            </div>
            <button type="button" id="addLevScheduleRow">Adicionar faixa</button>
          </div>
          <div class="table-wrap compact-table">
            <table class="access-table lev-schedule-table">
              <thead><tr><th>Início lançamento</th><th>Fim lançamento</th><th>Pagamento a partir de</th><th>Ação</th></tr></thead>
              <tbody id="levScheduleRows">${scheduleRows || '<tr><td colspan="4" class="empty">Nenhuma faixa cadastrada.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar configurações</button></div></div>
      </form>
    </section>
  `);
  bindSettingsCommon();
  const scheduleBody = document.querySelector("#levScheduleRows");
  const appendScheduleRow = (item = {}) => {
    scheduleBody?.querySelector(".empty")?.closest("tr")?.remove();
    scheduleBody?.insertAdjacentHTML("beforeend", `
      <tr data-lev-schedule-row>
        <td><input type="date" data-lev-schedule-start value="${escapeHtml(item.start || "")}" required></td>
        <td><input type="date" data-lev-schedule-end value="${escapeHtml(item.end || "")}" required></td>
        <td><input type="date" data-lev-schedule-payment value="${escapeHtml(item.paymentDate || "")}" required></td>
        <td><button type="button" class="icon-button" data-remove-lev-schedule title="Remover faixa">×</button></td>
      </tr>
    `);
  };
  document.querySelector("#addLevScheduleRow")?.addEventListener("click", () => appendScheduleRow());
  scheduleBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-lev-schedule]");
    if (!button) return;
    button.closest("[data-lev-schedule-row]")?.remove();
  });
  const templateEditor = document.querySelector("#levEmailTemplateEditor");
  const templatePreview = document.querySelector("#levEmailTemplatePreview");
  const templateFontFamily = document.querySelector("#levEmailFontFamily");
  const templateFontSize = document.querySelector("#levEmailFontSize");
  const templateLineHeight = document.querySelector("#levEmailLineHeight");
  const templateFontColor = document.querySelector("#levEmailFontColor");
  const previewVariables = {
    data_pagamento: "21/08/2026",
    data_envio: new Date().toLocaleDateString("pt-BR"),
    total_comissoes: money(2250),
    quantidade_vendas: "1",
    empreendimentos: "Golf Club Resort",
    tabela_vendas: sampleTable,
    lista_vendas: sampleTable
  };
  const refreshTemplatePreview = () => {
    if (!templateEditor || !templatePreview) return;
    const nextSettings = {
      emailTemplate: {
        html: sanitizeRichHtml(templateEditor.innerHTML),
        fontFamily: templateFontFamily?.value || "Arial",
        fontSize: templateFontSize?.value || "14px",
        color: templateFontColor?.value || "#101828",
        lineHeight: templateLineHeight?.value || "1.5"
      }
    };
    templateEditor.style.fontFamily = nextSettings.emailTemplate.fontFamily;
    templateEditor.style.fontSize = nextSettings.emailTemplate.fontSize;
    templateEditor.style.color = nextSettings.emailTemplate.color;
    templateEditor.style.lineHeight = nextSettings.emailTemplate.lineHeight;
    templatePreview.innerHTML = renderLevEmailTemplateHtml(nextSettings, previewVariables);
  };
  templateEditor?.addEventListener("input", refreshTemplatePreview);
  [templateFontFamily, templateFontSize, templateLineHeight, templateFontColor].forEach((control) => {
    control?.addEventListener("change", refreshTemplatePreview);
    control?.addEventListener("input", refreshTemplatePreview);
  });
  document.querySelectorAll("[data-lev-email-command]").forEach((button) => {
    button.addEventListener("click", () => {
      templateEditor?.focus();
      document.execCommand(button.dataset.levEmailCommand, false, null);
      refreshTemplatePreview();
    });
  });
  document.querySelectorAll("[data-lev-email-list]").forEach((button) => {
    button.addEventListener("click", () => {
      templateEditor?.focus();
      document.execCommand("insertOrderedList", false, null);
      const selection = window.getSelection();
      let node = selection?.anchorNode;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const list = node?.closest?.("ol") || templateEditor?.querySelector("ol:last-of-type");
      if (list) {
        const listStyle = button.dataset.levEmailList || "decimal";
        list.style.listStyleType = listStyle;
        list.setAttribute("type", listStyle === "lower-alpha" ? "a" : "1");
      }
      refreshTemplatePreview();
    });
  });
  document.querySelectorAll("[data-lev-email-variable]").forEach((button) => {
    button.addEventListener("click", () => {
      templateEditor?.focus();
      document.execCommand("insertText", false, `{{${button.dataset.levEmailVariable}}}`);
      refreshTemplatePreview();
    });
  });
  document.querySelector("#levFinanceSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const form = new FormData(event.currentTarget);
    const paymentSchedulePayload = [...document.querySelectorAll("[data-lev-schedule-row]")].map((row) => ({
      start: row.querySelector("[data-lev-schedule-start]")?.value || "",
      end: row.querySelector("[data-lev-schedule-end]")?.value || "",
      paymentDate: row.querySelector("[data-lev-schedule-payment]")?.value || ""
    })).filter((item) => item.start && item.end && item.paymentDate);
    const payload = {
      ...Object.fromEntries(form.entries()),
      emailTemplate: {
        html: sanitizeRichHtml(document.querySelector("#levEmailTemplateEditor")?.innerHTML || DEFAULT_LEV_EMAIL_TEMPLATE_HTML),
        fontFamily: document.querySelector("#levEmailFontFamily")?.value || "Arial",
        fontSize: document.querySelector("#levEmailFontSize")?.value || "14px",
        color: document.querySelector("#levEmailFontColor")?.value || "#101828",
        lineHeight: document.querySelector("#levEmailLineHeight")?.value || "1.5"
      },
      paymentSchedule: paymentSchedulePayload
    };
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api("/api/lev-finance/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      state.levFinance = data.levFinance;
      state.settingsNotice = "Configurações financeiras salvas.";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
}

function renderCommercialSettings() {
  const settings = state.commercialSettings || {};
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Configurações comerciais</h2>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <form id="commercialSettingsForm" class="form-grid editor">
        <div class="field">
          <label>Meta mensal de vendas</label>
          <input name="monthlySalesGoal" type="number" min="0" step="0.01" value="${escapeHtml(settings.monthlySalesGoal || "")}" placeholder="Ex.: 5000000">
        </div>
        <div class="field">
          <label>Timeout por inatividade (minutos)</label>
          <input name="sessionTimeoutMinutes" type="number" min="1" max="240" step="1" value="${escapeHtml(settings.sessionTimeoutMinutes || 15)}" placeholder="Ex.: 15">
        </div>
        <div class="field full">
          <div class="row-actions">
            <button class="primary" type="submit">Salvar configurações</button>
          </div>
        </div>
      </form>
    </section>
  `);
  bindSettingsCommon();
  document.querySelector("#commercialSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const formData = new FormData(event.currentTarget);
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api("/api/commercial-settings", {
        method: "PUT",
        body: JSON.stringify({
          monthlySalesGoal: Number(formData.get("monthlySalesGoal") || 0),
          sessionTimeoutMinutes: Number(formData.get("sessionTimeoutMinutes") || 15)
        })
      });
      state.commercialSettings = data.commercialSettings || {};
      state.settingsNotice = "Configurações comerciais salvas.";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsText(file);
  });
}

function renderBackupSettings() {
  const settings = state.backupSettings || {};
  const lastRun = settings.lastRun || null;
  const validation = lastRun?.validation || {};
  const deliveries = lastRun?.deliveries || {};
  const bytes = Number(validation.bytes || 0);
  const bytesLabel = bytes ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB` : "-";
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Backup diário</h2>
          <p class="muted-copy">Gera, valida e envia uma cópia completa do banco estruturado.</p>
        </div>
        <div class="row-actions">
          <button type="button" id="validateBackupButton">Testar integridade</button>
          <button class="primary" type="button" id="runBackupButton">Gerar backup agora</button>
        </div>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <form id="backupSettingsForm" class="form-grid editor">
        <div class="field full"><label class="checkline settings-check"><input type="checkbox" name="enabled" ${settings.enabled !== false ? "checked" : ""}> Backup diário ativo</label><small>Na Vercel, o agendamento roda uma vez por dia em produção. Para o automático funcionar, a variável <strong>CRON_SECRET</strong> precisa estar configurada na Vercel; ela pode ter o mesmo valor do BACKUP_SECRET.</small></div>
        <div class="field"><label>Enviar por e-mail</label><label class="checkline settings-check"><input type="checkbox" name="emailEnabled" ${settings.emailEnabled ? "checked" : ""}> Ativar envio</label></div>
        <div class="field"><label>Enviar para Google Drive</label><label class="checkline settings-check"><input type="checkbox" name="driveEnabled" ${settings.driveEnabled ? "checked" : ""}> Ativar envio</label></div>
        <div class="field"><label>E-mails Para</label><input name="emailTo" value="${escapeHtml(settings.emailTo || "")}" placeholder="admin@empresa.com, diretoria@empresa.com"></div>
        <div class="field"><label>E-mails Cc</label><input name="emailCc" value="${escapeHtml(settings.emailCc || "")}" placeholder="Opcional"></div>
        <div class="field full"><label>Webhook / URL do Google Drive</label><input name="driveWebhookUrl" value="${escapeHtml(settings.driveWebhookUrl || "")}" placeholder="URL do Apps Script ou endpoint que grava no Drive"><small>O sistema envia o arquivo JSON em base64 para esta URL. Use um Apps Script/endpoint autorizado a gravar no Drive.</small></div>
        <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar política</button><button type="button" id="downloadBackupButton">Baixar backup</button></div></div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Último backup</h2>
      </div>
      ${lastRun ? `
        <div class="backup-status-grid">
          <div><strong>Status</strong><span class="${lastRun.status === "success" ? "status-active" : "chip-warning"}">${lastRun.status === "success" ? "OK" : "Falha"}</span></div>
          <div><strong>Gerado em</strong><span>${escapeHtml(dateTimeLabel(lastRun.at))}</span></div>
          <div><strong>Arquivo</strong><span>${escapeHtml(lastRun.filename || "-")}</span></div>
          <div><strong>Tamanho</strong><span>${escapeHtml(bytesLabel)}</span></div>
          <div><strong>Leads</strong><span>${Number(validation.counts?.leads || 0).toLocaleString("pt-BR")}</span></div>
          <div><strong>Checksum</strong><span class="mono-text">${escapeHtml(String(validation.checksum || "").slice(0, 18))}${validation.checksum ? "..." : ""}</span></div>
        </div>
        <div class="backup-delivery-list">
          <p><strong>E-mail:</strong> ${escapeHtml(deliveries.email?.sent ? "enviado" : deliveries.email?.reason || "não enviado")}</p>
          <p><strong>Google Drive:</strong> ${escapeHtml(deliveries.googleDrive?.sent ? "enviado" : deliveries.googleDrive?.reason || "não enviado")}</p>
          ${(validation.errors || []).length ? `<p class="error"><strong>Erros:</strong> ${escapeHtml(validation.errors.join(" | "))}</p>` : ""}
          ${(validation.warnings || []).length ? `<p class="muted-copy"><strong>Avisos:</strong> ${escapeHtml(validation.warnings.join(" | "))}</p>` : ""}
        </div>
      ` : '<p class="muted-copy">Nenhum backup executado ainda.</p>'}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Importar backup</h2>
      </div>
      <form id="backupImportForm" class="form-grid editor">
        <div class="field full"><label>Arquivo JSON de backup</label><input type="file" name="backup" accept="application/json,.json" required><small>A importação substitui a base atual pelo conteúdo do arquivo selecionado.</small></div>
        <div class="field full"><div class="row-actions"><button class="danger-button" type="submit">Importar backup</button></div></div>
      </form>
    </section>
  `);
  bindSettingsCommon();
  document.querySelector("#backupSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const form = new FormData(event.currentTarget);
    const payload = {
      enabled: form.get("enabled") === "on",
      emailEnabled: form.get("emailEnabled") === "on",
      driveEnabled: form.get("driveEnabled") === "on",
      emailTo: form.get("emailTo"),
      emailCc: form.get("emailCc"),
      driveWebhookUrl: form.get("driveWebhookUrl")
    };
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api("/api/admin/backup-settings", { method: "PATCH", body: JSON.stringify(payload) });
      state.backupSettings = data.backupSettings;
      state.settingsNotice = "Política de backup salva.";
      renderBackupSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("#validateBackupButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Testando...");
      const data = await api("/api/admin/backup/validate");
      const counts = data.validation?.counts || {};
      state.settingsNotice = `Backup íntegro: ${Number(counts.leads || 0).toLocaleString("pt-BR")} lead(s), checksum ${String(data.validation?.checksum || "").slice(0, 12)}...`;
      renderBackupSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("#runBackupButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Gerando...");
      const data = await api("/api/admin/backup/run", { method: "POST", body: JSON.stringify({}) });
      state.backupSettings = data.settings;
      state.settingsNotice = `Backup gerado e validado: ${data.filename}.`;
      renderBackupSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("#downloadBackupButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Gerando...");
      const data = await api("/api/admin/export-db");
      const filename = `pipeline-mauad-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJsonFile(filename, data);
      setButtonBusy(button, false);
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("#backupImportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const file = event.currentTarget.querySelector("input[type='file']")?.files?.[0];
    if (!file) return;
    if (!confirm("Importar este backup vai substituir a base atual do sistema. Deseja continuar?")) return;
    try {
      setButtonBusy(button, true, "Importando...");
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const db = parsed.db || parsed;
      const data = await api("/api/admin/import-db", { method: "POST", body: JSON.stringify({ db }) });
      state.settingsNotice = `Backup importado com sucesso: ${data.leads} lead(s), ${data.users} usuário(s).`;
      await loadState();
      state.settingsTab = "backup";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
}

function structuredDbLabel(key) {
  return {
    users: "Usuários",
    leads: "Leads",
    comments: "Comentários",
    tags: "Etiquetas em leads",
    favorites: "Favoritos",
    statuses: "Status do pipeline",
    projects: "Empreendimentos",
    projectDefinitions: "Empreendimentos",
    unitDefinitions: "Unidades",
    availabilitySettings: "Configurações de disponibilidade",
    baseSources: "Origens de base",
    metaForms: "Forms Meta",
    permissions: "Permissões",
    auditLogs: "Logs de auditoria",
    accessLogs: "Logs de acesso",
    integrationLogs: "Eventos de integração",
    fupLeadLogs: "FUP Lead",
    samEvents: "Eventos SAM",
    levSales: "Vendas Lev",
    levReceipts: "Recebimentos Lev",
    levSettlements: "Acertos Lev",
    knowledgeArticles: "Tutoriais"
  }[key] || key;
}

function structuredDbRunLabel(run) {
  if (!run) return '<span class="muted">Nunca</span>';
  const when = run.finished_at || run.finishedAt || run.started_at || run.startedAt;
  const status = run.status === "success" ? "OK" : run.status === "reset" ? "Reiniciado" : run.status || "running";
  const statusClass = run.status === "success" || run.status === "reset" ? "status-active" : "chip-warning";
  const summary = run.summary || {};
  const remaining = Number(summary.remaining || 0);
  return `
    <span class="chip ${statusClass}">${escapeHtml(status)}</span>
    <small class="structured-run-date">${when ? escapeHtml(dateTimeLabel(when)) : ""}</small>
    ${remaining > 0 ? `<small class="structured-run-date">Faltam ${remaining.toLocaleString("pt-BR")}</small>` : ""}
    ${run.error ? `<small class="structured-run-error">${escapeHtml(run.error)}</small>` : ""}
  `;
}

function structuredDbLatestLabel(run) {
  if (!run) return "Ainda não executada";
  const when = run.finished_at || run.finishedAt || run.started_at || run.startedAt;
  const isStaleRunning = run.status === "running" && when && Date.now() - new Date(when).getTime() > 5 * 60 * 1000;
  const status = isStaleRunning ? "interrompida" : run.status;
  return `${status} · ${when ? dateTimeLabel(when) : ""}`;
}

function renderStructuredDbSettings() {
  const diagnostics = state.structuredDbDiagnostics;
  const latest = diagnostics?.latestRun;
  const rows = (diagnostics?.comparisons || []).map((item) => `
    <tr>
      <td>${escapeHtml(structuredDbLabel(item.key))}</td>
      <td>${Number(item.json || 0).toLocaleString("pt-BR")}</td>
      <td>${Number(item.structured || 0).toLocaleString("pt-BR")}</td>
      <td><span class="chip ${item.ok ? "status-active" : "chip-warning"}">${item.ok ? "OK" : "Divergente"}</span></td>
      <td>${structuredDbRunLabel(diagnostics?.latestRuns?.[item.key])}</td>
      <td>
        <div class="row-actions">
          <button class="compact-button primary structured-sync" type="button" data-dataset="${escapeHtml(item.key)}">Sincronizar</button>
        </div>
      </td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Banco estruturado</h2>
        <div class="row-actions">
          <button type="button" id="diagnoseStructuredDb">Diagnosticar</button>
        </div>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <p class="muted-copy">Banco estruturado ativo como fonte oficial. O JSON legado fica apenas como referência histórica e não recebe novas alterações operacionais.</p>
      <div class="info-card">
        <strong>Última atividade geral</strong>
        <span>${escapeHtml(structuredDbLatestLabel(latest))}</span>
        ${latest?.error ? `<small>${escapeHtml(latest.error)}</small>` : ""}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dados</th><th>Base arquivada</th><th>Banco oficial</th><th>Status</th><th>Última sincronização</th><th>Ações</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty">Clique em Diagnosticar para comparar os dados.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `);
  bindSettingsCommon();
  document.querySelector("#diagnoseStructuredDb")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Diagnosticando...");
      const data = await api("/api/structured-db/diagnostics");
      state.structuredDbDiagnostics = data.diagnostics;
      state.settingsNotice = "Diagnóstico atualizado.";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelectorAll(".structured-sync").forEach((button) => button.addEventListener("click", async (event) => {
    const dataset = event.currentTarget.dataset.dataset;
    if (!confirm(`Sincronizar ${structuredDbLabel(dataset)} agora?`)) return;
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Sincronizando...");
      const data = await api("/api/structured-db/sync", { method: "POST", body: JSON.stringify({ dataset }) });
      state.structuredDbDiagnostics = data.diagnostics;
      if (dataset === "leads") invalidateLeads();
      const remaining = Number(data.summary?.remaining || 0);
      state.settingsNotice = remaining > 0
        ? `${structuredDbLabel(dataset)} sincronizado parcialmente. Ainda faltam ${remaining.toLocaleString("pt-BR")} registro(s); clique em Sincronizar novamente para continuar.`
        : `${structuredDbLabel(dataset)} sincronizado.`;
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  }));
}

function levStatusKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isLevAwaitingAuthorization(item) {
  return levStatusKey(item?.status).includes("aguardando autorizacao");
}

function isLevConfirmedForMauad(item) {
  return Boolean(item?.eligible) || levStatusKey(item?.status).includes("confirmad");
}

function levMauadEligiblePendingSales(sales = []) {
  return sales.filter((sale) => isLevConfirmedForMauad(sale));
}

function levFinanceRow(item, options = {}) {
  if (options.readOnly) {
    const detail = [
      item.invoiceNumber ? `NF ${escapeHtml(item.invoiceNumber)}` : "",
      item.invoiceIssuedAt ? `emitida em ${escapeHtml(dateLabel(item.invoiceIssuedAt))}` : "",
      item.paidAt ? `paga em ${escapeHtml(dateLabel(item.paidAt))}` : ""
    ].filter(Boolean).join(" · ");
    return `
      <tr>
        <td>${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(item.client)}</td>
        <td>${escapeHtml(dateTimeLabel(item.signedAt))}</td>
        <td>${money(item.contractValue)}</td>
        <td>${item.commissionValue ? money(item.commissionValue) : "-"}</td>
        <td>${escapeHtml(item.realEstate)}</td>
        <td><span class="${levSettlementClass(item.status)}">${escapeHtml(item.status || options.statusLabel || "")}</span>${detail ? `<br><small>${detail}</small>` : ""}</td>
        <td>-</td>
      </tr>
    `;
  }
  const recordKey = item.id || `unit:${item.unit}`;
  const statusKey = options.statusKey || state.levFinanceTab || "pending";
  const actions = [
    `<button type="button" data-lev-action="edit" data-lev-key="${escapeHtml(recordKey)}">Editar</button>`,
    statusKey === "pending" ? `<button type="button" data-lev-action="ignore" data-lev-key="${escapeHtml(recordKey)}">Ignorar</button>` : "",
    statusKey === "pending" || statusKey === "ignored" || statusKey === "awaiting" ? `<button type="button" data-lev-action="confirm" data-lev-key="${escapeHtml(recordKey)}">Confirmar</button>` : "",
    statusKey === "pending" || statusKey === "ignored" || statusKey === "awaiting" ? `<button type="button" data-lev-action="invoice" data-lev-key="${escapeHtml(recordKey)}">Alterar para NF Emitida</button>` : "",
    statusKey === "pending" || statusKey === "nf" || statusKey === "awaiting" ? `<button type="button" data-lev-action="paid" data-lev-key="${escapeHtml(recordKey)}">Alterar para NF Paga</button>` : "",
    `<button type="button" class="danger-menu-item" data-lev-action="delete" data-lev-key="${escapeHtml(recordKey)}">Excluir</button>`
  ];
  const detail = [
    item.invoiceNumber ? `NF ${escapeHtml(item.invoiceNumber)}` : "",
    item.invoiceIssuedAt ? `emitida em ${escapeHtml(dateLabel(item.invoiceIssuedAt))}` : "",
    item.paidAt ? `paga em ${escapeHtml(dateLabel(item.paidAt))}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <tr>
      <td>${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(item.client)}</td>
      <td>${escapeHtml(dateTimeLabel(item.signedAt))}</td>
      <td>${money(item.contractValue)}</td>
      <td>${item.commissionValue ? money(item.commissionValue) : "-"}</td>
      <td>${escapeHtml(item.realEstate)}</td>
      <td><span class="${levSettlementClass(item.status)}">${escapeHtml(item.status || options.statusLabel || "")}</span>${detail ? `<br><small>${detail}</small>` : ""}</td>
      <td>${renderSettingsActionMenu(`lev-${recordKey}`, actions)}</td>
    </tr>
  `;
}

function renderLevMauadEmailPreviewModal(pendingSales = []) {
  if (!state.levMauadEmailPreview) return "";
  const finance = state.levFinance || { settings: {} };
  const settings = finance.settings || {};
  const sales = levMauadEligiblePendingSales(pendingSales);
  const groups = sales.reduce((map, sale) => {
    const project = saleProjectName(sale);
    if (!map.has(project)) map.set(project, []);
    map.get(project).push(sale);
    return map;
  }, new Map());
  const totalCommission = sales.reduce((sum, sale) => sum + Number(sale.commissionValue || 0), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduleMatch = (Array.isArray(settings.paymentSchedule) ? settings.paymentSchedule : []).find((item) => {
    const start = new Date(`${item.start}T00:00:00`);
    const end = new Date(`${item.end}T23:59:59`);
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && today >= start && today <= end;
  });
  const scheduledPaymentDate = scheduleMatch?.paymentDate || "";
  const scheduledPaymentDateLabel = scheduledPaymentDate
    ? new Date(`${scheduledPaymentDate}T00:00:00`).toLocaleDateString("pt-BR")
    : "-";
  const projectBlocks = [...groups.entries()].map(([project, items]) => {
    const projectCommission = items.reduce((sum, sale) => sum + Number(sale.commissionValue || 0), 0);
    const rows = items.map((sale) => `
      <tr>
        <td>${escapeHtml(sale.unit || "-")}</td>
        <td>${escapeHtml(sale.client || "-")}</td>
        <td>${escapeHtml(dateTimeLabel(sale.signedAt) || "-")}</td>
        <td>${money(sale.contractValue)}</td>
        <td>${money(sale.commissionValue)}</td>
        <td>${escapeHtml(sale.realEstate || "-")}</td>
      </tr>
    `).join("");
    return `
      <section class="email-preview-project">
        <h3>${escapeHtml(project)}</h3>
        <p><strong>Total da NF de comissões:</strong> ${money(projectCommission)}</p>
        <div class="table-wrap"><table class="email-preview-table"><thead><tr><th>Unidade</th><th>Cliente</th><th>Assinatura</th><th>Valor contrato</th><th>Comissão Lev</th><th>Imobiliária</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>
    `;
  }).join("");
  const emailBodyHtml = sales.length ? renderLevEmailTemplateHtml(settings, {
    data_pagamento: escapeHtml(scheduledPaymentDateLabel),
    data_envio: new Date().toLocaleDateString("pt-BR"),
    total_comissoes: money(totalCommission),
    quantidade_vendas: String(sales.length),
    empreendimentos: escapeHtml([...groups.keys()].join(", ") || "-"),
    tabela_vendas: projectBlocks,
    lista_vendas: projectBlocks
  }) : "";
  return `
    <div class="modal-backdrop" data-lev-email-preview-backdrop>
      <section class="modal-card wide-modal email-preview-modal" role="dialog" aria-modal="true" aria-labelledby="levEmailPreviewTitle">
        <div class="email-preview-window">
          <div class="email-preview-toolbar">
            <div>
              <span class="email-chip">Prévia</span>
              <h2 id="levEmailPreviewTitle">Novo e-mail</h2>
            </div>
            <button class="ghost-button" type="button" data-close-lev-email-preview>Fechar</button>
          </div>
          <div class="email-preview-fields">
            <div><span>Para</span><strong>${escapeHtml(settings.provisionTo || "Não configurado")}</strong></div>
            <div><span>Cc</span><strong>${escapeHtml(settings.provisionCc || "-")}</strong></div>
            <div><span>Assunto</span><strong>Autorização de comissões Lev - vendas confirmadas</strong></div>
          </div>
          <div class="email-preview-body">
            ${sales.length ? `
              ${emailBodyHtml}
            ` : `<p class="empty">Nenhuma venda confirmada para envio. Confirme os registros pendentes antes de enviar para a Mauad.</p>`}
          </div>
          <div class="row-actions modal-actions">
            <button class="secondary" type="button" data-close-lev-email-preview>Fechar</button>
            <button class="primary" type="button" data-send-lev-mauad-test-from-preview ${sales.length ? "" : "disabled"}>Enviar teste para renat.cg@gmail.com</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderLevExtractionModal() {
  const extraction = state.levFinanceExtraction;
  if (!extraction) return "";
  const validRows = (extraction.preview || []).map((sale) => levFinanceRow({ ...sale, status: "Prévia" }, { readOnly: true })).join("");
  const invalidRows = (extraction.invalid || []).map((sale) => `
    <tr>
      <td>${escapeHtml(sale.unit || "-")}</td>
      <td>${escapeHtml(sale.client || "-")}</td>
      <td>${escapeHtml(sale.signedAt || "-")}</td>
      <td>${sale.contractValue ? money(sale.contractValue) : "-"}</td>
      <td>${escapeHtml((sale.reasons || []).join(", "))}</td>
    </tr>
  `).join("");
  return `
    <div class="modal-backdrop" data-lev-extraction-backdrop>
      <section class="modal-card wide-modal lev-preview-modal" role="dialog" aria-modal="true" aria-labelledby="levPreviewTitle">
        <div class="panel-head">
          <div>
            <h2 id="levPreviewTitle">Conferir vendas extraídas</h2>
            <p class="modal-subtitle">${escapeHtml(extraction.summary?.valid || 0)} válida(s), ${escapeHtml(extraction.summary?.invalid || 0)} inválida(s). Confira antes de importar.</p>
          </div>
          <button class="ghost-button" type="button" data-close-lev-extraction>Fechar</button>
        </div>
        <div class="table-wrap"><table class="access-table"><thead><tr><th>Unidade</th><th>Cliente</th><th>Assinatura</th><th>Valor contrato</th><th>Comissão</th><th>Imobiliária</th><th>Status</th><th>Ação</th></tr></thead><tbody>${validRows || '<tr><td colspan="8" class="empty">Nenhuma venda válida para importar.</td></tr>'}</tbody></table></div>
        ${invalidRows ? `<h3 class="section-subtitle">Linhas ignoradas</h3><div class="table-wrap"><table class="access-table"><thead><tr><th>Unidade</th><th>Cliente</th><th>Assinatura</th><th>Valor contrato</th><th>Motivo</th></tr></thead><tbody>${invalidRows}</tbody></table></div>` : ""}
        <div class="row-actions modal-actions">
          <button class="secondary" type="button" data-close-lev-extraction>Cancelar</button>
          <button class="primary" type="button" id="importLevPreviewButton" ${validRows ? "" : "disabled"}>Importar vendas válidas</button>
        </div>
      </section>
    </div>
  `;
}

function levFinanceRecordByKey(key) {
  const decoded = String(key || "");
  const unitKey = decoded.startsWith("unit:") ? decoded.slice(5) : "";
  const sales = state.levFinance?.sales || [];
  const settlements = state.levFinance?.settlements || [];
  return sales.find((item) => item.id === decoded || (unitKey && item.unit === unitKey))
    || settlements.find((item) => item.id === decoded || item.unit === unitKey || item.unit === decoded)
    || null;
}

function renderLevFinanceModal() {
  const modal = state.levFinanceModal;
  if (!modal) return "";
  const record = levFinanceRecordByKey(modal.key) || {};
  const title = {
    edit: "Editar venda",
    invoice: "Alterar para NF Emitida",
    paid: "Alterar para NF Paga",
    ignore: "Ignorar registro"
  }[modal.type] || "Financeiro Lev";
  const editFields = modal.type === "edit" ? `
    <div class="field"><label>Unidade</label><input name="unit" value="${escapeHtml(record.unit || "")}" required></div>
    <div class="field"><label>Cliente</label><input name="client" value="${escapeHtml(record.client || "")}"></div>
    <div class="field"><label>Assinatura</label><input name="signedAt" value="${escapeHtml(dateTimeLabel(record.signedAt) || record.signedAt || "")}"></div>
    <div class="field"><label>Valor contrato</label><input name="contractValue" value="${escapeHtml(record.contractValue || "")}"></div>
    <div class="field"><label>Comissão Lev</label><input value="${escapeHtml(record.commissionValue ? money(record.commissionValue) : "Calculada ao salvar")}" disabled><small>Calculada automaticamente pelo % cadastrado.</small></div>
    <div class="field"><label>Imobiliária</label><input name="realEstate" value="${escapeHtml(record.realEstate || "")}"></div>
  ` : "";
  const invoiceFields = modal.type === "invoice" ? `
    <div class="field"><label>Número da NF</label><input name="invoiceNumber" value="${escapeHtml(record.invoiceNumber || "")}" required></div>
    <div class="field"><label>Data de emissão</label><input name="invoiceIssuedAt" type="date" value="${escapeHtml(record.invoiceIssuedAt || new Date().toISOString().slice(0, 10))}" required></div>
  ` : "";
  const paidFields = modal.type === "paid" ? `
    <div class="field"><label>Data de pagamento</label><input name="paidAt" type="date" value="${escapeHtml(record.paidAt || new Date().toISOString().slice(0, 10))}" required></div>
  ` : "";
  const ignoreFields = modal.type === "ignore" ? `
    <div class="field full"><label>Motivo</label><textarea name="ignoreReason" rows="4" placeholder="Informe por que este registro será ignorado" required>${escapeHtml(record.ignoreReason || "")}</textarea></div>
  ` : "";
  return `
    <div class="modal-backdrop" data-lev-modal-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="levFinanceModalTitle">
        <div class="panel-head">
          <div>
            <h2 id="levFinanceModalTitle">${title}</h2>
            <p class="modal-subtitle">${escapeHtml(record.unit || "")}${record.client ? ` · ${escapeHtml(record.client)}` : ""}</p>
          </div>
          <button class="ghost-button" type="button" data-close-lev-modal>Fechar</button>
        </div>
        <form id="levFinanceRecordForm" class="form-grid editor">
          ${editFields || invoiceFields || paidFields || ignoreFields}
          <div class="field full"><div class="row-actions modal-actions"><button class="secondary" type="button" data-close-lev-modal>Cancelar</button><button class="primary" type="submit">Salvar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function renderLevFinanceView() {
  const finance = state.levFinance || { settings: {}, sales: [], receipts: [], paidUnits: [], settlements: [] };
  const term = state.levFinanceSearch.trim().toLocaleLowerCase("pt-BR");
  const matchesFinanceSearch = (item) => !term || levFinanceSearchText(item).includes(term);
  const allSales = (finance.sales || []).filter(matchesFinanceSearch);
  const settlements = (finance.settlements || []).filter(matchesFinanceSearch);
  const isNfIssued = (item) => {
    const key = levStatusKey(item.status);
    return key.includes("nf emitida")
      || Boolean(item.invoiceNumber || item.invoiceIssuedAt);
  };
  const isPaid = (item) => Boolean(item.paid || item.paidAt || levStatusKey(item.status) === "paga");
  const isIgnored = (item) => levStatusKey(item.status).includes("nao contabilizada") || levStatusKey(item.status).includes("ignorada");
  const pendingSales = allSales.filter((sale) => !isPaid(sale) && !isNfIssued(sale) && !isIgnored(sale) && !isLevAwaitingAuthorization(sale));
  const awaitingSales = allSales.filter((sale) => !isPaid(sale) && !isIgnored(sale) && isLevAwaitingAuthorization(sale));
  const awaitingSettlements = settlements.filter((settlement) => !isPaid(settlement) && !isIgnored(settlement) && isLevAwaitingAuthorization(settlement));
  const nfSales = allSales.filter((sale) => !isPaid(sale) && !isLevAwaitingAuthorization(sale) && isNfIssued(sale)).map((sale) => ({ ...sale, status: sale.status || "NF Emitida" }));
  const nfSettlements = settlements.filter(isNfIssued);
  const paidSettlements = settlements.filter((settlement) => levStatusKey(settlement.status) === "paga");
  const ignoredSettlements = settlements.filter(isIgnored);
  const nfUnits = new Set(nfSales.map((sale) => sale.unit));
  const awaitingUnits = new Set(awaitingSales.map((sale) => sale.unit));
  const currentRowsByTab = {
    pending: pendingSales,
    awaiting: [...awaitingSales, ...awaitingSettlements.filter((settlement) => !awaitingUnits.has(settlement.unit))],
    nf: [...nfSales, ...nfSettlements.filter((settlement) => !nfUnits.has(settlement.unit) && !isLevAwaitingAuthorization(settlement))],
    paid: paidSettlements,
    ignored: ignoredSettlements
  };
  const activeRows = currentRowsByTab[state.levFinanceTab] || currentRowsByTab.pending;
  const activeTabLabel = {
    pending: "Pendentes",
    awaiting: "Aguardando autorização",
    nf: "NF Emitida",
    paid: "Pagas",
    ignored: "Ignoradas"
  }[state.levFinanceTab] || "Pendentes";
  const activeContract = activeRows.reduce((sum, item) => sum + Number(item.contractValue || 0), 0);
  const activeCommission = activeRows.reduce((sum, item) => sum + Number(item.commissionValue || 0), 0);
  const tableRows = activeRows.map((item) => levFinanceRow(item, { statusKey: state.levFinanceTab })).join("");
  const receiptRows = (finance.receipts || []).filter(matchesFinanceSearch).slice(0, 80).map((receipt) => `
    <tr>
      <td>${escapeHtml(receipt.unit)}</td>
      <td>${money(receipt.amount)}</td>
      <td>${escapeHtml(dateLabel(receipt.receivedAt))}</td>
      <td>${escapeHtml(receipt.note || "")}</td>
    </tr>
  `).join("");
  const tabs = [
    ["pending", "Pendentes", pendingSales.length],
    ["awaiting", "Aguardando autorização", currentRowsByTab.awaiting.length],
    ["nf", "NF Emitida", currentRowsByTab.nf.length],
    ["paid", "Pagas", paidSettlements.length],
    ["ignored", "Ignoradas", ignoredSettlements.length]
  ].map(([key, label, count]) => `<button class="${state.levFinanceTab === key ? "primary" : ""}" type="button" data-lev-finance-tab="${key}">${label} <span>${count}</span></button>`).join("");

  renderShell(`
    ${renderViewHead("Financeiro Lev", "Controle de vendas, recebimentos e comissão da Lev", {
      actions: `
        <input id="levImageInput" type="file" accept="image/*" hidden>
        ${state.levFinanceTab === "pending" && pendingSales.length ? renderSettingsActionMenu("lev-send-mauad", [
          `<button type="button" data-preview-lev-mauad-email>Visualizar e-mail antes de enviar</button>`,
          `<button type="button" data-send-lev-mauad>Enviar</button>`
        ], "Enviar Mauad") : ""}
        <button class="primary" type="button" id="submitLevImageButton">Submeter imagem</button>
      `
    })}
    <section class="panel compact-panel">
      <input id="levFinanceSearch" class="settings-search" placeholder="Pesquisar por unidade, cliente, imobiliária, status ou observação" value="${escapeHtml(state.levFinanceSearch)}">
    </section>
    <section class="metrics">
      <div class="metric"><span>${escapeHtml(activeTabLabel)}</span><strong>${activeRows.length}</strong></div>
      <div class="metric"><span>Valor da aba</span><strong>${money(activeContract)}</strong></div>
      <div class="metric"><span>Comissão da aba</span><strong>${money(activeCommission)}</strong></div>
      <div class="metric"><span>% comissão</span><strong>${escapeHtml(finance.settings?.commissionPercent || 0)}%</strong></div>
    </section>
    <section class="panel">
      <div class="tabs lev-finance-tabs">${tabs}</div>
      <div class="table-wrap"><table class="access-table"><thead><tr><th>Unidade</th><th>Cliente</th><th>Assinatura</th><th>Valor contrato</th><th>Comissão Lev</th><th>Imobiliária</th><th>Status</th><th>Ação</th></tr></thead><tbody>${tableRows || '<tr><td colspan="8" class="empty">Nenhum registro nesta aba.</td></tr>'}</tbody></table></div>
    </section>
    <section class="dashboard-grid finance-grid">
      <section class="panel">
        <div class="panel-head"><h2>Recebimentos / conciliação</h2></div>
        <form id="levReceiptForm" class="form-grid">
          <div class="field full"><label>Unidades pagas</label><textarea name="units" rows="4" placeholder="Uma unidade por linha. Ex.: GCR060107" required></textarea></div>
          <div class="field"><label>Valor recebido</label><input name="amount" placeholder="450.000,00"></div>
          <div class="field"><label>Data do recebimento</label><input name="receivedAt" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="field full"><label>Observação</label><input name="note" placeholder="Ex.: histórico inicial ou conciliação"></div>
          <div class="field full"><button class="primary" type="submit">Registrar recebimento</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Histórico de recebimentos</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Unidade</th><th>Valor</th><th>Recebido em</th><th>Observação</th></tr></thead><tbody>${receiptRows || '<tr><td colspan="4" class="empty">Nenhum recebimento registrado.</td></tr>'}</tbody></table></div>
      </section>
    </section>
    ${renderLevExtractionModal()}
    ${renderLevFinanceModal()}
    ${renderLevMauadEmailPreviewModal(pendingSales)}
  `);
  bindLevFinanceControls();
}

function bindLevFinanceControls() {
  bindSettingsActionMenus();
  document.querySelectorAll("[data-lev-finance-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.levFinanceTab = button.dataset.levFinanceTab || "pending";
      renderLevFinanceView();
    });
  });
  const financeSearch = document.querySelector("#levFinanceSearch");
  financeSearch?.addEventListener("input", (event) => {
    state.levFinanceSearch = event.target.value;
    if (pageSearchRenderTimer) clearTimeout(pageSearchRenderTimer);
    pageSearchRenderTimer = setTimeout(() => {
      pageSearchRenderTimer = null;
      renderLevFinanceView();
      requestAnimationFrame(() => {
        const nextSearch = document.querySelector("#levFinanceSearch");
        if (!nextSearch) return;
        nextSearch.focus({ preventScroll: true });
        const position = nextSearch.value.length;
        nextSearch.setSelectionRange(position, position);
      });
    }, 250);
  });
  document.querySelector("#submitLevImageButton")?.addEventListener("click", () => {
    document.querySelector("#levImageInput")?.click();
  });
  const sendLevToMauad = async (button) => {
    if (!confirm("Enviar as vendas confirmadas para a Mauad em um único e-mail?")) return;
    try {
      setButtonBusy(button, true, "Enviando...");
      const data = await api("/api/lev-finance/send-to-mauad", { method: "POST" });
      state.levFinance = data.levFinance;
      state.levFinanceTab = "awaiting";
      state.levMauadEmailPreview = false;
      alert(`Enviado para a Mauad: ${data.count || 0} registro(s).`);
      renderLevFinanceView();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  };
  const sendLevToMauadTest = async (button) => {
    try {
      setButtonBusy(button, true, "Enviando teste...");
      const data = await api("/api/lev-finance/send-to-mauad-test", { method: "POST" });
      alert(`Teste enviado para ${data.to || "renat.cg@gmail.com"} com ${data.count || 0} registro(s).`);
      setButtonBusy(button, false);
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  };
  document.querySelector("[data-preview-lev-mauad-email]")?.addEventListener("click", () => {
    state.levMauadEmailPreview = true;
    renderLevFinanceView();
  });
  document.querySelector("[data-send-lev-mauad]")?.addEventListener("click", (event) => sendLevToMauad(event.currentTarget));
  document.querySelector("[data-send-lev-mauad-test-from-preview]")?.addEventListener("click", (event) => sendLevToMauadTest(event.currentTarget));
  document.querySelectorAll("[data-close-lev-email-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      state.levMauadEmailPreview = false;
      renderLevFinanceView();
    });
  });
  document.querySelector("[data-lev-email-preview-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      state.levMauadEmailPreview = false;
      renderLevFinanceView();
    }
  });
  document.querySelector("#levImageInput")?.addEventListener("change", async (event) => {
    const button = document.querySelector("#submitLevImageButton");
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      setButtonBusy(button, true, "Extraindo...");
      const imageDataUrl = await readFileAsDataUrl(file);
      const data = await api("/api/lev-finance/extract", { method: "POST", body: JSON.stringify({ imageDataUrl }) });
      state.levFinanceExtraction = data;
      renderLevFinanceView();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    } finally {
      event.currentTarget.value = "";
    }
  });
  document.querySelectorAll("[data-close-lev-extraction], [data-lev-extraction-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.hasAttribute("data-lev-extraction-backdrop")) return;
      state.levFinanceExtraction = null;
      renderLevFinanceView();
    });
  });
  document.querySelector("#importLevPreviewButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const sales = state.levFinanceExtraction?.preview || [];
    if (!sales.length) return;
    try {
      setButtonBusy(button, true, "Importando...");
      const data = await api("/api/lev-finance/import-extracted", { method: "POST", body: JSON.stringify({ sales }) });
      state.levFinance = data.levFinance;
      state.levFinanceExtraction = null;
      state.levFinanceTab = "pending";
      alert(`Importação concluída: ${data.summary.created} nova(s), ${data.summary.duplicates} já existente(s), ${data.summary.paidSkipped} já paga(s), ${data.summary.invalidSkipped || 0} inválida(s).`);
      renderLevFinanceView();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelector("#levReceiptForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const form = new FormData(event.currentTarget);
    try {
      setButtonBusy(button, true, "Registrando...");
      const data = await api("/api/lev-finance/receipts", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      state.levFinance = data.levFinance;
      renderLevFinanceView();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelectorAll("[data-lev-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.levKey;
      const action = button.dataset.levAction;
      if (["edit", "invoice", "paid", "ignore"].includes(action)) {
        state.levFinanceModal = { type: action, key };
        renderLevFinanceView();
        return;
      }
      if (action === "delete") {
        if (!confirm("Excluir este registro financeiro? Esta ação remove a venda, histórico e recebimentos vinculados à unidade.")) return;
        try {
          const data = await api(`/api/lev-finance/records/${encodeURIComponent(key)}`, { method: "DELETE" });
          state.levFinance = data.levFinance;
          renderLevFinanceView();
        } catch (error) {
          alert(error.message);
        }
        return;
      }
      if (action === "confirm") {
        if (!confirm("Confirmar esta venda como elegível para envio em lote à Mauad?")) return;
        try {
          const data = await api(`/api/lev-finance/records/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) });
          state.levFinance = data.levFinance;
          alert("Venda confirmada para envio em lote à Mauad.");
          renderLevFinanceView();
        } catch (error) {
          alert(error.message);
        }
      }
    });
  });
  document.querySelectorAll("[data-close-lev-modal], [data-lev-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.hasAttribute("data-lev-modal-backdrop")) return;
      state.levFinanceModal = null;
      renderLevFinanceView();
    });
  });
  document.querySelector("#levFinanceRecordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const modal = state.levFinanceModal;
    if (!modal) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const body = modal.type === "edit"
      ? { action: "edit", fields: payload }
      : modal.type === "invoice"
        ? { action: "invoice_issued", ...payload }
        : modal.type === "ignore"
          ? { action: "ignore", reason: payload.ignoreReason }
          : { action: "paid", ...payload };
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api(`/api/lev-finance/records/${encodeURIComponent(modal.key)}`, { method: "PATCH", body: JSON.stringify(body) });
      state.levFinance = data.levFinance;
      state.levFinanceModal = null;
      if (modal.type === "invoice") state.levFinanceTab = "nf";
      if (modal.type === "paid") state.levFinanceTab = "paid";
      if (modal.type === "ignore") state.levFinanceTab = "ignored";
      renderLevFinanceView();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message);
    }
  });
  document.querySelectorAll("[data-confirm-lev-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Confirmar esta venda como elegível para envio em lote à Mauad?")) return;
      try {
        setButtonBusy(button, true, "Confirmando...");
        const data = await api(`/api/lev-finance/sales/${button.dataset.confirmLevSale}/confirm`, { method: "POST" });
        state.levFinance = data.levFinance;
        alert("Venda confirmada para envio em lote à Mauad.");
        renderLevFinanceView();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
}

function renderAvailabilityStatusSettings() {
  const mappings = availabilityStatusMappings();
  const isCreating = state.settingsEditing === "availability-status:new";
  const editIndex = state.settingsEditing?.startsWith("availability-status:") && !isCreating
    ? Number(state.settingsEditing.replace("availability-status:", ""))
    : null;
  const editMapping = editIndex != null ? mappings[editIndex] : null;
  const formMapping = isCreating
    ? { id: `custom-${Date.now()}`, label: "", color: "#e5e7eb", pipelineStatuses: [], samCodes: [] }
    : editMapping;
  const pipelineOptions = (state.statuses || []).map((status) => {
    const checked = (formMapping?.pipelineStatuses || []).some((item) => availabilityStatusKey(item) === availabilityStatusKey(status));
    return `
      <label class="subtle-check availability-map-check">
        <input type="checkbox" name="pipelineStatuses" value="${escapeHtml(status)}" ${checked ? "checked" : ""}>
        <span>${escapeHtml(status)}</span>
      </label>
    `;
  }).join("");
  const rows = mappings.map((mapping, index) => `
    <tr>
      <td><span class="color-swatch" style="background:${escapeHtml(mapping.color || "#e5e7eb")}"></span>${escapeHtml(mapping.label)}</td>
      <td>${(mapping.pipelineStatuses || []).map((status) => `<span class="mini-pill">${escapeHtml(status)}</span>`).join(" ") || '<span class="muted-cell">Sem vínculo</span>'}</td>
      <td>${(mapping.samCodes || []).map((code) => `<span class="mini-pill">${escapeHtml(code)}</span>`).join(" ") || '<span class="muted-cell">Sem código</span>'}</td>
      <td>${renderSettingsActionMenu(`availability-status-${index}`, [
        `<button type="button" data-edit-availability-status="${index}">Editar</button>`,
        ...(!availabilityDefaultStatusMappings().some((item) => item.id === mapping.id) ? [`<button type="button" class="danger-menu-item" data-delete-availability-status="${index}">Excluir</button>`] : [])
      ])}</td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Status de disponibilidade</h2>
          <p class="muted-copy">De-para entre o status visual das unidades, os status do pipeline e os códigos recebidos pelo SAM.</p>
        </div>
        <button class="primary" type="button" data-new-availability-status>Cadastrar novo</button>
      </div>
      ${(isCreating || editMapping) ? `
        <form id="availabilityStatusForm" class="form-grid editor compact-editor">
          <input type="hidden" name="id" value="${escapeHtml(formMapping?.id || "")}">
          <div class="field"><label>Status visual</label><input name="label" value="${escapeHtml(formMapping?.label || "")}" required></div>
          <div class="field"><label>Cor</label><input name="color" type="color" value="${escapeHtml(formMapping?.color || "#e5e7eb")}"></div>
          <div class="field full">
            <label>Status do pipeline vinculados</label>
            <div class="availability-map-checks">${pipelineOptions || '<span class="muted-cell">Cadastre status do pipeline primeiro.</span>'}</div>
          </div>
          <div class="field full"><label>Códigos SAM vinculados</label><textarea name="samCodes" rows="3" placeholder="Um código por linha ou separados por vírgula">${escapeHtml((formMapping?.samCodes || []).join("\n"))}</textarea></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table class="settings-table compact-records">
          <thead><tr><th>Status visual</th><th>Status do pipeline</th><th>Códigos SAM</th><th>Ação</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="empty">Nenhum status cadastrado.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `);
  document.querySelector("[data-new-availability-status]")?.addEventListener("click", () => {
    state.settingsEditing = "availability-status:new";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-availability-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `availability-status:${button.dataset.editAvailabilityStatus}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-availability-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este status de disponibilidade?")) return;
      const nextMappings = mappings.filter((_, index) => index !== Number(button.dataset.deleteAvailabilityStatus));
      const data = await api("/api/availability-settings", {
        method: "PUT",
        body: JSON.stringify({ ...(state.availabilitySettings || {}), statusMappings: nextMappings })
      });
      state.availabilitySettings = normalizeAvailabilitySettingsClient(data.availabilitySettings || {});
      state.settingsEditing = null;
      renderSettings();
    });
  });
  document.querySelector("#availabilityStatusForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pipelineStatuses = form.getAll("pipelineStatuses");
    const nextMapping = {
      id: String(form.get("id") || form.get("label") || `availability-status-${Date.now()}`).trim(),
      label: String(form.get("label") || "").trim(),
      color: String(form.get("color") || "#e5e7eb").trim(),
      pipelineStatuses,
      samCodes: String(form.get("samCodes") || "")
    };
    const nextMappings = mappings.slice();
    if (isCreating) nextMappings.push(nextMapping);
    else if (editIndex != null) nextMappings[editIndex] = { ...nextMappings[editIndex], ...nextMapping };
    const data = await api("/api/availability-settings", {
      method: "PUT",
      body: JSON.stringify({ ...(state.availabilitySettings || {}), statusMappings: nextMappings })
    });
    state.availabilitySettings = normalizeAvailabilitySettingsClient(data.availabilitySettings || {});
    state.settingsEditing = null;
    renderSettings();
  });
}

function renderAvailabilityOptionSettings(kind) {
  const isArchitecture = kind === "architecture";
  const key = isArchitecture ? "architectureOptions" : "typologyOptions";
  const title = isArchitecture ? "Arquitetura" : "Tipologia";
  const description = isArchitecture
    ? "Opções usadas no cadastro das unidades."
    : "Tipologias usadas no cadastro das unidades.";
  const availabilitySettings = state.availabilitySettings || { architectureOptions: [], typologyOptions: [] };
  const value = (availabilitySettings[key] || []).join("\n");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted-copy">${escapeHtml(description)}</p>
        </div>
      </div>
      <form id="availabilityOptionsForm" class="form-grid editor compact-editor" data-availability-options-kind="${escapeHtml(kind)}">
        <div class="field full"><label>Opções</label><textarea name="options" rows="8" placeholder="Uma opção por linha">${escapeHtml(value)}</textarea></div>
        <div class="field full"><button class="primary" type="submit">Salvar</button></div>
      </form>
    </section>
  `);
  document.querySelector("#availabilityOptionsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextSettings = {
      ...(state.availabilitySettings || {}),
      [key]: form.get("options")
    };
    const data = await api("/api/availability-settings", {
      method: "PUT",
      body: JSON.stringify(nextSettings)
    });
    state.availabilitySettings = data.availabilitySettings || state.availabilitySettings;
    await loadState();
    renderSettings();
  });
}

function renderProjectBlockSettings() {
  const projectName = state.blockSettingsProject || state.projects[0] || "";
  state.blockSettingsProject = projectName;
  const projectIndex = (state.projectDefinitions || []).findIndex((project) => project.name === projectName);
  if (!projectName || projectIndex < 0) {
    settingsLayout(`
      <section class="panel">
        <div class="panel-head"><h2>Blocos</h2></div>
        <p class="empty">Cadastre um empreendimento antes de cadastrar blocos.</p>
      </section>
    `);
    bindSettingsCommon();
    return;
  }
  const projectDefinition = projectDefinitionByName(projectName);
  const blockDefinitions = projectDefinition.blockDefinitions || [];
  const editBlockId = state.settingsEditing?.startsWith("block:") ? state.settingsEditing.replace("block:", "") : "";
  const editBlock = blockDefinitions.find((block) => block.id === editBlockId) || null;
  const isCreating = state.settingsEditing === "new-block";
  const blockForm = editBlock || { block: "", floorCount: "", columnCount: "", penthouseFloors: [] };
  const rows = blockDefinitions.map((block) => {
    const generatedCount = Number(block.floorCount || 0) * Number(block.columnCount || 0);
    return `
      <tr>
        <td>${escapeHtml(padUnitPart(block.block, 2))}</td>
        <td>${Number(block.floorCount || 0)}</td>
        <td>${Number(block.columnCount || 0)}</td>
        <td>${escapeHtml((block.penthouseFloors || []).join(", ") || "-")}</td>
        <td>${generatedCount}</td>
        <td>${renderSettingsActionMenu(`block-${block.id}`, [
          `<button type="button" data-edit-block="${escapeHtml(block.id)}">Editar</button>`,
          `<button type="button" data-generate-block="${escapeHtml(block.id)}">Gerar unidades</button>`,
          `<button type="button" class="danger-menu-item" data-delete-block="${escapeHtml(block.id)}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Blocos</h2>
          <p class="muted-copy">Estrutura usada para desenhar o quadro de disponibilidade.</p>
        </div>
        <button class="primary" type="button" data-new-block>Cadastrar bloco</button>
      </div>
      <div class="form-grid editor compact-editor">
        <div class="field"><label>Empreendimento</label><select id="blockProjectSelect">${(state.projects || []).map((project) => `<option value="${escapeHtml(project)}" ${project === projectName ? "selected" : ""}>${escapeHtml(project)}</option>`).join("")}</select></div>
      </div>
      ${(isCreating || editBlock) ? `
        <form id="projectBlockForm" class="form-grid editor">
          <div class="field"><label>Bloco</label><input name="block" value="${escapeHtml(blockForm.block)}" placeholder="Ex.: 1" required></div>
          <div class="field"><label>Quantidade de andares</label><input name="floorCount" type="number" min="1" value="${escapeHtml(blockForm.floorCount)}" required></div>
          <div class="field"><label>Colunas por andar</label><input name="columnCount" type="number" min="1" value="${escapeHtml(blockForm.columnCount)}" required></div>
          <div class="field"><label>Andares cobertura</label><input name="penthouseFloors" value="${escapeHtml((blockForm.penthouseFloors || []).join(", "))}" placeholder="Ex.: 10, 11"></div>
          <label class="tiny-check field full"><input type="checkbox" name="generateUnits" value="true"> Gerar unidades automaticamente ao salvar</label>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar bloco</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Bloco</th><th>Andares</th><th>Colunas</th><th>Coberturas</th><th>Unidades previstas</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">Nenhum bloco cadastrado para este empreendimento</td></tr>'}</tbody></table>
      </div>
    </section>
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  document.querySelector("#blockProjectSelect")?.addEventListener("change", (event) => {
    state.blockSettingsProject = event.target.value;
    state.settingsEditing = null;
    renderSettings();
  });
  document.querySelector("[data-new-block]")?.addEventListener("click", () => {
    state.settingsEditing = "new-block";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-block]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `block:${button.dataset.editBlock}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-block]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este bloco? As unidades já geradas não serão apagadas.")) return;
      const nextBlocks = blockDefinitions.filter((block) => block.id !== button.dataset.deleteBlock);
      const payload = { ...projectDefinition, blockDefinitions: nextBlocks };
      const data = await api(`/api/projects/${projectIndex}`, { method: "PATCH", body: JSON.stringify(payload) });
      state.projects = data.projects;
      state.projectDefinitions = data.projectDefinitions || [];
      state.settingsEditing = null;
      await loadState();
      renderSettings();
    });
  });
  document.querySelectorAll("[data-generate-block]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api("/api/units/generate", { method: "POST", body: JSON.stringify({ project: projectName, blockId: button.dataset.generateBlock }) });
      state.unitDefinitions = data.unitDefinitions || state.unitDefinitions;
      alert(`Unidades geradas/atualizadas: ${data.generated || 0}`);
      await loadState();
      renderSettings();
    });
  });
  document.querySelector("#projectBlockForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const blockPayload = {
      id: editBlock?.id || `block-${Date.now()}`,
      block: form.get("block"),
      floorCount: form.get("floorCount"),
      columnCount: form.get("columnCount"),
      penthouseFloors: form.get("penthouseFloors")
    };
    const nextBlocks = editBlock
      ? blockDefinitions.map((block) => block.id === editBlock.id ? blockPayload : block)
      : [...blockDefinitions, blockPayload];
    const payload = { ...projectDefinition, blockDefinitions: nextBlocks };
    const data = await api(`/api/projects/${projectIndex}`, { method: "PATCH", body: JSON.stringify(payload) });
    state.projects = data.projects;
    state.projectDefinitions = data.projectDefinitions || [];
    const savedBlockId = blockPayload.id;
    state.settingsEditing = null;
    if (form.get("generateUnits") === "true") {
      const generated = await api("/api/units/generate", { method: "POST", body: JSON.stringify({ project: projectName, blockId: savedBlockId }) });
      state.unitDefinitions = generated.unitDefinitions || state.unitDefinitions;
      alert(`Bloco salvo. Unidades geradas/atualizadas: ${generated.generated || 0}`);
    }
    await loadState();
    renderSettings();
  });
}

function renderUnitSettingsModal(project, unitRows, unitForm, editUnit, isCreatingUnit, availabilitySettings, selectOptions, optionTags) {
  if (!project) return "";
  const formOpen = isCreatingUnit || editUnit;
  const blockOptions = (projectName, current) => blockDefinitionsForProject(projectName).map((block) => `<option value="${escapeHtml(padUnitPart(block.block, 2))}" ${padUnitPart(block.block, 2) === padUnitPart(current, 2) ? "selected" : ""}>${escapeHtml(block.structureType || "Bloco")} ${escapeHtml(padUnitPart(block.block, 2))}</option>`).join("");
  return `
    <div class="modal-backdrop" data-unit-modal-backdrop>
      <section class="modal-card wide-modal unit-settings-modal" role="dialog" aria-modal="true" aria-labelledby="unitSettingsTitle">
        <div class="panel-head">
          <div>
            <h2 id="unitSettingsTitle">Unidades</h2>
            <p class="modal-subtitle">${escapeHtml(project)}</p>
          </div>
          <div class="row-actions">
            <button class="primary" type="button" data-new-unit>${formOpen ? "Nova unidade" : "Cadastrar unidade"}</button>
            <button class="ghost-button" type="button" data-close-unit-modal>Fechar</button>
          </div>
        </div>
        ${formOpen ? `
          <form id="unitForm" class="form-grid editor unit-editor">
            <div class="field"><label>Empreendimento</label><select name="project" required>${selectOptions(state.projects || [], unitForm.project)}</select></div>
            <div class="field"><label>Bloco/Quadra</label><select name="block"><option value="">Selecione</option>${blockOptions(unitForm.project, unitForm.block)}</select></div>
            <div class="field"><label>Andar</label><input name="floor" value="${escapeHtml(unitForm.floor)}" placeholder="Ex.: 6"></div>
            <div class="field"><label>Coluna</label><input name="column" value="${escapeHtml(unitForm.column)}" placeholder="Ex.: 07"></div>
            <div class="field"><label>Unidade</label><input name="unit" value="${escapeHtml(unitForm.unit)}" placeholder="Automático" required></div>
            <div class="field"><label>Código SAM</label><input name="samCode" value="${escapeHtml(unitForm.samCode)}" placeholder="Automático"></div>
            <div class="field"><label>Área útil</label><input name="usefulArea" value="${escapeHtml(unitForm.usefulArea)}"></div>
            <div class="field"><label>Área privativa</label><input name="privateArea" value="${escapeHtml(unitForm.privateArea)}"></div>
            <div class="field"><label>Posição</label><select name="sunPosition">${selectOptions(["Sol manhã", "Sol tarde"], unitForm.sunPosition)}</select></div>
            <div class="field"><label>Tipo</label><select name="unitType">${selectOptions(["Casa", "Apartamento"], unitForm.unitType)}</select></div>
            <div class="field"><label>Arquitetura</label><input name="architecture" list="architectureOptions" value="${escapeHtml(unitForm.architecture)}"><datalist id="architectureOptions">${optionTags(availabilitySettings.architectureOptions)}</datalist></div>
            <div class="field"><label>Tipologia</label><input name="typology" list="typologyOptions" value="${escapeHtml(unitForm.typology)}"><datalist id="typologyOptions">${optionTags(availabilitySettings.typologyOptions)}</datalist></div>
            <div class="field"><label>Fração ideal</label><input name="idealFraction" value="${escapeHtml(unitForm.idealFraction)}"></div>
            <div class="field"><label>Vista</label><select name="view">${selectOptions(["Livre", "Impedida"], unitForm.view)}</select></div>
            <div class="field"><label>Status</label><select name="status">${selectOptions(state.statuses || [], unitForm.status, "Disponível")}</select></div>
            <div class="field"><label>Cliente comprador</label><input name="buyerName" value="${escapeHtml(unitForm.buyerName)}"></div>
            <div class="field"><label>ID do lead vinculado</label><input name="leadId" value="${escapeHtml(unitForm.leadId)}"></div>
            <div class="field"><label>Planta (JPG/PNG/PDF)</label><input type="file" name="floorPlan" accept="image/png,image/jpeg,application/pdf">${unitForm.floorPlanName ? `<small>Atual: ${escapeHtml(unitForm.floorPlanName)}</small>` : ""}</div>
            <div class="field full"><div class="row-actions modal-actions"><button class="secondary" type="button" data-cancel-unit>Cancelar</button><button class="primary" type="submit">Salvar unidade</button></div></div>
          </form>
        ` : ""}
        <div class="table-wrap">
          <table><thead><tr><th>Unidade</th><th>Bloco</th><th>Andar</th><th>Coluna</th><th>Status</th><th>Cliente</th><th>Ações</th></tr></thead><tbody>${unitRows || '<tr><td colspan="7" class="empty">Nenhuma unidade cadastrada</td></tr>'}</tbody></table>
        </div>
      </section>
    </div>
  `;
}

function renderProjectBlockSettingsModal(project) {
  if (!project) return "";
  const projectIndex = (state.projectDefinitions || []).findIndex((item) => item.name === project);
  const projectDefinition = projectDefinitionByName(project);
  const blockDefinitions = projectDefinition.blockDefinitions || [];
  const isCreatingBlock = state.editBlockId === "__new__";
  const editBlock = state.editBlockId && !isCreatingBlock ? blockDefinitions.find((block) => block.id === state.editBlockId) : null;
  const blockForm = editBlock || { block: "", structureType: "Bloco", layoutType: "Vertical", floorCount: "", columnCount: "", hasPenthouse: false, unitPrefix: "", numberStart: "", numberEnd: "" };
  const rows = blockDefinitions.map((block) => {
    const layoutType = blockLayoutType(block);
    const generatedCount = expectedUnitsForBlock(block);
    const detail = layoutType === "Horizontal"
      ? `Prefixo ${block.unitPrefix || "-"} · ${block.numberStart || "-"} a ${block.numberEnd || "-"}`
      : `${Number(block.floorCount || 0)} pav. · ${Number(block.columnCount || 0)} col.`;
    return `
      <tr>
        <td>${escapeHtml(block.structureType || "Bloco")}</td>
        <td>${escapeHtml(layoutType)}</td>
        <td>${escapeHtml(blockDisplayName(block) || "-")}</td>
        <td>${escapeHtml(detail)}</td>
        <td>${layoutType === "Vertical" ? (block.hasPenthouse ? "Sim" : "Não") : "-"}</td>
        <td>${generatedCount}</td>
        <td>${renderSettingsActionMenu(`block-modal-${block.id}`, [
          `<button type="button" data-edit-project-block="${escapeHtml(block.id)}">Editar</button>`,
          `<button type="button" data-generate-project-block="${escapeHtml(block.id)}">Gerar unidades</button>`,
          `<button type="button" class="danger-menu-item" data-delete-project-block="${escapeHtml(block.id)}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  const formOpen = isCreatingBlock || editBlock;
  return `
    <div class="modal-backdrop" data-block-modal-backdrop>
      <section class="modal-card wide-modal unit-settings-modal" role="dialog" aria-modal="true" aria-labelledby="blockSettingsTitle">
        <div class="panel-head">
          <div>
            <h2 id="blockSettingsTitle">Blocos e quadras</h2>
            <p class="modal-subtitle">${escapeHtml(project)}</p>
          </div>
          <div class="row-actions">
            <button class="primary" type="button" data-new-project-block>${formOpen ? "Novo bloco" : "Cadastrar bloco"}</button>
            <button class="ghost-button" type="button" data-close-block-modal>Fechar</button>
          </div>
        </div>
        ${formOpen ? `
          <form id="projectBlockModalForm" class="form-grid editor unit-editor">
            <div class="field"><label>Tipo da estrutura</label><select name="structureType" required>
              <option value="Bloco" ${blockForm.structureType !== "Quadra" ? "selected" : ""}>Bloco</option>
              <option value="Quadra" ${blockForm.structureType === "Quadra" ? "selected" : ""}>Quadra</option>
            </select></div>
            <div class="field"><label>Modelo</label><select name="layoutType" data-block-layout-select required>
              <option value="Vertical" ${blockLayoutType(blockForm) !== "Horizontal" ? "selected" : ""}>Vertical</option>
              <option value="Horizontal" ${blockLayoutType(blockForm) === "Horizontal" ? "selected" : ""}>Horizontal</option>
            </select></div>
            <div class="field full"><label>Nome do bloco/quadra</label><input name="block" value="${escapeHtml(blockForm.block)}" placeholder="Ex.: Bloco 1, Quadra A, Vila 3" required></div>
            <div class="field" data-block-vertical-field><label>Qtde de Pavimentos-Tipo</label><input name="floorCount" type="number" min="1" value="${escapeHtml(blockForm.floorCount)}"></div>
            <div class="field" data-block-vertical-field><label>Colunas por pavimento</label><input name="columnCount" type="number" min="1" value="${escapeHtml(blockForm.columnCount)}"></div>
            <label class="checkline field full" data-block-vertical-field><input type="checkbox" name="hasPenthouse" value="true" ${blockForm.hasPenthouse ? "checked" : ""}> Existe Pavimento Cobertura</label>
            <div class="field" data-block-horizontal-field><label>Prefixo das unidades</label><input name="unitPrefix" value="${escapeHtml(blockForm.unitPrefix || "")}" placeholder="Ex.: LOTE, CASA, Q1"></div>
            <div class="field" data-block-horizontal-field><label>Início da numeração</label><input name="numberStart" type="number" min="1" value="${escapeHtml(blockForm.numberStart || "")}" placeholder="Ex.: 1"></div>
            <div class="field" data-block-horizontal-field><label>Fim da numeração</label><input name="numberEnd" type="number" min="1" value="${escapeHtml(blockForm.numberEnd || "")}" placeholder="Ex.: 40"></div>
            <label class="checkline field full"><input type="checkbox" name="generateUnits" value="true"> Gerar unidades automaticamente ao salvar</label>
            <div class="field full"><div class="row-actions modal-actions"><button class="secondary" type="button" data-cancel-project-block>Cancelar</button><button class="primary" type="submit">Salvar bloco</button></div></div>
          </form>
        ` : ""}
        <div class="table-wrap">
          <table><thead><tr><th>Tipo</th><th>Modelo</th><th>Nome</th><th>Detalhe</th><th>Cobertura</th><th>Unidades previstas</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Nenhum bloco ou quadra cadastrado</td></tr>'}</tbody></table>
        </div>
      </section>
    </div>
  `;
}

function bindProjectBlockLayoutToggle() {
  const selector = document.querySelector("[data-block-layout-select]");
  if (!selector) return;
  const sync = () => {
    const isHorizontal = selector.value === "Horizontal";
    document.querySelectorAll("[data-block-vertical-field]").forEach((field) => {
      field.hidden = isHorizontal;
    });
    document.querySelectorAll("[data-block-horizontal-field]").forEach((field) => {
      field.hidden = !isHorizontal;
    });
  };
  selector.addEventListener("change", sync);
  sync();
}

function renderProjectVisualMapEditor(projectName = "") {
  const project = projectDefinitionByName(projectName);
  const visualMap = visualMapForProject(project);
  const image = visualMap.image || (isReservaGuinleProject(projectName) ? "/reserva-guinle-masterplan.jpeg" : "");
  const units = virtualUnitsForProject(projectName).sort((a, b) => String(a.samCode || a.unit || "").localeCompare(String(b.samCode || b.unit || ""), "pt-BR", { numeric: true, sensitivity: "base" }));
  const editingHotspot = visualMap.hotspots.find((hotspot) => hotspot.id === state.visualMapEditingHotspotId) || null;
  const unitOptions = units.map((unit) => `
    <option value="${escapeHtml(unit.id)}" ${state.visualMapNewUnitId === unit.id ? "selected" : ""}>
      ${escapeHtml(unit.unit || unit.samCode || "-")} · ${escapeHtml(unit.samCode || "-")}
    </option>
  `).join("");
  const hotspotRows = visualMap.hotspots.map((hotspot) => {
    const unit = unitForVisualHotspot(hotspot, units);
    const isEditing = state.visualMapEditingHotspotId === hotspot.id;
    return `
      <tr class="${isEditing ? "selected-row" : ""}">
        <td>${escapeHtml(unit?.unit || hotspot.unit || "-")}</td>
        <td>${escapeHtml(unit?.samCode || hotspot.unitSamCode || "-")}</td>
        <td>${hotspot.points.length}</td>
        <td>${renderSettingsActionMenu(`visual-hotspot-${hotspot.id}`, [
          `<button type="button" data-edit-visual-hotspot="${escapeHtml(hotspot.id)}">Editar polígono</button>`,
          `<button type="button" data-clear-visual-hotspot="${escapeHtml(hotspot.id)}">Limpar polígono</button>`,
          `<button type="button" class="danger-menu-item" data-delete-visual-hotspot="${escapeHtml(hotspot.id)}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  const overlayHotspots = visualMap.hotspots.map((hotspot) => {
    const unit = unitForVisualHotspot(hotspot, units);
    const label = availabilityStatusLabel(unit || {});
    const color = unitStatusStyle(label);
    const centroid = visualMapHotspotCentroid(hotspot.points);
    const points = visualMapSvgPoints(hotspot.points);
    const isEditing = state.visualMapEditingHotspotId === hotspot.id;
    return `
      ${points ? `<polygon class="visual-map-hotspot-shape editor-shape ${isEditing ? "active" : ""}" points="${escapeHtml(points)}" style="--unit-status-color:${escapeHtml(color)}" data-edit-visual-hotspot="${escapeHtml(hotspot.id)}"></polygon>` : ""}
      <circle class="visual-map-hotspot-dot editor-dot ${isEditing ? "active" : ""}" cx="${centroid.x}" cy="${centroid.y}" r="${isEditing ? "1.9" : "1.35"}" style="--unit-status-color:${escapeHtml(color)}" data-edit-visual-hotspot="${escapeHtml(hotspot.id)}"></circle>
      ${(hotspot.points || []).map((point, index) => `<circle class="visual-map-hotspot-point ${isEditing ? "active" : ""}" cx="${point.x}" cy="${point.y}" r="0.75" data-remove-visual-point="${escapeHtml(hotspot.id)}:${index}"></circle>`).join("")}
    `;
  }).join("");
  return `
    <section class="panel visual-map-editor-panel">
      <div class="panel-head">
        <div>
          <h2>Mapa visual</h2>
          <p class="muted-copy">${escapeHtml(projectName)}</p>
        </div>
        <div class="row-actions">
          <button type="button" data-back-projects>Voltar</button>
          <button type="button" class="primary" data-save-project-map>Salvar mapa</button>
        </div>
      </div>
      <div class="visual-map-editor-layout">
        <div class="visual-map-editor-main">
          <div class="field">
            <label>Imagem do mapa</label>
            <input id="visualMapImageInput" type="file" accept="image/png,image/jpeg,image/webp">
          </div>
          ${image ? `
            <div class="visual-map-editor-canvas" data-visual-map-canvas>
              <img class="availability-masterplan-image" src="${escapeHtml(image)}" alt="Mapa visual ${escapeHtml(projectName)}">
              <svg class="visual-map-overlay visual-map-editor-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                ${overlayHotspots}
              </svg>
            </div>
          ` : '<div class="empty visual-map-editor-empty">Suba uma imagem para começar a cadastrar os hotspots.</div>'}
          <p class="muted-copy">Selecione um hotspot e clique na imagem para montar o polígono. Clique nos pontos pequenos para removê-los.</p>
        </div>
        <aside class="visual-map-editor-side">
          <h3>Gestão de hotspots</h3>
          <div class="form-grid compact-grid">
            <div class="field full">
              <label>Unidade</label>
              <select id="visualMapUnitSelect">
                <option value="">Selecione</option>
                ${unitOptions}
              </select>
            </div>
            <div class="field full">
              <button type="button" class="primary full-width" data-add-visual-hotspot>Adicionar hotspot</button>
            </div>
          </div>
          ${editingHotspot ? `<p class="chip chip-warning">Editando ${escapeHtml(unitForVisualHotspot(editingHotspot, units)?.unit || editingHotspot.unitSamCode || "hotspot")}</p>` : ""}
          <div class="table-wrap compact-table-wrap">
            <table><thead><tr><th>Unidade</th><th>Código SAM</th><th>Pontos</th><th>Ações</th></tr></thead><tbody>${hotspotRows || '<tr><td colspan="4" class="empty">Nenhum hotspot cadastrado</td></tr>'}</tbody></table>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function updateLocalProjectVisualMap(projectName, updater) {
  const index = (state.projectDefinitions || []).findIndex((project) => project.name === projectName);
  if (index < 0) return null;
  const current = state.projectDefinitions[index];
  const currentMap = visualMapForProject(current);
  const nextMap = updater(currentMap) || currentMap;
  state.projectDefinitions[index] = { ...current, visualMap: visualMapForProject(nextMap) };
  return state.projectDefinitions[index];
}

function bindProjectVisualMapEditor(projectName = "") {
  document.querySelector("[data-back-projects]")?.addEventListener("click", () => {
    state.settingsEditing = null;
    state.visualMapEditingHotspotId = "";
    state.visualMapNewUnitId = "";
    renderSettings();
  });
  document.querySelector("#visualMapUnitSelect")?.addEventListener("change", (event) => {
    state.visualMapNewUnitId = event.currentTarget.value;
  });
  document.querySelector("#visualMapImageInput")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const image = await readOptimizedVisualMapImage(file);
      updateLocalProjectVisualMap(projectName, (visualMap) => ({ ...visualMap, image }));
      renderSettings();
    } catch (error) {
      alert(error.message || "Não foi possível carregar o mapa.");
    } finally {
      event.currentTarget.value = "";
    }
  });
  document.querySelector("[data-add-visual-hotspot]")?.addEventListener("click", () => {
    const unitId = state.visualMapNewUnitId || document.querySelector("#visualMapUnitSelect")?.value || "";
    const unit = virtualUnitsForProject(projectName).find((item) => item.id === unitId);
    if (!unit) {
      alert("Selecione uma unidade para criar o hotspot.");
      return;
    }
    const hotspot = {
      id: `hotspot-${Date.now()}`,
      unitId: unit.id,
      unitSamCode: unit.samCode || "",
      unit: unit.unit || "",
      points: []
    };
    updateLocalProjectVisualMap(projectName, (visualMap) => ({ ...visualMap, hotspots: [...visualMap.hotspots, hotspot] }));
    state.visualMapEditingHotspotId = hotspot.id;
    renderSettings();
  });
  document.querySelector("[data-save-project-map]")?.addEventListener("click", async () => {
    const index = (state.projectDefinitions || []).findIndex((project) => project.name === projectName);
    if (index < 0) return;
    const project = state.projectDefinitions[index];
    const button = document.querySelector("[data-save-project-map]");
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api(`/api/projects/${index}`, { method: "PATCH", body: JSON.stringify(project) });
      state.projects = data.projects;
      state.projectDefinitions = data.projectDefinitions || [];
      state.settingsEditing = null;
      state.visualMapEditingHotspotId = "";
      state.visualMapNewUnitId = "";
      await loadState();
      alert("Mapa visual salvo.");
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
      alert(error.message || "Não foi possível salvar o mapa visual.");
    }
  });
  document.querySelectorAll("[data-edit-visual-hotspot]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      state.visualMapEditingHotspotId = element.dataset.editVisualHotspot;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-clear-visual-hotspot]").forEach((button) => {
    button.addEventListener("click", () => {
      updateLocalProjectVisualMap(projectName, (visualMap) => ({
        ...visualMap,
        hotspots: visualMap.hotspots.map((hotspot) => hotspot.id === button.dataset.clearVisualHotspot ? { ...hotspot, points: [] } : hotspot)
      }));
      state.visualMapEditingHotspotId = button.dataset.clearVisualHotspot;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-visual-hotspot]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("Excluir este hotspot?")) return;
      updateLocalProjectVisualMap(projectName, (visualMap) => ({
        ...visualMap,
        hotspots: visualMap.hotspots.filter((hotspot) => hotspot.id !== button.dataset.deleteVisualHotspot)
      }));
      if (state.visualMapEditingHotspotId === button.dataset.deleteVisualHotspot) state.visualMapEditingHotspotId = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-remove-visual-point]").forEach((point) => {
    point.addEventListener("click", (event) => {
      event.stopPropagation();
      const [hotspotId, indexText] = point.dataset.removeVisualPoint.split(":");
      const pointIndex = Number(indexText);
      updateLocalProjectVisualMap(projectName, (visualMap) => ({
        ...visualMap,
        hotspots: visualMap.hotspots.map((hotspot) => {
          if (hotspot.id !== hotspotId) return hotspot;
          return { ...hotspot, points: hotspot.points.filter((_, index) => index !== pointIndex) };
        })
      }));
      state.visualMapEditingHotspotId = hotspotId;
      renderSettings();
    });
  });
  document.querySelector("[data-visual-map-canvas]")?.addEventListener("click", (event) => {
    if (!state.visualMapEditingHotspotId) {
      alert("Selecione ou crie um hotspot antes de marcar o polígono.");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    updateLocalProjectVisualMap(projectName, (visualMap) => ({
      ...visualMap,
      hotspots: visualMap.hotspots.map((hotspot) => hotspot.id === state.visualMapEditingHotspotId
        ? { ...hotspot, points: [...hotspot.points, normalizeVisualMapPoint({ x, y })] }
        : hotspot)
    }));
    renderSettings();
  });
}

function renderProjectSettings() {
  const isCreating = state.settingsEditing === "new-project";
  const editIndex = state.settingsEditing?.startsWith("project:") ? Number(state.settingsEditing.replace("project:", "")) : null;
  const editProject = editIndex != null ? (state.projectDefinitions || [])[editIndex] || { name: state.projects[editIndex] || "", unitPrefixes: [] } : null;
  const unitModalProject = state.settingsEditing?.startsWith("units:") ? state.settingsEditing.replace("units:", "") : "";
  const blockModalProject = state.settingsEditing?.startsWith("blocks:") ? state.settingsEditing.replace("blocks:", "") : "";
  const visualMapProject = state.settingsEditing?.startsWith("visual-map:") ? state.settingsEditing.replace("visual-map:", "") : "";
  if (visualMapProject) {
    settingsLayout(renderProjectVisualMapEditor(visualMapProject));
    bindSettingsCommon();
    bindSettingsActionMenus();
    bindProjectVisualMapEditor(visualMapProject);
    return;
  }
  const isCreatingUnit = state.editUnitId === "__new__";
  const editUnit = state.editUnitId && !isCreatingUnit ? (state.unitDefinitions || []).find((unit) => unit.id === state.editUnitId) : null;
  const formValue = editProject?.name || "";
  const prefixValue = (editProject?.unitPrefixes || []).join(", ");
  const availabilityEnabledValue = editProject?.availabilityEnabled !== false;
  const availabilitySettings = state.availabilitySettings || { architectureOptions: [], typologyOptions: [] };
  const unitForm = editUnit || {
    project: unitModalProject || state.selectedAvailabilityProject || state.projects[0] || "",
    unit: "",
    block: "1",
    floor: "",
    column: "",
    samCode: "",
    usefulArea: "",
    privateArea: "",
    sunPosition: "",
    unitType: "",
    architecture: "",
    typology: "",
    idealFraction: "",
    view: "",
    status: "",
    buyerName: "",
    leadId: "",
    floorPlanName: "",
    floorPlanMime: "",
    floorPlanDataUrl: ""
  };
  const optionTags = (items) => (items || []).map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  const selectOptions = (items, current, placeholder = "Selecione") => `
    <option value="">${escapeHtml(placeholder)}</option>
    ${items.map((item) => `<option value="${escapeHtml(item)}" ${current === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
  `;
  const rows = (state.projects || []).map((project, index) => {
    const definition = (state.projectDefinitions || []).find((item) => item.name === project) || {};
    const leadCount = state.leads.filter((lead) => lead.desiredProject === project).length;
    const formCount = (state.integrations?.metaForms?.forms || []).filter((form) => form.project === project).length;
    const unitCount = (state.unitDefinitions || []).filter((unit) => unit.project === project).length;
    const blockCount = (definition.blockDefinitions || []).length;
    return `
      <tr>
        <td>${escapeHtml(project)}</td>
        <td>${escapeHtml((definition.unitPrefixes || []).join(", ") || "-")}</td>
        <td>${definition.availabilityEnabled !== false ? '<span class="status-ok">Ativo</span>' : '<span class="muted-cell">Inativo</span>'}</td>
        <td>${blockCount}</td>
        <td>${unitCount}</td>
        <td>${leadCount}</td>
        <td>${formCount}</td>
        <td>${renderSettingsActionMenu(`project-${index}`, [
          `<button type="button" data-open-project-blocks="${escapeHtml(project)}">Blocos/quadras</button>`,
          `<button type="button" data-open-project-units="${escapeHtml(project)}">Unidades</button>`,
          `<button type="button" data-edit-project="${index}">Editar</button>`,
          `<button type="button" class="danger-menu-item" data-delete-project="${index}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  const unitRows = (state.unitDefinitions || []).filter((unit) => !unitModalProject || unit.project === unitModalProject).map((unit) => `
    <tr>
      <td>${escapeHtml(unit.unit)}</td>
      <td>${escapeHtml(unit.block || "-")}</td>
      <td>${escapeHtml(unitFloorLabel(unit.floor))}</td>
      <td>${escapeHtml(unitColumnLabel(unit.column))}</td>
      <td>${escapeHtml(unit.status || "Disponível")}</td>
      <td>${escapeHtml(unit.buyerName || "-")}</td>
      <td>${renderSettingsActionMenu(`unit-${unit.id}`, [
        `<button type="button" data-edit-unit="${escapeHtml(unit.id)}">Editar</button>`,
        `<button type="button" class="danger-menu-item" data-delete-unit="${escapeHtml(unit.id)}">Excluir</button>`
      ])}</td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Empreendimentos</h2>
        <button class="primary" data-new-project>Cadastrar novo</button>
      </div>
      ${(isCreating || editIndex != null) ? `
        <form id="projectForm" class="form-grid editor">
          <div class="field"><label>Nome do empreendimento</label><input name="name" value="${escapeHtml(formValue)}" required></div>
          <div class="field"><label>Siglas das unidades</label><input name="unitPrefixes" value="${escapeHtml(prefixValue)}" placeholder="Ex.: GCR, RGL, RES"></div>
          <div class="field full">
            <label class="subtle-check inline-subtle-check">
              <input type="checkbox" name="availabilityEnabled" value="true" ${availabilityEnabledValue ? "checked" : ""}>
              <span>Exibir na tela de disponibilidade</span>
            </label>
          </div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Empreendimento</th><th>Siglas</th><th>Disponibilidade</th><th>Blocos/quadras</th><th>Unidades</th><th>Leads usando</th><th>Forms Meta</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">Nenhum empreendimento cadastrado</td></tr>'}</tbody></table>
      </div>
    </section>
    ${renderProjectBlockSettingsModal(blockModalProject)}
    ${renderUnitSettingsModal(unitModalProject, unitRows, unitForm, editUnit, isCreatingUnit, availabilitySettings, selectOptions, optionTags)}
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  document.querySelector("[data-new-project]")?.addEventListener("click", () => {
    state.settingsEditing = "new-project";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `project:${button.dataset.editProject}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este empreendimento? Ele deixará de aparecer nos menus suspensos.")) return;
      const data = await api(`/api/projects/${button.dataset.deleteProject}`, { method: "DELETE" });
      state.projects = data.projects;
      await loadState();
      renderSettings();
    });
  });
  document.querySelectorAll("[data-open-project-units]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `units:${button.dataset.openProjectUnits}`;
      state.editUnitId = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-open-project-blocks]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `blocks:${button.dataset.openProjectBlocks}`;
      state.editBlockId = "";
      renderSettings();
    });
  });
  document.querySelector("#projectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { name: form.get("name"), unitPrefixes: form.get("unitPrefixes"), availabilityEnabled: form.has("availabilityEnabled") };
    const data = editIndex != null
      ? await api(`/api/projects/${editIndex}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    state.projects = data.projects;
    state.projectDefinitions = data.projectDefinitions || [];
    state.settingsEditing = null;
    await loadState();
    renderSettings();
  });
  document.querySelector("[data-new-project-block]")?.addEventListener("click", () => {
    if (!state.settingsEditing?.startsWith("blocks:")) return;
    state.editBlockId = "__new__";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-project-block]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editBlockId = button.dataset.editProjectBlock;
      renderSettings();
    });
  });
  document.querySelector("[data-cancel-project-block]")?.addEventListener("click", () => {
    state.editBlockId = "";
    renderSettings();
  });
  document.querySelectorAll("[data-close-block-modal], [data-block-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.hasAttribute("data-block-modal-backdrop")) return;
      state.settingsEditing = null;
      state.editBlockId = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-project-block]").forEach((button) => {
    button.addEventListener("click", async () => {
      const projectName = state.settingsEditing?.startsWith("blocks:") ? state.settingsEditing.replace("blocks:", "") : "";
      const projectIndex = (state.projectDefinitions || []).findIndex((project) => project.name === projectName);
      const projectDefinition = projectDefinitionByName(projectName);
      if (projectIndex < 0) return;
      if (!confirm("Excluir este bloco/quadra? As unidades já geradas não serão apagadas.")) return;
      const nextBlocks = (projectDefinition.blockDefinitions || []).filter((block) => block.id !== button.dataset.deleteProjectBlock);
      const data = await api(`/api/projects/${projectIndex}`, { method: "PATCH", body: JSON.stringify({ ...projectDefinition, blockDefinitions: nextBlocks }) });
      state.projects = data.projects;
      state.projectDefinitions = data.projectDefinitions || [];
      state.editBlockId = "";
      await loadState();
      renderSettings();
    });
  });
  document.querySelectorAll("[data-generate-project-block]").forEach((button) => {
    button.addEventListener("click", async () => {
      const projectName = state.settingsEditing?.startsWith("blocks:") ? state.settingsEditing.replace("blocks:", "") : "";
      const data = await api("/api/units/generate", { method: "POST", body: JSON.stringify({ project: projectName, blockId: button.dataset.generateProjectBlock }) });
      state.unitDefinitions = data.unitDefinitions || state.unitDefinitions;
      alert(`Unidades geradas/atualizadas: ${data.generated || 0}`);
      await loadState();
      renderSettings();
    });
  });
  bindProjectBlockLayoutToggle();
  document.querySelector("#projectBlockModalForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const projectName = state.settingsEditing?.startsWith("blocks:") ? state.settingsEditing.replace("blocks:", "") : "";
    const projectIndex = (state.projectDefinitions || []).findIndex((project) => project.name === projectName);
    const projectDefinition = projectDefinitionByName(projectName);
    if (projectIndex < 0) return;
    const blockDefinitions = projectDefinition.blockDefinitions || [];
    const isCreatingBlock = state.editBlockId === "__new__";
    const editBlock = state.editBlockId && !isCreatingBlock ? blockDefinitions.find((block) => block.id === state.editBlockId) : null;
    const form = new FormData(event.currentTarget);
    const layoutType = form.get("layoutType") === "Horizontal" ? "Horizontal" : "Vertical";
    const blockName = String(form.get("block") || "").trim();
    const floorCount = Math.max(0, Number.parseInt(form.get("floorCount") || "0", 10) || 0);
    const columnCount = Math.max(0, Number.parseInt(form.get("columnCount") || "0", 10) || 0);
    const numberStart = Math.max(0, Number.parseInt(form.get("numberStart") || "0", 10) || 0);
    const numberEnd = Math.max(0, Number.parseInt(form.get("numberEnd") || "0", 10) || 0);
    if (!blockName) {
      alert("Informe o nome do bloco/quadra.");
      return;
    }
    if (layoutType === "Vertical" && (!floorCount || !columnCount)) {
      alert("Informe pavimentos e colunas para blocos verticais.");
      return;
    }
    if (layoutType === "Horizontal" && (!numberStart || !numberEnd || numberEnd < numberStart)) {
      alert("Informe início e fim da numeração para estruturas horizontais.");
      return;
    }
    const blockPayload = {
      id: editBlock?.id || `block-${Date.now()}`,
      structureType: form.get("structureType") || (layoutType === "Horizontal" ? "Quadra" : "Bloco"),
      layoutType,
      block: blockName,
      floorCount: layoutType === "Vertical" ? floorCount : 0,
      columnCount: layoutType === "Vertical" ? columnCount : 0,
      hasPenthouse: layoutType === "Vertical" && form.get("hasPenthouse") === "true",
      penthouseFloors: layoutType === "Vertical" ? (editBlock?.penthouseFloors || []) : [],
      unitPrefix: layoutType === "Horizontal" ? String(form.get("unitPrefix") || "").trim() : "",
      numberStart: layoutType === "Horizontal" ? numberStart : 0,
      numberEnd: layoutType === "Horizontal" ? numberEnd : 0
    };
    const nextBlocks = editBlock
      ? blockDefinitions.map((block) => block.id === editBlock.id ? blockPayload : block)
      : [...blockDefinitions, blockPayload];
    const data = await api(`/api/projects/${projectIndex}`, { method: "PATCH", body: JSON.stringify({ ...projectDefinition, blockDefinitions: nextBlocks }) });
    state.projects = data.projects;
    state.projectDefinitions = data.projectDefinitions || [];
    state.editBlockId = "";
    if (form.get("generateUnits") === "true") {
      const generated = await api("/api/units/generate", { method: "POST", body: JSON.stringify({ project: projectName, blockId: blockPayload.id }) });
      state.unitDefinitions = generated.unitDefinitions || state.unitDefinitions;
      alert(`Bloco salvo. Unidades geradas/atualizadas: ${generated.generated || 0}`);
    }
    await loadState();
    renderSettings();
  });
  document.querySelector("[data-new-unit]")?.addEventListener("click", () => {
    if (!state.settingsEditing?.startsWith("units:")) return;
    state.editUnitId = "__new__";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editUnitId = button.dataset.editUnit;
      renderSettings();
    });
  });
  document.querySelector("[data-cancel-unit]")?.addEventListener("click", () => {
    state.editUnitId = "";
    renderSettings();
  });
  document.querySelectorAll("[data-close-unit-modal], [data-unit-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.hasAttribute("data-unit-modal-backdrop")) return;
      state.settingsEditing = null;
      state.editUnitId = "";
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-unit]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir esta unidade?")) return;
      const data = await api(`/api/units/${encodeURIComponent(button.dataset.deleteUnit)}`, { method: "DELETE" });
      state.unitDefinitions = data.unitDefinitions || state.unitDefinitions;
      await loadState();
      renderSettings();
    });
  });
  document.querySelector("#unitForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    fillGeneratedUnitFields(event.currentTarget, true);
    const form = new FormData(event.currentTarget);
    const file = form.get("floorPlan");
    const current = state.editUnitId ? (state.unitDefinitions || []).find((unit) => unit.id === state.editUnitId) : null;
    const payload = {
      project: form.get("project"),
      unit: form.get("unit"),
      block: form.get("block"),
      floor: form.get("floor"),
      column: form.get("column"),
      samCode: form.get("samCode"),
      usefulArea: form.get("usefulArea"),
      privateArea: form.get("privateArea"),
      sunPosition: form.get("sunPosition"),
      unitType: form.get("unitType"),
      architecture: form.get("architecture"),
      typology: form.get("typology"),
      idealFraction: form.get("idealFraction"),
      view: form.get("view"),
      status: form.get("status"),
      buyerName: form.get("buyerName"),
      leadId: form.get("leadId"),
      floorPlanName: current?.floorPlanName || "",
      floorPlanMime: current?.floorPlanMime || "",
      floorPlanDataUrl: current?.floorPlanDataUrl || ""
    };
    if (file && file.size) {
      if (file.size > 1200000) {
        alert("A planta precisa ter até 1,2 MB nesta versão.");
        return;
      }
      payload.floorPlanName = file.name;
      payload.floorPlanMime = file.type;
      payload.floorPlanDataUrl = await readFileAsDataUrl(file);
    }
    const isEditingExistingUnit = state.editUnitId && state.editUnitId !== "__new__";
    const data = isEditingExistingUnit
      ? await api(`/api/units/${encodeURIComponent(state.editUnitId)}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/api/units", { method: "POST", body: JSON.stringify(payload) });
    state.unitDefinitions = data.unitDefinitions || state.unitDefinitions;
    state.editUnitId = "";
    await loadState();
    renderSettings();
  });
  bindUnitCodeAutofill();
}

function fillGeneratedUnitFields(form, force = false) {
  if (!form) return;
  const project = form.elements.project?.value || "";
  const block = form.elements.block?.value || "";
  const floor = form.elements.floor?.value || "";
  const column = form.elements.column?.value || "";
  const generated = generatedUnitCodes(project, block, floor, column);
  if (generated.unit && (force || !form.elements.unit?.value)) form.elements.unit.value = generated.unit;
  if (generated.samCode && (force || !form.elements.samCode?.value)) form.elements.samCode.value = generated.samCode;
}

function bindUnitCodeAutofill() {
  const form = document.querySelector("#unitForm");
  if (!form) return;
  const refresh = () => fillGeneratedUnitFields(form);
  form.elements.project?.addEventListener("change", () => {
    const current = form.elements.block?.value || "";
    if (form.elements.block) {
      form.elements.block.innerHTML = `<option value="">Selecione</option>${blockDefinitionsForProject(form.elements.project.value).map((block) => `<option value="${escapeHtml(padUnitPart(block.block, 2))}" ${padUnitPart(block.block, 2) === padUnitPart(current, 2) ? "selected" : ""}>${escapeHtml(block.structureType || "Bloco")} ${escapeHtml(padUnitPart(block.block, 2))}</option>`).join("")}`;
    }
    refresh();
  });
  ["project", "block", "floor", "column"].forEach((name) => {
    form.elements[name]?.addEventListener("input", refresh);
    form.elements[name]?.addEventListener("change", refresh);
  });
}

function renderStatusSettings() {
  const isCreating = state.settingsEditing === "new-status";
  const editIndex = state.settingsEditing?.startsWith("status:") ? Number(state.settingsEditing.replace("status:", "")) : null;
  const editStatus = editIndex != null ? (state.statusDefinitions || [])[editIndex] || { status: state.statuses[editIndex] || "", samCodes: [] } : null;
  const canEditMetaIntegration = canManageSystemSettings();
  const metaConversions = canEditMetaIntegration ? normalizeMetaConversions(state.integrations || {}) : normalizeMetaConversions({});
  const metaEvents = metaConversions.events || [];
  const formValue = editStatus?.status || "";
  const samCodesValue = (editStatus?.samCodes || []).join(", ");
  const advanceModeValue = editStatus?.advanceMode || "manual";
  const availabilityColorValue = editStatus?.availabilityColor || "#e5e7eb";
  const statusMapping = editStatus ? (metaConversions.statusMappings?.[editStatus.status] || {}) : {};
  const rows = state.statuses.map((status, index) => {
    const definition = (state.statusDefinitions || []).find((item) => item.status === status) || {};
    const mapping = metaConversions.statusMappings?.[status] || {};
    const count = state.leads.filter((lead) => lead.inPipeline && lead.status === status).length;
    return `
      <tr>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml((definition.samCodes || []).join(", ") || "-")}</td>
        <td>${escapeHtml(statusAdvanceLabel(status))}</td>
        <td><span class="color-swatch" style="background:${escapeHtml(definition.availabilityColor || "#e5e7eb")}"></span>${escapeHtml(definition.availabilityColor || "-")}</td>
        ${canEditMetaIntegration ? `<td>${mapping.enabled ? escapeHtml(metaConversionEventLabel(metaEvents, mapping.eventId)) : '<span class="muted-cell">Não enviar</span>'}</td>` : ""}
        <td>${index + 1}</td>
        <td>${count}</td>
        <td>${renderSettingsActionMenu(`status-${index}`, [
          `<button type="button" data-edit-status="${index}">Editar</button>`,
          `<button type="button" class="danger-menu-item" data-delete-status="${index}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Status do pipeline</h2>
        <button class="primary" data-new-status>Cadastrar novo</button>
      </div>
      ${(isCreating || editIndex != null) ? `
        <form id="statusForm" class="form-grid editor">
          <div class="field"><label>Nome do status</label><input name="name" value="${escapeHtml(formValue)}" required></div>
          <div class="field"><label>Códigos recebidos do SAM</label><input name="samCodes" value="${escapeHtml(samCodesValue)}" placeholder="Ex.: reservation_created, reserva"></div>
          <div class="field"><label>Avanço do status</label><select name="advanceMode">
            <option value="manual" ${advanceModeValue === "manual" ? "selected" : ""}>Manual</option>
            <option value="sam_only" ${advanceModeValue === "sam_only" ? "selected" : ""}>Somente pelo SAM</option>
          </select></div>
          <div class="field"><label>Cor no quadro de disponibilidade</label><input name="availabilityColor" type="color" value="${escapeHtml(availabilityColorValue)}"></div>
          ${canEditMetaIntegration ? `
          <div class="field"><label>Enviar evento Meta</label><select name="metaConversionEnabled">
            <option value="false" ${!statusMapping.enabled ? "selected" : ""}>Não</option>
            <option value="true" ${statusMapping.enabled ? "selected" : ""}>Sim</option>
          </select></div>
          <div class="field"><label>Evento Meta associado</label><select name="metaConversionEventId">${metaConversionEventOptions(metaEvents, statusMapping.eventId || "")}</select></div>
          ` : ""}
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Status</th><th>Códigos SAM</th><th>Avanço</th><th>Cor disponibilidade</th>${canEditMetaIntegration ? "<th>Evento Meta</th>" : ""}<th>Ordem</th><th>Leads usando</th><th>Ações</th></tr></thead><tbody>${rows || `<tr><td colspan="${canEditMetaIntegration ? 8 : 7}" class="empty">Nenhum status cadastrado</td></tr>`}</tbody></table>
      </div>
    </section>
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  document.querySelector("[data-new-status]")?.addEventListener("click", () => {
    state.settingsEditing = "new-status";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `status:${button.dataset.editStatus}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este status?")) return;
      await api(`/api/statuses/${button.dataset.deleteStatus}`, { method: "DELETE" });
      await loadState();
      renderSettings();
    });
  });
  document.querySelector("#statusForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      samCodes: form.get("samCodes"),
      advanceMode: form.get("advanceMode"),
      availabilityColor: form.get("availabilityColor")
    };
    if (canEditMetaIntegration) {
      payload.metaConversionEnabled = form.get("metaConversionEnabled") === "true";
      payload.metaConversionEventId = String(form.get("metaConversionEventId") || "").trim();
    }
    if (editIndex != null) {
      const data = await api(`/api/statuses/${editIndex}`, { method: "PATCH", body: JSON.stringify(payload) });
      state.statuses = data.pipelineStatuses || state.statuses;
      state.statusDefinitions = data.statusDefinitions || state.statusDefinitions;
    } else {
      const data = await api("/api/statuses", { method: "POST", body: JSON.stringify(payload) });
      state.statuses = data.pipelineStatuses || state.statuses;
      state.statusDefinitions = data.statusDefinitions || state.statusDefinitions;
    }
    state.settingsEditing = null;
    await loadState();
    renderSettings();
  });
}

function renderTagSettings() {
  const isCreating = state.settingsEditing === "new-tag";
  const editTag = state.tagDefinitions.find((tag) => state.settingsEditing === `tag:${tag.id}`);
  const canEditMetaIntegration = canManageSystemSettings();
  const metaConversions = canEditMetaIntegration ? normalizeMetaConversions(state.integrations || {}) : normalizeMetaConversions({});
  const metaEvents = metaConversions.events || [];
  const formTag = editTag || { name: "", color: "#0f766e" };
  const tagMapping = editTag ? (metaConversions.tagMappings?.[editTag.id] || {}) : {};
  const rows = state.tagDefinitions.map((tag) => {
    const count = state.leads.filter((lead) => leadTags(lead).includes(tag.name)).length;
    const mapping = metaConversions.tagMappings?.[tag.id] || {};
    return `
      <tr>
        <td><span class="tag static-tag" style="--tag-color:${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span></td>
        <td><span class="color-swatch" style="background:${escapeHtml(tag.color)}"></span>${escapeHtml(tag.color)}</td>
        ${canEditMetaIntegration ? `<td>${mapping.enabled ? escapeHtml(metaConversionEventLabel(metaEvents, mapping.eventId)) : '<span class="muted-cell">Não enviar</span>'}</td>` : ""}
        <td>${count}</td>
        <td>${renderSettingsActionMenu(`tag-${tag.id}`, [
          `<button type="button" data-edit-tag="${escapeHtml(tag.id)}">Editar</button>`,
          `<button type="button" class="danger-menu-item" data-delete-tag="${escapeHtml(tag.id)}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Etiquetas</h2>
        <button class="primary" data-new-tag>Cadastrar novo</button>
      </div>
      ${(isCreating || editTag) ? `
        <form id="tagForm" class="form-grid editor">
          <div class="field"><label>Nome da etiqueta</label><input name="name" value="${escapeHtml(formTag.name)}" required></div>
          <div class="field"><label>Cor</label><input name="color" type="color" value="${escapeHtml(formTag.color)}"></div>
          ${canEditMetaIntegration ? `
          <div class="field"><label>Enviar evento Meta</label><select name="metaConversionEnabled">
            <option value="false" ${!tagMapping.enabled ? "selected" : ""}>Não</option>
            <option value="true" ${tagMapping.enabled ? "selected" : ""}>Sim</option>
          </select></div>
          <div class="field"><label>Evento Meta associado</label><select name="metaConversionEventId">${metaConversionEventOptions(metaEvents, tagMapping.eventId || "")}</select></div>
          ` : ""}
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Etiqueta</th><th>Cor</th>${canEditMetaIntegration ? "<th>Evento Meta</th>" : ""}<th>Leads usando</th><th>Ações</th></tr></thead><tbody>${rows || `<tr><td colspan="${canEditMetaIntegration ? 5 : 4}" class="empty">Nenhuma etiqueta cadastrada</td></tr>`}</tbody></table>
      </div>
    </section>
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  document.querySelector("[data-new-tag]")?.addEventListener("click", () => {
    state.settingsEditing = "new-tag";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `tag:${button.dataset.editTag}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-tag]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir esta etiqueta? Ela será removida dos leads que a usam.")) return;
      const data = await api(`/api/tags/${button.dataset.deleteTag}`, { method: "DELETE" });
      state.tagDefinitions = data.tagDefinitions;
      await loadState();
      renderSettings();
    });
  });
  document.querySelector("#tagForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      color: form.get("color")
    };
    if (canEditMetaIntegration) {
      payload.metaConversionEnabled = form.get("metaConversionEnabled") === "true";
      payload.metaConversionEventId = String(form.get("metaConversionEventId") || "").trim();
    }
    const data = editTag
      ? await api(`/api/tags/${editTag.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/api/tags", { method: "POST", body: JSON.stringify(payload) });
    state.tagDefinitions = data.tagDefinitions;
    state.settingsEditing = null;
    await loadState();
    renderSettings();
  });
}

function bindSettingsCommon() {
  document.querySelectorAll("[data-cancel-settings]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = null;
      renderSettings();
    });
  });
}

function renderApp() {
  if (state.view === "password-setup") return renderPasswordSetup();
  if (viewNeedsLeads() && !hasLoadedLeadsForView()) {
    const retry = state.leadsLoadError ? `<button class="primary" data-retry-leads>Carregar novamente</button>` : "";
    renderShell(`
      <section class="panel">
        <h2>${state.leadsLoadError ? "Não foi possível carregar os leads" : "Carregando leads"}</h2>
        <p class="muted-copy">${escapeHtml(state.leadsLoadError || "Preparando os dados desta tela.")}</p>
        ${retry}
      </section>
    `);
    document.querySelector("[data-retry-leads]")?.addEventListener("click", () => {
      state.leadsLoadError = "";
      invalidateLeads();
      renderApp();
    });
    if (!state.leadsLoading && !state.leadsLoadError) {
      loadLeads().then(() => {
        if (viewNeedsLeads()) renderApp();
      });
    }
    return;
  }
  if (state.view === "lead") return renderLeadDetail();
  if (state.view === "kanban") return renderKanban();
  if (state.view === "availability") return renderAvailability();
  if (state.view === "sheet") return renderSheet();
  if (state.view === "odysseia") return renderLeadBases();
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "salesReport") return renderSalesReportView();
  if (state.view === "finance") return renderLevFinanceView();
  if (state.view === "settings") return renderSettings();
  if (state.view === "knowledge") return renderKnowledgeView();
}

(async function boot() {
  try {
    syncRouteFromLocation();
    if (state.view === "password-setup") {
      renderPasswordSetup();
      return;
    }
    await loadState();
    renderApp();
    startPresencePolling();
    trackAccess();
  } catch {
    renderLogin();
  }
})();

document.addEventListener("visibilitychange", () => {
  if (!state.user) return;
  if (document.hidden) {
    stopPresencePolling();
    return;
  }
  refreshPresence({ silent: false }).catch(() => {});
  startPresencePolling();
});

window.addEventListener("popstate", () => {
  syncRouteFromLocation();
  if (state.view === "password-setup") {
    renderPasswordSetup();
    return;
  }
  if (state.user) {
    renderApp();
    trackAccess();
  }
});
