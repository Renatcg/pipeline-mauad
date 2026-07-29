const app = document.querySelector("#app");
const INACTIVITY_LIMIT_MS = 1000 * 60 * 5;
let knowledgeTypingTimer = null;
let pageSearchRenderTimer = null;
const MANUAL_BASE_SOURCES = ["Stand", "Lista RMeirelles"];

const state = {
  user: null,
  roles: [],
  statuses: [],
  projects: [],
  tagDefinitions: [],
  users: [],
  leads: [],
  integrations: null,
  auditLog: [],
  accessLog: [],
  fupLeadLog: [],
  integrationLog: [],
  levFinance: null,
  knowledgeCategories: [],
  knowledgeArticles: [],
  knowledgeChatSessions: [],
  canManageKnowledge: false,
  canCreateKnowledge: false,
  metaDiagnostics: null,
  view: "kanban",
  leadId: null,
  previousView: "kanban",
  settingsTab: "users",
  settingsEditing: null,
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
  levFinanceSearch: "",
  levFinanceTab: "pending",
  levFinanceExtraction: null,
  mobileNavOpen: false,
  lastAccessLogKey: "",
  creatingLead: false,
  createLeadDraft: null,
  createLeadDuplicate: null,
  createLeadImpactPrompt: false,
  baseSource: "TODOS",
  baseSort: { key: "name", direction: "asc" },
  sheetSort: { key: "name", direction: "asc" },
  projectFilters: [],
  brokerFilters: [],
  favoriteRequests: {},
  brokerMenuBound: false,
  inactivityTimer: null,
  favoritesOnly: false,
  search: ""
};

const profileAccess = {
  "Admin TI": ["kanban", "sheet", "odysseia", "dashboard", "finance", "settings", "knowledge"],
  "Head Comercial": ["kanban", "sheet", "odysseia", "dashboard", "settings", "knowledge"],
  "Supervisor Comercial": ["kanban", "sheet", "odysseia", "dashboard", "knowledge"],
  Diretoria: ["dashboard", "sheet", "odysseia", "kanban", "knowledge"],
  Corretor: ["kanban", "sheet", "odysseia", "knowledge"],
  "Gerente Financeiro": ["finance", "settings", "knowledge"],
  "Auxiliar Financeiro": ["finance", "settings", "knowledge"]
};

const routeByView = {
  kanban: "/kanban",
  sheet: "/planilha",
  odysseia: "/bases",
  dashboard: "/dashboard",
  finance: "/financeiro-lev",
  settings: "/configuracoes",
  knowledge: "/ajuda"
};

