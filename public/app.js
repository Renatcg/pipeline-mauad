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
  settingsTab: "users",
  settingsEditing: null,
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
        <h1>Pipeline Comercial</h1>
        <p>Construtora Mauad</p>
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
          <strong>Pipeline Comercial</strong>
          <span>Construtora Mauad</span>
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
  renderShell(`${renderViewHead("Kanban", "Leads ativos no pipeline")}${renderMetrics(leads)}${empty}<section class="kanban">${columns}</section>`);
  bindLeadActions();
  bindDragDrop();
  bindColumnDragDrop();
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
      try {
        const result = await api(`/api/leads/${button.dataset.rescue}/rescue`, { method: "POST" });
        const lead = state.leads.find((item) => item.id === result.lead.id);
        Object.assign(lead, result.lead);
        renderOdysseiaBase();
      } catch (error) {
        alert(error.message);
      }
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
      ${settingsTabButton("integrations", "Integrações")}
      ${settingsTabButton("statuses", "Status do pipeline")}
    </div>
    ${content}
  `);
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsTab = button.dataset.settingsTab;
      state.settingsEditing = null;
      renderSettings();
    });
  });
}

function renderSettings() {
  if (state.settingsTab === "integrations") return renderIntegrationSettings();
  if (state.settingsTab === "statuses") return renderStatusSettings();
  return renderUserSettings();
}

function renderUserSettings() {
  const isCreating = state.settingsEditing === "new-user";
  const editUser = state.users.find((user) => user.id === state.settingsEditing);
  const formUser = editUser || {};
  const users = state.users.map((user) => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td class="${user.active ? "status-active" : "status-inactive"}">${user.active ? "Ativo" : "Inativo"}</td>
      <td>
        <div class="row-actions">
          <button data-edit-user="${escapeHtml(user.id)}">Editar</button>
          <button data-delete-user="${escapeHtml(user.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Usuários</h2>
        <button class="primary" data-new-user>Cadastrar novo</button>
      </div>
      ${(isCreating || editUser) ? `
        <form id="userForm" class="form-grid editor">
          <div class="field"><label>Nome</label><input name="name" value="${escapeHtml(formUser.name || "")}" required></div>
          <div class="field"><label>Usuário</label><input name="username" value="${escapeHtml(formUser.username || "")}" ${editUser ? "disabled" : "required"}></div>
          <div class="field"><label>Perfil</label><select name="role">${state.roles.map((role) => `<option ${role === formUser.role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}</select></div>
          <div class="field"><label>Senha</label><input name="password" type="password" placeholder="${editUser ? "Manter senha atual" : ""}"></div>
          <div class="field"><label>Status</label><select name="active"><option value="true" ${formUser.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${formUser.active === false ? "selected" : ""}>Inativo</option></select></div>
          <div class="field"><label>&nbsp;</label><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${users}</tbody></table>
      </div>
    </section>
  `);
  bindSettingsCommon();
  document.querySelector("[data-new-user]")?.addEventListener("click", () => {
    state.settingsEditing = "new-user";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = button.dataset.editUser;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir este usuário?")) return;
      await api(`/api/users/${button.dataset.deleteUser}`, { method: "DELETE" });
      await loadState();
      renderSettings();
    });
  });
  document.querySelector("#userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      role: form.get("role"),
      password: form.get("password"),
      active: form.get("active") === "true"
    };
    if (editUser) {
      await api(`/api/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ ...payload, username: form.get("username") })
      });
    }
    state.settingsEditing = null;
    await loadState();
    renderSettings();
  });
}

function integrationRows() {
  const integrations = state.integrations || {};
  return [
    { id: "metaForms", name: "Forms do Meta", type: "Meta", status: integrations.metaForms?.enabled, detail: `${integrations.metaForms?.forms?.length || 0} forms` },
    { id: "whatsapp", name: "WhatsApp", type: "Mensageria", status: integrations.whatsapp?.enabled, detail: integrations.whatsapp?.provider || "Sem provedor" },
    { id: "email", name: "E-mail", type: "E-mail", status: integrations.email?.enabled, detail: integrations.email?.sender || integrations.email?.smtpHost || "Sem remetente" },
    { id: "endpoint", name: "Endpoint proprietário", type: "API", status: Boolean(integrations.proprietaryEndpoints?.[0]?.enabled), detail: integrations.proprietaryEndpoints?.[0]?.url || "Sem endpoint" }
  ];
}

function renderIntegrationSettings() {
  const editing = state.settingsEditing;
  const integrations = state.integrations || {};
  const rows = integrationRows().map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td class="${item.status ? "status-active" : "status-inactive"}">${item.status ? "Ativo" : "Inativo"}</td>
      <td>${escapeHtml(item.detail)}</td>
      <td><div class="row-actions"><button data-edit-integration="${item.id}">Editar</button><button data-delete-integration="${item.id}">Excluir</button></div></td>
    </tr>
  `).join("");
  settingsLayout(`
    <section class="panel">
      <div class="panel-head">
        <h2>Integrações</h2>
        <button class="primary" data-new-integration>Cadastrar novo</button>
      </div>
      ${editing?.startsWith("integration:") ? renderIntegrationForm(editing.replace("integration:", ""), integrations) : ""}
      <div class="table-wrap">
        <table><thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Detalhe</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <h2>Auditoria</h2>
      <div class="meta">${state.auditLog.map((item) => `<span>${escapeHtml(new Date(item.at).toLocaleString("pt-BR"))} · ${escapeHtml(item.action)} · ${escapeHtml(item.actor)}</span>`).join("")}</div>
    </section>
  `);
  bindSettingsCommon();
  document.querySelector("[data-new-integration]")?.addEventListener("click", () => {
    state.settingsEditing = "integration:metaForms";
    renderSettings();
  });
  document.querySelectorAll("[data-edit-integration]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = `integration:${button.dataset.editIntegration}`;
      renderSettings();
    });
  });
  document.querySelectorAll("[data-delete-integration]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir esta integração?")) return;
      await saveIntegration(button.dataset.deleteIntegration, {});
    });
  });
  document.querySelector("#integrationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveIntegration(form.get("type"), Object.fromEntries(form.entries()));
  });
}

