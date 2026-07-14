const app = document.querySelector("#app");

const state = {
  user: null,
  roles: [],
  statuses: [],
  users: [],
  leads: [],
  integrations: null,
  auditLog: [],
  view: "kanban",
  favoritesOnly: false,
  search: ""
};

const profileAccess = {
  "Admin TI": ["kanban", "sheet", "odysseia", "dashboard", "settings"],
  "Head Comercial": ["kanban", "sheet", "odysseia", "dashboard"],
  "Supervisor Comercial": ["kanban", "sheet", "odysseia", "dashboard"],
  Diretoria: ["dashboard", "sheet", "odysseia", "kanban"],
  Corretor: ["kanban", "sheet"]
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

function userName(id) {
  return state.users.find((user) => user.id === id)?.name || "";
}

function filteredLeads() {
  const term = state.search.trim().toLowerCase();
  return state.leads.filter((lead) => {
    if (state.favoritesOnly && !lead.favorite) return false;
    if (!term) return true;
    return [lead.name, lead.phone, lead.assistant, lead.assignedName, lead.externalId, lead.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
}

function pipelineLeads() {
  return filteredLeads().filter((lead) => lead.inPipeline);
}

function odysseiaLeads() {
  return filteredLeads().filter((lead) => lead.source === "ODYSSEIA");
}

function metrics(leads = filteredLeads()) {
  const total = leads.length;
  const favorites = leads.filter((lead) => lead.favorite).length;
  const assigned = leads.filter((lead) => lead.assignedTo).length;
  const active = leads.filter((lead) => !["Desqualificado", "Arquivado (Permanentemente)"].includes(lead.status)).length;
  return { total, favorites, assigned, active };
}

function renderLogin(error = "") {
  app.innerHTML = `
    <section class="login-page">
      <form class="login-box" id="loginForm">
        <h1>Pipeline de Leads</h1>
        <p>RMeireles | Mauad | Lev</p>
        <div class="field">
          <label for="username">Usuário</label>
          <input id="username" name="username" autocomplete="username" value="admin" required>
        </div>
        <div class="field">
          <label for="password">Senha</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
        </div>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        <div class="field">
          <button class="primary" type="submit">Entrar</button>
        </div>
      </form>
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
      await loadState();
      renderApp();
    } catch (error) {
      renderLogin(error.message);
    }
  });
}

async function loadState() {
  const data = await api("/api/state");
  state.user = data.user;
  state.roles = data.roles;
  state.statuses = data.pipelineStatuses;
  state.users = data.users;
  state.leads = data.leads;
  state.integrations = data.integrations;
  state.auditLog = data.auditLog;
  if (!allowedViews().includes(state.view)) state.view = allowedViews()[0];
}

function navButton(view, icon, label) {
  if (!allowedViews().includes(view)) return "";
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}" title="${label}"><span>${icon}</span>${label}</button>`;
}

function renderShell(content) {
  app.innerHTML = `
    <section class="shell">
      <aside class="side">
        <div class="brand">
          <strong>Pipeline</strong>
          <span>Origem ODYSSEIA</span>
        </div>
        <nav class="nav">
          ${navButton("kanban", "▦", "Kanban")}
          ${navButton("sheet", "▤", "Planilha")}
          ${navButton("odysseia", "◎", "Base Odysseia")}
          ${navButton("dashboard", "◫", "Dashboard")}
          ${navButton("settings", "⚙", "Configurações")}
        </nav>
      </aside>
      <section class="main">
        <header class="topbar">
          <div class="actions">
            <input id="search" value="${escapeHtml(state.search)}" placeholder="Buscar lead, telefone, fase ou corretor">
            <button id="favoriteToggle" class="${state.favoritesOnly ? "primary" : ""}" title="Favoritos">★</button>
          </div>
          <div class="user-pill">
            <strong>${escapeHtml(state.user.name)}</strong>
            <span>${escapeHtml(state.user.role)}</span>
            <button id="logout">Sair</button>
          </div>
        </header>
        <div class="content">${content}</div>
      </section>
    </section>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderApp();
    });
  });
  document.querySelector("#search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderApp();
  });
  document.querySelector("#favoriteToggle").addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderApp();
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    renderLogin();
  });
}

function renderViewHead(title, subtitle = "") {
  return `
    <div class="view-head">
      <div class="view-title">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
    </div>
  `;
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

function leadCard(lead) {
  return `
    <article class="card" draggable="true" data-lead="${escapeHtml(lead.id)}">
      <div class="card-title">
        <strong>${escapeHtml(lead.name)}</strong>
        <button class="icon favorite" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button>
      </div>
      <div class="meta">
        <span>${escapeHtml(lead.phone || "Sem telefone")}</span>
        <span>${escapeHtml(lead.assignedName || userName(lead.assignedTo) || "Sem corretor")}</span>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(lead.source)}</span>
        <span class="chip">#${escapeHtml(lead.externalId)}</span>
      </div>
    </article>
  `;
}

function renderKanban() {
  const leads = pipelineLeads();
  const byStatus = Object.groupBy ? Object.groupBy(leads, (lead) => lead.status) : leads.reduce((acc, lead) => {
    (acc[lead.status] ||= []).push(lead);
    return acc;
  }, {});
  const columns = state.statuses.map((status) => {
    const items = (byStatus[status] || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return `
      <section class="column" data-status="${escapeHtml(status)}">
        <div class="column-head">
          <strong>${escapeHtml(status)}</strong>
          <span class="count">${items.length}</span>
        </div>
        <div class="cards">${items.map(leadCard).join("") || '<div class="empty">Vazio</div>'}</div>
      </section>
    `;
  }).join("");
  renderShell(`${renderViewHead("Kanban", "Leads ativos no pipeline")}${renderMetrics(leads)}<section class="kanban">${columns}</section>`);
  bindLeadActions();
  bindDragDrop();
}

function bindLeadActions() {
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const lead = state.leads.find((item) => item.id === button.dataset.favorite);
      const result = await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ favorite: !lead.favorite })
      });
      Object.assign(lead, result.lead);
      renderApp();
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

function leadRows(leads, options = {}) {
  return leads.map((lead) => `
    <tr>
      <td><button class="icon favorite" data-favorite="${escapeHtml(lead.id)}" title="Favoritar">${lead.favorite ? "★" : "☆"}</button></td>
      <td>${escapeHtml(lead.externalId)}</td>
      <td>${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.phone)}</td>
      <td>${escapeHtml(lead.assistant)}</td>
      <td>
        ${options.readOnlyStatus ? escapeHtml(lead.odysseiaStatus || lead.status) : `<select data-status-select="${escapeHtml(lead.id)}">
          ${state.statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === lead.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
        </select>`}
      </td>
      <td>${escapeHtml(lead.assignedName || userName(lead.assignedTo))}</td>
      <td>${escapeHtml(lead.source)}</td>
      ${options.withRescue ? `<td>${lead.inPipeline ? '<span class="chip">No pipeline</span>' : `<button class="primary" data-rescue="${escapeHtml(lead.id)}">Resgatar</button>`}</td>` : ""}
    </tr>
  `).join("");
}

function renderLeadsTable(rows, withRescue = false) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>★</th><th>ID</th><th>Nome</th><th>Celular</th><th>Assistente</th><th>Fase atual</th><th>Corretor</th><th>Origem</th>${withRescue ? "<th>Ação</th>" : ""}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${withRescue ? 9 : 8}" class="empty">Nenhum lead nesta visão</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderSheet() {
  const leads = pipelineLeads();
  const rows = leadRows(leads);
  renderShell(`
    ${renderViewHead("Planilha", "Leads vindos do Meta e leads resgatados da Base Odysseia")}
    ${renderMetrics(leads)}
    ${renderLeadsTable(rows)}
  `);
  bindLeadActions();
  document.querySelectorAll("[data-status-select]").forEach((select) => {
    select.addEventListener("change", async () => {
      const lead = state.leads.find((item) => item.id === select.dataset.statusSelect);
      const result = await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value, order: Date.now() })
      });
      Object.assign(lead, result.lead);
      renderApp();
    });
  });
}

function renderOdysseiaBase() {
  const leads = odysseiaLeads();
  const rows = leadRows(leads, { readOnlyStatus: true, withRescue: true });
  const pending = leads.filter((lead) => !lead.inPipeline).length;
  const rescued = leads.filter((lead) => lead.inPipeline).length;
  renderShell(`
    ${renderViewHead("Base Odysseia", "Base importada separada do pipeline")}
    <section class="metrics">
      <div class="metric"><span>Total Odysseia</span><strong>${leads.length}</strong></div>
      <div class="metric"><span>A resgatar</span><strong>${pending}</strong></div>
      <div class="metric"><span>Resgatados</span><strong>${rescued}</strong></div>
      <div class="metric"><span>Origem</span><strong>ODYSSEIA</strong></div>
    </section>
    ${renderLeadsTable(rows, true)}
  `);
  bindLeadActions();
  document.querySelectorAll("[data-rescue]").forEach((button) => {
    button.addEventListener("click", async () => {
      const result = await api(`/api/leads/${button.dataset.rescue}/rescue`, { method: "POST" });
      const lead = state.leads.find((item) => item.id === result.lead.id);
      Object.assign(lead, result.lead);
      renderOdysseiaBase();
    });
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
    ${renderViewHead("Dashboard", "Indicadores de volume de lead e funil")}
    <section class="metrics">
      <div class="metric"><span>Volume total</span><strong>${data.total}</strong></div>
      <div class="metric"><span>Ativos</span><strong>${data.active}</strong></div>
      <div class="metric"><span>Favoritos</span><strong>${data.favorites}</strong></div>
      <div class="metric"><span>Base Odysseia</span><strong>${odysseiaLeads().length}</strong></div>
    </section>
    <section class="dashboard-grid">
      <div class="panel"><h2>Funil</h2>${funnel}</div>
      <div class="panel">
        <h2>Corretores</h2>
        <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Leads</th><th>Status</th></tr></thead><tbody>${brokers}</tbody></table></div>
      </div>
    </section>
  `);
}

function renderSettings() {
  const users = state.users.map((user) => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td class="${user.active ? "status-active" : "status-inactive"}">${user.active ? "Ativo" : "Inativo"}</td>
      <td><button data-toggle-user="${escapeHtml(user.id)}">${user.active ? "Inativar" : "Ativar"}</button></td>
    </tr>
  `).join("");
  const integrations = state.integrations || {};
  renderShell(`
    ${renderViewHead("Configurações", "Usuários, perfis e integrações")}
    <section class="settings-grid">
      <div class="panel">
        <h2>Usuários</h2>
        <form id="userForm" class="form-grid">
          <div class="field"><label>Nome</label><input name="name" required></div>
          <div class="field"><label>Usuário</label><input name="username" required></div>
          <div class="field"><label>Perfil</label><select name="role">${state.roles.map((role) => `<option>${escapeHtml(role)}</option>`).join("")}</select></div>
          <div class="field"><label>Senha</label><input name="password" type="password"></div>
          <div class="field"><label>Status</label><select name="active"><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
          <div class="field"><label>&nbsp;</label><button class="primary" type="submit">Criar usuário</button></div>
        </form>
        <div class="table-wrap">
          <table><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>${users}</tbody></table>
        </div>
      </div>
      <div class="panel">
        <h2>Integrações</h2>
        <form id="integrationForm" class="form-grid">
          <div class="field"><label>Forms Meta</label><select name="meta"><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
          <div class="field"><label>WhatsApp</label><input name="whatsapp" value="${escapeHtml(integrations.whatsapp?.provider || "")}"></div>
          <div class="field"><label>E-mail remetente</label><input name="sender" value="${escapeHtml(integrations.email?.sender || "")}"></div>
          <div class="field"><label>SMTP</label><input name="smtp" value="${escapeHtml(integrations.email?.smtpHost || "")}"></div>
          <div class="field full"><label>Endpoint proprietário</label><input name="endpoint" value="${escapeHtml(integrations.proprietaryEndpoints?.[0]?.url || "")}"></div>
          <div class="field full"><button class="primary" type="submit">Salvar integrações</button></div>
        </form>
        <h2>Auditoria</h2>
        <div class="meta">${state.auditLog.map((item) => `<span>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))} · ${escapeHtml(item.action)} · ${escapeHtml(item.actor)}</span>`).join("")}</div>
      </div>
    </section>
  `);
  document.querySelector("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        username: form.get("username"),
        role: form.get("role"),
        password: form.get("password"),
        active: form.get("active") === "true"
      })
    });
    await loadState();
    renderSettings();
  });
  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.users.find((user) => user.id === button.dataset.toggleUser);
      await api(`/api/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !target.active })
      });
      await loadState();
      renderSettings();
    });
  });
  document.querySelector("#integrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const integrations = {
      metaForms: { enabled: form.get("meta") === "true", forms: state.integrations?.metaForms?.forms || [] },
      whatsapp: { enabled: Boolean(form.get("whatsapp")), provider: form.get("whatsapp"), tokenSet: state.integrations?.whatsapp?.tokenSet || false },
      email: { enabled: Boolean(form.get("sender") || form.get("smtp")), sender: form.get("sender"), smtpHost: form.get("smtp") },
      proprietaryEndpoints: form.get("endpoint") ? [{ name: "Endpoint principal", url: form.get("endpoint"), enabled: true }] : []
    };
    await api("/api/integrations", { method: "PUT", body: JSON.stringify({ integrations }) });
    await loadState();
    renderSettings();
  });
}

function renderApp() {
  if (state.view === "kanban") return renderKanban();
  if (state.view === "sheet") return renderSheet();
  if (state.view === "odysseia") return renderOdysseiaBase();
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "settings") return renderSettings();
}

(async function boot() {
  try {
    await loadState();
    renderApp();
  } catch {
    renderLogin();
  }
})();