const viewByRoute = {
  "/": "kanban",
  "/kanban": "kanban",
  "/planilha": "sheet",
  "/bases": "odysseia",
  "/dashboard": "dashboard",
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

function renderChatText(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replaceAll("\n", "<br>");
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
  const views = profileAccess[state.user?.role] || [];
  return views.filter((view) => view !== "finance" || canAccessLevFinance());
}

function clearInactivityTimer() {
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
  state.inactivityTimer = null;
}

function resetInactivityTimer() {
  if (!state.user) return;
  clearInactivityTimer();
  state.inactivityTimer = setTimeout(async () => {
    state.user = null;
    try {
      await api("/api/logout", { method: "POST" });
    } catch {}
    history.pushState({}, "", "/login");
    renderLogin("Sessão expirada por inatividade.");
  }, INACTIVITY_LIMIT_MS);
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

function canAccessLevFinance() {
  return (state.user?.role === "Admin TI" && String(state.user?.username || "").toLowerCase() === "admin")
    || ["Gerente Financeiro", "Auxiliar Financeiro"].includes(state.user?.role);
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
    return;
  }
  state.view = viewByRoute[path] || "kanban";
  state.leadId = null;
}

function routeTo(view, leadId = null) {
  state.view = view;
  state.leadId = leadId;
  const path = view === "lead" ? `/leads/${encodeURIComponent(leadId)}` : routeByView[view] || "/kanban";
  if (window.location.pathname !== path) history.pushState({}, "", path);
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
    sheet: "Planilha",
    odysseia: "Bases",
    dashboard: "Dashboard",
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
    return [lead.name, lead.phone, lead.email, lead.assistant, lead.assignedName, lead.externalId, lead.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
}

function pipelineLeads() {
  return filteredLeads().filter((lead) => {
    if (!lead.inPipeline) return false;
    if (state.user?.role === "Corretor" && lead.assignedTo !== state.user.id) return false;
    if (state.projectFilters.length && !state.projectFilters.includes(leadProjectValue(lead))) return false;
    if (state.brokerFilters.length && !state.brokerFilters.includes(lead.assignedTo || "__none__")) return false;
    return true;
  });
}

function odysseiaLeads() {
  return filteredLeads().filter((lead) => lead.source === "ODYSSEIA");
}

function hasBaseHistory(lead) {
  return Boolean(lead.sourceStatus || lead.odysseiaStatus);
}

function isAvailableBaseLead(lead) {
  if (!lead.inPipeline) return true;
  return hasBaseHistory(lead) && !lead.assignedTo;
}

function baseSources() {
  let sources = [...new Set(state.leads
    .filter((lead) => isAvailableBaseLead(lead) || lead.source === "META" || MANUAL_BASE_SOURCES.includes(lead.source))
    .map((lead) => lead.source)
    .filter(Boolean))].sort();
  for (const source of MANUAL_BASE_SOURCES) {
    if (!sources.includes(source)) sources.push(source);
  }
  if (sources.includes("ODYSSEIA")) sources.unshift(...sources.splice(sources.indexOf("ODYSSEIA"), 1));
  if (sources.includes("META")) sources.push(...sources.splice(sources.indexOf("META"), 1));
  return sources.length ? ["TODOS", ...sources.filter((source) => source !== "TODOS")] : [];
}

function baseLeads() {
  const sources = baseSources();
  if (!sources.includes(state.baseSource)) state.baseSource = sources[0] || "TODOS";
  return sortBaseLeads(filteredLeads().filter((lead) => {
    if (state.baseSource === "META") return lead.source === "META";
    if (MANUAL_BASE_SOURCES.includes(state.baseSource)) return lead.source === state.baseSource;
    if (!isAvailableBaseLead(lead)) return false;
    return state.baseSource === "TODOS" || lead.source === state.baseSource;
  }));
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
  return sortLeadsForTable(leads, state.baseSort, { blankHistoricalBaseStatus: true });
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
    return source === "TODOS" ? sources.length > 0 : sources.includes(source);
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
            ${message ? `<div class="success">${escapeHtml(message)}</div>` : ""}
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
      resetInactivityTimer();
      await loadState();
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
  resetInactivityTimer();
  state.roles = data.roles;
  state.statuses = data.pipelineStatuses;
  state.projects = data.projects || ["Reserva Guinle", "Golf Club Resort"];
  state.tagDefinitions = data.tagDefinitions || [];
  state.users = data.users;
  state.leads = data.leads;
  state.integrations = data.integrations;
  state.integrationLog = data.integrationLog || [];
  state.auditLog = data.auditLog;
  state.accessLog = data.accessLog || [];
  state.fupLeadLog = data.fupLeadLog || [];
  state.levFinance = data.levFinance || null;
  state.knowledgeCategories = data.knowledgeCategories || [];
  state.knowledgeArticles = data.knowledgeArticles || [];
  state.knowledgeChatSessions = data.knowledgeChatSessions || [];
  state.canManageKnowledge = Boolean(data.canManageKnowledge);
  state.canCreateKnowledge = Boolean(data.canCreateKnowledge);
  if (state.view !== "lead" && !allowedViews().includes(state.view)) state.view = allowedViews()[0];
}

function navButton(view, icon, label) {
  if (!allowedViews().includes(view)) return "";
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}" title="${label}"><span>${icon}</span>${label}</button>`;
}

function renderShell(content) {
  app.innerHTML = `
    <section class="shell">
      <aside class="side">
        <div class="side-head">
          <div class="brand">
            <strong>Pipeline Comercial</strong>
            <span>Construtora Mauad</span>
          </div>
          <button class="mobile-menu-button" type="button" data-mobile-menu aria-expanded="${state.mobileNavOpen ? "true" : "false"}">Menu</button>
        </div>
        <nav class="nav ${state.mobileNavOpen ? "open" : ""}">
          ${navButton("kanban", "▦", "Kanban")}
          ${navButton("sheet", "▤", "Planilha")}
          ${navButton("odysseia", "◎", "Bases")}
          ${navButton("dashboard", "◫", "Dashboard")}
          ${navButton("finance", "▣", "Financeiro Lev")}
          ${navButton("settings", "⚙", "Configurações")}
          ${navButton("knowledge", "?", "Ajuda")}
        </nav>
      </aside>
      <section class="main">
        <header class="topbar">
          <div class="user-pill">
            <strong>${escapeHtml(state.user.name)}</strong>
            <span>${escapeHtml(state.user.role)}</span>
            <button id="logout">Sair</button>
          </div>
        </header>
        <div class="content">${content}</div>
      </section>
    </section>
    ${state.creatingLead ? renderCreateLeadModal() : ""}
  `;
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
  document.querySelector("#logout").addEventListener("click", async () => {
    clearInactivityTimer();
    state.user = null;
    await api("/api/logout", { method: "POST" });
    history.pushState({}, "", "/login");
    renderLogin();
  });
}

function renderViewHead(title, subtitle = "", options = {}) {
  const showAddLead = Boolean(options.addLead && canCreateLeads());
  const pipelineFilters = options.pipelineFilters ? renderPipelineFilterControls() : "";
  const filters = options.filters ? `
    <div class="page-filters ${showAddLead ? "with-add-lead" : ""}">
      ${showAddLead ? '<button id="addLeadButton" class="primary add-lead-button">Adicionar Lead</button>' : ""}
      ${pipelineFilters}
      <input id="pageSearch" value="${escapeHtml(state.search)}" placeholder="Buscar lead, telefone, fase ou corretor">
      <button id="pageFavoriteToggle" class="${state.favoritesOnly ? "primary" : ""}" title="Filtrar favoritos">★</button>
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
  return `
    <details class="multi-filter" id="${escapeHtml(id)}">
      <summary>${escapeHtml(label)} <strong>${escapeHtml(filterSummary(selected, "Todos"))}</strong></summary>
      <div class="multi-filter-menu">
        ${options.map((option) => `
          <label>
            <input type="checkbox" data-multi-filter="${escapeHtml(id)}" value="${escapeHtml(option.value)}" ${selected.includes(option.value) ? "checked" : ""}>
            <span>${escapeHtml(option.label)}</span>
          </label>
        `).join("")}
      </div>
    </details>
  `;
}

function renderPipelineFilterControls() {
  const projectOptions = state.projects
    .map((project) => ({ value: project, label: project }))
    .filter((option) => option.value);
  const brokerOptions = [
    { value: "__none__", label: "Sem corretor" },
    ...activeBrokers().map((broker) => ({ value: broker.id, label: broker.name }))
  ];
  return `
    ${renderMultiFilter("projectFilters", "Empreendimento", state.projectFilters, projectOptions)}
    ${canManageLeads() ? renderMultiFilter("brokerFilters", "Corretor", state.brokerFilters, brokerOptions) : ""}
  `;
}

function bindPageFilters() {
  const search = document.querySelector("#pageSearch");
  const favoriteToggle = document.querySelector("#pageFavoriteToggle");
  const addLeadButton = document.querySelector("#addLeadButton");
  let composingSearch = false;
  const scheduleSearchRender = () => {
    if (pageSearchRenderTimer) clearTimeout(pageSearchRenderTimer);
    pageSearchRenderTimer = setTimeout(() => {
      pageSearchRenderTimer = null;
      renderApp();
      requestAnimationFrame(() => {
        const nextSearch = document.querySelector("#pageSearch");
        if (!nextSearch) return;
        nextSearch.focus({ preventScroll: true });
        const position = nextSearch.value.length;
        nextSearch.setSelectionRange(position, position);
      });
    }, 320);
  };
  const scheduleFilterRender = () => {
    if (pageSearchRenderTimer) clearTimeout(pageSearchRenderTimer);
    pageSearchRenderTimer = setTimeout(() => {
      pageSearchRenderTimer = null;
      renderApp();
    }, 420);
  };
  search?.addEventListener("compositionstart", () => {
    composingSearch = true;
  });
  search?.addEventListener("compositionend", (event) => {
    composingSearch = false;
    state.search = event.target.value;
    scheduleSearchRender();
  });
  search?.addEventListener("input", (event) => {
    state.search = event.target.value;
    if (!composingSearch) scheduleSearchRender();
  });
  search?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (pageSearchRenderTimer) clearTimeout(pageSearchRenderTimer);
    pageSearchRenderTimer = null;
    renderApp();
  });
  favoriteToggle?.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderApp();
  });
  document.querySelectorAll("[data-multi-filter]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const key = event.target.dataset.multiFilter;
      if (!["projectFilters", "brokerFilters"].includes(key)) return;
      const value = event.target.value;
      const selected = new Set(state[key]);
      if (event.target.checked) selected.add(value);
      else selected.delete(value);
      state[key] = [...selected];
      scheduleFilterRender();
    });
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
  const statusOptions = state.statuses.map((status, index) => `<option value="${escapeHtml(status)}" ${(draft.status ? draft.status === status : index === 0) ? "selected" : ""}>${escapeHtml(status)}</option>`).join("");
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

function refreshFavoriteButtons(lead) {
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    if (button.dataset.favorite !== lead.id) return;
    button.textContent = lead.favorite ? "★" : "☆";
    button.classList.toggle("primary", Boolean(lead.favorite));
  });
}

function brokerRedirectControl(lead) {
  if (!canManageLeads()) return "";
  const brokers = activeBrokers();
  return `
    <div class="broker-menu" data-assign-menu="${escapeHtml(lead.id)}">
      <button class="broker-menu-button" data-toggle-assign-menu="${escapeHtml(lead.id)}" title="Direcionar para corretor" ${brokers.length ? "" : "disabled"}>⋮</button>
      <div class="broker-menu-list">
        <button data-assign-broker="${escapeHtml(lead.id)}" data-broker-id="" ${lead.assignedTo ? "" : "disabled"}>Sem corretor</button>
        ${brokers.map((broker) => `<button data-assign-broker="${escapeHtml(lead.id)}" data-broker-id="${escapeHtml(broker.id)}" ${broker.id === lead.assignedTo ? "disabled" : ""}>${escapeHtml(broker.name)}</button>`).join("")}
      </div>
    </div>
  `;
}

function leadCard(lead) {
  const broker = activeBrokerForLead(lead);
  return `
    <article class="card" draggable="true" data-lead="${escapeHtml(lead.id)}" data-open-lead="${escapeHtml(lead.id)}">
      <div class="card-title">
        <button class="favorite-inline" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button>
        <strong>${escapeHtml(lead.name)}</strong>
        ${brokerRedirectControl(lead)}
      </div>
      <div class="meta">
        <span>${escapeHtml(lead.phone || "Sem telefone")}</span>
        <span>${escapeHtml(broker?.name || "Sem corretor")}</span>
      </div>
      ${renderLeadTags(lead, true)}
    </article>
  `;
}

function renderKanban() {
  const leads = pipelineLeads();
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
        <div class="column-head" draggable="true" data-column-drag="${index}" title="Arraste para ordenar">
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
      if (event.target.closest("button, select, input, textarea, a, [data-assign-menu], [data-tag-menu]")) return;
      state.previousView = state.view === "lead" ? state.previousView : state.view;
      routeTo("lead", element.dataset.openLead);
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
      const assignedTo = button.dataset.brokerId || null;
      const previous = { assignedTo: lead.assignedTo, assignedName: lead.assignedName };
      const broker = state.users.find((user) => user.id === assignedTo);
      lead.assignedTo = assignedTo;
      lead.assignedName = broker?.name || "";
      try {
        setButtonBusy(button, true, "Direcionando...");
        await patchLead(lead.id, { assignedTo });
        renderApp();
      } catch (error) {
        Object.assign(lead, previous);
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
      const lead = state.leads.find((item) => item.id === draggedId);
      const status = column.dataset.status;
      if (!lead) return;
      const cards = [...column.querySelectorAll(".card")]
        .filter((card) => card.dataset.lead !== draggedId);
      const beforeCard = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });
      const insertIndex = beforeCard ? cards.indexOf(beforeCard) : cards.length;
      const orderedIds = cards.map((card) => card.dataset.lead);
      orderedIds.splice(insertIndex, 0, draggedId);
      const aboveLead = insertIndex > 0 ? state.leads.find((item) => item.id === orderedIds[insertIndex - 1]) : null;
      const belowLead = insertIndex < orderedIds.length - 1 ? state.leads.find((item) => item.id === orderedIds[insertIndex + 1]) : null;
      const aboveOrder = Number(aboveLead?.order || 0);
      const belowOrder = Number(belowLead?.order || 0);
      let nextOrder = Date.now();
      if (aboveLead && belowLead) nextOrder = (aboveOrder + belowOrder) / 2;
      else if (aboveLead) nextOrder = aboveOrder - 1000;
      else if (belowLead) nextOrder = Math.max(Date.now(), belowOrder + 1000);
      const result = await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, order: nextOrder })
      });
      Object.assign(lead, result.lead);
      renderApp();
    });
  });
}

function bindColumnDragDrop() {
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
    <tr data-open-lead="${escapeHtml(lead.id)}">
      <td><button class="icon favorite" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button></td>
      <td>${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.phone)}</td>
      <td>${escapeHtml(leadEmailForTable(lead))}</td>
      <td>
        ${(options.readOnlyStatus || options.textStatus) ? escapeHtml(leadBaseStatus(lead, options)) : `<select data-status-select="${escapeHtml(lead.id)}">
          ${state.statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === lead.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
        </select>`}
      </td>
      <td>${escapeHtml(lead.assignedName || userName(lead.assignedTo))}</td>
      <td>${escapeHtml(lead.source)}</td>
      <td>${renderLeadTags(lead, !options.withRescue)}</td>
      <td>${
        options.withRollback && lead.inPipeline && canRollbackLead(lead)
          ? `<button data-rollback="${escapeHtml(lead.id)}">Rollback</button>`
          : options.withRescue
            ? (lead.inPipeline ? (canRollbackLead(lead) ? `<button data-rollback="${escapeHtml(lead.id)}">Rollback</button>` : '<span class="chip">No pipeline</span>') : `<button class="primary" data-rescue="${escapeHtml(lead.id)}">Resgatar</button>`)
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
      renderFn();
    });
  });
}

function bindRollbackControls(renderFn) {
  document.querySelectorAll("[data-rollback]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Enviar este lead para a base Pipeline GDrive?")) return;
      try {
        setButtonBusy(button, true, "Voltando...");
        const result = await api(`/api/leads/${button.dataset.rollback}/rollback`, { method: "POST" });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderFn();
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
      ${sources.map((source) => `<button class="${state.baseSource === source ? "active" : ""}" data-base-source="${escapeHtml(source)}">${escapeHtml(baseSourceLabel(source))}</button>`).join("")}
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
  const pending = leads.filter((lead) => !lead.inPipeline).length;
  const rescued = leads.filter((lead) => lead.inPipeline).length;
  const totalBase = baseLeadCount(state.baseSource);
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
  `);
  bindLeadActions();
  bindTableSortControls(renderLeadBases);
  document.querySelectorAll("[data-base-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.baseSource = button.dataset.baseSource;
      renderLeadBases();
    });
  });
  document.querySelectorAll("[data-rescue]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setButtonBusy(button, true, "Resgatando...");
        let assignToSelf = false;
        if (["Head Comercial", "Supervisor Comercial"].includes(state.user?.role) && currentUserCanOperateAsBroker()) {
          assignToSelf = confirm("Deseja resgatar este lead vinculado a você como corretor?\n\nOK: resgatar vinculado a você.\nCancelar: resgatar sem corretor para vincular depois.");
        }
        const result = await api(`/api/leads/${button.dataset.rescue}/rescue`, { method: "POST", body: JSON.stringify({ assignToSelf }) });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderLeadBases();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  bindRollbackControls(renderLeadBases);
}