function renderIntegrationForm(type, integrations) {
  const endpoint = integrations.proprietaryEndpoints?.[0] || {};
  return `
    <form id="integrationForm" class="form-grid editor">
      <div class="field"><label>Tipo</label><select name="type">
        ${["metaForms", "whatsapp", "email", "endpoint"].map((item) => `<option value="${item}" ${item === type ? "selected" : ""}>${escapeHtml({ metaForms: "Forms do Meta", whatsapp: "WhatsApp", email: "E-mail", endpoint: "Endpoint proprietário" }[item])}</option>`).join("")}
      </select></div>
      <div class="field"><label>Status</label><select name="enabled"><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
      <div class="field"><label>Provedor / Remetente</label><input name="primary" value="${escapeHtml(integrations.whatsapp?.provider || integrations.email?.sender || "")}"></div>
      <div class="field"><label>SMTP / URL</label><input name="secondary" value="${escapeHtml(integrations.email?.smtpHost || endpoint.url || "")}"></div>
      <div class="field full"><label>&nbsp;</label><div class="row-actions"><button class="primary" type="submit">Salvar</button><button type="button" data-cancel-settings>Cancelar</button></div></div>
    </form>
  `;
}

async function saveIntegration(type, values) {
  const integrations = JSON.parse(JSON.stringify(state.integrations || {}));
  const enabled = values.enabled === "true";
  if (type === "metaForms") integrations.metaForms = { enabled, forms: integrations.metaForms?.forms || [] };
  if (type === "whatsapp") integrations.whatsapp = { enabled, provider: values.primary || "", tokenSet: integrations.whatsapp?.tokenSet || false };
  if (type === "email") integrations.email = { enabled, sender: values.primary || "", smtpHost: values.secondary || "" };
  if (type === "endpoint") integrations.proprietaryEndpoints = values.secondary ? [{ name: "Endpoint principal", url: values.secondary, enabled }] : [];
  await api("/api/integrations", { method: "PUT", body: JSON.stringify({ integrations }) });
  state.settingsEditing = null;
  await loadState();
  renderSettings();
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
        <td><div class="row-actions"><button data-edit-status="${index}">Editar</button><button data-delete-status="${index}">Excluir</button></div></td>
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

function bindSettingsCommon() {
  document.querySelectorAll("[data-cancel-settings]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsEditing = null;
      renderSettings();
    });
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
