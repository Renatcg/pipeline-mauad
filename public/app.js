const app = document.querySelector("#app");
const INACTIVITY_LIMIT_MS = 1000 * 60 * 5;

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
  integrationLog: [],
  view: "kanban",
  leadId: null,
  previousView: "kanban",
  settingsTab: "users",
  settingsEditing: null,
  settingsNotice: "",
  settingsLogSearch: "",
  metaFormsTab: "active",
  mobileNavOpen: false,
  lastAccessLogKey: "",
  creatingLead: false,
  baseSource: "TODOS",
  favoriteRequests: {},
  brokerMenuBound: false,
  inactivityTimer: null,
  favoritesOnly: false,
  search: ""
};

const profileAccess = {
  "Admin TI": ["kanban", "sheet", "odysseia", "dashboard", "settings"],
  "Head Comercial": ["kanban", "sheet", "odysseia", "dashboard", "settings"],
  "Supervisor Comercial": ["kanban", "sheet", "odysseia", "dashboard"],
  Diretoria: ["dashboard", "sheet", "odysseia", "kanban"],
  Corretor: ["kanban", "sheet", "odysseia"]
};

const routeByView = {
  kanban: "/kanban",
  sheet: "/planilha",
  odysseia: "/bases",
  dashboard: "/dashboard",
  settings: "/configuracoes"
};

const viewByRoute = {
  "/": "kanban",
  "/kanban": "kanban",
  "/planilha": "sheet",
  "/bases": "odysseia",
  "/dashboard": "dashboard",
  "/configuracoes": "settings"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return profileAccess[state.user?.role] || [];
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

function canManageUsers() {
  return ["Admin TI", "Head Comercial"].includes(state.user?.role);
}

function canManageSystemSettings() {
  return state.user?.role === "Admin TI";
}

function canManagePipelineSettings() {
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

function canRollbackLead(lead) {
  return canManageLeads() || (state.user?.role === "Corretor" && lead.assignedTo === state.user.id);
}

function activeBrokerForLead(lead) {
  return state.users.find((user) => user.id === lead.assignedTo && user.role === "Corretor" && user.active) || null;
}

function activeBrokers() {
  return state.users
    .filter((user) => user.role === "Corretor" && user.active)
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

function currentViewLabel() {
  const labels = {
    kanban: "Kanban",
    sheet: "Planilha",
    odysseia: "Bases",
    dashboard: "Dashboard",
    settings: "Configurações",
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
    body: JSON.stringify({ path: window.location.pathname, view: currentViewLabel() })
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
  return filteredLeads().filter((lead) => lead.inPipeline && (state.user?.role !== "Corretor" || lead.assignedTo === state.user.id));
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
    .filter((lead) => isAvailableBaseLead(lead) || lead.source === "META")
    .map((lead) => lead.source)
    .filter(Boolean))].sort();
  if (sources.includes("ODYSSEIA")) sources.unshift(...sources.splice(sources.indexOf("ODYSSEIA"), 1));
  if (sources.includes("META")) sources.push(...sources.splice(sources.indexOf("META"), 1));
  return sources.length ? ["TODOS", ...sources.filter((source) => source !== "TODOS")] : [];
}

function baseLeads() {
  const sources = baseSources();
  if (!sources.includes(state.baseSource)) state.baseSource = sources[0] || "TODOS";
  return filteredLeads().filter((lead) => {
    if (state.baseSource === "META") return lead.source === "META";
    if (!isAvailableBaseLead(lead)) return false;
    return state.baseSource === "TODOS" || lead.source === state.baseSource;
  });
}

function baseLeadCount() {
  return state.leads.filter((lead) => !lead.inPipeline).length;
}

function leadBaseStatus(lead, options = {}) {
  const source = String(lead.source || "").toUpperCase();
  if (options.blankHistoricalBaseStatus && (source.includes("RD") || source.includes("VINHOS") || source.includes("OAB"))) {
    return "";
  }
  return lead.sourceStatus || lead.odysseiaStatus || lead.status;
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
  if (window.location.pathname !== "/login") history.replaceState({}, "", "/login");
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
          ${navButton("settings", "⚙", "Configurações")}
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
  const filters = options.filters ? `
    <div class="page-filters ${showAddLead ? "with-add-lead" : ""}">
      ${showAddLead ? '<button id="addLeadButton" class="primary add-lead-button">Adicionar Lead</button>' : ""}
      <input id="pageSearch" value="${escapeHtml(state.search)}" placeholder="Buscar lead, telefone, fase ou corretor">
      <button id="pageFavoriteToggle" class="${state.favoritesOnly ? "primary" : ""}" title="Filtrar favoritos">★</button>
    </div>
  ` : "";
  return `
    <div class="view-head">
      <div class="view-title">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${filters}
    </div>
  `;
}

function bindPageFilters() {
  const search = document.querySelector("#pageSearch");
  const favoriteToggle = document.querySelector("#pageFavoriteToggle");
  const addLeadButton = document.querySelector("#addLeadButton");
  search?.addEventListener("input", (event) => {
    const cursorStart = event.target.selectionStart;
    const cursorEnd = event.target.selectionEnd;
    state.search = event.target.value;
    renderApp();
    requestAnimationFrame(() => {
      const nextSearch = document.querySelector("#pageSearch");
      if (!nextSearch) return;
      nextSearch.focus();
      nextSearch.setSelectionRange(cursorStart, cursorEnd);
    });
  });
  favoriteToggle?.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderApp();
  });
  addLeadButton?.addEventListener("click", () => {
    state.creatingLead = true;
    renderApp();
  });
}