function leadProjectValue(lead) {
  if (lead.desiredProject) return lead.desiredProject;
  const project = String(lead.project || "");
  if (project.toLowerCase().includes("guinle")) return "Reserva Guinle";
  if (project.toLowerCase().includes("golf")) return "Golf Club Resort";
  return "";
}

function metaAdUrlForLead(lead) {
  if (lead.meta?.adUrl) return lead.meta.adUrl;
  const formId = String(lead.meta?.formId || "").trim();
  if (!formId) return "";
  const form = (state.integrations?.metaForms?.forms || [])
    .find((item) => String(item.id || "").trim() === formId);
  const adId = String(lead.meta?.adId || "").trim();
  const adLink = (form?.adLinks || []).find((item) => String(item.id || "").trim() === adId);
  return String(adLink?.url || form?.adUrl || "").trim();
}

function metaFormConfigForLead(lead) {
  const formId = String(lead.meta?.formId || "").trim();
  if (!formId) return {};
  return (state.integrations?.metaForms?.forms || [])
    .find((item) => String(item.id || "").trim() === formId) || {};
}

function friendlyMetaValue(value, labels = {}) {
  const text = String(value || "");
  return labels[text] || text;
}

function renderMetaLeadInfo(lead) {
  if (lead.source !== "META" || !lead.meta) return "";
  const formConfig = metaFormConfigForLead(lead);
  const ignoredFields = new Set(["email", "full_name", "phone_number", "nome", "telefone", "celular"]);
  const answerRows = Object.entries(lead.meta.rawFields || {})
    .filter(([question]) => !ignoredFields.has(String(question || "").toLowerCase()))
    .map(([question, answer]) => `
    <article class="answer-item">
      <span>${escapeHtml(friendlyMetaValue(question, formConfig.questionLabels))}</span>
      <strong>${escapeHtml(friendlyMetaValue(answer, formConfig.answerLabels))}</strong>
    </article>
  `).join("");
  const adUrl = metaAdUrlForLead(lead);
  return `
    <section class="panel meta-detail-panel">
      <h2>Respostas do formulário</h2>
      <div class="answers-list">${answerRows || '<div class="empty">Nenhuma resposta recebida.</div>'}</div>
      <div class="meta-ad-link">
        <span>URL do anúncio</span>
        ${adUrl ? `<a href="${escapeHtml(adUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(adUrl)}</a>` : "<strong>Não cadastrada</strong>"}
      </div>
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
          <span>${escapeHtml(new Date(comment.createdAt).toLocaleString("pt-BR"))}</span>
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
  return `
    <div class="panel">
      <h2>Interesse</h2>
      <div class="interest-grid">
        <div class="field"><label>Empreendimento desejado</label><select name="desiredProject" form="leadDetailForm">
          <option value="">Selecione</option>
          ${projectOptions(project)}
        </select></div>
        <div class="field"><label>Unidade</label><input name="desiredUnit" form="leadDetailForm" value="${escapeHtml(lead.desiredUnit || lead.unit || "")}"></div>
        <div class="field"><label>Valor da unidade</label><input name="unitValue" form="leadDetailForm" value="${escapeHtml(lead.unitValue || lead.value || "")}"></div>
      </div>
    </div>
  `;
}

function renderLeadDetail() {
  const lead = state.leads.find((item) => item.id === state.leadId);
  if (!lead) {
    renderShell(`
      ${renderViewHead("Lead não encontrado", "Este registro não está disponível para o seu perfil")}
      <button data-back-lead>Voltar</button>
    `);
    document.querySelector("[data-back-lead]")?.addEventListener("click", () => routeTo(state.previousView || "kanban"));
    return;
  }

  const comments = [...(Array.isArray(lead.comments) ? lead.comments : [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const project = leadProjectValue(lead);
  const statusField = lead.inPipeline ? `
    <select name="status" ${canManageLeads() ? "" : "disabled"}>
      ${state.statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === lead.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
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
            <div class="field"><label>Criado em</label><input value="${escapeHtml(lead.createdAt ? new Date(lead.createdAt).toLocaleString("pt-BR") : "")}" disabled></div>
            <div class="field"><label>Nome</label><input name="name" value="${escapeHtml(lead.name)}" required></div>
            <div class="field"><label>Telefone</label><input name="phone" value="${escapeHtml(lead.phone || "")}"></div>
            <div class="field"><label>E-mail</label><input name="email" type="email" value="${escapeHtml(lead.email || "")}"></div>
            <div class="field"><label>Status do pipeline</label>${statusField}</div>
            <div class="field"><label>Corretor</label>${brokerField}</div>
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
    }
    await patchLead(lead.id, payload);
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
  const leads = pipelineLeads();
  const data = metrics(leads);
  const max = Math.max(...state.statuses.map((status) => leads.filter((lead) => lead.status === status).length), 1);
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
    ${renderViewHead("Dashboard", "Indicadores de volume de lead e funil", { filters: true })}
    <section class="metrics">
      <div class="metric"><span>Volume total</span><strong>${data.total}</strong></div>
      <div class="metric"><span>Ativos</span><strong>${data.active}</strong></div>
      <div class="metric"><span>Favoritos</span><strong>${data.favorites}</strong></div>
      <div class="metric"><span>Em bases</span><strong>${baseLeadCount()}</strong></div>
    </section>
    ${renderFunnelInfographic(leads)}
    <section class="dashboard-grid">
      <div class="panel"><h2>Funil</h2>${funnel}</div>
      <div class="panel">
        <h2>Corretores</h2>
        <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Leads</th><th>Status</th></tr></thead><tbody>${brokers}</tbody></table></div>
      </div>
    </section>
  `);
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
        <div class="funnel-bar" style="--funnel-width:${width}%; --funnel-color:${color}">
          <span>${escapeHtml(item.status)}</span>
          <strong>${item.count}</strong>
        </div>
        ${next ? `<div class="funnel-conversion">${conversion == null ? "0%" : `${conversion}%`} para ${escapeHtml(next.status)}</div>` : ""}
      </div>
    `;
  }).join("");
  return `<section class="panel funnel-panel"><h2>Conversão do funil</h2><div class="funnel-visual">${stages}</div></section>`;
}

function settingsTabButton(tab, label) {
  return `<button class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}">${label}</button>`;
}

function settingsLayout(content) {
  renderShell(`
    ${renderViewHead("Configurações", "Cadastros administrativos do sistema")}
      <div class="tabs">
        ${canManageUsers() ? settingsTabButton("users", "Usuários") : ""}
        ${canManageSystemSettings() ? settingsTabButton("integrations", "Integrações") : ""}
        ${canManagePipelineSettings() ? settingsTabButton("statuses", "Status do pipeline") : ""}
        ${canManagePipelineSettings() ? settingsTabButton("tags", "Etiquetas") : ""}
        ${canManageSystemSettings() ? settingsTabButton("logs", "Logs") : ""}
        ${canManagePipelineSettings() ? settingsTabButton("projects", "Empreendimentos") : ""}
        ${canManageLevFinanceSettings() ? settingsTabButton("levFinance", "Financeiro Lev") : ""}
        ${canManageSystemSettings() ? settingsTabButton("backup", "Backup") : ""}
        ${canManageSystemSettings() ? settingsTabButton("knowledge", "Base de conhecimento") : ""}
    </div>
    ${content}
  `);
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
  if (["integrations", "logs", "knowledge", "backup"].includes(state.settingsTab) && !canManageSystemSettings()) state.settingsTab = "users";
  if (["statuses", "tags", "projects"].includes(state.settingsTab) && !canManagePipelineSettings()) state.settingsTab = "users";
  if (state.settingsTab === "levFinance" && !canManageLevFinanceSettings()) state.settingsTab = "users";
  if (state.settingsTab === "users" && !canManageUsers()) state.settingsTab = canManageLevFinanceSettings() ? "levFinance" : "knowledge";
  if (state.settingsTab === "integrations") return renderIntegrationSettings();
  if (state.settingsTab === "statuses") return renderStatusSettings();
  if (state.settingsTab === "tags") return renderTagSettings();
  if (state.settingsTab === "logs") return renderLogSettings();
  if (state.settingsTab === "projects") return renderProjectSettings();
  if (state.settingsTab === "levFinance") return renderLevFinanceSettings();
  if (state.settingsTab === "backup") return renderBackupSettings();
  if (state.settingsTab === "knowledge") return renderKnowledgeSettings();
  return renderUserSettings();
}

function renderSettingsActionMenu(menuId, actions) {
  return `
    <div class="action-menu">
      <button type="button" class="action-menu-button" data-settings-action-menu="${escapeHtml(menuId)}" title="Ações" aria-label="Ações">⋮</button>
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
        whatsappNumber: form.get("whatsappNumber")
      },
      operatesAsBroker: form.get("operatesAsBroker") === "on"
    };
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
  return `
    <div class="modal-backdrop" data-user-modal-backdrop>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="userModalTitle">
        <div class="panel-head">
          <h2 id="userModalTitle">${isEditing ? "Editar usuário" : "Cadastrar usuário"}</h2>
          <button type="button" class="icon" data-cancel-settings title="Fechar">×</button>
        </div>
        <form id="userForm" class="form-grid">
          <div class="field"><label>Nome</label><input name="name" value="${escapeHtml(formUser.name || "")}" required autofocus></div>
          <div class="field"><label>E-mail de acesso</label><input name="username" type="email" value="${escapeHtml(formUser.username || "")}" ${isEditing ? "disabled" : "required"}></div>
          <div class="field"><label>Perfil</label><select name="role">${roleOptions.map((role) => `<option ${role === formUser.role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}</select></div>
          <div class="field"><label>Status</label><select name="active"><option value="true" ${formUser.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${formUser.active === false ? "selected" : ""}>Inativo</option></select></div>
          <div class="field full"><label>Operação comercial</label><label class="checkline settings-check"><input type="checkbox" name="operatesAsBroker" ${formUser.operatesAsBroker ? "checked" : ""}> Operar também como corretor</label><small>Quando ativo para Head ou Supervisor, o usuário pode receber leads como corretor sem perder a visão gerencial.</small></div>
          <div class="field"><label>Notificar por e-mail</label><label class="checkline settings-check"><input type="checkbox" name="notifyEmail" ${formUser.notifications?.email ? "checked" : ""}> Receber novos leads</label></div>
          <div class="field"><label>Notificar por WhatsApp</label><label class="checkline settings-check"><input type="checkbox" name="notifyWhatsapp" ${formUser.notifications?.whatsapp ? "checked" : ""}> Receber novos leads</label></div>
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
  const rows = (state.accessLog || [])
    .filter((item) => item.actor === selectedUser.username)
    .map((item) => `
      <tr>
        <td>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))}</td>
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
          `<button type="button" data-edit-meta-form="${form.index}">Editar</button>`,
          form.archived
            ? `<button type="button" data-restore-meta-form="${form.index}">Restaurar</button>`
            : `<button type="button" data-archive-meta-form="${form.index}">Arquivar</button>`
        ])}
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
        <h2>Importar lead Meta por ID</h2>
        <form id="metaLeadImportForm" class="form-grid compact-form">
          <div class="field"><label>Leadgen ID</label><input name="leadgenId" required placeholder="Cole o leadgen_id do teste"></div>
          <div class="field"><label>&nbsp;</label><button class="primary" type="submit">Importar lead</button></div>
        </form>
      </section>
    </section>
    ${isFormModalOpen ? renderMetaFormModal(formValue, editIndex != null) : ""}
  `);
  bindSettingsCommon();
  bindSettingsActionMenus();
  document.querySelector("[data-new-meta-form]")?.addEventListener("click", () => {
    state.settingsEditing = "new-meta-form";
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
  document.querySelector("[data-sync-meta-recent]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      setButtonBusy(button, true, "Sincronizando...");
      const data = await api("/api/integrations/meta/sync-recent", {
        method: "POST",
        body: JSON.stringify({ days: 7 })
      });
      state.settingsNotice = `Sincronização concluída: ${data.created} novo(s), ${data.duplicates} já existente(s), ${data.errors.length} erro(s).`;
      await loadState();
      state.settingsTab = "integrations";
      renderSettings();
    } catch (error) {
      setButtonBusy(button, false);
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
    RESCUE_BASE_LEAD: "Resgatou da base"
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

function renderLogSettings() {
  const term = state.settingsLogSearch.trim().toLowerCase();
  const matches = (value) => !term || String(value || "").toLowerCase().includes(term);
  const integrationRows = (state.integrationLog || [])
    .filter((item) => {
      const details = JSON.stringify(item.details || {});
      return [item.provider, item.action, details, item.details?.leadgenId, item.details?.error].some(matches);
    })
    .map((item) => `
      <tr>
        <td>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))}</td>
        <td>${escapeHtml(item.provider || "")}</td>
        <td>${escapeHtml(item.action || "")}</td>
        <td>${escapeHtml(item.details?.leadgenId || item.details?.formId || "")}</td>
        <td>${escapeHtml(item.details?.project || item.details?.error || "")}</td>
      </tr>
    `).join("");
  const auditRows = (state.auditLog || [])
    .filter((item) => {
      const details = JSON.stringify(item.details || {});
      return [item.actor, item.action, details].some(matches);
    })
    .map((item) => `
      <tr>
        <td>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))}</td>
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
        <td>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))}</td>
        <td>${escapeHtml(item.leadName || "")}</td>
        <td>${escapeHtml(item.actorName || item.actor || "")}</td>
        <td>${escapeHtml(fupActionLabel(item.action))}</td>
        <td>${escapeHtml(fupDetailsLabel(item))}</td>
      </tr>
    `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Logs</h2>
        <div class="row-actions">
          ${state.settingsLogTab === "fup" ? '<button class="danger-button" type="button" data-clear-fup-log>Limpar FUP Lead</button>' : ""}
          <input id="settingsLogSearch" class="settings-search" placeholder="Pesquisar nos logs" value="${escapeHtml(state.settingsLogSearch)}">
        </div>
      </div>
      <div class="tabs compact-tabs log-tabs">
        <button class="${state.settingsLogTab === "audit" ? "active" : ""}" data-log-tab="audit">Auditoria</button>
        <button class="${state.settingsLogTab === "fup" ? "active" : ""}" data-log-tab="fup">FUP Lead</button>
        <button class="${state.settingsLogTab === "integration" ? "active" : ""}" data-log-tab="integration">Eventos de integração</button>
      </div>
      <div class="table-wrap log-table-wrap">
        ${state.settingsLogTab === "integration"
          ? `<table><thead><tr><th>Data</th><th>Origem</th><th>Evento</th><th>ID</th><th>Detalhe</th></tr></thead><tbody>${integrationRows || '<tr><td colspan="5" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>`
          : state.settingsLogTab === "fup"
            ? `<table><thead><tr><th>Data</th><th>Lead</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${fupRows || '<tr><td colspan="5" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>`
          : `<table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>`}
      </div>
    </section>
  `);
  document.querySelectorAll("[data-log-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsLogTab = button.dataset.logTab;
      renderLogSettings();
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
      <small>Atualizado em ${escapeHtml(article.updatedAt ? new Date(article.updatedAt).toLocaleString("pt-BR") : "-")}${article.updatedBy ? ` por ${escapeHtml(article.updatedBy)}` : ""}</small>
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
      <td>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))}</td>
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

function levSettlementClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("paga")) return "status-active";
  if (normalized.includes("não contabilizada")) return "chip chip-warning";
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
    item.note,
    item.receivedAt
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
}

function renderLevFinanceSettings() {
  const settings = state.levFinance?.settings || {};
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
        <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar configurações</button></div></div>
      </form>
    </section>
  `);
  bindSettingsCommon();
  document.querySelector("#levFinanceSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const form = new FormData(event.currentTarget);
    try {
      setButtonBusy(button, true, "Salvando...");
      const data = await api("/api/lev-finance/settings", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(form.entries()))
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
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Backup</h2>
      </div>
      ${state.settingsNotice ? `<div class="success settings-notice">${escapeHtml(state.settingsNotice)}</div>` : ""}
      <div class="form-grid editor">
        <div class="field full">
          <label>Baixar backup completo</label>
          <small>Gera um arquivo JSON com leads, usuários, configurações, logs e dados financeiros.</small>
          <div class="row-actions"><button class="primary" type="button" id="downloadBackupButton">Baixar backup</button></div>
        </div>
      </div>
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

function levStatusKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function levFinanceRow(item, options = {}) {
  const canConfirm = Boolean(options.canConfirm && item.id);
  return `
    <tr>
      <td>${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(item.client)}</td>
      <td>${escapeHtml(item.signedAt)}</td>
      <td>${money(item.contractValue)}</td>
      <td>${item.commissionValue ? money(item.commissionValue) : "-"}</td>
      <td>${escapeHtml(item.realEstate)}</td>
      <td><span class="${levSettlementClass(item.status)}">${escapeHtml(item.status || options.statusLabel || "")}</span></td>
      <td>${canConfirm ? `<button class="primary compact-button" data-confirm-lev-sale="${escapeHtml(item.id)}">Confirmar</button>` : "-"}</td>
    </tr>
  `;
}

function renderLevExtractionModal() {
  const extraction = state.levFinanceExtraction;
  if (!extraction) return "";
  const validRows = (extraction.preview || []).map((sale) => levFinanceRow({ ...sale, status: "Prévia" })).join("");
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

function renderLevFinanceView() {
  const finance = state.levFinance || { settings: {}, sales: [], receipts: [], paidUnits: [], settlements: [] };
  const term = state.levFinanceSearch.trim().toLocaleLowerCase("pt-BR");
  const matchesFinanceSearch = (item) => !term || levFinanceSearchText(item).includes(term);
  const allSales = (finance.sales || []).filter(matchesFinanceSearch);
  const pendingSales = allSales.filter((sale) => !sale.paid && !sale.eligible);
  const nfSales = allSales.filter((sale) => !sale.paid && sale.eligible).map((sale) => ({ ...sale, status: "NF/provisionamento solicitado" }));
  const settlements = (finance.settlements || []).filter(matchesFinanceSearch);
  const nfSettlements = settlements.filter((settlement) => levStatusKey(settlement.status).includes("nf"));
  const paidSettlements = settlements.filter((settlement) => levStatusKey(settlement.status) === "paga");
  const ignoredSettlements = settlements.filter((settlement) => levStatusKey(settlement.status).includes("nao contabilizada") || levStatusKey(settlement.status).includes("ignorada"));
  const nfUnits = new Set(nfSales.map((sale) => sale.unit));
  const currentRowsByTab = {
    pending: pendingSales,
    nf: [...nfSales, ...nfSettlements.filter((settlement) => !nfUnits.has(settlement.unit))],
    paid: paidSettlements,
    ignored: ignoredSettlements
  };
  const activeRows = currentRowsByTab[state.levFinanceTab] || currentRowsByTab.pending;
  const pendingContract = pendingSales.reduce((sum, sale) => sum + Number(sale.contractValue || 0), 0);
  const pendingCommission = pendingSales.reduce((sum, sale) => sum + Number(sale.commissionValue || 0), 0);
  const tableRows = activeRows.map((item) => levFinanceRow(item, { canConfirm: state.levFinanceTab === "pending" })).join("");
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
    ["nf", "NF Emitida", currentRowsByTab.nf.length],
    ["paid", "Pagas", paidSettlements.length],
    ["ignored", "Ignoradas", ignoredSettlements.length]
  ].map(([key, label, count]) => `<button class="${state.levFinanceTab === key ? "primary" : ""}" type="button" data-lev-finance-tab="${key}">${label} <span>${count}</span></button>`).join("");

  renderShell(`
    ${renderViewHead("Financeiro Lev", "Controle de vendas, recebimentos e comissão da Lev", {
      actions: `
        <input id="levImageInput" type="file" accept="image/*" hidden>
        <button class="primary" type="button" id="submitLevImageButton">Submeter imagem</button>
      `
    })}
    <section class="panel compact-panel">
      <input id="levFinanceSearch" class="settings-search" placeholder="Pesquisar por unidade, cliente, imobiliária, status ou observação" value="${escapeHtml(state.levFinanceSearch)}">
    </section>
    <section class="metrics">
      <div class="metric"><span>Pendentes</span><strong>${pendingSales.length}</strong></div>
      <div class="metric"><span>Valor pendente</span><strong>${money(pendingContract)}</strong></div>
      <div class="metric"><span>Comissão estimada</span><strong>${money(pendingCommission)}</strong></div>
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
  `);
  bindLevFinanceControls();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    reader.readAsDataURL(file);
  });
}