function renderCreateLeadModal() {
  const statusOptions = state.statuses.map((status, index) => `<option value="${escapeHtml(status)}" ${index === 0 ? "selected" : ""}>${escapeHtml(status)}</option>`).join("");
  const brokerOptions = state.user?.role === "Corretor"
    ? `<option value="${escapeHtml(state.user.id)}" selected>${escapeHtml(state.user.name)}</option>`
    : `<option value="">Sem corretor</option>${activeBrokers().map((broker) => `<option value="${escapeHtml(broker.id)}">${escapeHtml(broker.name)}</option>`).join("")}`;
  return `
    <div class="modal-backdrop" data-close-create-lead>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="createLeadTitle">
        <div class="panel-head">
          <h2 id="createLeadTitle">Adicionar Lead</h2>
          <button type="button" class="icon" data-close-create-lead title="Fechar">×</button>
        </div>
        <form id="createLeadForm" class="form-grid">
          <div class="field"><label>Nome</label><input name="name" required autofocus></div>
          <div class="field"><label>Telefone</label><input name="phone"></div>
          <div class="field"><label>Status do pipeline</label><select name="status" ${state.statuses.length ? "" : "disabled"}>${statusOptions || '<option value="">Cadastre um status</option>'}</select></div>
          <div class="field"><label>Corretor</label><select name="assignedTo">${brokerOptions}</select></div>
          <div class="field"><label>Empreendimento desejado</label><select name="desiredProject">
            <option value="">Selecione</option>
            ${projectOptions()}
          </select></div>
          <div class="field"><label>Unidade</label><input name="desiredUnit"></div>
          <div class="field"><label>Valor da unidade</label><input name="unitValue"></div>
          <div class="field full"><label>Observações internas</label><textarea name="notes"></textarea></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar lead</button><button type="button" data-close-create-lead>Cancelar</button></div></div>
        </form>
      </section>
    </div>
  `;
}