function bindLevFinanceControls() {
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
  document.querySelectorAll("[data-confirm-lev-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Confirmar venda, elegibilidade e enviar e-mail de aprovisionamento?")) return;
      try {
        setButtonBusy(button, true, "Enviando...");
        const data = await api(`/api/lev-finance/sales/${button.dataset.confirmLevSale}/confirm`, { method: "POST" });
        state.levFinance = data.levFinance;
        if (!data.email?.sent) alert(`Venda confirmada, mas o e-mail não foi enviado: ${data.email?.reason || "falha desconhecida"}`);
        renderLevFinanceView();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
}

function renderProjectSettings() {
  const isCreating = state.settingsEditing === "new-project";
  const editIndex = state.settingsEditing?.startsWith("project:") ? Number(state.settingsEditing.replace("project:", "")) : null;
  const formValue = editIndex != null ? state.projects[editIndex] || "" : "";
  const rows = (state.projects || []).map((project, index) => {
    const leadCount = state.leads.filter((lead) => lead.desiredProject === project).length;
    const formCount = (state.integrations?.metaForms?.forms || []).filter((form) => form.project === project).length;
    return `
      <tr>
        <td>${escapeHtml(project)}</td>
        <td>${leadCount}</td>
        <td>${formCount}</td>
        <td>${renderSettingsActionMenu(`project-${index}`, [
          `<button type="button" data-edit-project="${index}">Editar</button>`,
          `<button type="button" class="danger-menu-item" data-delete-project="${index}">Excluir</button>`
        ])}</td>
      </tr>
    `;
  }).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Empreendimentos</h2>
        <button class="primary" data-new-project>Cadastrar novo</button>
      </div>
      ${(isCreating || editIndex != null) ? `
        <form id="projectForm" class="form-grid editor">
          <div class="field full"><label>Nome do empreendimento</label><input name="name" value="${escapeHtml(formValue)}" required></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Empreendimento</th><th>Leads usando</th><th>Forms Meta</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nenhum empreendimento cadastrado</td></tr>'}</tbody></table>
      </div>
    </section>
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
  document.querySelector("#projectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { name: form.get("name") };
    const data = editIndex != null
      ? await api(`/api/projects/${editIndex}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    state.projects = data.projects;
    state.settingsEditing = null;
    await loadState();
    renderSettings();
  });
}