function bindCreateLeadModal() {
  document.querySelectorAll("[data-close-create-lead]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && element.classList.contains("modal-backdrop")) return;
      state.creatingLead = false;
      renderApp();
    });
  });
  document.querySelector("#createLeadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/leads", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      state.leads.push(result.lead);
      state.creatingLead = false;
      state.previousView = state.view;
      routeTo("lead", result.lead.id);
    } catch (error) {
      alert(error.message);
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
    const items = (byStatus[status] || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
  renderShell(`${renderViewHead("Kanban", "Leads ativos no pipeline", { filters: true, addLead: true })}${renderMetrics(leads)}${empty}<section class="kanban">${columns}</section>`);
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
    column.addEventListener("drop", async () => {
      if (!draggedId) return;
      const lead = state.leads.find((item) => item.id === draggedId);
      const status = column.dataset.status;
      if (!lead || lead.status === status) return;
      const result = await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, order: Date.now() })
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
      ${options.hideId ? "" : `<td>${escapeHtml(lead.externalId)}</td>`}
      <td>${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.phone)}</td>
      ${options.hideAssistant ? "" : `<td>${escapeHtml(lead.assistant)}</td>`}
      <td>
        ${(options.readOnlyStatus || options.textStatus) ? escapeHtml(leadBaseStatus(lead, options)) : `<select data-status-select="${escapeHtml(lead.id)}">
          ${state.statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === lead.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
        </select>`}
      </td>
      <td>${escapeHtml(lead.assignedName || userName(lead.assignedTo))}</td>
      <td>${escapeHtml(lead.source)}</td>
      ${options.hideTags ? "" : `<td>${renderLeadTags(lead, !options.withRescue)}</td>`}
      ${options.withRescue ? `<td>${lead.inPipeline ? (canRollbackLead(lead) ? `<button data-rollback="${escapeHtml(lead.id)}">Rollback</button>` : '<span class="chip">No pipeline</span>') : `<button class="primary" data-rescue="${escapeHtml(lead.id)}">Resgatar</button>`}</td>` : ""}
    </tr>
  `).join("");
}

function renderLeadsTable(rows, options = {}) {
  const headers = [
    "<th>★</th>",
    options.hideId ? "" : "<th>ID</th>",
    "<th>Nome</th>",
    "<th>Celular</th>",
    options.hideAssistant ? "" : "<th>Assistente</th>",
    "<th>Fase atual</th>",
    "<th>Corretor</th>",
    "<th>Origem</th>",
    options.hideTags ? "" : "<th>Etiquetas</th>",
    options.withRescue ? "<th>Ação</th>" : ""
  ].join("");
  const columnCount = [
    true,
    !options.hideId,
    true,
    true,
    !options.hideAssistant,
    true,
    true,
    true,
    !options.hideTags,
    options.withRescue
  ].filter(Boolean).length;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${columnCount}" class="empty">Nenhum lead nesta visão</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderSheet() {
  const leads = pipelineLeads();
  const tableOptions = { hideId: true, hideAssistant: true, hideTags: true, textStatus: true };
  const rows = leadRows(leads, tableOptions);
  renderShell(`
    ${renderViewHead("Planilha", "Leads vindos do Meta, importações de pipeline e resgates das bases", { filters: true, addLead: true })}
    ${renderMetrics(leads)}
    ${renderLeadsTable(rows, tableOptions)}
  `);
  bindLeadActions();
}

function renderBaseSources(sources) {
  const sourceLabel = (source) => ({ TODOS: "Todos", META: "META" }[source] || source);
  return `
    <div class="tabs base-tabs">
      ${sources.map((source) => `<button class="${state.baseSource === source ? "active" : ""}" data-base-source="${escapeHtml(source)}">${escapeHtml(sourceLabel(source))}</button>`).join("")}
    </div>
  `;
}

function renderLeadBases() {
  const sources = baseSources();
  const leads = baseLeads();
  const rows = leadRows(leads, { hideId: true, readOnlyStatus: true, withRescue: true, blankHistoricalBaseStatus: true });
  const pending = leads.filter((lead) => !lead.inPipeline).length;
  const rescued = leads.filter((lead) => lead.inPipeline).length;
  renderShell(`
    ${renderViewHead("Bases de Leads", "Bases importadas separadas do pipeline comercial", { filters: true })}
    ${sources.length ? renderBaseSources(sources) : ""}
    <section class="metrics">
      <div class="metric"><span>Total da base</span><strong>${leads.length}</strong></div>
      <div class="metric"><span>A resgatar</span><strong>${pending}</strong></div>
      <div class="metric"><span>Resgatados</span><strong>${rescued}</strong></div>
      <div class="metric"><span>Origem</span><strong>${escapeHtml(state.baseSource)}</strong></div>
    </section>
    ${renderLeadsTable(rows, { hideId: true, withRescue: true })}
  `);
  bindLeadActions();
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
        const result = await api(`/api/leads/${button.dataset.rescue}/rescue`, { method: "POST" });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderLeadBases();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
  document.querySelectorAll("[data-rollback]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setButtonBusy(button, true, "Voltando...");
        const result = await api(`/api/leads/${button.dataset.rollback}/rollback`, { method: "POST" });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderLeadBases();
      } catch (error) {
        setButtonBusy(button, false);
        alert(error.message);
      }
    });
  });
}

function leadProjectValue(lead) {
  if (lead.desiredProject) return lead.desiredProject;
  const project = String(lead.project || "");
  if (project.toLowerCase().includes("guinle")) return "Reserva Guinle";
  if (project.toLowerCase().includes("golf")) return "Golf Club Resort";
  return "";
}

function renderMetaLeadInfo(lead) {
  if (lead.source !== "META" || !lead.meta) return "";
  const metaRows = [
    ["Formulário", lead.meta.formId],
    ["Campanha", lead.meta.campaignName || lead.meta.campaignId],
    ["Conjunto", lead.meta.adsetName || lead.meta.adsetId],
    ["Anúncio", lead.meta.adName || lead.meta.adId],
    ["Plataforma", lead.meta.platform],
    ["Lead ID Meta", lead.metaLeadId]
  ].filter(([, value]) => value);
  const answerRows = Object.entries(lead.meta.rawFields || {}).map(([question, answer]) => `
    <tr>
      <td>${escapeHtml(question)}</td>
      <td>${escapeHtml(answer)}</td>
    </tr>
  `).join("");
  return `
    <section class="panel meta-detail-panel">
      <h2>Origem Meta</h2>
      <div class="meta-grid">
        ${metaRows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      </div>
      <h2>Respostas do formulário</h2>
      <div class="table-wrap">
        <table class="answers-table"><thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead><tbody>${answerRows || '<tr><td colspan="2" class="empty">Nenhuma resposta recebida.</td></tr>'}</tbody></table>
      </div>
    </section>
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
      ${state.users.filter((user) => user.role === "Corretor").map((user) => `<option value="${escapeHtml(user.id)}" ${user.id === lead.assignedTo ? "selected" : ""}>${escapeHtml(user.name)}${user.active ? "" : " (inativo)"}</option>`).join("")}
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
      <div class="panel">
        <div class="panel-head">
          <h2>Dados do lead</h2>
          ${renderLeadTags(lead, true)}
        </div>
        <form id="leadDetailForm" class="form-grid">
          <div class="field"><label>Origem</label><input value="${escapeHtml(lead.source || "")}" disabled></div>
          <div class="field"><label>ID importado</label><input value="${escapeHtml(lead.externalId || "")}" disabled></div>
          <div class="field"><label>Nome</label><input name="name" value="${escapeHtml(lead.name)}" required></div>
          <div class="field"><label>Telefone</label><input name="phone" value="${escapeHtml(lead.phone || "")}"></div>
          <div class="field"><label>E-mail</label><input name="email" type="email" value="${escapeHtml(lead.email || "")}"></div>
          <div class="field"><label>Status do pipeline</label>${statusField}</div>
          <div class="field"><label>Corretor</label>${brokerField}</div>
          <div class="field"><label>Empreendimento desejado</label><select name="desiredProject">
            <option value="">Selecione</option>
            ${projectOptions(project)}
          </select></div>
          <div class="field"><label>Unidade</label><input name="desiredUnit" value="${escapeHtml(lead.desiredUnit || lead.unit || "")}"></div>
          <div class="field"><label>Valor da unidade</label><input name="unitValue" value="${escapeHtml(lead.unitValue || lead.value || "")}"></div>
          <div class="field full"><label>Observações internas</label><textarea name="notes">${escapeHtml(lead.notes || "")}</textarea></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">Salvar detalhes</button></div></div>
        </form>
      </div>
      <div class="panel">
        <h2>Comentários</h2>
        <form id="commentForm" class="comment-form">
          <textarea name="text" placeholder="Adicionar comentário"></textarea>
          <button class="primary" type="submit">Comentar</button>
        </form>
        <div class="timeline">
          ${comments.map((comment) => `
            <article class="timeline-item">
              <div>
                <strong>${escapeHtml(comment.authorName || "Usuário")}</strong>
                <span>${escapeHtml(new Date(comment.createdAt).toLocaleString("pt-BR"))}</span>
              </div>
              <p>${escapeHtml(comment.text)}</p>
            </article>
          `).join("") || '<div class="empty">Nenhum comentário ainda</div>'}
        </div>
      </div>
    </section>
    ${renderMetaLeadInfo(lead)}
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
      body: JSON.stringify({ text })
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
        ${settingsTabButton("users", "Usuários")}
        ${canManageSystemSettings() ? settingsTabButton("integrations", "Integrações") : ""}
        ${canManagePipelineSettings() ? settingsTabButton("statuses", "Status do pipeline") : ""}
        ${canManagePipelineSettings() ? settingsTabButton("tags", "Etiquetas") : ""}
        ${canManageSystemSettings() ? settingsTabButton("logs", "Logs") : ""}
        ${canManagePipelineSettings() ? settingsTabButton("projects", "Empreendimentos") : ""}
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
  if (["integrations", "logs", "knowledge"].includes(state.settingsTab) && !canManageSystemSettings()) state.settingsTab = "users";
  if (["statuses", "tags", "projects"].includes(state.settingsTab) && !canManagePipelineSettings()) state.settingsTab = "users";
  if (state.settingsTab === "integrations") return renderIntegrationSettings();
  if (state.settingsTab === "statuses") return renderStatusSettings();
  if (state.settingsTab === "tags") return renderTagSettings();
  if (state.settingsTab === "logs") return renderLogSettings();
  if (state.settingsTab === "projects") return renderProjectSettings();
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
      menu?.style.setProperty("--menu-top", `${rect.bottom + 6}px`);
      menu?.style.setProperty("--menu-right", `${Math.max(12, window.innerWidth - rect.right)}px`);
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

function renderUserActionMenu(user) {
  const userId = escapeHtml(user.id);
  const statusAction = user.id === state.user?.id
    ? ""
    : user.active
      ? `<button type="button" data-deactivate-user="${userId}">Inativar</button>`
      : `<button type="button" data-activate-user="${userId}">Ativar</button>`;
  return `
    ${renderSettingsActionMenu(`user-${userId}`, [
      `<button type="button" data-edit-user="${userId}">Editar</button>`,
      statusAction,
      `<button type="button" data-invite-user="${userId}">${user.passwordConfigured ? "Redefinir senha" : "Reenviar convite"}</button>`,
      canManageSystemSettings() ? `<button type="button" data-view-user-log="${userId}">Ver log</button>` : "",
      canManageSystemSettings() ? `<button type="button" class="danger-menu-item" data-delete-user="${userId}">Excluir</button>` : ""
    ])}
  `;
}

function closeUserActionMenus() {
  document.querySelectorAll(".action-menu.open").forEach((item) => item.classList.remove("open"));
}

function reassignPayloadForBrokerDeactivation(targetUser) {
  if (targetUser?.role !== "Corretor" || !targetUser.active) return {};
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
        <table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Senha</th><th>Ações</th></tr></thead><tbody>${users}</tbody></table>
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
  document.querySelector("#userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      role: form.get("role"),
      active: form.get("active") === "true"
    };
    if (editUser?.role === "Corretor" && editUser.active && payload.active === false) {
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
          <div class="field full"><label>Empreendimento</label><select name="project" required><option value="">Selecione</option>${projectOptions(formValue.project || "")}</select></div>
          <div class="field full"><div class="row-actions"><button class="primary" type="submit">${isEditing ? "Salvar form" : "Adicionar form"}</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      </section>
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
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Logs</h2>
        <input id="settingsLogSearch" class="settings-search" placeholder="Pesquisar nos logs" value="${escapeHtml(state.settingsLogSearch)}">
      </div>
      <div class="logs-grid">
        <section>
          <h2>Eventos de integração</h2>
          <div class="table-wrap">
            <table><thead><tr><th>Data</th><th>Origem</th><th>Evento</th><th>ID</th><th>Detalhe</th></tr></thead><tbody>${integrationRows || '<tr><td colspan="5" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>
          </div>
        </section>
        <section>
          <h2>Auditoria</h2>
          <div class="table-wrap">
            <table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4" class="empty">Nenhum evento encontrado.</td></tr>'}</tbody></table>
          </div>
        </section>
      </div>
    </section>
  `);
  document.querySelector("#settingsLogSearch")?.addEventListener("input", (event) => {
    state.settingsLogSearch = event.target.value;
    renderLogSettings();
    requestAnimationFrame(() => {
      const input = document.querySelector("#settingsLogSearch");
      input?.focus();
      input?.setSelectionRange(state.settingsLogSearch.length, state.settingsLogSearch.length);
    });
  });
}

function renderKnowledgeSettings() {
  const webhookUrl = `${window.location.origin}/api/webhooks/meta`;
  settingsLayout(`
    <section class="panel">
      <h2>Base de conhecimento</h2>
      <section class="integration-help">
        <h2>Webhook Meta</h2>
        <div class="meta">
          <span>URL de callback: <strong>${escapeHtml(webhookUrl)}</strong></span>
          <span>Variáveis na Vercel: <strong>META_VERIFY_TOKEN</strong>, <strong>META_APP_SECRET</strong>, <strong>META_PAGE_ACCESS_TOKEN</strong>, <strong>CRON_SECRET</strong></span>
          <span>Evento assinado no Meta: <strong>Page / leadgen</strong></span>
        </div>
      </section>
    </section>
  `);
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
  if (state.view === "settings") return renderSettings();
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