function renderStatusSettings() {
  const isCreating = state.settingsEditing === "new-status";
  const editIndex = state.settingsEditing?.startsWith("status:") ? Number(state.settingsEditing.replace("status:", "")) : null;
  const formValue = editIndex != null ? state.statuses[editIndex] : "";
  const rows = state.statuses.map((status, index) => {
    const count = state.leads.filter((lead) => lead.inPipeline && lead.status === status).length;
    return `
      <tr>
        <td>${escapeHtml(status)}</td>
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
          <div class="field full"><label>Nome do status</label><input name="name" value="${escapeHtml(formValue)}" required></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Status</th><th>Ordem</th><th>Leads usando</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nenhum status cadastrado</td></tr>'}</tbody></table>
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
    if (editIndex != null) {
      await api(`/api/statuses/${editIndex}`, { method: "PATCH", body: JSON.stringify({ name: form.get("name") }) });
    } else {
      await api("/api/statuses", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
    }
    state.settingsEditing = null;
    await loadState();
    renderSettings();
  });
}

function renderTagSettings() {
  const isCreating = state.settingsEditing === "new-tag";
  const editTag = state.tagDefinitions.find((tag) => state.settingsEditing === `tag:${tag.id}`);
  const formTag = editTag || { name: "", color: "#0f766e" };
  const rows = state.tagDefinitions.map((tag) => {
    const count = state.leads.filter((lead) => leadTags(lead).includes(tag.name)).length;
    return `
      <tr>
        <td><span class="tag static-tag" style="--tag-color:${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span></td>
        <td><span class="color-swatch" style="background:${escapeHtml(tag.color)}"></span>${escapeHtml(tag.color)}</td>
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
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Etiqueta</th><th>Cor</th><th>Leads usando</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nenhuma etiqueta cadastrada</td></tr>'}</tbody></table>
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
    const payload = { name: form.get("name"), color: form.get("color") };
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
  if (state.view === "lead") return renderLeadDetail();
  if (state.view === "kanban") return renderKanban();
  if (state.view === "sheet") return renderSheet();
  if (state.view === "odysseia") return renderLeadBases();
  if (state.view === "dashboard") return renderDashboard();
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
    trackAccess();
  } catch {
    renderLogin();
  }
})();

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
