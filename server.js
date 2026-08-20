const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const MARKETING_HISTORICAL_EXPENSES = require("./resources/marketing-actual-expenses.json");

process.env.TZ = "America/Sao_Paulo";

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join("/tmp", "pipeline-leads-data") : path.join(__dirname, "data"));
const DB_PATH = path.join(DATA_DIR, "db.json");
const SEED_PATH = path.join(DATA_DIR, "seed.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 15;
const PASSWORD_SETUP_TTL_MS = 1000 * 60 * 60 * 24;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "pipeline-mauad";
const REDIS_TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS || 800);
const REDIS_CONFIG_TTL_SECONDS = Number(process.env.REDIS_CONFIG_TTL_SECONDS || 120);
const CHATWOOT_BASE_URL = String(process.env.CHATWOOT_BASE_URL || "").trim().replace(/\/+$/, "");
const CHATWOOT_ACCOUNT_ID = String(process.env.CHATWOOT_ACCOUNT_ID || "").trim();
const CHATWOOT_API_TOKEN = String(process.env.CHATWOOT_API_TOKEN || "").trim();
const ROLES = ["Admin TI", "Head Comercial", "Supervisor Comercial", "Diretoria", "Corretor", "Gerente Financeiro", "Auxiliar Financeiro", "Gestor de Tráfego", "Coordenador de Marketing"];
const META_HEALTH_NOTIFICATION_ROLES = new Set(["Admin TI", "Gestor de Tráfego", "Coordenador de Marketing"]);
const META_HEALTH_ALERT_FACTOR = Number(process.env.META_HEALTH_ALERT_FACTOR || 2.5);
const META_HEALTH_MIN_SAMPLE = Number(process.env.META_HEALTH_MIN_SAMPLE || 5);
const META_HEALTH_MIN_GAP_MINUTES = Number(process.env.META_HEALTH_MIN_GAP_MINUTES || 180);
const META_HEALTH_ALERT_COOLDOWN_HOURS = Number(process.env.META_HEALTH_ALERT_COOLDOWN_HOURS || 6);
const DEFAULT_PROJECTS = ["Reserva Guinle", "Golf Club Resort"];
const DEFAULT_EVENT_CAPTURE_EMAIL_HTML = "<h1>Obrigado pela sua visita, {{nome_lead}}!</h1><p>Agradecemos a atenção dispensada à equipe Comercial Mauad durante o 64º Aberto de Golfe, em Teresópolis.</p><p>Foi um prazer conversar com você. Em breve, nossa equipe poderá apresentar mais detalhes do Golf Club Resort.</p><p>Atenciosamente,<br><strong>Comercial Mauad</strong></p>";
const PERMISSION_SCREENS = [
  { id: "screen:kanban", label: "Kanban", view: "kanban" },
  { id: "screen:availability", label: "Disponibilidade", view: "availability" },
  { id: "screen:sheet", label: "Planilha", view: "sheet" },
  { id: "screen:bases", label: "Bases", view: "odysseia" },
  { id: "screen:dashboard", label: "Dashboard", view: "dashboard" },
  { id: "screen:salesReport", label: "Relatório Comercial", view: "salesReport" },
  { id: "screen:marketing", label: "Marketing", view: "marketing" },
  { id: "screen:finance", label: "Financeiro Lev", view: "finance" },
  { id: "screen:financeSml", label: "Financeiro SML", view: "financeSml" },
  { id: "screen:settings", label: "Configurações", view: "settings" },
  { id: "screen:knowledge", label: "Ajuda", view: "knowledge" }
];
const DEFAULT_TAG_DEFINITIONS = [
  { id: "tag-quente", name: "Quente", color: "#d92d20" },
  { id: "tag-morno", name: "Morno", color: "#f79009" },
  { id: "tag-frio", name: "Frio", color: "#1570ef" },
  { id: "tag-retorno", name: "Retorno", color: "#7f56d9" },
  { id: "tag-visita", name: "Visita", color: "#039855" },
  { id: "tag-documentacao", name: "Documentação", color: "#475467" }
];
const KNOWLEDGE_CATEGORIES = ["Primeiros passos", "Leads e Pipeline", "Bases", "Meta Leads", "Configurações", "Notificações", "Logs e Auditoria"];
const DEFAULT_BASE_ACCESS = {
  roles: Object.fromEntries(ROLES.map((role) => [role, {
    enabled: ["Admin TI", "Head Comercial", "Supervisor Comercial", "Diretoria", "Corretor"].includes(role),
    sources: []
  }])),
  users: {}
};

function permissionCell(access = false, action = false) {
  return { access: Boolean(access || action), action: Boolean(action) };
}

function basePermissionId(source) {
  return `base:${source}`;
}

function defaultScreenPermission(role, screen) {
  const viewAccess = {
    "Admin TI": ["kanban", "availability", "sheet", "odysseia", "dashboard", "salesReport", "marketing", "finance", "financeSml", "settings", "knowledge"],
    "Head Comercial": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "marketing", "settings", "knowledge"],
    "Supervisor Comercial": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "knowledge"],
    Diretoria: ["dashboard", "salesReport", "marketing", "sheet", "odysseia", "kanban", "knowledge"],
    Corretor: ["kanban", "sheet", "odysseia", "knowledge"],
    "Gerente Financeiro": ["marketing", "finance", "financeSml", "settings", "knowledge"],
    "Auxiliar Financeiro": ["finance", "financeSml", "settings", "knowledge"],
    "Gestor de Tráfego": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "marketing", "knowledge"],
    "Coordenador de Marketing": ["kanban", "sheet", "odysseia", "dashboard", "salesReport", "marketing", "settings", "knowledge"]
  };
  const actionAccess = {
    "Admin TI": ["kanban", "availability", "sheet", "odysseia", "dashboard", "salesReport", "marketing", "finance", "financeSml", "settings", "knowledge"],
    "Head Comercial": ["kanban", "sheet", "odysseia", "marketing", "settings", "knowledge"],
    "Supervisor Comercial": ["kanban", "sheet", "odysseia", "knowledge"],
    Corretor: ["kanban", "sheet", "odysseia", "knowledge"],
    "Gerente Financeiro": ["marketing", "finance", "financeSml", "settings", "knowledge"],
    "Auxiliar Financeiro": ["finance", "financeSml", "knowledge"],
    "Gestor de Tráfego": ["knowledge"],
    "Coordenador de Marketing": ["marketing", "settings", "knowledge"]
  };
  const canAccess = (viewAccess[role] || []).includes(screen.view);
  return permissionCell(canAccess, canAccess && (actionAccess[role] || []).includes(screen.view));
}

function defaultPermissionsForSources(sources = []) {
  const roles = {};
  for (const role of ROLES) {
    roles[role] = {};
    for (const screen of PERMISSION_SCREENS) {
      roles[role][screen.id] = defaultScreenPermission(role, screen);
    }
    const baseRule = DEFAULT_BASE_ACCESS.roles[role] || { enabled: false, sources: [] };
    for (const source of sources) {
      roles[role][basePermissionId(source)] = permissionCell(baseRule.enabled, baseRule.enabled && role !== "Diretoria");
    }
  }
  return { roles, users: {} };
}
const DEFAULT_KNOWLEDGE_ARTICLES = [
  {
    id: "kb-primeiros-passos",
    title: "Primeiros passos no Pipeline Comercial",
    category: "Primeiros passos",
    summary: "Entenda o menu principal, as telas do sistema e o fluxo básico de trabalho.",
    content: "1. Acesse o sistema com seu e-mail e senha.\n2. Use o menu lateral para navegar entre Kanban, Planilha, Bases e Ajuda.\n3. Corretores visualizam os leads atribuídos a eles no Kanban e na Planilha.\n4. Head, Supervisor e Admin TI acompanham o pipeline comercial de forma ampla, conforme suas permissões.\n5. Ao terminar, use Sair para encerrar a sessão.",
    keywords: ["login", "menu", "primeiro acesso", "navegação"],
    audienceRoles: ROLES,
    published: true
  },
  {
    id: "kb-resgatar-lead-base",
    title: "Como resgatar um lead da base",
    category: "Bases",
    summary: "Veja como trazer um lead histórico para o pipeline ativo.",
    content: "1. Abra a tela Bases.\n2. Escolha a origem desejada, como ODYSSEIA, RD Station ou PIPELINE GDRIVE.\n3. Use a busca ou ordene as colunas para encontrar o lead.\n4. Clique em Resgatar.\n5. O lead entra no pipeline no primeiro status cadastrado.\n6. Se você for corretor, o lead resgatado fica atribuído a você.",
    keywords: ["base", "resgatar", "pipeline gdrive", "odysseia", "rd station"],
    audienceRoles: ROLES,
    published: true
  },
  {
    id: "kb-atribuir-corretor",
    title: "Como atribuir um lead a um corretor",
    category: "Leads e Pipeline",
    summary: "Direcione leads para corretores ativos pelo card do Kanban ou pelo detalhe do lead.",
    content: "1. No Kanban, localize o card do lead.\n2. Clique no menu de três pontos do card.\n3. Escolha um corretor ativo na lista.\n4. O sistema registra a atribuição no FUP Lead.\n5. Se o corretor tiver notificações ativas, ele recebe o aviso de novo lead atribuído.",
    keywords: ["corretor", "atribuir", "direcionar", "kanban", "fup"],
    audienceRoles: ["Admin TI", "Head Comercial", "Supervisor Comercial"],
    published: true
  },
  {
    id: "kb-meta-leads",
    title: "Como acompanhar leads vindos do Meta",
    category: "Meta Leads",
    summary: "Entenda onde ver leads Meta e como sincronizar manualmente quando necessário.",
    content: "1. Leads recebidos do Meta entram no pipeline como origem META.\n2. Na tela Bases, use a origem META para filtrar esses registros.\n3. Em Configurações, Admin TI pode cadastrar formulários monitorados.\n4. Se o webhook falhar, Admin TI pode importar por Lead ID ou acionar Sincronizar Meta.\n5. As respostas do formulário aparecem no detalhe do lead.",
    keywords: ["meta", "facebook", "formulário", "leadgen", "sincronizar"],
    audienceRoles: ["Admin TI", "Head Comercial", "Supervisor Comercial"],
    published: true
  },
  {
    id: "kb-notificacoes",
    title: "Como funcionam as notificações",
    category: "Notificações",
    summary: "Saiba quando o sistema envia e-mail ou WhatsApp para usuários.",
    content: "1. Cada usuário pode ter notificações por e-mail e/ou WhatsApp configuradas no cadastro.\n2. Quando um lead Meta chega, gestores configurados podem ser avisados.\n3. Quando um lead é atribuído a um corretor, o corretor pode receber uma mensagem com resumo e links úteis.\n4. Admin TI pode testar notificações em usuários Admin TI.\n5. Falhas de envio aparecem nos eventos de integração.",
    keywords: ["email", "whatsapp", "resend", "evo", "notificação"],
    audienceRoles: ["Admin TI", "Head Comercial", "Supervisor Comercial"],
    published: true
  },
  {
    id: "kb-fup-lead",
    title: "O que é FUP Lead",
    category: "Logs e Auditoria",
    summary: "Conheça o log que registra interações importantes nos leads.",
    content: "O FUP Lead registra ações comerciais relevantes, como abertura do detalhe, comentário, favoritagem, atribuição de corretor, mudança de status, mudança manual de ordem, exclusão e resgate da base.\n\nUse esse log para entender quem fez cada ação, em qual lead e quando aconteceu.",
    keywords: ["fup", "log", "auditoria", "histórico", "lead"],
    audienceRoles: ["Admin TI", "Head Comercial", "Supervisor Comercial", "Diretoria"],
    published: true
  }
];
const DEFAULT_LEV_PAYMENT_SCHEDULE = [
  { start: "2026-07-14", end: "2026-07-20", paymentDate: "2026-08-07" },
  { start: "2026-07-21", end: "2026-07-27", paymentDate: "2026-08-14" },
  { start: "2026-07-28", end: "2026-08-03", paymentDate: "2026-08-21" },
  { start: "2026-08-04", end: "2026-08-10", paymentDate: "2026-08-28" },
  { start: "2026-08-11", end: "2026-08-17", paymentDate: "2026-09-04" },
  { start: "2026-08-18", end: "2026-08-24", paymentDate: "2026-09-11" },
  { start: "2026-08-25", end: "2026-08-31", paymentDate: "2026-09-18" },
  { start: "2026-09-01", end: "2026-09-07", paymentDate: "2026-09-25" },
  { start: "2026-09-08", end: "2026-09-14", paymentDate: "2026-10-02" },
  { start: "2026-09-15", end: "2026-09-21", paymentDate: "2026-10-09" },
  { start: "2026-09-22", end: "2026-09-28", paymentDate: "2026-10-16" },
  { start: "2026-09-29", end: "2026-10-05", paymentDate: "2026-10-23" },
  { start: "2026-10-06", end: "2026-10-12", paymentDate: "2026-10-30" },
  { start: "2026-10-13", end: "2026-10-19", paymentDate: "2026-11-06" },
  { start: "2026-10-20", end: "2026-10-26", paymentDate: "2026-11-13" },
  { start: "2026-10-27", end: "2026-11-02", paymentDate: "2026-11-20" },
  { start: "2026-11-03", end: "2026-11-09", paymentDate: "2026-11-27" },
  { start: "2026-11-10", end: "2026-11-16", paymentDate: "2026-12-04" },
  { start: "2026-11-17", end: "2026-11-23", paymentDate: "2026-12-11" },
  { start: "2026-11-24", end: "2026-11-30", paymentDate: "2026-12-18" },
  { start: "2026-12-01", end: "2026-12-07", paymentDate: "2026-12-25" }
];
const DEFAULT_LEV_EMAIL_TEMPLATE_HTML = `
  <p>Prezados,</p>
  <p>Segue o demonstrativo de comissões da Lev referente às vendas confirmadas no período, conforme relação abaixo.</p>
  <p>Solicitamos, por gentileza, o provisionamento dos valores para a data de <strong>{{data_pagamento}}</strong>, conforme calendário financeiro da Mauad.</p>
  <p>Tão logo confirmado o provisionamento, emitiremos a(s) respectiva(s) Nota(s) Fiscal(is).</p>
  <p>Quaisquer dúvidas, seguimos à disposição.</p>
  <p><strong>Total geral da NF de comissões:</strong> {{total_comissoes}}</p>
  {{tabela_vendas}}
  <p>Obrigado.</p>
`;
const DEFAULT_LEV_SETTLEMENTS = [
  {
    "unit": "RGLQDLF19",
    "projectCode": "RGL",
    "contractValueText": "730.052,18",
    "commissionValueText": "3.650,26",
    "signedAt": "04/06/26 12:02:44",
    "client": "Leila Cristina Nunes Gomes",
    "realEstate": "Construtora Mauad Ltda",
    "status": "NF emitida, aguardando sexta-feira",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040203",
    "projectCode": "GCR",
    "contractValueText": "420.900,00",
    "commissionValueText": "2.104,50",
    "signedAt": "21/06/26 10:19:25",
    "client": "Breno Vagner Bezerra Vicente",
    "realEstate": "Mr Negocios Imobiliarios",
    "status": "NF emitida, aguardando sexta-feira",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060201",
    "projectCode": "GCR",
    "contractValueText": "627.737,34",
    "commissionValueText": "3.138,69",
    "signedAt": "28/05/26 08:36:19",
    "client": "Eduardo Pinheiro do Nascimento",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050104",
    "projectCode": "GCR",
    "contractValueText": "766.271,95",
    "commissionValueText": "3.831,36",
    "signedAt": "18/02/26 07:12:48",
    "client": "Eduardo Anjo Barreto",
    "realEstate": "Velith e Barbosa Imoveis",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030101",
    "projectCode": "GCR",
    "contractValueText": "619.464,92",
    "commissionValueText": "3.097,32",
    "signedAt": "18/02/26 17:54:27",
    "client": "Cláudia Everilde Coutinho Mendes Bento",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030303",
    "projectCode": "GCR",
    "contractValueText": "421.387,55",
    "commissionValueText": "2.106,94",
    "signedAt": "24/02/26 17:11:03",
    "client": "Rodrigo Noronha de Carvalho",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060104",
    "projectCode": "GCR",
    "contractValueText": "625.459,33",
    "commissionValueText": "3.127,30",
    "signedAt": "21/05/26 14:56:06",
    "client": "Marcia de Lima Leitão",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060103",
    "projectCode": "GCR",
    "contractValueText": "448.673,08",
    "commissionValueText": "2.243,37",
    "signedAt": "20/05/26 16:41:35",
    "client": "Marcia de Lima Leitão",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030305",
    "projectCode": "GCR",
    "contractValueText": "568.205,46",
    "commissionValueText": "2.841,03",
    "signedAt": "28/02/26 19:43:40",
    "client": "Alexsandro Gonçalves Amaral",
    "realEstate": "Bruno Medeiros da Silva",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050206",
    "projectCode": "GCR",
    "contractValueText": "397.601,32",
    "commissionValueText": "1.988,01",
    "signedAt": "21/03/26 16:05:40",
    "client": "Ronaldo Maia Botelho",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040106",
    "projectCode": "GCR",
    "contractValueText": "442.080,00",
    "commissionValueText": "2.210,40",
    "signedAt": "05/05/26 22:57:29",
    "client": "Paula Camara de Oliveira",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050304",
    "projectCode": "GCR",
    "contractValueText": "550.661,45",
    "commissionValueText": "2.753,31",
    "signedAt": "20/03/26 15:48:39",
    "client": "Ana Maria de Azambuja Mancini Correa",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040202",
    "projectCode": "GCR",
    "contractValueText": "369.096,52",
    "commissionValueText": "1.845,48",
    "signedAt": "18/02/26 10:18:59",
    "client": "Danielle Tito Loureiro",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030206",
    "projectCode": "GCR",
    "contractValueText": "397.601,32",
    "commissionValueText": "1.988,01",
    "signedAt": "31/03/26 12:16:35",
    "client": "Tavane Rosado de Aquino Odontologia",
    "realEstate": "Construtora Mauad Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050202",
    "projectCode": "GCR",
    "contractValueText": "397.601,32",
    "commissionValueText": "1.988,01",
    "signedAt": "21/03/26 14:21:50",
    "client": "Sylvio Maia Botelho",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040303",
    "projectCode": "GCR",
    "contractValueText": "200.000,00",
    "commissionValueText": "1.000,00",
    "signedAt": "21/03/26 19:14:06",
    "client": "Keyla Blank de Cnop",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060207",
    "projectCode": "GCR",
    "contractValueText": "348.000,00",
    "commissionValueText": "1.740,00",
    "signedAt": "10/02/26 22:48:40",
    "client": "Robson Correa Santos",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040304",
    "projectCode": "GCR",
    "contractValueText": "325.000,00",
    "commissionValueText": "1.625,00",
    "signedAt": "14/03/26 16:50:25",
    "client": "Keyla Blank de Cnop",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060206",
    "projectCode": "GCR",
    "contractValueText": "342.322,00",
    "commissionValueText": "1.711,61",
    "signedAt": "07/02/26 14:26:50",
    "client": "Mauricio Elisio Martins Loureiro",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060301",
    "projectCode": "GCR",
    "contractValueText": "309.090,00",
    "commissionValueText": "1.545,45",
    "signedAt": "04/03/26 17:54:57",
    "client": "Rafael Estevam de Brito",
    "realEstate": "Construtora Mauad Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050103",
    "projectCode": "GCR",
    "contractValueText": "425.282,64",
    "commissionValueText": "2.126,41",
    "signedAt": "18/02/26 22:40:27",
    "client": "Ricardo Portilho da Costa",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030308",
    "projectCode": "GCR",
    "contractValueText": "599.104,04",
    "commissionValueText": "2.995,52",
    "signedAt": "04/03/26 14:44:08",
    "client": "Wilson Palha de Castro Neto",
    "realEstate": "Construtora Mauad Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060302",
    "projectCode": "GCR",
    "contractValueText": "190.910,00",
    "commissionValueText": "954,55",
    "signedAt": "04/03/26 18:04:57",
    "client": "Rafael Estevam de Brito",
    "realEstate": "Construtora Mauad Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060308",
    "projectCode": "GCR",
    "contractValueText": "720.213,78",
    "commissionValueText": "3.601,07",
    "signedAt": "03/03/26 20:18:15",
    "client": "Ronaldo Andrade D Alcântara",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060101",
    "projectCode": "GCR",
    "contractValueText": "650.024,00",
    "commissionValueText": "3.250,12",
    "signedAt": "25/02/26 10:37:56",
    "client": "Guilherme Pinto Nazar",
    "realEstate": "Mega Empreendimentos e Consultoria Imobiliaria Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050107",
    "projectCode": "GCR",
    "contractValueText": "417.000,00",
    "commissionValueText": "2.085,00",
    "signedAt": "24/02/26 16:30:29",
    "client": "Shirley de Souza Pinto",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050301",
    "projectCode": "GCR",
    "contractValueText": "580.926,52",
    "commissionValueText": "2.904,63",
    "signedAt": "06/02/26 20:06:02",
    "client": "Lords Participacoes Ltda",
    "realEstate": "Construtora Mauad Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030102",
    "projectCode": "GCR",
    "contractValueText": "420.707,60",
    "commissionValueText": "2.103,54",
    "signedAt": "13/02/26 18:35:59",
    "client": "Teresa Celina Campello de Siqueira e Pinto",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050308",
    "projectCode": "GCR",
    "contractValueText": "705.573,87",
    "commissionValueText": "3.527,87",
    "signedAt": "11/02/26 12:40:59",
    "client": "Cássia Cavalcante Silva",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040302",
    "projectCode": "GCR",
    "contractValueText": "388.873,88",
    "commissionValueText": "1.944,37",
    "signedAt": "06/02/26 19:11:40",
    "client": "Erica Alves Bezerra da Cruz",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040301",
    "projectCode": "GCR",
    "contractValueText": "580.926,52",
    "commissionValueText": "2.904,63",
    "signedAt": "08/02/26 10:44:55",
    "client": "Sergio Ricardo Marinatto",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060307",
    "projectCode": "GCR",
    "contractValueText": "377.605,64",
    "commissionValueText": "1.888,03",
    "signedAt": "10/02/26 12:22:37",
    "client": "Humberto Marques Siqueira da Silva",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040107",
    "projectCode": "GCR",
    "contractValueText": "430.158,60",
    "commissionValueText": "2.150,79",
    "signedAt": "11/02/26 21:17:27",
    "client": "Romulo da Silva Campos",
    "realEstate": "Brick Imobiliaria Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050303",
    "projectCode": "GCR",
    "contractValueText": "389.247,32",
    "commissionValueText": "1.946,24",
    "signedAt": "11/02/26 11:51:39",
    "client": "Mauro Sérgio Fatuch Bayout",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040102",
    "projectCode": "GCR",
    "contractValueText": "420.707,89",
    "commissionValueText": "2.103,54",
    "signedAt": "11/02/26 10:22:12",
    "client": "Laura Maria Maia Periard",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030203",
    "projectCode": "GCR",
    "contractValueText": "374.242,40",
    "commissionValueText": "1.871,21",
    "signedAt": "10/02/26 21:14:07",
    "client": "Adilson Pereira Pacheco",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050207",
    "projectCode": "GCR",
    "contractValueText": "344.483,00",
    "commissionValueText": "1.722,42",
    "signedAt": "10/02/26 20:15:10",
    "client": "João Fernando Monteiro Campos",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060203",
    "projectCode": "GCR",
    "contractValueText": "377.460,00",
    "commissionValueText": "1.887,30",
    "signedAt": "10/02/26 19:55:13",
    "client": "Juliana Nesi Cardoso Migliano Porto",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030207",
    "projectCode": "GCR",
    "contractValueText": "361.500,00",
    "commissionValueText": "1.807,50",
    "signedAt": "10/02/26 15:53:41",
    "client": "Marcio Jose Camara de Figueiredo",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040305",
    "projectCode": "GCR",
    "contractValueText": "717.264,28",
    "commissionValueText": "3.586,32",
    "signedAt": "10/02/26 12:25:11",
    "client": "Thiago Cabral Rodrigues",
    "realEstate": "Premier Brocker Imoveis",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050203",
    "projectCode": "GCR",
    "contractValueText": "479.732,00",
    "commissionValueText": "2.398,66",
    "signedAt": "09/02/26 21:30:21",
    "client": "Danielle Flatow Cha",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040308",
    "projectCode": "GCR",
    "contractValueText": "696.481,00",
    "commissionValueText": "3.482,41",
    "signedAt": "09/02/26 19:01:42",
    "client": "Jose Carlos Ferraz Junior",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060202",
    "projectCode": "GCR",
    "contractValueText": "377.460,00",
    "commissionValueText": "1.887,30",
    "signedAt": "09/02/26 17:33:14",
    "client": "Camila Mury Alves Porto",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050306",
    "projectCode": "GCR",
    "contractValueText": "388.873,88",
    "commissionValueText": "1.944,37",
    "signedAt": "09/02/26 17:11:40",
    "client": "Jeronymo Barbalho Maia Junior",
    "realEstate": "Carla Maturano",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060303",
    "projectCode": "GCR",
    "contractValueText": "388.873,88",
    "commissionValueText": "1.944,37",
    "signedAt": "09/02/26 17:05:54",
    "client": "Paulo Cesar Borges de Sousa",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050302",
    "projectCode": "GCR",
    "contractValueText": "388.873,88",
    "commissionValueText": "1.944,37",
    "signedAt": "09/02/26 14:32:04",
    "client": "Leonardo Antonio Archimedes Bottari",
    "realEstate": "Carla Maturano",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR050305",
    "projectCode": "GCR",
    "contractValueText": "573.748,44",
    "commissionValueText": "2.868,74",
    "signedAt": "09/02/26 10:42:33",
    "client": "Adriana Cristina Devesa Saade",
    "realEstate": "Analon Castro",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060306",
    "projectCode": "GCR",
    "contractValueText": "405.779,86",
    "commissionValueText": "2.028,90",
    "signedAt": "08/02/26 20:37:07",
    "client": "Ana Gabriela Santa Marinha Pinheiro",
    "realEstate": "Brick Imobiliaria Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040103",
    "projectCode": "GCR",
    "contractValueText": "537.895,88",
    "commissionValueText": "2.689,48",
    "signedAt": "08/02/26 14:10:37",
    "client": "Marco Antonio Naslausky Mibielli",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR040307",
    "projectCode": "GCR",
    "contractValueText": "390.646,77",
    "commissionValueText": "1.953,23",
    "signedAt": "08/02/26 10:23:08",
    "client": "Carlos Augusto Mendes Bittar",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030107",
    "projectCode": "GCR",
    "contractValueText": "380.230,92",
    "commissionValueText": "1.901,15",
    "signedAt": "07/02/26 16:38:39",
    "client": "Luiz Fabiano da Silva",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030306",
    "projectCode": "GCR",
    "contractValueText": "405.700,00",
    "commissionValueText": "2.028,50",
    "signedAt": "07/02/26 16:22:50",
    "client": "Marcos Jose Resnik",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR030202",
    "projectCode": "GCR",
    "contractValueText": "377.565,39",
    "commissionValueText": "1.887,83",
    "signedAt": "06/02/26 19:30:29",
    "client": "Marcia de Freitas Milagres",
    "realEstate": "My House Imoveis Ltda",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060304",
    "projectCode": "GCR",
    "contractValueText": "717.264,00",
    "commissionValueText": "3.586,32",
    "signedAt": "06/02/26 18:27:42",
    "client": "Raphael da Silva Braga",
    "realEstate": "Premier Brocker Imoveis",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "GCR060106",
    "projectCode": "GCR",
    "contractValueText": "439.499,80",
    "commissionValueText": "2.197,50",
    "signedAt": "06/02/26 16:30:50",
    "client": "Juliano Bizzo Netto",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Paga",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "RGLQACA04",
    "projectCode": "RGL",
    "contractValueText": "1.592.626,20",
    "commissionValueText": "",
    "signedAt": "04/11/25 16:19:34",
    "client": "Silvio José Martins Corrêa",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Não contabilizada antes de jan/2026",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "RGLQACA05",
    "projectCode": "RGL",
    "contractValueText": "1.588.000,00",
    "commissionValueText": "",
    "signedAt": "16/10/25 10:51:57",
    "client": "Jorge Nunes de Oliveira",
    "realEstate": "Mega Lançamentos Imobiliarios Ltda",
    "status": "Não contabilizada antes de jan/2026",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  },
  {
    "unit": "RGLQBCA04",
    "projectCode": "RGL",
    "contractValueText": "3.246.630,00",
    "commissionValueText": "",
    "signedAt": "20/10/25 09:49:07",
    "client": "Marco Aurelio Madruga Taboadela",
    "realEstate": "Rmeirelles Negocios Imobiliarios Eireli",
    "status": "Não contabilizada antes de jan/2026",
    "source": "Acerto de Contas Remun LEV - Vendas.pdf"
  }
];
const DATABASE_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
const ENABLE_LEGACY_JSON_FALLBACK = process.env.ENABLE_LEGACY_JSON_FALLBACK === "true";
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.INITIAL_ADMIN_PASSWORD || "local-dev-session-secret";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_API_KEY_TESTE = process.env.RESEND_API_KEY_TESTE || "";
const RESEND_API_KEY_GOLF = process.env.RESEND_API_KEY_GOLF || process.env.GOLF_RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Pipeline Mauad <onboarding@resend.dev>";
const EMAIL_FROM_TESTE = process.env.EMAIL_FROM_TESTE || "";
const LEV_FINANCE_EMAIL_FROM = process.env.EMAIL_FROM_FINAN_COEVO || process.env.LEV_FINANCE_EMAIL_FROM || "Financeiro Lev <financeiro@grupocoevo.com.br>";
const EVO_API_URL = process.env.EVO_API_URL || "";
const EVO_API_KEY = process.env.EVO_API_KEY || "";
const EVO_INSTANCE = process.env.EVO_INSTANCE || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || "";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const META_DEFAULT_ASSIGNED_TO = process.env.META_DEFAULT_ASSIGNED_TO || "";
const SAM_WEBHOOK_SECRET = process.env.SAM_WEBHOOK_SECRET || "";
const BACKUP_SECRET = process.env.CRON_SECRET || process.env.BACKUP_SECRET || "";
const APP_SCHEMA_VERSION = 2026082003;
const DB_CACHE_TTL_MS = 3000;
let sqlClientPromise = null;
let structuredSchemaReady = false;
let structuredSchemaPromise = null;
let postgresInitialized = false;
let dbCache = null;
let dbCacheAt = 0;

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

function verifyPasswordSafe(password, stored) {
  try {
    return verifyPassword(password, stored);
  } catch {
    return false;
  }
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

function saoPauloDateOnly(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function sanitizeRichHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function normalizeProvisioningTerminology(value) {
  return String(value || "")
    .replace(/Aprovisionamentos/g, "Provisionamentos")
    .replace(/aprovisionamentos/g, "provisionamentos")
    .replace(/Aprovisionamento/g, "Provisionamento")
    .replace(/aprovisionamento/g, "provisionamento")
    .replace(/Aprovisionar/g, "Provisionar")
    .replace(/aprovisionar/g, "provisionar");
}

function normalizeLevFinanceEmailTemplate(template = {}) {
  return {
    html: normalizeProvisioningTerminology(sanitizeRichHtml(template.html || DEFAULT_LEV_EMAIL_TEMPLATE_HTML)),
    fontFamily: String(template.fontFamily || "Arial").trim() || "Arial",
    fontSize: String(template.fontSize || "14px").trim() || "14px",
    color: String(template.color || "#101828").trim() || "#101828",
    lineHeight: String(template.lineHeight || "1.5").trim() || "1.5"
  };
}

function prepareInlineEmailImages(html, filenamePrefix = "imagem-email") {
  const attachments = [];
  const convertedHtml = sanitizeRichHtml(html).replace(/(\bsrc\s*=\s*["'])data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)(["'])/gi, (match, prefix, mimeType, content, suffix) => {
    const contentId = `${filenamePrefix}-${attachments.length + 1}`;
    const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : "jpg";
    attachments.push({
      filename: `${filenamePrefix}-${attachments.length + 1}.${extension}`,
      content: content.replace(/\s/g, ""),
      content_type: mimeType.toLowerCase(),
      content_id: contentId,
      content_disposition: "inline"
    });
    return `${prefix}cid:${contentId}${suffix}`;
  });
  return { html: convertedHtml, attachments };
}

function renderLevFinanceEmailTemplate(settings = {}, variables = {}) {
  const template = normalizeLevFinanceEmailTemplate(settings.emailTemplate || {});
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

function prepareLevFinanceEmailTemplate(settings = {}, variables = {}) {
  return prepareInlineEmailImages(renderLevFinanceEmailTemplate(settings, variables), "imagem-financeiro-lev");
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
        projects: DEFAULT_PROJECTS,
        pipelineStatuses: ["Novo Lead", "Encaminhado ao Corretor", "Interesse Definido", "Simulação de Financiamento", "Desqualificado", "Arquivado (Permanentemente)", "Sem status"],
        users: [],
        leads: [],
        integrations: {
          metaForms: { enabled: false, forms: [] },
          whatsapp: { enabled: false, provider: "", tokenSet: false },
          email: { enabled: false, sender: "", smtpHost: "" },
          proprietaryEndpoints: []
        },
        samEvents: [],
        importSummary: { origin: "EMPTY", leadCount: 0, inactiveBrokerCount: 0 }
      };
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "Admin@12345";
  const now = new Date().toISOString();
  const db = {
    schemaVersion: APP_SCHEMA_VERSION,
    roles: [...new Set([...(seed.roles || []), ...ROLES])],
    projects: seed.projects || DEFAULT_PROJECTS,
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
        samEvents: [],
        accessLog: [],
        marketing: defaultMarketingData(),
        knowledgeArticles: DEFAULT_KNOWLEDGE_ARTICLES,
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

function defaultMarketingData() {
  return {
    actualExpenses: MARKETING_HISTORICAL_EXPENSES.map((item) => ({ ...item })),
    reconciliationQueue: [],
    provisions: [],
    commitments: [],
    budgetGroups: ["Estratégia", "Gestão de marketing", "Marketing offline", "Marketing online", "Stand de vendas", "Comercial"],
    budgetCategories: [],
    budgetEntries: []
  };
}

function normalizeMarketingData(marketing) {
  const source = marketing && typeof marketing === "object" && !Array.isArray(marketing) ? marketing : {};
  const actualExpenses = Array.isArray(source.actualExpenses) && source.actualExpenses.length
    ? source.actualExpenses
    : MARKETING_HISTORICAL_EXPENSES;
  return {
    actualExpenses: actualExpenses.map((item) => ({
      ...item,
      id: String(item.id || `mkt-exp-${crypto.randomUUID()}`),
      project: String(item.project || "").trim(),
      paymentDate: String(item.paymentDate || "").slice(0, 10),
      paidAmount: Number(item.paidAmount || 0),
      provisioningId: String(item.provisioningId || ""),
      eventId: String(item.eventId || "")
    })),
    reconciliationQueue: Array.isArray(source.reconciliationQueue) ? source.reconciliationQueue : [],
    provisions: Array.isArray(source.provisions) ? source.provisions : [],
    commitments: Array.isArray(source.commitments) ? source.commitments : [],
    budgetGroups: ["Estratégia", "Gestão de marketing", "Marketing offline", "Marketing online", "Stand de vendas", "Comercial"],
    budgetCategories: Array.isArray(source.budgetCategories) ? source.budgetCategories : [],
    budgetEntries: Array.isArray(source.budgetEntries) ? source.budgetEntries : (Array.isArray(source.budgets) ? source.budgets : [])
  };
}

async function ensurePostgresState() {
  if (dbCache && Date.now() - dbCacheAt < DB_CACHE_TTL_MS) return dbCache;
  const sql = await getSql();
  if (!sql) return null;
  if (!postgresInitialized) {
    await sql`
      CREATE TABLE IF NOT EXISTS app_state (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    postgresInitialized = true;
  }
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
    dbCache = db;
    dbCacheAt = Date.now();
    return db;
  }
  const db = buildDefaultDb();
  await sql`INSERT INTO app_state (id, data) VALUES ('main', ${JSON.stringify(db)}::jsonb)`;
  dbCache = db;
  dbCacheAt = Date.now();
  return db;
}

async function loadDb() {
  if (!ENABLE_LEGACY_JSON_FALLBACK) throw new Error("Fallback JSON legado desativado.");
  if (DATABASE_URL) return ensurePostgresState();
  return buildDefaultDb();
}

async function saveDb(db) {
  if (!ENABLE_LEGACY_JSON_FALLBACK) throw new Error("Gravação JSON/app_state legada desativada.");
  dbCache = db;
  dbCacheAt = Date.now();
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
  if (!ENABLE_LEGACY_JSON_FALLBACK) throw new Error("Log legado em JSON/app_state desativado.");
  dbCache = db;
  dbCacheAt = Date.now();
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
  if (db?.schemaVersion === APP_SCHEMA_VERSION) return db;
  let changed = db?.schemaVersion !== APP_SCHEMA_VERSION;
  if (!Array.isArray(db.roles)) {
    db.roles = [...ROLES];
    changed = true;
  } else {
    const mergedRoles = [...new Set([...db.roles, ...ROLES])];
    if (mergedRoles.length !== db.roles.length) {
      db.roles = mergedRoles;
      changed = true;
    }
  }
  if (!Array.isArray(db.auditLog)) {
    db.auditLog = [];
    changed = true;
  }
  if (!Array.isArray(db.accessLog)) {
    db.accessLog = [];
    changed = true;
  }
  if (!Array.isArray(db.fupLeadLog)) {
    db.fupLeadLog = [];
    changed = true;
  }
  if (!Array.isArray(db.integrationLog)) {
    db.integrationLog = [];
    changed = true;
  }
  if (!Array.isArray(db.samEvents)) {
    db.samEvents = [];
    changed = true;
  }
  const normalizedMarketing = normalizeMarketingData(db.marketing);
  if (!db.marketing || !Array.isArray(db.marketing.actualExpenses)) changed = true;
  db.marketing = normalizedMarketing;
  if (!db.baseAccess || typeof db.baseAccess !== "object" || Array.isArray(db.baseAccess)) {
    db.baseAccess = structuredClone(DEFAULT_BASE_ACCESS);
    changed = true;
  }
  if (!db.baseAccess.roles || typeof db.baseAccess.roles !== "object" || Array.isArray(db.baseAccess.roles)) {
    db.baseAccess.roles = structuredClone(DEFAULT_BASE_ACCESS.roles);
    changed = true;
  }
  if (!db.baseAccess.users || typeof db.baseAccess.users !== "object" || Array.isArray(db.baseAccess.users)) {
    db.baseAccess.users = {};
    changed = true;
  }
  for (const role of ROLES) {
    const current = db.baseAccess.roles[role] || DEFAULT_BASE_ACCESS.roles[role] || { enabled: false, sources: [] };
    db.baseAccess.roles[role] = {
      enabled: current.enabled !== false,
      sources: Array.isArray(current.sources) ? current.sources.map((source) => String(source || "").trim()).filter(Boolean) : []
    };
  }
  for (const [userId, rule] of Object.entries(db.baseAccess.users)) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      delete db.baseAccess.users[userId];
      changed = true;
      continue;
    }
    db.baseAccess.users[userId] = {
      override: Boolean(rule.override),
      enabled: rule.enabled !== false,
      sources: Array.isArray(rule.sources) ? rule.sources.map((source) => String(source || "").trim()).filter(Boolean) : []
    };
  }
  ensurePermissions(db);
  if (!Array.isArray(db.knowledgeArticles)) {
    db.knowledgeArticles = DEFAULT_KNOWLEDGE_ARTICLES.map((article) => ({ ...article }));
    changed = true;
  }
  if (!Array.isArray(db.knowledgeChatSessions)) {
    db.knowledgeChatSessions = [];
    changed = true;
  }
  if (!db.levFinance || typeof db.levFinance !== "object" || Array.isArray(db.levFinance)) {
    db.levFinance = {};
    changed = true;
  }
  if (!db.levFinance.settings || typeof db.levFinance.settings !== "object" || Array.isArray(db.levFinance.settings)) {
    db.levFinance.settings = {};
    changed = true;
  }
  db.levFinance.settings = {
    commissionPercent: Number(db.levFinance.settings.commissionPercent || 0),
    provisionTo: String(db.levFinance.settings.provisionTo || "").trim(),
    provisionCc: String(db.levFinance.settings.provisionCc || "").trim(),
    emailTemplate: normalizeLevFinanceEmailTemplate(db.levFinance.settings.emailTemplate),
    paymentSchedule: Array.isArray(db.levFinance.settings.paymentSchedule)
      ? db.levFinance.settings.paymentSchedule
      : DEFAULT_LEV_PAYMENT_SCHEDULE.map((item) => ({ ...item }))
  };
  db.levFinance.settings.paymentSchedule = db.levFinance.settings.paymentSchedule
    .map((item) => ({
      start: String(item.start || "").trim(),
      end: String(item.end || "").trim(),
      paymentDate: String(item.paymentDate || "").trim()
    }))
    .filter((item) => item.start && item.end && item.paymentDate)
    .sort((a, b) => new Date(`${a.start}T00:00:00`).getTime() - new Date(`${b.start}T00:00:00`).getTime());
  db.levFinance.defaultSettlementsCleared = Boolean(db.levFinance.defaultSettlementsCleared);
  if (!Array.isArray(db.levFinance.sales)) {
    db.levFinance.sales = [];
    changed = true;
  }
  if (!Array.isArray(db.levFinance.receipts)) {
    db.levFinance.receipts = [];
    changed = true;
  }
  if (!Array.isArray(db.levFinance.paidUnits)) {
    db.levFinance.paidUnits = [];
    changed = true;
  }
  if (!Array.isArray(db.levFinance.settlements)) {
    db.levFinance.settlements = [];
    changed = true;
  }
  const settledLevUnits = new Set([
    ...db.levFinance.paidUnits.map(normalizeLevUnit),
    ...DEFAULT_LEV_SETTLEMENTS
      .filter((settlement) => settlement.status === "Paga" || settlement.status === "Não contabilizada antes de jan/2026")
      .map((settlement) => normalizeLevUnit(settlement.unit)),
    ...(db.levFinance.settlements || [])
      .filter((settlement) => settlement.status === "Paga" || settlement.status === "Não contabilizada antes de jan/2026")
      .map((settlement) => normalizeLevUnit(settlement.unit))
  ]);
  const previousLevSalesLength = db.levFinance.sales.length;
  db.levFinance.sales = db.levFinance.sales.map((sale) => ({
    id: String(sale.id || `lev-sale-${crypto.randomUUID()}`),
    sourceId: String(sale.sourceId || "").trim(),
    unit: normalizeLevUnit(sale.unit || sale.produto || ""),
    client: String(sale.client || "").trim(),
    contractValue: Number(sale.contractValue || 0),
    signedAt: String(sale.signedAt || "").trim(),
    status: String(sale.status || "Extraída").trim(),
    table: String(sale.table || "").trim(),
    realEstate: String(sale.realEstate || "").trim(),
    eligible: Boolean(sale.eligible),
    confirmedAt: sale.confirmedAt || "",
    confirmedBy: sale.confirmedBy || "",
    provisionDate: sale.provisionDate || "",
    provisionEmailSentAt: sale.provisionEmailSentAt || "",
    invoiceNumber: String(sale.invoiceNumber || "").trim(),
    invoiceIssuedAt: String(sale.invoiceIssuedAt || "").trim(),
    paidAt: String(sale.paidAt || "").trim(),
    commissionPercent: Number(sale.commissionPercent || db.levFinance.settings.commissionPercent || 0),
    commissionValue: Number(sale.commissionValue || 0),
    createdAt: sale.createdAt || new Date().toISOString(),
    updatedAt: sale.updatedAt || sale.createdAt || new Date().toISOString()
  })).filter((sale, index, sales) => (
    isLikelyLevUnit(sale.unit)
    && !settledLevUnits.has(sale.unit)
    && sales.findIndex((item) => item.unit === sale.unit) === index
  ));
  if (db.levFinance.sales.length !== previousLevSalesLength) changed = true;
  db.levFinance.receipts = db.levFinance.receipts.map((receipt) => ({
    id: String(receipt.id || `lev-receipt-${crypto.randomUUID()}`),
    unit: normalizeLevUnit(receipt.unit || ""),
    amount: Number(receipt.amount || 0),
    receivedAt: String(receipt.receivedAt || "").trim(),
    note: String(receipt.note || "").trim(),
    createdAt: receipt.createdAt || new Date().toISOString(),
    createdBy: String(receipt.createdBy || "").trim()
  })).filter((receipt) => receipt.unit);
  if (!db.levFinance.defaultSettlementsCleared) {
    for (const settlement of DEFAULT_LEV_SETTLEMENTS) {
      if (!db.levFinance.settlements.some((item) => item.unit === settlement.unit)) {
        db.levFinance.settlements.push({
          id: `lev-settlement-${settlement.unit}`,
          ...settlement,
          contractValue: parseMoney(settlement.contractValueText),
          commissionValue: parseMoney(settlement.commissionValueText),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        changed = true;
      }
    }
  }
  const previousLevSettlementsLength = db.levFinance.settlements.length;
  db.levFinance.settlements = db.levFinance.settlements.map((settlement) => ({
    id: String(settlement.id || `lev-settlement-${crypto.randomUUID()}`),
    unit: normalizeLevUnit(settlement.unit || ""),
    projectCode: String(settlement.projectCode || "").trim(),
    contractValueText: String(settlement.contractValueText || "").trim(),
    commissionValueText: String(settlement.commissionValueText || "").trim(),
    contractValue: Number(settlement.contractValue || parseMoney(settlement.contractValueText)),
    commissionValue: Number(settlement.commissionValue || parseMoney(settlement.commissionValueText)),
    signedAt: String(settlement.signedAt || "").trim(),
    client: String(settlement.client || "").trim(),
    realEstate: String(settlement.realEstate || "").trim(),
    status: String(settlement.status || "").trim(),
    invoiceNumber: String(settlement.invoiceNumber || "").trim(),
    invoiceIssuedAt: String(settlement.invoiceIssuedAt || "").trim(),
    paidAt: String(settlement.paidAt || "").trim(),
    source: String(settlement.source || "").trim(),
    createdAt: settlement.createdAt || new Date().toISOString(),
    updatedAt: settlement.updatedAt || settlement.createdAt || new Date().toISOString()
  })).filter((settlement, index, settlements) => (
    isLikelyLevUnit(settlement.unit)
    && settlements.findIndex((item) => item.unit === settlement.unit) === index
  ));
  if (db.levFinance.settlements.length !== previousLevSettlementsLength) changed = true;
  const previousLevSalesAfterSettlementCleanup = db.levFinance.sales.length;
  db.levFinance.sales = db.levFinance.sales.filter((sale) => !isLikelyScrambledLevSale(sale, db));
  if (db.levFinance.sales.length !== previousLevSalesAfterSettlementCleanup) changed = true;
  db.levFinance.paidUnits = [...new Set([
    ...db.levFinance.paidUnits.map((unit) => String(unit || "").trim()).filter(Boolean),
    ...db.levFinance.receipts.map((receipt) => receipt.unit),
    ...db.levFinance.settlements.filter((settlement) => settlement.status === "Paga").map((settlement) => settlement.unit)
  ])];
  for (const defaultArticle of DEFAULT_KNOWLEDGE_ARTICLES) {
    if (!db.knowledgeArticles.some((article) => article.id === defaultArticle.id)) {
      db.knowledgeArticles.push({ ...defaultArticle });
      changed = true;
    }
  }
  db.knowledgeArticles = db.knowledgeArticles.map((article) => ({
    id: String(article.id || `kb-${crypto.randomUUID()}`).trim(),
    title: String(article.title || "").trim(),
    category: KNOWLEDGE_CATEGORIES.includes(article.category) ? article.category : "Primeiros passos",
    summary: String(article.summary || "").trim(),
    content: String(article.content || "").trim(),
    keywords: Array.isArray(article.keywords) ? article.keywords.map((keyword) => String(keyword).trim()).filter(Boolean).slice(0, 24) : [],
    audienceRoles: Array.isArray(article.audienceRoles)
      ? article.audienceRoles.filter((role) => ROLES.includes(role))
      : [...ROLES],
    published: article.published !== false,
    createdAt: article.createdAt || new Date().toISOString(),
    updatedAt: article.updatedAt || article.createdAt || new Date().toISOString(),
    updatedBy: String(article.updatedBy || "").trim()
  })).filter((article, index, articles) => article.id && article.title && articles.findIndex((item) => item.id === article.id) === index);
  db.knowledgeChatSessions = db.knowledgeChatSessions
    .map((session) => ({
      id: String(session.id || `kc-${crypto.randomUUID()}`).trim(),
      userId: String(session.userId || "").trim(),
      title: String(session.title || "Nova conversa").trim().slice(0, 90),
      messages: Array.isArray(session.messages) ? session.messages.slice(-30).map((message) => ({
        role: ["user", "assistant"].includes(message.role) ? message.role : "assistant",
        text: String(message.text || "").trim().slice(0, 4000),
        sources: Array.isArray(message.sources) ? message.sources.slice(0, 4) : [],
        at: message.at || new Date().toISOString()
      })).filter((message) => message.text) : [],
      generatedTutorialId: String(session.generatedTutorialId || "").trim(),
      createdAt: session.createdAt || new Date().toISOString(),
      updatedAt: session.updatedAt || session.createdAt || new Date().toISOString()
    }))
    .filter((session) => session.id && session.userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 300);
  if (!Array.isArray(db.pipelineStatuses)) {
    db.pipelineStatuses = [];
    changed = true;
  }
  if (!Array.isArray(db.projects)) {
    db.projects = [...DEFAULT_PROJECTS];
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
    if (!lead.inPipeline && lead.source === "Pipeline GDrive" && lead.rolledBackAt && lead.previousPipelineSource && lead.previousPipelineSource !== "Pipeline GDrive") {
      lead.source = lead.previousPipelineSource;
      changed = true;
    }
    if (lead.inPipeline == null) {
      lead.inPipeline = lead.source !== "ODYSSEIA";
      changed = true;
    }
  }
  for (const user of db.users || []) {
    if (user.operatesAsBroker == null) {
      user.operatesAsBroker = false;
      changed = true;
    }
    if (!user.notifications || typeof user.notifications !== "object" || Array.isArray(user.notifications)) {
      user.notifications = { email: false, whatsapp: false, whatsappNumber: "" };
      changed = true;
    } else {
      user.notifications = {
        email: Boolean(user.notifications.email),
        whatsapp: Boolean(user.notifications.whatsapp),
        whatsappNumber: String(user.notifications.whatsappNumber || user.whatsapp || "").trim()
      };
    }
  }
  if (db.integrations?.metaForms && !Array.isArray(db.integrations.metaForms.mappings)) {
    db.integrations.metaForms.mappings = [];
    changed = true;
  }
  if (db.integrations?.metaForms && !Array.isArray(db.integrations.metaForms.forms)) {
    db.integrations.metaForms.forms = [];
    changed = true;
  }
  if (db.integrations?.metaForms?.forms) {
    db.integrations.metaForms.forms = db.integrations.metaForms.forms
      .map((form) => {
        if (typeof form === "string") return { id: form, name: "", project: "", adUrl: "", adLinks: [], questionLabels: {}, answerLabels: {}, archived: false };
        return {
          id: String(form.id || form.formId || "").trim(),
          name: String(form.name || "").trim(),
          project: String(form.project || "").trim(),
          adUrl: String(form.adUrl || form.ad_url || "").trim(),
          adLinks: Array.isArray(form.adLinks) ? form.adLinks.map((ad) => ({
            id: String(ad.id || ad.adId || "").trim(),
            url: String(ad.url || ad.adUrl || "").trim()
          })).filter((ad) => ad.id && ad.url) : [],
          questionLabels: form.questionLabels && typeof form.questionLabels === "object" ? form.questionLabels : {},
          answerLabels: form.answerLabels && typeof form.answerLabels === "object" ? form.answerLabels : {},
          archived: Boolean(form.archived)
        };
      })
      .filter((form, index, forms) => form.id && forms.findIndex((item) => item.id === form.id) === index);
  }
  db.schemaVersion = APP_SCHEMA_VERSION;
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

function normalizeNotificationPreferences(value = {}) {
  return {
    email: Boolean(value.email),
    whatsapp: Boolean(value.whatsapp),
    whatsappNumber: String(value.whatsappNumber || "").trim(),
    metaHealthWhatsapp: Boolean(value.metaHealthWhatsapp)
  };
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

function externalFetchFailureReason(provider, error) {
  const cause = error?.cause || {};
  const details = [error?.message, cause.code, cause.hostname].filter(Boolean).join(" · ");
  return `Falha de conexão com ${provider}: ${details || "erro de rede"}`;
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

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY ausente" };
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Resend", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || "Falha no envio do Resend" };
  return { sent: true, id: data.id };
}

async function sendEmailDiagnostics(user) {
  const testFrom = EMAIL_FROM_TESTE || EMAIL_FROM;
  if (!RESEND_API_KEY_TESTE) return { sent: false, reason: "RESEND_API_KEY_TESTE ausente" };
  const now = new Date().toISOString();
  const html = `
    <div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.5">
      <h2>Teste de envio de e-mail</h2>
      <p>Este e-mail confirma que o Pipeline Comercial Mauad conseguiu enviar uma mensagem pelo Resend de teste configurado na Vercel.</p>
      <ul>
        <li><strong>Remetente de teste:</strong> ${escapeHtml(testFrom)}</li>
        <li><strong>Usuário solicitante:</strong> ${escapeHtml(user?.name || user?.username || "-")}</li>
        <li><strong>Gerado em:</strong> ${escapeHtml(now)}</li>
      </ul>
      <p>Se você recebeu esta mensagem, a variável RESEND_API_KEY_TESTE está funcionando. O sistema em produção continua usando RESEND_API_KEY.</p>
    </div>
  `;
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY_TESTE}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: testFrom, to: "renat.cg@gmail.com", subject: "Teste de e-mail - Pipeline Comercial Mauad", html })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Resend", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || "Falha no envio do Resend de teste" };
  return { sent: true, id: data.id, from: testFrom };
}

async function sendEmailWithCcFrom(from, to, cc, subject, html, options = {}) {
  const apiKey = options.apiKey || RESEND_API_KEY;
  const apiKeyLabel = options.apiKeyLabel || "RESEND_API_KEY";
  if (!apiKey) return { sent: false, reason: `${apiKeyLabel} ausente` };
  const recipients = String(to || "").split(",").map((item) => item.trim()).filter(Boolean);
  const ccRecipients = String(cc || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "E-mail Para não configurado" };
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: from || EMAIL_FROM,
        to: recipients,
        cc: ccRecipients.length ? ccRecipients : undefined,
        subject,
        html,
        attachments: Array.isArray(options.attachments) && options.attachments.length ? options.attachments : undefined
      })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Resend", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || "Falha no envio do Resend" };
  return { sent: true, id: data.id, from: from || EMAIL_FROM };
}

async function sendEmailWithCc(to, cc, subject, html) {
  return sendEmailWithCcFrom(EMAIL_FROM, to, cc, subject, html);
}

async function sendEmailWithAttachments(to, cc, subject, html, attachments = []) {
  if (!RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY ausente" };
  const recipients = String(to || "").split(",").map((item) => item.trim()).filter(Boolean);
  const ccRecipients = String(cc || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "E-mail Para não configurado" };
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: recipients,
        cc: ccRecipients.length ? ccRecipients : undefined,
        subject,
        html,
        attachments
      })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Resend", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || "Falha no envio do Resend" };
  return { sent: true, id: data.id };
}

function parseMoney(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeLevUnit(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isLikelyLevUnit(value) {
  const unit = normalizeLevUnit(value);
  if (!unit) return false;
  if (/[,.]/.test(unit) || unit.includes("R$")) return false;
  return /^(GCR|RGL|RES)[A-Z0-9]{4,}$/.test(unit);
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function findLikelyLevUnit(raw = {}) {
  const preferredKeys = ["unit", "produto", "Produto", "product", "unidade", "Unidade"];
  for (const key of preferredKeys) {
    if (isLikelyLevUnit(raw[key])) return normalizeLevUnit(raw[key]);
  }
  for (const value of Object.values(raw || {})) {
    if (isLikelyLevUnit(value)) return normalizeLevUnit(value);
  }
  return "";
}

function parseBrazilDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  return new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
}

function provisionFridayForRequest(sentAt = new Date()) {
  const base = new Date(sentAt);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const cutoffTuesday = new Date(base);
  if (day === 2) cutoffTuesday.setDate(base.getDate());
  else if (day < 2) cutoffTuesday.setDate(base.getDate() + (2 - day));
  else cutoffTuesday.setDate(base.getDate() + (9 - day));
  const provision = new Date(cutoffTuesday);
  provision.setDate(cutoffTuesday.getDate() + 24);
  return saoPauloDateOnly(provision);
}

function provisionDateFromPaymentSchedule(settings = {}, sentAt = new Date()) {
  const base = new Date(sentAt);
  base.setHours(0, 0, 0, 0);
  const schedule = Array.isArray(settings.paymentSchedule) ? settings.paymentSchedule : [];
  const match = schedule.find((item) => {
    const start = new Date(`${item.start}T00:00:00`);
    const end = new Date(`${item.end}T23:59:59`);
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && base >= start && base <= end;
  });
  return match?.paymentDate || provisionFridayForRequest(base);
}

function publicLevFinance(db) {
  const finance = db.levFinance || { settings: {}, sales: [], receipts: [], paidUnits: [], settlements: [] };
  const paid = new Set([
    ...(finance.paidUnits || []).map(normalizeLevUnit),
    ...(finance.settlements || [])
      .filter((settlement) => settlement.status === "Paga" || settlement.status === "Não contabilizada antes de jan/2026")
      .map((settlement) => normalizeLevUnit(settlement.unit))
  ]);
  return {
    settings: finance.settings || {},
    sales: (finance.sales || [])
      .filter((sale) => isLikelyLevUnit(sale.unit) && !isLikelyScrambledLevSale(sale, db))
      .map((sale) => ({
        ...sale,
        unit: normalizeLevUnit(sale.unit),
        paid: paid.has(normalizeLevUnit(sale.unit))
      }))
      .sort((a, b) => (parseBrazilDate(b.signedAt)?.getTime() || new Date(b.createdAt).getTime()) - (parseBrazilDate(a.signedAt)?.getTime() || new Date(a.createdAt).getTime())),
    receipts: finance.receipts || [],
    paidUnits: finance.paidUnits || [],
    settlements: (finance.settlements || [])
      .filter((settlement) => isLikelyLevUnit(settlement.unit))
      .map((settlement) => ({ ...settlement, unit: normalizeLevUnit(settlement.unit) }))
      .sort((a, b) => (parseBrazilDate(b.signedAt)?.getTime() || new Date(b.createdAt).getTime()) - (parseBrazilDate(a.signedAt)?.getTime() || new Date(a.createdAt).getTime()))
  };
}

function normalizeLevSale(raw, settings = {}) {
  const unit = findLikelyLevUnit(raw);
  const contractValue = parseMoney(raw.contractValue ?? raw.valorContrato ?? raw["Valor contrato"]);
  const commissionPercent = Number(settings.commissionPercent || 0);
  return {
    id: `lev-sale-${crypto.randomUUID()}`,
    sourceId: String(raw.sourceId || raw.id || raw["ID"] || "").trim(),
    unit,
    client: String(raw.client || raw.cliente || raw["Cliente"] || "").trim(),
    contractValue,
    signedAt: String(raw.signedAt || raw.assinatura || raw["DtHr Assinatura"] || "").trim(),
    status: String(raw.status || raw["Status"] || "Assinado").trim(),
    table: String(raw.table || raw.tabela || raw["Tabela"] || "").trim(),
    realEstate: String(raw.realEstate || raw.imobiliaria || raw["Imobiliária"] || "").trim(),
    eligible: false,
    confirmedAt: "",
    confirmedBy: "",
    provisionDate: "",
    provisionEmailSentAt: "",
    invoiceNumber: String(raw.invoiceNumber || raw.numeroNf || raw["NF"] || "").trim(),
    invoiceIssuedAt: String(raw.invoiceIssuedAt || raw.emissaoNf || "").trim(),
    paidAt: String(raw.paidAt || raw.dataPagamento || "").trim(),
    commissionPercent,
    commissionValue: contractValue * (commissionPercent / 100),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function levSettlementIsPaidOrIgnored(settlement) {
  const status = normalizeComparableText(settlement.status);
  return status.includes("paga") || status.includes("nao contabilizada") || status.includes("ignorada");
}

function sameMoneyApprox(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= 100;
}

function isLikelyScrambledLevSale(sale, db) {
  if (sale.eligible) return false;
  const saleClient = normalizeComparableText(sale.client);
  if (!saleClient) return false;
  return (db.levFinance?.settlements || []).some((settlement) => (
    levSettlementIsPaidOrIgnored(settlement)
    && normalizeComparableText(settlement.client) === saleClient
    && normalizeLevUnit(settlement.unit) !== normalizeLevUnit(sale.unit)
    && sameMoneyApprox(settlement.contractValue, sale.contractValue)
  ));
}

function levSaleValidation(db, sale) {
  const reasons = [];
  if (!sale.unit || !isLikelyLevUnit(sale.unit)) reasons.push("Unidade inválida");
  if (!sale.sourceId || !/^\d+$/.test(String(sale.sourceId))) reasons.push("ID da linha ausente");
  if (!sale.client) reasons.push("Cliente ausente");
  if (!sale.signedAt) reasons.push("Assinatura ausente");
  if (!String(sale.status || "").toLowerCase().includes("assinado")) reasons.push("Status não assinado");
  if (!sale.contractValue) reasons.push("Valor do contrato ausente");
  if (isLikelyScrambledLevSale(sale, db)) reasons.push("Possível linha embaralhada com venda já paga");
  return reasons;
}

function levFinanceSettledUnits(db) {
  return new Set([
    ...(db.levFinance.paidUnits || []).map(normalizeLevUnit),
    ...(db.levFinance.settlements || [])
      .filter(levSettlementIsPaidOrIgnored)
      .map((settlement) => normalizeLevUnit(settlement.unit))
  ]);
}

function buildLevExtractionPreview(db, rawSales = []) {
  const settled = levFinanceSettledUnits(db);
  const seen = new Set();
  const preview = [];
  const invalid = [];
  for (const raw of rawSales) {
    const sale = normalizeLevSale(raw, db.levFinance.settings);
    const reasons = levSaleValidation(db, sale);
    if (!reasons.length && settled.has(sale.unit)) reasons.push("Venda já paga/ignorada");
    if (!reasons.length && db.levFinance.sales.some((item) => item.unit === sale.unit)) reasons.push("Venda já existente");
    if (!reasons.length && seen.has(sale.unit)) reasons.push("Unidade duplicada na extração");
    seen.add(sale.unit);
    const row = {
      sourceId: sale.sourceId,
      unit: sale.unit,
      client: sale.client,
      signedAt: sale.signedAt,
      contractValue: sale.contractValue,
      status: sale.status,
      table: sale.table,
      realEstate: sale.realEstate,
      commissionPercent: sale.commissionPercent,
      commissionValue: sale.commissionValue,
      valid: !reasons.length,
      reasons
    };
    if (row.valid) preview.push(row);
    else invalid.push(row);
  }
  return {
    preview,
    invalid,
    summary: {
      extracted: rawSales.length,
      valid: preview.length,
      invalid: invalid.length
    }
  };
}

function upsertLevSettlement(db, sale, status, source = "Financeiro Lev") {
  if (!db.levFinance) db.levFinance = {};
  if (!Array.isArray(db.levFinance.settlements)) db.levFinance.settlements = [];
  const unit = String(sale.unit || "").trim();
  if (!unit) return;
  const existing = db.levFinance.settlements.find((item) => item.unit === unit);
  const data = {
    unit,
    projectCode: String(sale.projectCode || "").trim(),
    contractValueText: sale.contractValueText || formatCurrency(sale.contractValue).replace("R$ ", ""),
    commissionValueText: sale.commissionValueText || (sale.commissionValue ? formatCurrency(sale.commissionValue).replace("R$ ", "") : ""),
    contractValue: Number(sale.contractValue || 0),
    commissionValue: Number(sale.commissionValue || 0),
    signedAt: String(sale.signedAt || "").trim(),
    client: String(sale.client || "").trim(),
    realEstate: String(sale.realEstate || "").trim(),
    status,
    invoiceNumber: String(sale.invoiceNumber || "").trim(),
    invoiceIssuedAt: String(sale.invoiceIssuedAt || "").trim(),
    paidAt: String(sale.paidAt || "").trim(),
    source,
    updatedAt: new Date().toISOString()
  };
  if (existing) {
    Object.assign(existing, data);
  } else {
    db.levFinance.settlements.unshift({
      id: `lev-settlement-${crypto.randomUUID()}`,
      ...data,
      createdAt: new Date().toISOString()
    });
  }
}

function findLevFinanceRecord(db, rawKey) {
  const key = decodeURIComponent(String(rawKey || ""));
  const unitKey = key.startsWith("unit:") ? normalizeLevUnit(key.slice(5)) : "";
  const sale = db.levFinance.sales.find((item) => item.id === key || (unitKey && normalizeLevUnit(item.unit) === unitKey));
  const unit = normalizeLevUnit(unitKey || sale?.unit || key);
  const settlement = db.levFinance.settlements.find((item) => item.id === key || normalizeLevUnit(item.unit) === unit);
  return { sale, settlement, unit };
}

function saleFromSettlement(db, settlement) {
  const commissionPercent = Number(db.levFinance.settings?.commissionPercent || 0);
  const settlementStatus = levStatusKeyServer(settlement.status);
  const hasInvoiceStatus = settlementStatus.includes("nf emitida")
    || Boolean(settlement.invoiceNumber || settlement.invoiceIssuedAt);
  const sale = {
    id: `lev-sale-${crypto.randomUUID()}`,
    sourceId: "",
    unit: normalizeLevUnit(settlement.unit),
    client: String(settlement.client || "").trim(),
    contractValue: Number(settlement.contractValue || 0),
    signedAt: String(settlement.signedAt || "").trim(),
    status: "Assinado",
    table: "",
    realEstate: String(settlement.realEstate || "").trim(),
    eligible: hasInvoiceStatus,
    confirmedAt: "",
    confirmedBy: "",
    provisionDate: "",
    provisionEmailSentAt: "",
    invoiceNumber: String(settlement.invoiceNumber || "").trim(),
    invoiceIssuedAt: String(settlement.invoiceIssuedAt || "").trim(),
    paidAt: String(settlement.paidAt || "").trim(),
    commissionPercent,
    commissionValue: Number(settlement.commissionValue || 0) || Number(settlement.contractValue || 0) * (commissionPercent / 100),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.levFinance.sales.push(sale);
  return sale;
}

function levStatusKeyServer(value) {
  return normalizeComparableText(value);
}

function levRecordIsPaid(item) {
  return Boolean(item?.paid || item?.paidAt || levStatusKeyServer(item?.status) === "paga");
}

function levRecordIsIgnored(item) {
  const key = levStatusKeyServer(item?.status);
  return key.includes("nao contabilizada") || key.includes("ignorada");
}

function levRecordIsAwaitingAuthorization(item) {
  return levStatusKeyServer(item?.status).includes("aguardando autorizacao");
}

function levRecordIsNfIssued(item) {
  const key = levStatusKeyServer(item?.status);
  return key.includes("nf emitida")
    || Boolean(item?.invoiceNumber || item?.invoiceIssuedAt);
}

function levRecordIsConfirmedForMauad(item) {
  return Boolean(item?.eligible) || levStatusKeyServer(item?.status).includes("confirmad");
}

function levRecordIsPendingMauad(item) {
  return !levRecordIsPaid(item)
    && !levRecordIsIgnored(item)
    && !levRecordIsAwaitingAuthorization(item)
    && !levRecordIsNfIssued(item);
}

function applyLevRecordFields(db, sale, settlement, fields = {}) {
  const oldUnit = normalizeLevUnit(sale?.unit || settlement?.unit);
  const nextUnit = fields.unit !== undefined ? normalizeLevUnit(fields.unit) : oldUnit;
  if (fields.unit !== undefined && !isLikelyLevUnit(nextUnit)) throw new Error("Unidade inválida");
  const patch = {
    unit: nextUnit,
    client: fields.client !== undefined ? String(fields.client || "").trim() : undefined,
    signedAt: fields.signedAt !== undefined ? String(fields.signedAt || "").trim() : undefined,
    contractValue: fields.contractValue !== undefined ? parseMoney(fields.contractValue) : undefined,
    realEstate: fields.realEstate !== undefined ? String(fields.realEstate || "").trim() : undefined,
    invoiceNumber: fields.invoiceNumber !== undefined ? String(fields.invoiceNumber || "").trim() : undefined,
    invoiceIssuedAt: fields.invoiceIssuedAt !== undefined ? String(fields.invoiceIssuedAt || "").trim() : undefined,
    paidAt: fields.paidAt !== undefined ? String(fields.paidAt || "").trim() : undefined
  };
  for (const target of [sale, settlement].filter(Boolean)) {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) target[key] = value;
    }
    target.updatedAt = new Date().toISOString();
  }
  if (sale) {
    sale.commissionPercent = Number(sale.commissionPercent || db.levFinance.settings?.commissionPercent || 0);
    sale.commissionValue = Number(sale.contractValue || 0) * (Number(sale.commissionPercent || 0) / 100);
  }
  if (settlement) {
    settlement.commissionPercent = Number(settlement.commissionPercent || sale?.commissionPercent || db.levFinance.settings?.commissionPercent || 0);
    settlement.commissionValue = Number(settlement.contractValue || 0) * (Number(settlement.commissionPercent || 0) / 100);
  }
  if (oldUnit && nextUnit && oldUnit !== nextUnit) {
    db.levFinance.paidUnits = db.levFinance.paidUnits.map((unit) => normalizeLevUnit(unit) === oldUnit ? nextUnit : unit);
    db.levFinance.receipts.forEach((receipt) => {
      if (normalizeLevUnit(receipt.unit) === oldUnit) receipt.unit = nextUnit;
    });
  }
}

function deleteLevFinanceRecord(db, sale, settlement, unit) {
  const targetUnit = normalizeLevUnit(unit || sale?.unit || settlement?.unit);
  db.levFinance.sales = db.levFinance.sales.filter((item) => item !== sale && normalizeLevUnit(item.unit) !== targetUnit);
  db.levFinance.settlements = db.levFinance.settlements.filter((item) => item !== settlement && normalizeLevUnit(item.unit) !== targetUnit);
  db.levFinance.paidUnits = db.levFinance.paidUnits.filter((item) => normalizeLevUnit(item) !== targetUnit);
  db.levFinance.receipts = db.levFinance.receipts.filter((item) => normalizeLevUnit(item.unit) !== targetUnit);
}

async function extractLevSalesFromImage(imageDataUrl) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente para extração da imagem");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        "Extraia de uma imagem de planilha apenas registros de vendas imobiliárias com Status Assinado e DtHr Assinatura preenchida.",
        "Responda somente JSON válido no formato {\"sales\":[...]} sem markdown.",
        "Nunca combine dados de linhas diferentes. Cada item deve representar uma única linha horizontal da planilha.",
        "Use o ID da primeira coluna da mesma linha como sourceId. Se não conseguir ler o ID da linha, não inclua a linha.",
        "A unidade deve vir da coluna Produto, não da coluna Valor contrato. Unidades válidas começam com GCR, RGL ou RES, como GCR060107, RGLQDLF19 ou RES030307.",
        "Nunca preencha unit com valores monetários como 450.000,00. Se houver dúvida, preserve o código da coluna Produto em unit.",
        "Cada item deve ter: sourceId, unit, contractValue, signedAt, client, status, table, realEstate.",
        "Preserve datas e valores como aparecem na imagem quando possível. Ignore linhas sem assinatura preenchida."
      ].join(" "),
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Extraia as vendas assinadas desta imagem e responda em JSON válido." },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }],
      text: { format: { type: "json_object" } },
      max_output_tokens: 5000
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Não foi possível extrair vendas da imagem");
  const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((content) => content.text || "").join("").trim();
  const parsed = JSON.parse(text || "{\"sales\":[]}");
  return Array.isArray(parsed.sales) ? parsed.sales : [];
}

async function sendLevProvisionEmail(db, sale) {
  const settings = db.levFinance?.settings || {};
  const provisionDate = sale.provisionDate ? parseBrazilDate(sale.provisionDate) || new Date(`${sale.provisionDate}T00:00:00`) : null;
  const provisionLabel = provisionDate
    ? provisionDate.toLocaleDateString("pt-BR")
    : sale.provisionDate || "";
  const html = `
    <div style="font-family:Arial,sans-serif;color:#101828;line-height:1.5">
      <h2>Solicitação de provisionamento - Comissão Lev</h2>
      <p>Prezados,</p>
      <p>Solicitamos o provisionamento da comissão Lev para a venda abaixo, com previsão de pagamento em <strong>${escapeHtml(provisionLabel)}</strong>.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #d0d5dd">
        <tr><td><strong>Unidade</strong></td><td>${escapeHtml(sale.unit)}</td></tr>
        <tr><td><strong>Cliente</strong></td><td>${escapeHtml(sale.client)}</td></tr>
        <tr><td><strong>Data de assinatura</strong></td><td>${escapeHtml(sale.signedAt)}</td></tr>
        <tr><td><strong>Valor contrato</strong></td><td>${escapeHtml(formatCurrency(sale.contractValue))}</td></tr>
        <tr><td><strong>% comissão</strong></td><td>${escapeHtml(String(sale.commissionPercent || 0))}%</td></tr>
        <tr><td><strong>Comissão estimada</strong></td><td>${escapeHtml(formatCurrency(sale.commissionValue))}</td></tr>
        <tr><td><strong>Imobiliária</strong></td><td>${escapeHtml(sale.realEstate)}</td></tr>
      </table>
      <p>Obrigado.</p>
    </div>
  `;
  return sendEmailWithCc(settings.provisionTo, settings.provisionCc, `Provisionamento comissão Lev - ${sale.unit}`, html);
}

async function sendLevMauadPendingEmail(sql, db, sales = [], options = {}) {
  const settings = db.levFinance?.settings || {};
  if (!sales.length) return { sent: false, reason: "Nenhuma venda pendente para enviar" };
  const to = String(options.to || settings.provisionTo || "").trim();
  const cc = options.cc !== undefined ? options.cc : settings.provisionCc;
  if (!to) return { sent: false, reason: "E-mail destinatário não configurado" };
  const projects = await structuredProjectDefinitions(sql).catch(() => []);
  const projectForSale = (sale) => projectNameForUnit(sale.unit, projects) || sale.project || sale.projectName || "Empreendimento não identificado";
  const groups = new Map();
  for (const sale of sales) {
    const project = projectForSale(sale);
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(sale);
  }
  const projectBlocks = [...groups.entries()].map(([project, items]) => {
    const totalCommission = items.reduce((sum, item) => sum + Number(item.commissionValue || 0), 0);
    const rows = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(item.client)}</td>
        <td>${escapeHtml(item.signedAt)}</td>
        <td>${escapeHtml(formatCurrency(item.contractValue))}</td>
        <td>${escapeHtml(formatCurrency(item.commissionValue))}</td>
        <td>${escapeHtml(item.realEstate)}</td>
      </tr>
    `).join("");
    return `
      <h3 style="margin:28px 0 6px">${escapeHtml(project)}</h3>
      <p style="margin:0 0 12px"><strong>Total da NF de comissões:</strong> ${escapeHtml(formatCurrency(totalCommission))}</p>
      <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #d0d5dd;font-size:13px">
        <thead>
          <tr style="background:#f2f4f7;text-align:left">
            <th>Unidade</th><th>Cliente</th><th>Assinatura</th><th>Valor contrato</th><th>Comissão Lev</th><th>Imobiliária</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }).join("");
  const totalCommission = sales.reduce((sum, item) => sum + Number(item.commissionValue || 0), 0);
  const scheduledPaymentDate = provisionDateFromPaymentSchedule(settings, options.sentAt || new Date());
  const scheduledPaymentDateLabel = scheduledPaymentDate
    ? new Date(`${scheduledPaymentDate}T00:00:00`).toLocaleDateString("pt-BR")
    : "";
  const emailContent = prepareLevFinanceEmailTemplate(settings, {
    data_pagamento: escapeHtml(scheduledPaymentDateLabel || scheduledPaymentDate || "-"),
    data_envio: new Date(options.sentAt || new Date()).toLocaleDateString("pt-BR"),
    total_comissoes: escapeHtml(formatCurrency(totalCommission)),
    quantidade_vendas: String(sales.length),
    empreendimentos: escapeHtml([...groups.keys()].join(", ") || "-"),
    tabela_vendas: projectBlocks,
    lista_vendas: projectBlocks
  });
  const html = `
    <div style="font-family:Arial,sans-serif;color:#101828;line-height:1.5">
      <h2>Solicitação de autorização - Comissões Lev</h2>
      ${emailContent.html}
    </div>
  `;
  return sendEmailWithCcFrom(
    options.from || LEV_FINANCE_EMAIL_FROM,
    to,
    cc,
    `${options.subjectPrefix || ""}Autorização de comissões Lev - vendas confirmadas`,
    html,
    { ...(options.emailOptions || {}), attachments: [...(options.emailOptions?.attachments || []), ...emailContent.attachments] }
  );
}

function leadUrl(lead) {
  const configured = String(process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (!configured) return "";
  const baseUrl = configured.startsWith("http") ? configured.replace(/\/$/, "") : `https://${configured.replace(/\/$/, "")}`;
  return `${baseUrl}/leads/${encodeURIComponent(lead.id)}`;
}

function formatWhatsappNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function leadNotificationText(lead) {
  const parts = [
    "Novo lead no Pipeline Comercial | Construtora Mauad",
    "",
    `Nome: ${lead.name || "Sem nome"}`,
    `Telefone: ${lead.phone || "Sem telefone"}`,
    `E-mail: ${lead.email || "Sem e-mail"}`,
    `Empreendimento: ${lead.desiredProject || "Não informado"}`,
    `Origem: ${lead.source || "META"}`
  ];
  const url = leadUrl(lead);
  if (url) parts.push("", `Acesse diretamente o detalhe deste lead: ${url}`);
  const whatsappUrl = leadWhatsappUrl(lead);
  if (whatsappUrl) parts.push("", `Fale com o lead pelo WhatsApp: ${whatsappUrl}`);
  return parts.join("\n");
}

function leadWhatsappUrl(lead) {
  const number = formatWhatsappNumber(lead.phone);
  return number ? `https://wa.me/${number}` : "";
}

function friendlyMetaValue(value, labels = {}) {
  const text = String(value || "").trim();
  if (labels[text]) return labels[text];
  const target = metaLabelKey(text);
  const match = Object.entries(labels || {}).find(([key]) => metaLabelKey(key) === target);
  return match?.[1] || text;
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

function leadMetaFormConfig(db, lead) {
  const direct = metaFormForId(db, metaIdValue(lead.meta?.formId || lead.meta?.form_id || lead.formId || lead.form_id));
  if (direct) return direct;
  const rawQuestionKeys = Object.keys(lead.meta?.rawFields || {}).map(metaLabelKey).filter(Boolean);
  if (!rawQuestionKeys.length) return {};
  return (db.integrations?.metaForms?.forms || []).find((form) => {
    const labelKeys = Object.keys(form.questionLabels || {}).map(metaLabelKey);
    return rawQuestionKeys.some((key) => labelKeys.includes(key));
  }) || {};
}

function leadFormAnswersSummary(db, lead) {
  const rawFields = lead.meta?.rawFields || {};
  const entries = Object.entries(rawFields)
    .filter(([key]) => !["full_name", "name", "first_name", "email", "phone_number", "phone", "telefone", "celular"].includes(String(key).toLowerCase()))
    .slice(0, 8);
  if (!entries.length) return "Sem respostas de formulário registradas.";
  const formConfig = leadMetaFormConfig(db, lead);
  return entries
    .map(([question, answer]) => {
      const label = friendlyMetaValue(question, formConfig.questionLabels);
      const value = friendlyMetaValue(answer, formConfig.answerLabels);
      return `- ${label}: ${value || "Sem resposta"}`;
    })
    .join("\n");
}

function visibleLeadComments(lead) {
  return (Array.isArray(lead.comments) ? lead.comments : [])
    .filter((comment) => !comment.deletedAt && String(comment.text || "").trim())
    .slice(0, 12);
}

function fallbackCommentsSummary(lead) {
  const comments = visibleLeadComments(lead);
  if (!comments.length) return "Sem comentários registrados.";
  return comments
    .slice(0, 4)
    .map((comment) => `${comment.fromUser ? "Lead" : comment.authorName || "Equipe"}: ${String(comment.text || "").trim()}`)
    .join(" | ");
}

async function aiCommentsSummary(lead) {
  const comments = visibleLeadComments(lead);
  if (!comments.length) return "Sem comentários registrados.";
  const fallback = fallbackCommentsSummary(lead);
  if (!OPENAI_API_KEY) return fallback;
  const transcript = comments
    .map((comment) => `${comment.fromUser ? "Lead" : comment.authorName || "Equipe"}: ${String(comment.text || "").trim()}`)
    .join("\n");
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: "Resuma comentarios comerciais de um lead imobiliario em portugues do Brasil, em ate 2 frases objetivas. Nao invente dados.",
        input: transcript,
        max_output_tokens: 120
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return fallback;
    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((content) => content.text || "").join(" ").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function relevantKnowledgeContext(db, user, question) {
  const terms = String(question || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
  const scoreArticle = (article) => {
    const haystack = [
      article.title,
      article.category,
      article.summary,
      article.content,
      ...(article.keywords || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  };
  const visible = visibleKnowledgeArticles(db, user)
    .filter((article) => article.published !== false)
    .map((article) => ({ ...article, score: scoreArticle(article) }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pt-BR"));
  const selected = visible.filter((article) => article.score > 0).slice(0, 8);
  const sources = (selected.length ? selected : visible.slice(0, 8));
  return {
    context: sources
      .map((article, index) => [
      `Tutorial ${index + 1}: ${article.title}`,
      `Categoria: ${article.category}`,
      `Resumo: ${article.summary || ""}`,
      `Conteudo: ${article.content || ""}`
    ].join("\n"))
      .join("\n\n---\n\n"),
    sources: sources.slice(0, 4).map((article) => ({
      id: article.id,
      title: article.title,
      category: article.category
    }))
  };
}

async function answerKnowledgeQuestion(db, user, question) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) throw new Error("Digite uma pergunta.");
  if (cleanQuestion.length > 900) throw new Error("Pergunta muito longa. Tente resumir em poucas linhas.");
  if (!OPENAI_API_KEY) throw new Error("Assistente de IA ainda não configurado.");
  const { context, sources } = relevantKnowledgeContext(db, user, cleanQuestion);
  if (!context) {
    return {
      answer: "Ainda não existem tutoriais publicados para usar como base. Peça a um administrador para cadastrar conteúdo na Central de ajuda.",
      sources: []
    };
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        "Você é o assistente interno do Pipeline Comercial | Construtora Mauad.",
        "Responda exclusivamente sobre como usar este sistema de pipeline, leads, bases, configurações, Meta, notificações, logs e ajuda.",
        "Use apenas o contexto de tutoriais fornecido e o perfil do usuário. Não invente funcionalidades, dados, credenciais, regras jurídicas, médicas, financeiras ou assuntos fora do sistema.",
        "Se a pergunta estiver fora do uso do sistema, recuse brevemente e diga que pode ajudar apenas com o Pipeline Comercial.",
        "Se o contexto não tiver informação suficiente, diga isso claramente e sugira procurar o Admin TI ou cadastrar um tutorial.",
        "Responda em português do Brasil, com acentuação correta, de forma objetiva, usando negrito em pontos importantes quando fizer sentido."
      ].join(" "),
      input: [
        `Perfil do usuario: ${user.role}`,
        "Contexto autorizado:",
        context,
        "Pergunta do usuario:",
        cleanQuestion
      ].join("\n\n"),
      max_output_tokens: 420
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Não foi possível acionar a IA agora.");
  }
  const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((content) => content.text || "").join(" ").trim();
  return {
    answer: String(text || "").trim() || "Não consegui montar uma resposta com os tutoriais disponíveis.",
    sources
  };
}

async function generateTutorialDraftFromSession(db, user, session) {
  if (!OPENAI_API_KEY || session.generatedTutorialId) return null;
  const userQuestions = (session.messages || []).filter((message) => message.role === "user");
  if (userQuestions.length < 3) return null;
  const transcript = (session.messages || [])
    .map((message) => `${message.role === "user" ? "Usuário" : "Assistente"}: ${message.text}`)
    .join("\n\n")
    .slice(-10000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: [
          "Crie um tutorial interno para a Central de Ajuda do Pipeline Comercial | Construtora Mauad.",
          "Use apenas a conversa fornecida. Não invente funcionalidades.",
          "Responda em JSON válido com: title, category, summary, content, keywords.",
          `category deve ser uma destas: ${KNOWLEDGE_CATEGORIES.join(", ")}.`,
          "content deve ser prático, em passos curtos, português do Brasil com acentuação correta."
        ].join(" "),
        input: transcript,
        text: { format: { type: "json_object" } },
        max_output_tokens: 650
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const raw = data.output_text || data.output?.flatMap((item) => item.content || []).map((content) => content.text || "").join(" ").trim();
    const parsed = JSON.parse(raw || "{}");
    const articleData = normalizeKnowledgePayload({
      title: parsed.title || session.title || "Tutorial sugerido pela IA",
      category: parsed.category || "Primeiros passos",
      summary: parsed.summary || "Tutorial sugerido automaticamente a partir de uma conversa com a IA.",
      content: parsed.content || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      audienceRoles: ["Admin TI", "Head Comercial", "Supervisor Comercial"],
      published: false
    });
    if (!articleData.title || !articleData.content) return null;
    const now = new Date().toISOString();
    const article = {
      id: `kb-${crypto.randomUUID()}`,
      ...articleData,
      createdAt: now,
      updatedAt: now,
      updatedBy: "Assistente IA"
    };
    db.knowledgeArticles.unshift(article);
    session.generatedTutorialId = article.id;
    audit(db, user, "AI_GENERATE_KNOWLEDGE_DRAFT", { articleId: article.id, sessionId: session.id, title: article.title });
    return article;
  } catch {
    return null;
  }
}

async function leadAssignmentNotificationContent(db, lead, reassigned = false) {
  const detailUrl = leadUrl(lead);
  const whatsappUrl = leadWhatsappUrl(lead);
  const commentSummary = await aiCommentsSummary(lead);
  const title = reassigned
    ? `Lead ${lead.name || "sem nome"} reatribuído`
    : `Novo lead ${lead.name || "sem nome"} atribuído`;
  const lines = [
    title,
    "",
    `Nome: ${lead.name || "Sem nome"}`,
    `Telefone: ${lead.phone || "Sem telefone"}`,
    `E-mail: ${lead.email || "Sem e-mail"}`,
    `Empreendimento: ${lead.desiredProject || "Não informado"}`,
    `Status: ${lead.status || "Não informado"}`,
    "",
    "Respostas do formulário:",
    leadFormAnswersSummary(db, lead),
    "",
    "Observações do detalhe do lead:",
    lead.notes ? String(lead.notes).trim() : "Sem observações registradas.",
    "",
    "Resumo dos comentários:",
    commentSummary
  ];
  if (detailUrl) lines.push("", `Detalhe do lead no Pipeline: ${detailUrl}`);
  if (whatsappUrl) lines.push("", `Falar com o lead no WhatsApp: ${whatsappUrl}`);
  return { title, text: lines.join("\n"), detailUrl, whatsappUrl, commentSummary };
}

async function sendLeadAssignmentEmail(user, db, lead, reassigned = false, preparedContent = null) {
  if (!user?.username || !user.notifications?.email) return { skipped: true };
  const content = preparedContent || await leadAssignmentNotificationContent(db, lead, reassigned);
  return sendEmail(
    user.username,
    content.title,
    `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17202a">
        <h1 style="font-size:22px">${escapeHtml(content.title)}</h1>
        <div style="background:#f6f8fa;border:1px solid #d7dee8;border-radius:8px;padding:14px;margin:16px 0">
          <p><strong>Nome:</strong> ${escapeHtml(lead.name || "Sem nome")}</p>
          <p><strong>Telefone:</strong> ${escapeHtml(lead.phone || "Sem telefone")}</p>
          <p><strong>E-mail:</strong> ${escapeHtml(lead.email || "Sem e-mail")}</p>
          <p><strong>Empreendimento:</strong> ${escapeHtml(lead.desiredProject || "Não informado")}</p>
          <p><strong>Status:</strong> ${escapeHtml(lead.status || "Não informado")}</p>
        </div>
        <h2 style="font-size:16px">Respostas do formulário</h2>
        <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;background:#fff;border:1px solid #d7dee8;border-radius:8px;padding:12px">${escapeHtml(leadFormAnswersSummary(db, lead))}</pre>
        <h2 style="font-size:16px">Observações</h2>
        <p>${escapeHtml(lead.notes || "Sem observações registradas.")}</p>
        <h2 style="font-size:16px">Resumo dos comentários</h2>
        <p>${escapeHtml(content.commentSummary)}</p>
        ${content.detailUrl ? `<p><a href="${content.detailUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Abrir detalhe do lead</a></p><p style="font-size:12px;color:#657382">${escapeHtml(content.detailUrl)}</p>` : ""}
        ${content.whatsappUrl ? `<p><a href="${content.whatsappUrl}" style="display:inline-block;background:#128c7e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Falar com o lead no WhatsApp</a></p><p style="font-size:12px;color:#657382">${escapeHtml(content.whatsappUrl)}</p>` : ""}
      </div>
    `
  );
}

async function sendLeadAssignmentWhatsapp(user, db, lead, reassigned = false, preparedContent = null) {
  if (!user?.notifications?.whatsapp) return { skipped: true };
  const number = formatWhatsappNumber(user.notifications.whatsappNumber);
  if (!number) return { sent: false, reason: "Número de WhatsApp ausente" };
  if (!EVO_API_URL || !EVO_API_KEY || !EVO_INSTANCE) return { sent: false, reason: "Evo API não configurada" };
  const content = preparedContent || await leadAssignmentNotificationContent(db, lead, reassigned);
  const endpoint = `${EVO_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: EVO_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ number, text: content.text })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Evo API", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || data.error || "Falha no envio da Evo API" };
  return { sent: true, id: data.key?.id || data.id || "" };
}

async function notifyLeadAssignment(db, lead, assignedUser, reassigned = false) {
  if (!assignedUser?.active) return;
  const results = [];
  const shouldNotify = Boolean(assignedUser.notifications?.email || assignedUser.notifications?.whatsapp);
  const content = shouldNotify ? await leadAssignmentNotificationContent(db, lead, reassigned) : null;
  if (assignedUser.notifications?.email) {
    const result = await sendLeadAssignmentEmail(assignedUser, db, lead, reassigned, content);
    results.push(["email", result]);
    integrationEvent(db, "NOTIFICATION", result.sent ? "ASSIGNMENT_EMAIL_SENT" : "ASSIGNMENT_EMAIL_FAILED", {
      leadId: lead.id,
      userId: assignedUser.id,
      email: assignedUser.username,
      reassigned,
      reason: result.reason || ""
    });
  }
  if (assignedUser.notifications?.whatsapp) {
    const result = await sendLeadAssignmentWhatsapp(assignedUser, db, lead, reassigned, content);
    results.push(["whatsapp", result]);
    integrationEvent(db, "NOTIFICATION", result.sent ? "ASSIGNMENT_WHATSAPP_SENT" : "ASSIGNMENT_WHATSAPP_FAILED", {
      leadId: lead.id,
      userId: assignedUser.id,
      whatsapp: assignedUser.notifications.whatsappNumber || "",
      reassigned,
      reason: result.reason || ""
    });
  }
  if (!results.length) {
    integrationEvent(db, "NOTIFICATION", "ASSIGNMENT_NO_CHANNELS", { leadId: lead.id, userId: assignedUser.id, reassigned });
  }
}

async function sendLeadNotificationEmail(user, lead) {
  if (!user?.username || !user.notifications?.email) return { skipped: true };
  const url = leadUrl(lead);
  return sendEmail(
    user.username,
    `Novo lead Meta: ${lead.name || "Lead sem nome"}`,
    `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#17202a">
        <h1 style="font-size:22px">Novo lead recebido</h1>
        <p>Olá, ${escapeHtml(user.name)}.</p>
        <p>Um novo lead entrou no Pipeline Comercial da Construtora Mauad.</p>
        <div style="background:#f6f8fa;border:1px solid #d7dee8;border-radius:8px;padding:14px;margin:16px 0">
          <p><strong>Nome:</strong> ${escapeHtml(lead.name || "Sem nome")}</p>
          <p><strong>Telefone:</strong> ${escapeHtml(lead.phone || "Sem telefone")}</p>
          <p><strong>E-mail:</strong> ${escapeHtml(lead.email || "Sem e-mail")}</p>
          <p><strong>Empreendimento:</strong> ${escapeHtml(lead.desiredProject || "Não informado")}</p>
          <p><strong>Origem:</strong> ${escapeHtml(lead.source || "META")}</p>
        </div>
        ${url ? `<p>Acesse diretamente o detalhe deste lead:</p><p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Abrir detalhe do lead</a></p><p style="font-size:12px;color:#657382">${escapeHtml(url)}</p>` : ""}
      </div>
    `
  );
}

async function sendLeadNotificationWhatsapp(user, lead) {
  if (!user?.notifications?.whatsapp) return { skipped: true };
  const number = formatWhatsappNumber(user.notifications.whatsappNumber);
  if (!number) return { sent: false, reason: "Número de WhatsApp ausente" };
  if (!EVO_API_URL || !EVO_API_KEY || !EVO_INSTANCE) return { sent: false, reason: "Evo API não configurada" };
  const endpoint = `${EVO_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: EVO_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        number,
        text: leadNotificationText(lead)
      })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Evo API", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || data.error || "Falha no envio da Evo API" };
  return { sent: true, id: data.key?.id || data.id || "" };
}

async function sendUserWhatsappText(user, text) {
  if (!user?.notifications?.whatsapp) return { skipped: true };
  const number = formatWhatsappNumber(user.notifications.whatsappNumber);
  if (!number) return { sent: false, reason: "Número de WhatsApp ausente" };
  if (!EVO_API_URL || !EVO_API_KEY || !EVO_INSTANCE) return { sent: false, reason: "Evo API não configurada" };
  const endpoint = `${EVO_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: EVO_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ number, text })
    });
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Evo API", error) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data.message || data.error || "Falha no envio da Evo API" };
  return { sent: true, id: data.key?.id || data.id || "" };
}

function leadNotificationRecipients(db, lead) {
  const recipients = new Map();
  const assigned = lead.assignedTo
    ? db.users.find((user) => user.id === lead.assignedTo && user.active)
    : null;
  if (assigned) recipients.set(assigned.id, assigned);
  for (const user of db.users || []) {
    if (!user.active) continue;
    if (!["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(user.role)) continue;
    if (user.notifications?.email || user.notifications?.whatsapp) recipients.set(user.id, user);
  }
  return [...recipients.values()];
}

async function notifyNewMetaLead(db, lead) {
  const recipients = leadNotificationRecipients(db, lead);
  if (!recipients.length) {
    integrationEvent(db, "NOTIFICATION", "NO_RECIPIENTS", { leadId: lead.id, source: lead.source });
    return;
  }
  for (const recipient of recipients) {
    if (recipient.notifications?.email) {
      const result = await sendLeadNotificationEmail(recipient, lead);
      integrationEvent(db, "NOTIFICATION", result.sent ? "EMAIL_SENT" : "EMAIL_FAILED", {
        leadId: lead.id,
        userId: recipient.id,
        email: recipient.username,
        reason: result.reason || ""
      });
    }
    if (recipient.notifications?.whatsapp) {
      const result = await sendLeadNotificationWhatsapp(recipient, lead);
      integrationEvent(db, "NOTIFICATION", result.sent ? "WHATSAPP_SENT" : "WHATSAPP_FAILED", {
        leadId: lead.id,
        userId: recipient.id,
        whatsapp: recipient.notifications.whatsappNumber || "",
        reason: result.reason || ""
      });
    }
  }
}

async function sendLeadNotificationTest(db, actor, target) {
  const lead = {
    id: "teste-notificacao",
    name: "Lead de Teste Meta",
    phone: "+5521999999999",
    email: "lead.teste@exemplo.com",
    desiredProject: "Teste de notificação",
    source: "META"
  };
  const results = [];
  if (target.notifications?.email) {
    const result = await sendLeadNotificationEmail(target, lead);
    results.push({ channel: "email", ...result });
    integrationEvent(db, "NOTIFICATION", result.sent ? "TEST_EMAIL_SENT" : "TEST_EMAIL_FAILED", {
      userId: target.id,
      email: target.username,
      reason: result.reason || ""
    });
  }
  if (target.notifications?.whatsapp) {
    const result = await sendLeadNotificationWhatsapp(target, lead);
    results.push({ channel: "whatsapp", ...result });
    integrationEvent(db, "NOTIFICATION", result.sent ? "TEST_WHATSAPP_SENT" : "TEST_WHATSAPP_FAILED", {
      userId: target.id,
      whatsapp: target.notifications.whatsappNumber || "",
      reason: result.reason || ""
    });
  }
  if (!results.length) {
    integrationEvent(db, "NOTIFICATION", "TEST_SKIPPED", { userId: target.id, reason: "Usuário sem canais ativos" });
  }
  audit(db, actor, "TEST_LEAD_NOTIFICATION", { userId: target.id, channels: results.map((item) => item.channel) });
  return results;
}

async function sendLeadAssignmentNotificationTest(db, actor, target) {
  const now = new Date().toISOString();
  const lead = {
    id: "teste-atribuicao",
    name: "Lead Teste Atribuição",
    phone: "+5521967566636",
    email: "lead.teste@exemplo.com",
    desiredProject: "Golf Club Resort",
    status: db.pipelineStatuses?.[0] || "Novo Lead",
    source: "META",
    notes: "Lead demonstrou interesse em receber atendimento ainda hoje. Priorizar contato por WhatsApp.",
    comments: [
      {
        id: "comment-test-1",
        text: "Cliente pediu retorno com informações sobre unidades disponíveis e fluxo de pagamento.",
        fromUser: false,
        createdAt: now,
        authorName: "Administrador TI"
      },
      {
        id: "comment-test-2",
        text: "Prefere falar por WhatsApp no período da tarde.",
        fromUser: true,
        createdAt: now,
        authorName: "Lead Teste"
      }
    ],
    meta: {
      formId: "",
      rawFields: {
        "onde_você_reside_atualmente?": "Rio de Janeiro",
        "quanto_você_pretende_investir?": "até_r$_600_mil_",
        "como_será_sua_experiência_com_o_lançamento?": "moradia_e_qualidade_de_vida"
      }
    }
  };
  const content = await leadAssignmentNotificationContent(db, lead, false);
  const results = [];
  if (target.notifications?.email) {
    const result = await sendLeadAssignmentEmail(target, db, lead, false, content);
    results.push({ channel: "email", ...result });
    integrationEvent(db, "NOTIFICATION", result.sent ? "TEST_ASSIGNMENT_EMAIL_SENT" : "TEST_ASSIGNMENT_EMAIL_FAILED", {
      userId: target.id,
      email: target.username,
      reason: result.reason || ""
    });
  }
  if (target.notifications?.whatsapp) {
    const result = await sendLeadAssignmentWhatsapp(target, db, lead, false, content);
    results.push({ channel: "whatsapp", ...result });
    integrationEvent(db, "NOTIFICATION", result.sent ? "TEST_ASSIGNMENT_WHATSAPP_SENT" : "TEST_ASSIGNMENT_WHATSAPP_FAILED", {
      userId: target.id,
      whatsapp: target.notifications.whatsappNumber || "",
      reason: result.reason || ""
    });
  }
  if (!results.length) {
    integrationEvent(db, "NOTIFICATION", "TEST_ASSIGNMENT_SKIPPED", { userId: target.id, reason: "Usuário sem canais ativos" });
  }
  audit(db, actor, "TEST_LEAD_ASSIGNMENT_NOTIFICATION", { userId: target.id, channels: results.map((item) => item.channel) });
  return results;
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
  if (res.headersSent || res.writableEnded) return false;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
  return true;
}

function sendJson(res, status, body, headers = {}) {
  return send(res, status, body, { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function sendBuffer(res, status, buffer, headers = {}) {
  if (res.headersSent || res.writableEnded) return false;
  res.writeHead(status, {
    "Content-Type": "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Content-Length": buffer.length,
    ...headers
  });
  res.end(buffer);
  return true;
}

function notFound(res) {
  return sendJson(res, 404, { error: "Não encontrado" });
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function sessionTtlMsFromCommercialSettings(settings = {}) {
  const minutes = Number(settings.sessionTimeoutMinutes || 15);
  const safeMinutes = Number.isFinite(minutes) ? Math.min(240, Math.max(1, minutes)) : 15;
  return safeMinutes * 60 * 1000;
}

function redisEnabled() {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

function redisKey(...parts) {
  return [REDIS_KEY_PREFIX, ...parts].map((part) => String(part || "").replace(/[:\s]+/g, "-")).join(":");
}

async function redisPipeline(commands = []) {
  if (!redisEnabled() || !commands.length) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(200, REDIS_TIMEOUT_MS));
  try {
    const response = await fetch(`${UPSTASH_REDIS_REST_URL.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    });
    if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    return data.map((item) => item?.result ?? null);
  } catch (error) {
    mirrorStructuredError("redis", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function redisGetJson(key) {
  const result = await redisPipeline([["GET", key]]);
  const value = result?.[0];
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

async function redisSetJson(key, value, ttlSeconds) {
  const command = ["SET", key, JSON.stringify(value)];
  if (ttlSeconds) command.push("EX", String(Math.max(1, Math.floor(ttlSeconds))));
  await redisPipeline([command]);
}

async function redisDelete(key) {
  await redisPipeline([["DEL", key]]);
}

async function invalidateStructuredConfigCache() {
  if (!redisEnabled()) return;
  await redisPipeline([
    ["DEL", redisKey("config", "state")],
    ["DEL", redisKey("settings", "commercial")]
  ]);
}

async function cachedCommercialSettings(sql) {
  const key = redisKey("settings", "commercial");
  const cached = await redisGetJson(key);
  if (cached) return cached;
  const rows = await sql`SELECT payload FROM crm_settings WHERE key = 'commercialSettings' LIMIT 1`;
  const settings = rows[0]?.payload || {};
  void redisSetJson(key, settings, 60).catch((error) => mirrorStructuredError("redis-settings", error));
  return settings;
}

async function structuredSessionTtlMs(sql) {
  try {
    return sessionTtlMsFromCommercialSettings(await cachedCommercialSettings(sql));
  } catch {
    return DEFAULT_SESSION_TTL_MS;
  }
}

function sessionCookie(userId, ttlMs = DEFAULT_SESSION_TTL_MS) {
  const safeTtlMs = Math.max(60 * 1000, Number(ttlMs || DEFAULT_SESSION_TTL_MS));
  const sid = signSession({ userId, expiresAt: Date.now() + safeTtlMs });
  return `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(safeTtlMs / 1000)}`;
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

function verifySamJwt(req) {
  if (!SAM_WEBHOOK_SECRET) return { ok: false, status: 500, error: "SAM_WEBHOOK_SECRET ausente" };
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Token ausente" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, status: 401, error: "JWT inválido" };
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, status: 401, error: "JWT inválido" };
  }
  if (header.alg !== "HS256") return { ok: false, status: 401, error: "Algoritmo JWT inválido" };
  if (payload.iss !== "sam-mauad" || payload.aud !== "pipeline-mauad") return { ok: false, status: 401, error: "JWT fora do escopo esperado" };
  const expected = crypto.createHmac("sha256", SAM_WEBHOOK_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (Buffer.byteLength(parts[2]) !== Buffer.byteLength(expected)) return { ok: false, status: 401, error: "Assinatura inválida" };
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return { ok: false, status: 401, error: "Assinatura inválida" };
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return { ok: false, status: 401, error: "JWT expirado" };
  return { ok: true, payload };
}

function publicUser(user) {
  const { passwordHash, passwordSetup, photoUrl, ...safe } = user;
  return {
    ...safe,
    hasPhoto: Boolean(photoUrl),
    photoUpdatedAt: user.updatedAt || safe.updatedAt || null,
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

function chatwootCollection(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.payload)) return value.payload;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

async function chatwootRequest(pathname) {
  if (!CHATWOOT_BASE_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_TOKEN) {
    throw new Error("Configure CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID e CHATWOOT_API_TOKEN no ambiente do servidor.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${CHATWOOT_BASE_URL}${pathname}`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN, Accept: "application/json" },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.message || data?.error || "").trim();
      throw new Error(`Chatwoot respondeu HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("O Chatwoot não respondeu em até 10 segundos.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function diagnoseChatwoot() {
  const accountPath = `/api/v1/accounts/${encodeURIComponent(CHATWOOT_ACCOUNT_ID)}`;
  const profile = await chatwootRequest("/api/v1/profile");
  const [inboxResponse, agentResponse, teamResponse] = await Promise.all([
    chatwootRequest(`${accountPath}/inboxes`),
    chatwootRequest(`${accountPath}/agents`),
    chatwootRequest(`${accountPath}/teams`)
  ]);
  const inboxes = chatwootCollection(inboxResponse).map((inbox) => ({
    id: inbox.id,
    name: inbox.name || `Caixa ${inbox.id}`,
    channelType: inbox.channel_type || inbox.channel?.type || "",
    enabled: inbox.enable_auto_assignment !== false
  }));
  const agents = chatwootCollection(agentResponse).map((agent) => ({
    id: agent.id,
    name: agent.name || "",
    email: agent.email || "",
    role: agent.role || "",
    availability: agent.availability_status || ""
  }));
  const teams = chatwootCollection(teamResponse).map((team) => ({ id: team.id, name: team.name || `Equipe ${team.id}` }));
  return {
    connected: true,
    checkedAt: new Date().toISOString(),
    baseUrl: CHATWOOT_BASE_URL,
    accountId: CHATWOOT_ACCOUNT_ID,
    profile: { id: profile.id, name: profile.name || "", email: profile.email || "", role: profile.role || "" },
    inboxes,
    agents,
    teams
  };
}

function canManagePipelineSettings(user) {
  return ["Admin TI", "Head Comercial"].includes(user.role);
}

function canManageKnowledge(user) {
  return ["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(user.role);
}

function canCreateKnowledge(user) {
  return user.role === "Admin TI";
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

function canOperateAsBroker(user) {
  return user.role === "Corretor" || (["Head Comercial", "Supervisor Comercial"].includes(user.role) && Boolean(user.operatesAsBroker));
}

function isAssignableBroker(user) {
  return Boolean(user?.active && canOperateAsBroker(user));
}

function canAccessLevFinance(user) {
  return (user.role === "Admin TI" && String(user.username || "").toLowerCase() === "admin")
    || ["Gerente Financeiro", "Auxiliar Financeiro"].includes(user.role);
}

function canAccessCommercialSalesReport(user) {
  return ["Admin TI", "Head Comercial", "Diretoria"].includes(user.role);
}

function canResetLevFinance(user) {
  return user.role === "Admin TI" && String(user.username || "").toLowerCase() === "admin";
}

function canManageCommercialSettings(user) {
  return ["Admin TI", "Head Comercial"].includes(user.role);
}

function canManageEventCaptureSettings(user) {
  return ["Admin TI", "Head Comercial", "Coordenador de Marketing"].includes(user.role);
}

function hasBaseHistory(lead) {
  return Boolean(lead.sourceStatus || lead.odysseiaStatus || lead.baseSourceBeforePipeline || lead.previousPipelineSource);
}

function isAvailableBaseLead(lead) {
  if (!lead.inPipeline) return true;
  return hasBaseHistory(lead) && !lead.assignedTo;
}

function baseSourcesForLead(lead) {
  const sources = new Set();
  if (lead.source) sources.add(lead.source);
  if (lead.baseSourceBeforePipeline) sources.add(lead.baseSourceBeforePipeline);
  if (lead.previousPipelineSource) sources.add(lead.previousPipelineSource);
  return [...sources].filter(Boolean);
}

function allBaseSources(db) {
  const sources = new Set(["ODYSSEIA", "RD Station", "OAB", "Vinhos na Serra", "Pipeline GDrive", "META", "Stand", "Lista RMeirelles"]);
  for (const source of db.baseAccessSources || []) {
    if (source) sources.add(source);
  }
  for (const lead of db.leads || []) {
    for (const source of baseSourcesForLead(lead)) sources.add(source);
  }
  return [...sources]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function permissionResources(db) {
  return [
    ...PERMISSION_SCREENS,
    ...allBaseSources(db).map((source) => ({ id: basePermissionId(source), label: source, source }))
  ];
}

function normalizePermissionCell(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return permissionCell(false, false);
  return permissionCell(value.access, value.action);
}

function ensurePermissions(db) {
  const resources = permissionResources(db);
  if (!db.permissions || typeof db.permissions !== "object" || Array.isArray(db.permissions)) {
    db.permissions = defaultPermissionsForSources(allBaseSources(db));
  }
  if (!db.permissions.roles || typeof db.permissions.roles !== "object" || Array.isArray(db.permissions.roles)) db.permissions.roles = {};
  if (!db.permissions.users || typeof db.permissions.users !== "object" || Array.isArray(db.permissions.users)) db.permissions.users = {};

  for (const role of ROLES) {
    if (!db.permissions.roles[role] || typeof db.permissions.roles[role] !== "object" || Array.isArray(db.permissions.roles[role])) {
      db.permissions.roles[role] = {};
    }
    for (const resource of resources) {
      if (db.permissions.roles[role][resource.id]) {
        db.permissions.roles[role][resource.id] = normalizePermissionCell(db.permissions.roles[role][resource.id]);
      } else if (resource.source) {
        const rule = db.baseAccess?.roles?.[role] || DEFAULT_BASE_ACCESS.roles[role] || { enabled: false, sources: [] };
        const selected = Array.isArray(rule.sources) ? rule.sources.filter(Boolean) : [];
        const hasSource = rule.enabled && (!selected.length || selected.includes(resource.source));
        db.permissions.roles[role][resource.id] = permissionCell(hasSource, hasSource && role !== "Diretoria");
      } else {
        db.permissions.roles[role][resource.id] = defaultScreenPermission(role, resource);
      }
    }
  }

  const validUserIds = new Set((db.users || []).map((item) => item.id));
  for (const [userId, rules] of Object.entries(db.permissions.users)) {
    if (!validUserIds.has(userId) || !rules || typeof rules !== "object" || Array.isArray(rules)) {
      delete db.permissions.users[userId];
      continue;
    }
    const user = db.users.find((item) => item.id === userId);
    for (const resource of resources) {
      const roleCell = db.permissions.roles[user.role]?.[resource.id] || permissionCell(false, false);
      db.permissions.users[userId][resource.id] = rules[resource.id]
        ? normalizePermissionCell(rules[resource.id])
        : { ...roleCell };
    }
  }
  for (const user of db.users || []) {
    if (!db.permissions.users[user.id]) db.permissions.users[user.id] = {};
    for (const resource of resources) {
      const roleCell = db.permissions.roles[user.role]?.[resource.id] || permissionCell(false, false);
      db.permissions.users[user.id][resource.id] = db.permissions.users[user.id][resource.id]
        ? normalizePermissionCell(db.permissions.users[user.id][resource.id])
        : { ...roleCell };
    }
  }
  return db.permissions;
}

function permissionForUser(db, user, resourceId) {
  if (user.role === "Admin TI") return permissionCell(true, true);
  ensurePermissions(db);
  return normalizePermissionCell(db.permissions.users?.[user.id]?.[resourceId] || db.permissions.roles?.[user.role]?.[resourceId]);
}

function baseAccessRuleForUser(db, user) {
  if (db.permissions) {
    const sources = allBaseSources(db).filter((source) => permissionForUser(db, user, basePermissionId(source)).access);
    return { enabled: sources.length > 0, sources };
  }
  if (user.role === "Admin TI") return { enabled: true, sources: [] };
  const userRule = db.baseAccess?.users?.[user.id];
  if (userRule?.override) return userRule;
  return db.baseAccess?.roles?.[user.role] || { enabled: false, sources: [] };
}

function accessibleBaseSources(db, user) {
  const rule = baseAccessRuleForUser(db, user);
  if (!rule.enabled) return [];
  const allSources = allBaseSources(db);
  const selected = Array.isArray(rule.sources) ? rule.sources.filter(Boolean) : [];
  return selected.length ? selected.filter((source) => allSources.includes(source)) : allSources;
}

function canAccessBases(db, user) {
  return accessibleBaseSources(db, user).length > 0;
}

function canAccessBaseLead(db, user, lead) {
  if (!isAvailableBaseLead(lead) && lead.source !== "META") return false;
  const allowed = accessibleBaseSources(db, user);
  if (!allowed.length) return false;
  return baseSourcesForLead(lead).some((source) => allowed.includes(source));
}

function canActBaseLead(db, user, lead) {
  if (!canAccessBaseLead(db, user, lead)) return false;
  return baseSourcesForLead(lead).some((source) => permissionForUser(db, user, basePermissionId(source)).action);
}

function structuredBaseSourceAliases(source) {
  const value = String(source || "").trim();
  const aliases = {
    "Vinhos na Serra": ["Vinhos na Serra", "VINHOS NA SERRA"],
    "Pipeline GDrive": ["Pipeline GDrive", "PIPELINE MAUAD"],
    "RD Station": ["RD Station", "RD STATION"]
  }[value] || [value];
  return [...new Set(aliases.filter(Boolean))];
}

function structuredBaseSourceAliasesMany(sources = []) {
  return [...new Set((sources || []).flatMap((source) => structuredBaseSourceAliases(source)))];
}

function visibleLeadsFromList(db, user, leads) {
  if (user.role === "Corretor") {
    return leads.filter((lead) => {
      if (lead.inPipeline && lead.assignedTo) return lead.assignedTo === user.id;
      return canAccessBaseLead(db, user, lead);
    });
  }
  return leads.filter((lead) => {
    if (lead.inPipeline) return true;
    return canAccessBaseLead(db, user, lead);
  });
}

function visibleLeads(db, user) {
  return visibleLeadsFromList(db, user, db.leads || []);
}

function leadMatchesScope(lead, scope) {
  if (scope === "pipeline") return Boolean(lead.inPipeline);
  if (scope === "bases") return isAvailableBaseLead(lead) || lead.source === "META" || MANUAL_LEAD_SOURCES.includes(lead.source);
  return true;
}

function canEditLead(user, lead) {
  return canManageLeads(user) || (user.role === "Corretor" && lead.assignedTo === user.id);
}

const MANUAL_LEAD_SOURCES = ["Stand", "Lista RMeirelles"];
const UNKNOWN_PROJECT = "Não informado";

function validProjectNames(db) {
  return new Set([...(db.projects || DEFAULT_PROJECTS), UNKNOWN_PROJECT]);
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUnitForMatch(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function leadEmailsForMatch(lead) {
  return [lead.email, String(lead.assistant || "").includes("@") ? lead.assistant : ""]
    .map(normalizeEmail)
    .filter(Boolean);
}

function leadPhonesForMatch(lead) {
  return [lead.phone]
    .map(normalizePhoneDigits)
    .filter((phone) => phone.length >= 8);
}

function baseNameForLead(lead) {
  return lead.source || "Base";
}

function rememberLeadBaseOrigin(lead) {
  const source = lead.source === "Pipeline GDrive" && lead.previousPipelineSource
    ? lead.previousPipelineSource
    : lead.source || "";
  if (!lead.baseSourceBeforePipeline) lead.baseSourceBeforePipeline = source;
  if (!lead.baseStatusBeforePipeline) lead.baseStatusBeforePipeline = lead.sourceStatus || lead.odysseiaStatus || lead.status || "";
}

function findManualLeadDuplicate(db, body) {
  const email = normalizeEmail(body.email);
  const phone = normalizePhoneDigits(body.phone);
  return db.leads.find((lead) => {
    if (lead.inPipeline) return false;
    if (email && leadEmailsForMatch(lead).includes(email)) return true;
    if (phone.length >= 8) {
      return leadPhonesForMatch(lead).some((leadPhone) => leadPhone === phone || leadPhone.endsWith(phone) || phone.endsWith(leadPhone));
    }
    return false;
  }) || null;
}

function normalizeManualLeadPayload(db, body) {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const desiredProject = String(body.desiredProject || "").trim();
  const source = String(body.source || "").trim();
  if (!name) return { error: "Nome obrigatório" };
  if (!phone) return { error: "Telefone obrigatório" };
  if (!email) return { error: "E-mail obrigatório" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido" };
  if (!desiredProject) return { error: "Empreendimento desejado obrigatório" };
  if (!validProjectNames(db).has(desiredProject)) return { error: "Empreendimento desejado inválido" };
  if (!MANUAL_LEAD_SOURCES.includes(source)) return { error: "Origem do novo lead inválida" };
  return {
    lead: {
      name,
      phone,
      email,
      source,
      desiredProject,
      desiredUnit: String(body.desiredUnit || "").trim(),
      unitValue: String(body.unitValue || "").trim(),
      notes: String(body.notes || "").trim(),
      impactedBySocial: String(body.impactedBySocial || "").trim()
    }
  };
}

function samStatusToPipelineStatus(db, status) {
  return samStatusToPipelineStatusFromList(db.pipelineStatuses || [], status);
}

function samStatusToPipelineStatusFromList(pipelineStatuses, status) {
  const definitions = (pipelineStatuses || []).map((item) => typeof item === "string" ? { status: item, samCodes: [] } : item);
  const raw = String(status || "").trim();
  const normalized = normalizeComparableText(raw).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  for (const definition of definitions) {
    const codes = Array.isArray(definition.samCodes) ? definition.samCodes : [];
    if (codes.some((code) => normalizeComparableText(code).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") === normalized)) {
      return definition.status || definition.name || raw;
    }
  }
  const aliases = {
    reservation_created: "Reservado",
    contract_issued: "Contrato Emitido",
    contract_signed: "Contrato Assinado",
    payment_received: "Boleto Pago",
    reserva: "Reservado",
    reservado: "Reservado",
    contrato_emitido: "Contrato Emitido",
    emissao_de_contrato: "Contrato Emitido",
    contrato_100_assinado: "Contrato Assinado",
    contrato_assinado: "Contrato Assinado",
    venda_finalizada: "Contrato Assinado",
    boleto_pago: "Boleto Pago",
    pago: "Boleto Pago"
  };
  const desired = aliases[normalized] || raw;
  const desiredComparable = normalizeComparableText(desired);
  return definitions.find((item) => normalizeComparableText(item.status || item.name) === desiredComparable)?.status || "";
}

function isDuplicateSamEvent(db, eventId) {
  if (!eventId) return false;
  if ((db.samEvents || []).some((event) => String(event.eventId || "") === eventId)) return true;
  return (db.integrationLog || []).some((entry) => {
    if (entry.provider !== "SAM") return false;
    if (!["STATUS_UPDATED", "LEAD_NOT_FOUND", "UNIT_MISMATCH"].includes(entry.action)) return false;
    return String(entry.details?.eventId || "") === eventId;
  });
}

function leadUnitsForMatch(lead) {
  return [lead.unit, lead.unidade, lead.desiredUnit, lead.meta?.unit]
    .map(normalizeUnitForMatch)
    .filter(Boolean);
}

function opportunityUnitsForMatch(opportunity) {
  return [opportunity?.unitSamCode, opportunity?.unit, opportunity?.desiredUnit]
    .map(normalizeUnitForMatch)
    .filter(Boolean);
}

function samOpportunityOption(opportunity) {
  return {
    id: opportunity.id || "",
    project: opportunity.project || "",
    unit: opportunity.unitSamCode || opportunity.unit || "",
    status: opportunity.status || "",
    assignedName: opportunity.assignedName || ""
  };
}

function findSamLeadCandidate(db, { email, phone }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhoneDigits(phone);
  return (db.leads || []).find((lead) => {
    if (normalizedEmail && leadEmailsForMatch(lead).includes(normalizedEmail)) return true;
    if (normalizedPhone.length >= 8) {
      return leadPhonesForMatch(lead).some((leadPhone) => leadPhone === normalizedPhone || leadPhone.endsWith(normalizedPhone) || normalizedPhone.endsWith(leadPhone));
    }
    return false;
  }) || null;
}

function findLeadForSamManualLink(db, search) {
  const query = String(search || "").trim();
  if (!query) return null;
  const normalizedQuery = normalizeComparableText(query);
  const email = normalizeEmail(query);
  const phone = normalizePhoneDigits(query);
  return (db.leads || []).find((lead) => {
    if (lead.id === query) return true;
    if (email && leadEmailsForMatch(lead).includes(email)) return true;
    if (phone.length >= 8 && leadPhonesForMatch(lead).some((leadPhone) => leadPhone === phone || leadPhone.endsWith(phone) || phone.endsWith(leadPhone))) return true;
    return normalizeComparableText(lead.name).includes(normalizedQuery);
  }) || null;
}

async function applySamEventToLead(db, user, event, lead) {
  const previousStatus = lead.status || "";
  const nextStatus = event.nextStatus || samStatusToPipelineStatus(db, event.eventType);
  if (!nextStatus) {
    throw new Error("Código SAM sem status de pipeline vinculado.");
  }
  if (!lead.inPipeline) rememberLeadBaseOrigin(lead);
  if (!lead.inPipeline) rememberLeadBaseOrigin(lead);
  lead.status = nextStatus;
  lead.inPipeline = true;
  lead.samLastEvent = {
    eventId: event.eventId,
    eventType: event.eventType,
    eventDatetime: event.eventDatetime,
    unit: event.unit,
    appliedAt: new Date().toISOString()
  };
  lead.updatedAt = lead.samLastEvent.appliedAt;
  event.status = "linked";
  event.leadId = lead.id;
  event.leadName = lead.name || "";
  event.resolution = "linked";
  event.resolvedAt = lead.updatedAt;
  event.resolvedBy = user.username;
  integrationEvent(db, "SAM", "LINKED_TO_LEAD", { eventId: event.eventId, samEventId: event.id, leadId: lead.id, from: previousStatus, to: lead.status });
  fupLeadEvent(db, user, lead, "SAM_STATUS_LINKED", { eventId: event.eventId, from: previousStatus, to: lead.status });
  await mirrorStructuredLead(lead);
  return { previousStatus, nextStatus: lead.status };
}

async function notifySamMismatch(db, subject, details) {
  const recipients = (db.users || [])
    .filter((user) => user.active && ["Admin TI", "Head Comercial"].includes(user.role) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.username))
    .map((user) => user.username);
  if (!recipients.length) return { sent: false, reason: "Sem destinatários" };
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17202a">
      <h1 style="font-size:20px">${escapeHtml(subject)}</h1>
      <p>O SAM enviou uma atualização que precisa de conferência no Pipeline Comercial.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${Object.entries(details).map(([key, value]) => `
          <tr>
            <td style="border:1px solid #d9e0e7;padding:8px;font-weight:700">${escapeHtml(key)}</td>
            <td style="border:1px solid #d9e0e7;padding:8px">${escapeHtml(String(value || "-"))}</td>
          </tr>
        `).join("")}
      </table>
    </div>
  `;
  return sendEmail(recipients, subject, html);
}

async function processSamWebhook(db, payload) {
  const eventId = String(payload.event_id || payload.eventId || payload.id || "").trim();
  const eventType = String(payload.event_type || payload.eventType || payload.status || payload.event || payload.movimento || "").trim();
  const eventDatetime = String(payload.event_datetime || payload.eventDatetime || "").trim();
  const email = String(payload.email || "").trim();
  const phone = String(payload.phone || payload.telefone || "").trim();
  const name = String(payload.name || payload.nome || payload.client_name || payload.clientName || payload.cliente || "").trim();
  const unit = normalizeUnitForMatch(payload.unit_code || payload.unitCode || payload.unit || payload.unidade);
  const contractValue = parseMoney(payload.contract_value || payload.contractValue || payload.valor_contrato || payload.valorContrato || payload.value || payload.valor);
  const rawContractValue = filledSamValue(payload.contract_value, payload.contractValue, payload.valor_contrato, payload.valorContrato, payload.value, payload.valor);
  if (!eventId) return { ok: false, httpStatus: 400, error: "event_id obrigatório" };
  if (isDuplicateSamEvent(db, eventId)) return { ok: true, status: "duplicate" };
  if (!eventType) return { ok: false, httpStatus: 400, error: "event_type obrigatório" };
  if (!email && !phone) return { ok: false, httpStatus: 400, error: "E-mail ou telefone obrigatório" };
  if (!unit) return { ok: false, httpStatus: 400, error: "Unidade obrigatória" };
  const lead = findSamLeadCandidate(db, { email, phone });
  const nextStatus = samStatusToPipelineStatus(db, eventType);
  const leadUnits = lead ? leadUnitsForMatch(lead) : [];
  const unitMatches = Boolean(lead && leadUnits.includes(unit));
  const event = {
    id: `sam-${crypto.randomUUID()}`,
    eventId,
    eventType,
    eventDatetime,
    email,
    phone,
    unit,
    nextStatus,
    status: unitMatches ? "matched" : lead ? "unit_mismatch" : "not_found",
    leadId: lead?.id || "",
    leadName: lead?.name || "",
    leadUnits,
    createdAt: new Date().toISOString(),
    resolvedAt: "",
    resolvedBy: "",
    resolution: ""
  };
  db.samEvents.unshift(event);
  db.samEvents = db.samEvents.slice(0, 500);
  integrationEvent(db, "SAM", unitMatches ? "RECEIVED_MATCHED" : lead ? "RECEIVED_UNIT_MISMATCH" : "RECEIVED_NOT_FOUND", {
    eventId,
    eventType,
    eventDatetime,
    leadId: event.leadId,
    unit,
    nextStatus
  });
  return {
    ok: true,
    status: "pending_review",
    reason: unitMatches ? "Lead encontrado. Aguardando confirmação no Pipeline." : lead ? "Lead encontrado, mas unidade divergente." : "Lead não encontrado no Pipeline.",
    sam_event_id: event.id,
    lead_id: event.leadId || undefined
  };
}

function normalizeKnowledgePayload(body, current = {}) {
  const audienceRoles = Array.isArray(body.audienceRoles)
    ? body.audienceRoles.filter((role) => ROLES.includes(role))
    : current.audienceRoles || [...ROLES];
  const keywords = String(Array.isArray(body.keywords) ? body.keywords.join(",") : body.keywords || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 24);
  return {
    title: String(body.title || current.title || "").trim(),
    category: KNOWLEDGE_CATEGORIES.includes(body.category) ? body.category : current.category || "Primeiros passos",
    summary: String(body.summary || current.summary || "").trim(),
    content: String(body.content || current.content || "").trim(),
    keywords,
    audienceRoles: audienceRoles.length ? audienceRoles : [...ROLES],
    published: Object.prototype.hasOwnProperty.call(body, "published") ? Boolean(body.published) : current.published !== false
  };
}

function publicKnowledgeArticle(article) {
  return {
    id: article.id,
    title: article.title,
    category: article.category,
    summary: article.summary,
    content: article.content,
    keywords: article.keywords || [],
    audienceRoles: article.audienceRoles || [],
    published: article.published !== false,
    updatedAt: article.updatedAt || "",
    updatedBy: article.updatedBy || ""
  };
}

function visibleKnowledgeArticles(db, user) {
  const articles = db.knowledgeArticles || [];
  return articles
    .filter((article) => {
      if (canManageKnowledge(user)) return true;
      if (article.published === false) return false;
      const roles = Array.isArray(article.audienceRoles) && article.audienceRoles.length ? article.audienceRoles : ROLES;
      return roles.includes(user.role);
    })
    .map(publicKnowledgeArticle);
}

function publicKnowledgeChatSession(session) {
  return {
    id: session.id,
    title: session.title,
    messages: (session.messages || []).slice(-30),
    generatedTutorialId: session.generatedTutorialId || "",
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function userKnowledgeChatSessions(db, user) {
  return (db.knowledgeChatSessions || [])
    .filter((session) => session.userId === user.id)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 20)
    .map(publicKnowledgeChatSession);
}

function publicLead(lead, user) {
  const comments = Array.isArray(lead.comments) ? lead.comments.map((comment) => {
    if (!comment.deletedAt || user.role === "Admin TI") return comment;
    return {
      ...comment,
      text: "",
      deletedText: undefined
    };
  }) : [];
  return {
    ...lead,
    comments,
    favorite: Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite),
    favoritesByUser: undefined
  };
}

function publicLeadSummary(lead, user) {
  const { comments, favoritesByUser, meta, ...summary } = lead;
  const commentPreview = Array.isArray(comments) ? comments.slice(0, 3) : [];
  const rawFieldKeys = meta?.rawFields && typeof meta.rawFields === "object"
    ? Object.keys(meta.rawFields).filter(Boolean)
    : [];
  return {
    ...summary,
    meta: meta ? { ...meta, rawFields: undefined, rawFieldKeys } : meta,
    comments: commentPreview,
    commentCount: Number(lead.commentCount || commentPreview.length || 0),
    favorite: Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite),
    detailLoaded: false
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
  const entry = {
    at: new Date().toISOString(),
    actor: actor.username,
    action,
    details
  };
  db.auditLog.unshift(entry);
  db.auditLog = db.auditLog.slice(0, 200);
  void mirrorStructuredAuditLog(entry);
}

function integrationEvent(db, provider, action, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    provider,
    action,
    details
  };
  db.integrationLog.unshift(entry);
  db.integrationLog = db.integrationLog.slice(0, 200);
  void mirrorStructuredIntegrationLog(entry);
}

function fupLeadEvent(db, actor, lead, action, details = {}) {
  if (!lead) return;
  const entry = {
    at: new Date().toISOString(),
    actor: actor.username,
    actorName: actor.name,
    userId: actor.id,
    leadId: lead.id,
    leadName: lead.name || "",
    action,
    details
  };
  db.fupLeadLog.unshift(entry);
  db.fupLeadLog = db.fupLeadLog.slice(0, 500);
  void mirrorStructuredFupLeadLog(entry);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
}

function access(db, actor, action, details, req) {
  const entry = {
    at: new Date().toISOString(),
    actor: actor.username,
    actorName: actor.name,
    role: actor.role,
    action,
    details,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 220)
  };
  db.accessLog.unshift(entry);
  db.accessLog = db.accessLog.slice(0, 500);
  void mirrorStructuredAccessLog(entry);
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

function metaIdValue(value) {
  if (value && typeof value === "object") return String(value.id || value.value || "").trim();
  return String(value || "").trim();
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
    ad_id: metaIdValue(metaLead.ad_id),
    form_id: metaIdValue(metaLead.form_id),
    campaign_id: metaIdValue(metaLead.campaign_id),
    ad_name_contains: metaIdValue(metaLead.ad_name),
    campaign_name_contains: metaIdValue(metaLead.campaign_name)
  };
  const target = String(comparisons[rule.type] || "").trim();
  if (!target) return false;
  if (rule.type.endsWith("_contains")) return target.toLowerCase().includes(lowerValue);
  return target === value;
}

function mappedMetaProject(db, metaLead) {
  const formProject = metaFormForId(db, metaIdValue(metaLead.form_id))?.project || "";
  if (formProject) return formProject;
  const match = normalizeMetaMappingRules(db.integrations)
    .find((rule) => metaRuleMatches(rule, metaLead));
  if (match?.project) return match.project;
  return metaProjectFromLeadText(db, metaLead);
}

function metaProjectFromLeadText(db, metaLead) {
  const fieldText = (Array.isArray(metaLead?.field_data) ? metaLead.field_data : [])
    .flatMap((field) => [field.name, ...(Array.isArray(field.values) ? field.values : [])])
    .join(" ");
  const text = metaLabelKey([
    fieldText,
    metaIdValue(metaLead?.ad_name),
    metaIdValue(metaLead?.campaign_name)
  ].join(" "));
  if (!text) return "";
  return (db.projects || []).find((project) => text.includes(metaLabelKey(project))) || "";
}

function metaFormForId(db, formId) {
  const id = String(formId || "").trim();
  if (!id) return null;
  return (db.integrations?.metaForms?.forms || [])
    .find((item) => String(item.id || item.formId || "").trim() === id);
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

async function fetchMetaFormLeads(formId, { sinceIso = "", limit = 200 } = {}) {
  if (!META_PAGE_ACCESS_TOKEN) throw new Error("META_PAGE_ACCESS_TOKEN ausente");
  const leads = [];
  let url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(formId)}/leads`);
  url.searchParams.set("fields", "id,created_time");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", META_PAGE_ACCESS_TOKEN);
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;

  while (url && leads.length < limit) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || "Falha ao buscar leads recentes do formulário");
    }
    const pageLeads = Array.isArray(data.data) ? data.data : [];
    for (const lead of pageLeads) {
      const createdMs = lead.created_time ? new Date(lead.created_time).getTime() : 0;
      if (sinceMs && createdMs && createdMs < sinceMs) return leads;
      if (lead.id) leads.push(lead);
      if (leads.length >= limit) break;
    }
    url = data.paging?.next ? new URL(data.paging.next) : null;
    if (!pageLeads.length) break;
  }
  return leads;
}

async function metaGraphGet(pathname, params = {}, token = META_PAGE_ACCESS_TOKEN) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pathname.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Falha na Graph API");
  return data;
}

async function metaGraphPost(pathname, params = {}, token = META_PAGE_ACCESS_TOKEN) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pathname.replace(/^\/+/, "")}`);
  url.searchParams.set("access_token", token);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") body.set(key, value);
  }
  const response = await fetch(url, { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Falha na Graph API");
  return data;
}

function defaultMetaConversionEventsServer() {
  return [
    { id: "lead_received", name: "Lead recebido", eventName: "Lead", active: true },
    { id: "lead_contacted", name: "Lead contatado", eventName: "Contact", active: true },
    { id: "qualified_lead", name: "Lead qualificado", eventName: "QualifiedLead", active: true },
    { id: "visit_scheduled", name: "Visita agendada", eventName: "Schedule", active: true },
    { id: "visit_done", name: "Visita realizada", eventName: "VisitDone", active: true },
    { id: "proposal_sent", name: "Proposta enviada", eventName: "SubmitApplication", active: true },
    { id: "contract_issued", name: "Contrato emitido", eventName: "ContractIssued", active: true },
    { id: "purchase", name: "Contrato assinado / venda", eventName: "Purchase", active: true }
  ];
}

function normalizeMetaConversionsServer(integrations = {}) {
  const current = integrations.metaConversions || {};
  const currentEvents = Array.isArray(current.events) ? current.events : [];
  const currentIds = new Set(currentEvents.map((event) => event.id));
  const seeded = defaultMetaConversionEventsServer().filter((event) => !currentIds.has(event.id));
  return {
    enabled: Boolean(current.enabled),
    apiUrl: current.apiUrl || `https://graph.facebook.com/${META_GRAPH_VERSION}/{DATASET_ID}/events`,
    datasetId: String(current.datasetId || "").trim(),
    tokenLabel: String(current.tokenLabel || "META_CAPI_ACCESS_TOKEN").trim() || "META_CAPI_ACCESS_TOKEN",
    testEventCode: String(current.testEventCode || "").trim(),
    events: [...currentEvents, ...seeded].map((event) => ({
      id: String(event.id || event.eventName || "").trim(),
      name: String(event.name || event.eventName || "Evento").trim(),
      eventName: String(event.eventName || "").trim(),
      active: event.active !== false
    })).filter((event) => event.id && event.eventName),
    statusMappings: current.statusMappings || {},
    tagMappings: current.tagMappings || {}
  };
}

async function structuredMetaConversionsConfig(sql) {
  const rows = await sql`SELECT payload FROM crm_settings WHERE key = 'integrations' LIMIT 1`;
  return normalizeMetaConversionsServer(rows[0]?.payload || {});
}

function activeMetaConversionEvent(config, eventId) {
  const id = String(eventId || "").trim();
  if (!id) return null;
  const event = (config.events || []).find((item) => item.id === id);
  if (!event || event.active === false || !event.eventName) return null;
  return event;
}

function configuredMetaConversionForStatus(config, status) {
  const mapping = config.statusMappings?.[String(status || "")] || {};
  if (!config.enabled || mapping.enabled !== true) return null;
  return activeMetaConversionEvent(config, mapping.eventId);
}

function configuredMetaConversionForTag(config, tagKey) {
  const mapping = config.tagMappings?.[String(tagKey || "")] || {};
  if (!config.enabled || mapping.enabled !== true) return null;
  return activeMetaConversionEvent(config, mapping.eventId);
}

function sha256Lower(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function metaConversionUserData(lead) {
  const userData = {};
  const emailHash = sha256Lower(lead.email);
  const phoneDigits = normalizePhoneDigits(lead.phone);
  const phoneHash = phoneDigits ? sha256Lower(phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`) : "";
  const leadgenId = String(lead.metaLeadId || lead.meta?.leadgenId || "").trim();
  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (leadgenId) userData.lead_id = leadgenId;
  return userData;
}

function metaConversionEndpoint(config) {
  const rawUrl = String(config.apiUrl || "").trim();
  if (!rawUrl) throw new Error("URL de envio Meta CAPI não configurada");
  if (rawUrl.includes("{DATASET_ID}") && !config.datasetId) throw new Error("Dataset / Pixel ID Meta CAPI não configurado");
  const withDataset = rawUrl.replace(/\{DATASET_ID\}/g, encodeURIComponent(config.datasetId || ""));
  const url = new URL(withDataset);
  const token = process.env[config.tokenLabel];
  if (!token) throw new Error(`${config.tokenLabel} ausente`);
  url.searchParams.set("access_token", token);
  return url;
}

function metaConversionEventPayload({ id, lead, event, sourceType, sourceKey, context = {}, config }) {
  const eventDate = context.statusAt || context.eventTime || lead.updatedAt || lead.createdAt || new Date().toISOString();
  const eventTime = Math.floor((Date.parse(eventDate) || Date.now()) / 1000);
  const userData = metaConversionUserData(lead);
  const value = parseMoney(lead.unitValue || lead.valorUnidade || "");
  const data = {
    event_name: event.eventName,
    event_time: eventTime,
    action_source: "system_generated",
    event_id: id,
    user_data: userData,
    custom_data: {
      crm_lead_id: lead.id || "",
      meta_leadgen_id: lead.metaLeadId || lead.meta?.leadgenId || "",
      form_id: lead.meta?.formId || "",
      ad_id: lead.meta?.adId || "",
      campaign_id: lead.meta?.campaignId || "",
      project: lead.desiredProject || lead.project || "",
      unit: lead.desiredUnit || lead.unit || "",
      status: lead.status || "",
      source_type: sourceType,
      source_key: sourceKey,
      trigger_source: context.source || "",
      screen: context.screen || ""
    }
  };
  if (value > 0) {
    data.custom_data.value = value;
    data.custom_data.currency = "BRL";
  }
  const payload = { data: [data] };
  if (config.testEventCode) payload.test_event_code = config.testEventCode;
  return payload;
}

async function sendStructuredMetaConversionEvent(sql, eventId) {
  const rows = await sql`SELECT * FROM crm_meta_conversion_events WHERE id = ${eventId} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  const config = await structuredMetaConversionsConfig(sql);
  if (!config.enabled) {
    await sql`UPDATE crm_meta_conversion_events SET status = 'skipped', last_error = 'Meta CAPI inativa' WHERE id = ${eventId}`;
    return null;
  }
  try {
    const url = metaConversionEndpoint(config);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.payload || {}),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
    if (!response.ok) throw new Error(data.error?.message || data.message || `Meta CAPI HTTP ${response.status}`);
    const eventsReceived = Number(data.events_received ?? data.eventsReceived ?? 0);
    const warningMessage = eventsReceived === 0
      ? "Meta respondeu 200, mas não confirmou nenhum evento recebido."
      : null;
    await sql`UPDATE crm_meta_conversion_events
      SET status = ${warningMessage ? "warning" : "sent"}, attempts = attempts + 1, last_error = ${warningMessage}, response = ${JSON.stringify(data)}::jsonb, sent_at = now()
      WHERE id = ${eventId}`;
    await structuredIntegration("META", "CAPI_EVENT_SENT", {
      eventId,
      leadId: row.lead_id,
      eventName: row.event_name,
      sourceType: row.source_type,
      sourceKey: row.source_key,
      eventsReceived,
      warning: warningMessage || ""
    });
    return data;
  } catch (error) {
    const message = error.name === "AbortError" ? "Timeout ao enviar Meta CAPI" : (error.message || "Falha ao enviar Meta CAPI");
    await sql`UPDATE crm_meta_conversion_events
      SET status = 'error', attempts = attempts + 1, last_error = ${message}
      WHERE id = ${eventId}`;
    await structuredIntegration("META", "CAPI_EVENT_FAILED", {
      eventId,
      leadId: row.lead_id,
      eventName: row.event_name,
      sourceType: row.source_type,
      sourceKey: row.source_key,
      error: message
    });
    return null;
  }
}

function publicMetaConversionEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: row.lead_name || "",
    sourceType: row.source_type,
    sourceKey: row.source_key,
    eventId: row.event_id,
    eventName: row.event_name,
    status: row.status,
    attempts: Number(row.attempts || 0),
    lastError: row.last_error || "",
    payload: row.payload || {},
    response: row.response || null,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}

async function metaCapiDiagnostics(sql) {
  const config = await structuredMetaConversionsConfig(sql);
  const tokenName = config.tokenLabel || "META_CAPI_ACCESS_TOKEN";
  const tokenConfigured = Boolean(process.env[tokenName]);
  const endpointOk = (() => {
    try {
      metaConversionEndpoint({ ...config, tokenLabel: tokenConfigured ? tokenName : "__MISSING_META_CAPI_TOKEN__" });
      return true;
    } catch (error) {
      return false;
    }
  })();
  const queueRows = await sql`
    SELECT status, count(*)::int AS total
    FROM crm_meta_conversion_events
    GROUP BY status
  `;
  const latestRows = await sql`
    SELECT e.*, l.name AS lead_name
    FROM crm_meta_conversion_events e
    LEFT JOIN crm_leads l ON l.id = e.lead_id
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 5
  `;
  const queue = Object.fromEntries(queueRows.map((row) => [row.status || "unknown", Number(row.total || 0)]));
  return {
    checkedAt: new Date().toISOString(),
    checks: [
      { label: "Integração Meta CAPI ativa", ok: config.enabled === true, detail: config.enabled ? "Ativa" : "Inativa" },
      { label: "Dataset / Pixel ID configurado", ok: Boolean(config.datasetId), detail: config.datasetId ? "Configurado" : "Não configurado" },
      { label: `Token ${tokenName}`, ok: tokenConfigured, detail: tokenConfigured ? "Configurado na Vercel" : "Ausente na Vercel" },
      { label: "URL de envio válida", ok: endpointOk, detail: endpointOk ? "OK" : "Revise URL, Dataset / Pixel ID e token" },
      { label: "Eventos ativos", ok: (config.events || []).some((event) => event.active !== false), detail: `${(config.events || []).filter((event) => event.active !== false).length} ativo(s)` }
    ],
    queue,
    latest: latestRows.map(publicMetaConversionEvent).filter(Boolean)
  };
}

async function metaCapiRowsForState(sql) {
  const rows = await sql`
    SELECT e.*, l.name AS lead_name
    FROM crm_meta_conversion_events e
    LEFT JOIN crm_leads l ON l.id = e.lead_id
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 500
  `;
  return rows.map(publicMetaConversionEvent).filter(Boolean);
}

async function enqueueStructuredMetaConversion(sql, actor, lead, event, sourceType, sourceKey, context = {}) {
  if (!lead?.id || !event?.id || !event.eventName) return null;
  const hasMetaOrigin = String(lead.source || "").toUpperCase() === "META" || lead.metaLeadId || lead.meta?.leadgenId || lead.meta?.formId;
  if (!hasMetaOrigin) return null;
  const userData = metaConversionUserData(lead);
  if (!Object.keys(userData).length) {
    await structuredIntegration("META", "CAPI_EVENT_SKIPPED", { leadId: lead.id, eventName: event.eventName, reason: "Lead sem e-mail, telefone ou leadgen_id" });
    return null;
  }
  const id = `meta-capi-${crypto.randomUUID()}`;
  const payload = metaConversionEventPayload({ id, lead, event, sourceType, sourceKey, context, config: await structuredMetaConversionsConfig(sql) });
  const inserted = await sql`INSERT INTO crm_meta_conversion_events (
      id, lead_id, source_type, source_key, event_id, event_name, status, payload, created_at
    ) VALUES (
      ${id}, ${lead.id}, ${sourceType}, ${sourceKey}, ${event.id}, ${event.eventName}, 'pending', ${JSON.stringify(payload)}::jsonb, now()
    )
    ON CONFLICT (lead_id, source_type, source_key, event_id) DO NOTHING
    RETURNING id`;
  const persistedId = inserted[0]?.id;
  if (!persistedId) return null;
  await structuredIntegration("META", "CAPI_EVENT_QUEUED", {
    eventId: persistedId,
    leadId: lead.id,
    leadName: lead.name || "",
    eventName: event.eventName,
    sourceType,
    sourceKey,
    actor: actor?.username || ""
  });
  await sendStructuredMetaConversionEvent(sql, persistedId);
  return persistedId;
}

async function enqueueStructuredMetaConversionForStatus(sql, actor, lead, fromStatus, toStatus, context = {}) {
  const nextStatus = String(toStatus || "").trim();
  if (!nextStatus || nextStatus === String(fromStatus || "").trim()) return null;
  const config = await structuredMetaConversionsConfig(sql);
  const event = configuredMetaConversionForStatus(config, nextStatus);
  if (!event) return null;
  return enqueueStructuredMetaConversion(sql, actor, lead, event, "status", nextStatus, context);
}

async function enqueueStructuredMetaConversionsForTags(sql, actor, lead, addedTags = [], context = {}) {
  const tags = [...new Set((addedTags || []).map((tag) => String(tag || "").trim()).filter(Boolean))];
  if (!tags.length) return [];
  const config = await structuredMetaConversionsConfig(sql);
  if (!config.enabled) return [];
  const tagRows = await sql`SELECT payload FROM crm_tag_definitions`;
  const tagDefinitions = tagRows.map((row) => row.payload || {}).filter((tag) => tag.id);
  const queued = [];
  for (const tag of tags) {
    const definition = tagDefinitions.find((item) => item.id === tag || item.name === tag);
    const event = configuredMetaConversionForTag(config, tag) || configuredMetaConversionForTag(config, definition?.id) || configuredMetaConversionForTag(config, definition?.name);
    if (!event) continue;
    const eventId = await enqueueStructuredMetaConversion(sql, actor, lead, event, "tag", definition?.id || tag, {
      ...context,
      tag: definition?.name || tag
    });
    if (eventId) queued.push(eventId);
  }
  return queued;
}

async function mirrorStructuredMetaConversionForStatus(lead, fromStatus, toStatus, actor = {}, context = {}) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await enqueueStructuredMetaConversionForStatus(sql, actor, lead, fromStatus, toStatus, context);
  } catch (error) {
    mirrorStructuredError("meta-capi-status", error);
  }
}

async function subscribeMetaLeadgenPage(pageId) {
  const id = String(pageId || "").trim();
  if (!id) throw new Error("ID da Página obrigatório");
  if (!META_PAGE_ACCESS_TOKEN) throw new Error("META_PAGE_ACCESS_TOKEN ausente");
  const page = await metaGraphGet(`${id}`, { fields: "id,name,access_token" });
  if (!page.access_token) {
    throw new Error("Não foi possível obter o token de acesso da Página. Confirme se o System User tem controle da Página e permissão pages_manage_metadata.");
  }
  const result = await metaGraphPost(`${id}/subscribed_apps`, { subscribed_fields: "leadgen" }, page.access_token);
  const subscribed = await metaGraphGet(`${id}/subscribed_apps`, { fields: "id,name,subscribed_fields" }, page.access_token);
  return { result, subscribed, page: { id: page.id, name: page.name || "" } };
}

async function diagnoseMeta(db) {
  const checks = [];
  const add = (name, status, detail = "") => checks.push({ name, status, detail });
  add("META_PAGE_ACCESS_TOKEN", META_PAGE_ACCESS_TOKEN ? "ok" : "error", META_PAGE_ACCESS_TOKEN ? "Configurado na Vercel" : "Ausente");
  add("META_APP_SECRET", META_APP_SECRET ? "ok" : "error", META_APP_SECRET ? "Configurado na Vercel" : "Ausente");
  add("META_VERIFY_TOKEN", META_VERIFY_TOKEN ? "ok" : "error", META_VERIFY_TOKEN ? "Configurado na Vercel" : "Ausente");
  add("META_APP_ID", META_APP_ID ? "ok" : "warning", META_APP_ID ? "Configurado na Vercel" : "Ausente; sem ele não dá para depurar expiração/permissões do token");

  if (!META_PAGE_ACCESS_TOKEN) return { checks, forms: [] };

  if (META_APP_ID && META_APP_SECRET) {
    try {
      const debug = await metaGraphGet("debug_token", { input_token: META_PAGE_ACCESS_TOKEN }, `${META_APP_ID}|${META_APP_SECRET}`);
      const data = debug.data || {};
      const expiresAt = data.expires_at ? new Date(data.expires_at * 1000).toISOString() : "sem expiração informada";
      add("Validade do token", data.is_valid ? "ok" : "error", `Tipo: ${data.type || "não informado"} · expira: ${expiresAt}`);
      add("Permissões do token", "ok", (data.scopes || []).join(", ") || "Nenhuma permissão retornada");
    } catch (error) {
      add("Debug do token", "error", error.message);
    }
  }

  let page = null;
  try {
    page = await metaGraphGet("me", { fields: "id,name" });
    add("Página acessível", "ok", `${page.name || "Página"} · ${page.id || ""}`);
  } catch (error) {
    add("Página acessível", "error", error.message);
  }

  if (page?.id) {
    try {
      const subscribed = await metaGraphGet(`${page.id}/subscribed_apps`, { fields: "id,name,subscribed_fields" });
      const app = (subscribed.data || []).find((item) => String(item.id || "") === META_APP_ID || String(item.subscribed_fields || "").includes("leadgen"));
      add("Webhook leadgen assinado", app ? "ok" : "warning", app ? `${app.name || "App"} · ${(app.subscribed_fields || []).join(", ")}` : "Nenhum app com leadgen encontrado na Página");
    } catch (error) {
      add("Webhook leadgen assinado", "warning", error.message);
    }
  }

  const forms = [];
  for (const form of configuredMetaForms(db)) {
    try {
      const metaForm = await metaGraphGet(form.id, { fields: "id,name,status" });
      forms.push({ id: form.id, name: form.name || metaForm.name || "", status: "ok", detail: metaForm.status || "Acessível" });
    } catch (error) {
      forms.push({ id: form.id, name: form.name || "", status: "error", detail: error.message });
    }
  }
  return { checks, forms };
}

function configuredMetaForms(db) {
  const forms = (db.integrations?.metaForms?.forms || []).filter((form) => !form.archived);
  const unique = new Map();
  for (const form of forms) {
    const id = String(form.id || form.formId || "").trim();
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      name: String(form.name || "").trim(),
      project: String(form.project || "").trim(),
      adUrl: String(form.adUrl || "").trim(),
      adLinks: Array.isArray(form.adLinks) ? form.adLinks : [],
      questionLabels: form.questionLabels || {},
      answerLabels: form.answerLabels || {}
    });
  }
  return [...unique.values()];
}

function metaAdUrlForForm(form, adId) {
  const id = String(adId || "").trim();
  const adLink = (form?.adLinks || []).find((item) => String(item.id || "").trim() === id);
  return String(adLink?.url || form?.adUrl || "").trim();
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
  const formId = metaIdValue(metaLead.form_id) || metaIdValue(webhookValue.form_id);
  const adId = metaIdValue(metaLead.ad_id) || metaIdValue(webhookValue.ad_id);
  const monitoredForm = metaFormForId(db, formId);
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
    desiredProject: monitoredForm?.project || mappedMetaProject(db, { ...metaLead, form_id: formId, ad_id: adId }) || normalized.desiredProject,
    desiredUnit: "",
    unitValue: "",
    notes: "",
    tags: [],
    comments: [],
    order: Date.now(),
    createdAt,
    updatedAt: now,
    meta: {
      pageId: metaIdValue(webhookValue.page_id),
      formId,
      adId,
      adName: metaIdValue(metaLead.ad_name),
      adUrl: metaAdUrlForForm(monitoredForm, adId),
      adsetId: metaIdValue(metaLead.adset_id),
      adsetName: metaIdValue(metaLead.adset_name),
      campaignId: metaIdValue(metaLead.campaign_id),
      campaignName: metaIdValue(metaLead.campaign_name),
      platform: metaLead.platform || "",
      isOrganic: Boolean(metaLead.is_organic),
      rawFields: normalized.rawFields
    }
  };
  db.leads.push(lead);
  return { status: "created", lead };
}

async function importMetaLeadById(db, actor, leadgenId, webhookValue = {}) {
  const id = String(leadgenId || "").trim();
  if (!id) throw new Error("Leadgen ID obrigatório");
  const localId = `meta-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const existing = db.leads.find((lead) => lead.externalId === `META-${id}` || lead.metaLeadId === id || lead.id === localId);
  if (existing) {
    integrationEvent(db, "META", "DUPLICATE_LEAD", { leadgenId: id });
    await mirrorStructuredLead(existing);
    return { status: "duplicate", lead: existing };
  }
  const metaLead = await fetchMetaLead(id);
  const created = createMetaLead(db, id, metaLead, webhookValue);
  if (created.status === "created") {
    await mirrorStructuredLead(created.lead);
    await mirrorStructuredLeadStatusMovement({
      actor,
      lead: created.lead,
      fromStatus: "",
      toStatus: created.lead.status,
      movementType: "meta_create",
      source: "meta",
      screen: actor?.username === "meta-webhook" ? "meta_webhook" : actor?.username === "meta-cron" ? "meta_cron" : "meta_manual_import",
      statusAt: created.lead.createdAt || created.lead.meta?.createdTime,
      details: {
        leadgenId: id,
        formId: created.lead.meta?.formId || "",
        adId: created.lead.meta?.adId || "",
        project: created.lead.desiredProject || ""
      }
    });
    await mirrorStructuredMetaConversionForStatus(created.lead, "", created.lead.status, actor, {
      source: "meta",
      screen: actor?.username === "meta-webhook" ? "meta_webhook" : actor?.username === "meta-cron" ? "meta_cron" : "meta_manual_import",
      statusAt: created.lead.createdAt || created.lead.meta?.createdTime || created.lead.updatedAt
    });
    audit(db, actor, "CREATE_META_LEAD", { leadId: created.lead.id, leadgenId: id });
    integrationEvent(db, "META", "LEAD_IMPORTED", {
      leadId: created.lead.id,
      leadgenId: id,
      project: created.lead.desiredProject || "",
      adId: created.lead.meta?.adId || "",
      formId: created.lead.meta?.formId || ""
    });
    if (!created.lead.desiredProject) {
      integrationEvent(db, "META", "PROJECT_NOT_MAPPED", {
        leadId: created.lead.id,
        leadgenId: id,
        adId: created.lead.meta?.adId || "",
        formId: created.lead.meta?.formId || "",
        campaignId: created.lead.meta?.campaignId || "",
        adName: created.lead.meta?.adName || "",
        campaignName: created.lead.meta?.campaignName || ""
      });
    }
    try {
      await notifyNewMetaLead(db, created.lead);
    } catch (error) {
      integrationEvent(db, "NOTIFICATION", "NEW_LEAD_NOTIFICATION_ERROR", {
        leadId: created.lead.id,
        leadgenId: id,
        reason: error.message || "Erro inesperado ao notificar novo lead"
      });
    }
  }
  return created;
}

async function syncRecentMetaLeads(db, actor, { days = 7, limitPerForm = 200, formId = "" } = {}) {
  const requestedFormId = String(formId || "").trim();
  const forms = configuredMetaForms(db).filter((form) => !requestedFormId || form.id === requestedFormId);
  if (!forms.length) {
    throw new Error(requestedFormId
      ? `Formulário Meta ${requestedFormId} não está cadastrado como ativo`
      : "Cadastre pelo menos um ID de formulário do Meta");
  }
  const sinceIso = new Date(Date.now() - Math.max(1, Number(days) || 7) * 24 * 60 * 60 * 1000).toISOString();
  const result = {
    forms: forms.length,
    formId: requestedFormId,
    found: 0,
    created: 0,
    duplicates: 0,
    errors: []
  };

  for (const form of forms) {
    let recentLeads = [];
    try {
      recentLeads = await fetchMetaFormLeads(form.id, { sinceIso, limit: limitPerForm });
      result.found += recentLeads.length;
    } catch (error) {
      result.errors.push({ formId: form.id, error: error.message });
      integrationEvent(db, "META", "SYNC_FORM_ERROR", { formId: form.id, error: error.message });
      continue;
    }

    for (const item of recentLeads) {
      try {
        const imported = await importMetaLeadById(db, actor, item.id, { form_id: form.id });
        if (imported.status === "created") result.created += 1;
        else result.duplicates += 1;
      } catch (error) {
        result.errors.push({ formId: form.id, leadgenId: item.id, error: error.message });
        integrationEvent(db, "META", "SYNC_LEAD_ERROR", { formId: form.id, leadgenId: item.id, error: error.message });
      }
    }
  }

  integrationEvent(db, "META", "SYNC_RECENT", {
    days,
    formId: requestedFormId,
    forms: result.forms,
    found: result.found,
    created: result.created,
    duplicates: result.duplicates,
    errors: result.errors.length
  });
  audit(db, actor, "SYNC_META_RECENT", {
    days,
    formId: requestedFormId,
    forms: result.forms,
    found: result.found,
    created: result.created,
    duplicates: result.duplicates,
    errors: result.errors.length
  });
  return result;
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
      const created = await importMetaLeadById(db, { username: "meta-webhook" }, leadgenId, value);
      if (created.status === "created") {
        result.created += 1;
      } else {
        result.duplicates += 1;
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

function dbDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseManualSamStatusDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const rawYear = Number(br[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hours = Number(br[4] || 12);
    const minutes = Number(br[5] || 0);
    const seconds = Number(br[6] || 0);
    const date = new Date(year, month - 1, day, hours, minutes, seconds);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date.toISOString();
    return "";
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function logRowId(prefix, item, index) {
  return item.id || `${prefix}-${index}-${crypto.createHash("sha1").update(JSON.stringify(item)).digest("hex").slice(0, 16)}`;
}

function structuredLeadDbFields(lead = {}) {
  return {
    source: lead.source || lead.origem || lead.origin || "",
    sourceStatus: lead.sourceStatus || lead.source_status || "",
    odysseiaStatus: lead.odysseiaStatus || lead.odysseia_status || "",
    baseSourceBeforePipeline: lead.baseSourceBeforePipeline || lead.base_source_before_pipeline || "",
    previousPipelineSource: lead.previousPipelineSource || lead.previous_pipeline_source || "",
    assistant: lead.assistant || "",
    externalId: lead.externalId || lead.external_id || "",
    project: lead.project || lead.empreendimento || lead.desiredProject || "",
    unit: lead.unit || lead.unidade || lead.desiredUnit || "",
    unitValue: lead.unitValue || lead.valorUnidade || ""
  };
}

async function ensureStructuredSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS crm_structured_sync_runs (id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL, summary jsonb NOT NULL DEFAULT '{}'::jsonb, error text)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_users (id text PRIMARY KEY, username text, name text, role text, active boolean NOT NULL DEFAULT true, operates_as_broker boolean NOT NULL DEFAULT false, notifications jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz, updated_at timestamptz, payload jsonb NOT NULL)`;
  await sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS password_hash text`;
  await sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS password_setup jsonb`;
  await sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS photo_url text`;
  await sql`CREATE INDEX IF NOT EXISTS crm_users_username_idx ON crm_users (lower(username))`;
  await sql`CREATE TABLE IF NOT EXISTS crm_leads (id text PRIMARY KEY, name text, email text, phone text, source text, status text, in_pipeline boolean NOT NULL DEFAULT false, assigned_to text, assigned_name text, project text, unit text, unit_value text, base_source_before_pipeline text, previous_pipeline_source text, created_at timestamptz, updated_at timestamptz, payload jsonb NOT NULL)`;
  await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS source_status text`;
  await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS odysseia_status text`;
  await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS assistant text`;
  await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS external_id text`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_source_idx ON crm_leads (source)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_pipeline_idx ON crm_leads (in_pipeline)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_status_idx ON crm_leads (status)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_assigned_idx ON crm_leads (assigned_to)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_email_idx ON crm_leads (email)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_phone_idx ON crm_leads (phone)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_base_before_idx ON crm_leads (base_source_before_pipeline)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_previous_source_idx ON crm_leads (previous_pipeline_source)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_source_status_idx ON crm_leads (source_status)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_leads_odysseia_status_idx ON crm_leads (odysseia_status)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_opportunities (
    id text PRIMARY KEY,
    lead_id text NOT NULL,
    status text,
    in_pipeline boolean NOT NULL DEFAULT true,
    assigned_to text,
    assigned_name text,
    project text,
    unit text,
    unit_sam_code text,
    unit_value text,
    source text,
    created_at timestamptz,
    updated_at timestamptz,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  )`;
  await sql`CREATE INDEX IF NOT EXISTS crm_opportunities_lead_idx ON crm_opportunities (lead_id)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_opportunities_status_idx ON crm_opportunities (status)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_opportunities_assigned_idx ON crm_opportunities (assigned_to)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_opportunities_project_idx ON crm_opportunities (project)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_opportunities_unit_idx ON crm_opportunities (unit_sam_code)`;
  await sql`UPDATE crm_leads SET
      source = COALESCE(NULLIF(source, ''), NULLIF(payload->>'source', ''), NULLIF(payload->>'origem', ''), NULLIF(payload->>'origin', ''), ''),
      base_source_before_pipeline = COALESCE(NULLIF(base_source_before_pipeline, ''), NULLIF(payload->>'baseSourceBeforePipeline', ''), NULLIF(payload->>'base_source_before_pipeline', ''), ''),
      previous_pipeline_source = COALESCE(NULLIF(previous_pipeline_source, ''), NULLIF(payload->>'previousPipelineSource', ''), NULLIF(payload->>'previous_pipeline_source', ''), ''),
      source_status = COALESCE(NULLIF(source_status, ''), NULLIF(payload->>'sourceStatus', ''), NULLIF(payload->>'source_status', ''), ''),
      odysseia_status = COALESCE(NULLIF(odysseia_status, ''), NULLIF(payload->>'odysseiaStatus', ''), NULLIF(payload->>'odysseia_status', ''), ''),
      assistant = COALESCE(NULLIF(assistant, ''), NULLIF(payload->>'assistant', ''), ''),
      external_id = COALESCE(NULLIF(external_id, ''), NULLIF(payload->>'externalId', ''), NULLIF(payload->>'external_id', ''), '')
    WHERE (NULLIF(source, '') IS NULL AND COALESCE(NULLIF(payload->>'source', ''), NULLIF(payload->>'origem', ''), NULLIF(payload->>'origin', '')) IS NOT NULL)
      OR (NULLIF(base_source_before_pipeline, '') IS NULL AND COALESCE(NULLIF(payload->>'baseSourceBeforePipeline', ''), NULLIF(payload->>'base_source_before_pipeline', '')) IS NOT NULL)
      OR (NULLIF(previous_pipeline_source, '') IS NULL AND COALESCE(NULLIF(payload->>'previousPipelineSource', ''), NULLIF(payload->>'previous_pipeline_source', '')) IS NOT NULL)
      OR (NULLIF(source_status, '') IS NULL AND COALESCE(NULLIF(payload->>'sourceStatus', ''), NULLIF(payload->>'source_status', '')) IS NOT NULL)
      OR (NULLIF(odysseia_status, '') IS NULL AND COALESCE(NULLIF(payload->>'odysseiaStatus', ''), NULLIF(payload->>'odysseia_status', '')) IS NOT NULL)
      OR (NULLIF(assistant, '') IS NULL AND NULLIF(payload->>'assistant', '') IS NOT NULL)
      OR (NULLIF(external_id, '') IS NULL AND COALESCE(NULLIF(payload->>'externalId', ''), NULLIF(payload->>'external_id', '')) IS NOT NULL)`;
  await sql`UPDATE crm_leads
    SET in_pipeline = true
    WHERE in_pipeline = false
      AND lower(COALESCE(payload->>'inPipeline', payload->>'in_pipeline', 'false')) = 'true'`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lead_comments (id text PRIMARY KEY, lead_id text NOT NULL, author_user_id text, author_name text, comment_text text, from_user boolean NOT NULL DEFAULT false, deleted boolean NOT NULL DEFAULT false, created_at timestamptz, payload jsonb NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_lead_comments_lead_idx ON crm_lead_comments (lead_id)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lead_tags (lead_id text NOT NULL, tag_id text NOT NULL, PRIMARY KEY (lead_id, tag_id))`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lead_favorites (lead_id text NOT NULL, user_id text NOT NULL, favorite boolean NOT NULL DEFAULT true, PRIMARY KEY (lead_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS crm_pipeline_statuses (status text PRIMARY KEY, position integer NOT NULL)`;
  await sql`ALTER TABLE crm_pipeline_statuses ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`CREATE TABLE IF NOT EXISTS crm_projects (name text PRIMARY KEY, payload jsonb NOT NULL DEFAULT '{}'::jsonb)`;
  await sql`ALTER TABLE crm_projects ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS crm_units (
    id text PRIMARY KEY,
    project text NOT NULL,
    unit text NOT NULL,
    block text,
    floor text,
    stack text,
    sam_code text,
    status text,
    lead_id text,
    buyer_name text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_units_project_unit_idx ON crm_units (project, unit)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_units_project_idx ON crm_units (project, block, floor, stack)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_tag_definitions (id text PRIMARY KEY, name text, color text, payload jsonb NOT NULL DEFAULT '{}'::jsonb)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_base_sources (name text PRIMARY KEY)`;
  await sql`INSERT INTO crm_base_sources (name) VALUES ('64 OPEN') ON CONFLICT DO NOTHING`;
  await sql`UPDATE crm_leads SET source = '64 OPEN', payload = jsonb_set(payload, '{source}', to_jsonb('64 OPEN'::text), true), updated_at = now() WHERE source = '64º Aberto de Golfe' OR payload->>'source' = '64º Aberto de Golfe'`;
  await sql`DELETE FROM crm_base_sources WHERE name = '64º Aberto de Golfe'`;
  await sql`CREATE TABLE IF NOT EXISTS crm_meta_forms (id text PRIMARY KEY, name text, project text, archived boolean NOT NULL DEFAULT false, ad_url text, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_settings (key text PRIMARY KEY, payload jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS crm_marketing_state (id text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`INSERT INTO crm_marketing_state (id, data) VALUES ('main', ${JSON.stringify(defaultMarketingData())}::jsonb) ON CONFLICT (id) DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS crm_permissions (owner_type text NOT NULL, owner_id text NOT NULL, resource_id text NOT NULL, can_access boolean NOT NULL DEFAULT false, can_act boolean NOT NULL DEFAULT false, PRIMARY KEY (owner_type, owner_id, resource_id))`;
  await sql`INSERT INTO crm_permissions (owner_type, owner_id, resource_id, can_access, can_act) VALUES
    ('role', 'Admin TI', 'base:64 OPEN', true, true),
    ('role', 'Head Comercial', 'base:64 OPEN', true, true),
    ('role', 'Supervisor Comercial', 'base:64 OPEN', true, true),
    ('role', 'Diretoria', 'base:64 OPEN', true, false),
    ('role', 'Corretor', 'base:64 OPEN', true, true)
    ON CONFLICT (owner_type, owner_id, resource_id) DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS crm_audit_logs (id text PRIMARY KEY, at timestamptz, actor text, actor_name text, action text, details jsonb NOT NULL DEFAULT '{}'::jsonb, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_access_logs (id text PRIMARY KEY, at timestamptz, actor text, actor_name text, role text, action text, details jsonb NOT NULL DEFAULT '{}'::jsonb, ip text, user_agent text, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_integration_logs (id text PRIMARY KEY, at timestamptz, provider text, action text, details jsonb NOT NULL DEFAULT '{}'::jsonb, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_meta_lead_health (
    project text PRIMARY KEY,
    last_lead_at timestamptz,
    average_gap_minutes numeric,
    current_gap_minutes numeric,
    sample_size integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'ok',
    alerted_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  )`;
  await sql`CREATE TABLE IF NOT EXISTS crm_fup_lead_logs (id text PRIMARY KEY, at timestamptz, lead_id text, lead_name text, actor text, actor_name text, action text, details jsonb NOT NULL DEFAULT '{}'::jsonb, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_meta_conversion_events (
    id text PRIMARY KEY,
    lead_id text NOT NULL,
    source_type text NOT NULL,
    source_key text NOT NULL,
    event_id text NOT NULL,
    event_name text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    response jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_meta_conversion_events_unique_idx ON crm_meta_conversion_events (lead_id, source_type, source_key, event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_meta_conversion_events_status_idx ON crm_meta_conversion_events (status, created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lead_status_movements (
    id text PRIMARY KEY,
    lead_id text NOT NULL,
    lead_name text,
    from_status text,
    to_status text NOT NULL,
    moved_at timestamptz NOT NULL DEFAULT now(),
    status_at timestamptz,
    actor_id text,
    actor_username text,
    actor_name text,
    actor_role text,
    movement_type text NOT NULL,
    source text,
    screen text,
    sam_event_id text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  )`;
  await sql`CREATE INDEX IF NOT EXISTS crm_lead_status_movements_lead_idx ON crm_lead_status_movements (lead_id, moved_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_lead_status_movements_status_idx ON crm_lead_status_movements (to_status, moved_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_lead_status_movements_actor_idx ON crm_lead_status_movements (actor_id, moved_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_sam_events (id text PRIMARY KEY, event_id text, event_type text, event_datetime text, email text, phone text, unit text, next_status text, status text, lead_id text, lead_name text, created_at timestamptz, resolved_at timestamptz, resolved_by text, payload jsonb NOT NULL)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_sam_events_event_id_idx ON crm_sam_events (event_id) WHERE event_id IS NOT NULL AND event_id <> ''`;
  await sql`CREATE INDEX IF NOT EXISTS crm_sam_events_status_idx ON crm_sam_events (status)`;
  await sql`CREATE INDEX IF NOT EXISTS crm_sam_events_created_idx ON crm_sam_events (created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lev_sales (id text PRIMARY KEY, unit text, client text, signed_at timestamptz, contract_value numeric, commission_value numeric, realtor_company text, status text, nf_number text, paid_at timestamptz, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lev_receipts (id text PRIMARY KEY, unit text, amount numeric, paid_at timestamptz, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_lev_settlements (id text PRIMARY KEY, unit text, client text, signed_at timestamptz, contract_value numeric, commission_value numeric, realtor_company text, status text, nf_number text, paid_at timestamptz, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_sml_sales (id text PRIMARY KEY, unit text, client text, signed_at timestamptz, contract_value numeric, signal_value numeric, financing_value numeric, commission_value numeric, realtor_company text, zero_entry boolean NOT NULL DEFAULT false, status text, nf_number text, paid_at timestamptz, payload jsonb NOT NULL)`;
  await sql`ALTER TABLE crm_sml_sales ADD COLUMN IF NOT EXISTS signal_value numeric`;
  await sql`ALTER TABLE crm_sml_sales ADD COLUMN IF NOT EXISTS financing_value numeric`;
  await sql`ALTER TABLE crm_sml_sales ADD COLUMN IF NOT EXISTS zero_entry boolean NOT NULL DEFAULT false`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_sml_sales_unit_unique ON crm_sml_sales (upper(unit))`;
  await sql`CREATE TABLE IF NOT EXISTS crm_sml_receipts (id text PRIMARY KEY, unit text, amount numeric, paid_at timestamptz, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_sml_settlements (id text PRIMARY KEY, unit text, client text, signed_at timestamptz, contract_value numeric, commission_value numeric, realtor_company text, status text, nf_number text, paid_at timestamptz, payload jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_sml_authorization_links (id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, email text NOT NULL, password_hash text NOT NULL, sale_ids jsonb NOT NULL DEFAULT '[]'::jsonb, expires_at timestamptz NOT NULL, confirmed_at timestamptz, payload jsonb NOT NULL DEFAULT '{}'::jsonb)`;
  await sql`CREATE TABLE IF NOT EXISTS crm_knowledge_articles (id text PRIMARY KEY, title text, category text, published boolean NOT NULL DEFAULT false, updated_at timestamptz, payload jsonb NOT NULL)`;
  await invalidateStructuredConfigCache();
}

async function ensureStructuredSchemaOnce(sql) {
  if (structuredSchemaReady) return;
  if (!structuredSchemaPromise) {
    structuredSchemaPromise = ensureStructuredSchema(sql)
      .then(() => {
        structuredSchemaReady = true;
      })
      .catch((error) => {
        structuredSchemaPromise = null;
        structuredSchemaReady = false;
        throw error;
      });
  }
  await structuredSchemaPromise;
}

const STRUCTURED_TABLES = [
  "crm_lead_comments", "crm_lead_tags", "crm_lead_favorites", "crm_opportunities", "crm_units", "crm_permissions", "crm_meta_forms", "crm_tag_definitions", "crm_settings", "crm_meta_lead_health", "crm_meta_conversion_events",
  "crm_pipeline_statuses", "crm_projects", "crm_base_sources", "crm_audit_logs", "crm_access_logs", "crm_integration_logs",
  "crm_fup_lead_logs", "crm_lead_status_movements", "crm_sam_events", "crm_lev_sales", "crm_lev_receipts", "crm_lev_settlements", "crm_sml_authorization_links", "crm_sml_sales", "crm_sml_receipts", "crm_sml_settlements", "crm_knowledge_articles", "crm_leads", "crm_users"
];

const STRUCTURED_DATASETS = [
  { key: "users", tables: ["crm_users"] },
  { key: "leads", tables: ["crm_leads"] },
  { key: "opportunities", tables: ["crm_opportunities"] },
  { key: "units", tables: ["crm_units"] },
  { key: "comments", tables: ["crm_lead_comments"] },
  { key: "tags", tables: ["crm_lead_tags"] },
  { key: "tagDefinitions", tables: ["crm_tag_definitions"] },
  { key: "favorites", tables: ["crm_lead_favorites"] },
  { key: "statuses", tables: ["crm_pipeline_statuses"] },
  { key: "projects", tables: ["crm_projects"] },
  { key: "baseSources", tables: ["crm_base_sources"] },
  { key: "metaForms", tables: ["crm_meta_forms"] },
  { key: "settings", tables: ["crm_settings"] },
  { key: "permissions", tables: ["crm_permissions"] },
  { key: "auditLogs", tables: ["crm_audit_logs"] },
  { key: "accessLogs", tables: ["crm_access_logs"] },
  { key: "integrationLogs", tables: ["crm_integration_logs"] },
  { key: "fupLeadLogs", tables: ["crm_fup_lead_logs"] },
  { key: "leadStatusMovements", tables: ["crm_lead_status_movements"] },
  { key: "samEvents", tables: ["crm_sam_events"] },
  { key: "levSales", tables: ["crm_lev_sales"] },
  { key: "levReceipts", tables: ["crm_lev_receipts"] },
  { key: "levSettlements", tables: ["crm_lev_settlements"] },
  { key: "knowledgeArticles", tables: ["crm_knowledge_articles"] }
];

const STRUCTURED_DATASET_BY_KEY = new Map(STRUCTURED_DATASETS.map((item) => [item.key, item]));

function structuredDataset(key) {
  const dataset = STRUCTURED_DATASET_BY_KEY.get(String(key || ""));
  if (!dataset) throw new Error("Dado estruturado inválido.");
  return dataset;
}

async function clearStructuredTable(sql, table) {
  if (table === "crm_lead_comments") return sql`DELETE FROM crm_lead_comments`;
  if (table === "crm_lead_tags") return sql`DELETE FROM crm_lead_tags`;
  if (table === "crm_lead_favorites") return sql`DELETE FROM crm_lead_favorites`;
  if (table === "crm_opportunities") return sql`DELETE FROM crm_opportunities`;
  if (table === "crm_units") return sql`DELETE FROM crm_units`;
  if (table === "crm_permissions") return sql`DELETE FROM crm_permissions`;
  if (table === "crm_meta_forms") return sql`DELETE FROM crm_meta_forms`;
  if (table === "crm_tag_definitions") return sql`DELETE FROM crm_tag_definitions`;
  if (table === "crm_settings") return sql`DELETE FROM crm_settings`;
  if (table === "crm_meta_lead_health") return sql`DELETE FROM crm_meta_lead_health`;
  if (table === "crm_meta_conversion_events") return sql`DELETE FROM crm_meta_conversion_events`;
  if (table === "crm_pipeline_statuses") return sql`DELETE FROM crm_pipeline_statuses`;
  if (table === "crm_projects") return sql`DELETE FROM crm_projects`;
  if (table === "crm_base_sources") return sql`DELETE FROM crm_base_sources`;
  if (table === "crm_audit_logs") return sql`DELETE FROM crm_audit_logs`;
  if (table === "crm_access_logs") return sql`DELETE FROM crm_access_logs`;
  if (table === "crm_integration_logs") return sql`DELETE FROM crm_integration_logs`;
  if (table === "crm_fup_lead_logs") return sql`DELETE FROM crm_fup_lead_logs`;
  if (table === "crm_lead_status_movements") return sql`DELETE FROM crm_lead_status_movements`;
  if (table === "crm_sam_events") return sql`DELETE FROM crm_sam_events`;
  if (table === "crm_lev_sales") return sql`DELETE FROM crm_lev_sales`;
  if (table === "crm_lev_receipts") return sql`DELETE FROM crm_lev_receipts`;
  if (table === "crm_lev_settlements") return sql`DELETE FROM crm_lev_settlements`;
  if (table === "crm_sml_authorization_links") return sql`DELETE FROM crm_sml_authorization_links`;
  if (table === "crm_sml_sales") return sql`DELETE FROM crm_sml_sales`;
  if (table === "crm_sml_receipts") return sql`DELETE FROM crm_sml_receipts`;
  if (table === "crm_sml_settlements") return sql`DELETE FROM crm_sml_settlements`;
  if (table === "crm_knowledge_articles") return sql`DELETE FROM crm_knowledge_articles`;
  if (table === "crm_leads") return sql`DELETE FROM crm_leads`;
  if (table === "crm_users") return sql`DELETE FROM crm_users`;
  throw new Error(`Tabela estruturada inválida: ${table}`);
}

async function clearStructuredTables(sql) {
  for (const table of STRUCTURED_TABLES) await clearStructuredTable(sql, table);
}

async function clearStructuredDataset(sql, key) {
  const dataset = structuredDataset(key);
  for (const table of dataset.tables) await clearStructuredTable(sql, table);
}

async function countStructuredTable(sql, table) {
  if (table === "crm_users") return (await sql`SELECT COUNT(*)::int AS count FROM crm_users`)[0]?.count || 0;
  if (table === "crm_leads") return (await sql`SELECT COUNT(*)::int AS count FROM crm_leads`)[0]?.count || 0;
  if (table === "crm_lead_comments") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lead_comments`)[0]?.count || 0;
  if (table === "crm_lead_tags") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lead_tags`)[0]?.count || 0;
  if (table === "crm_lead_favorites") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lead_favorites`)[0]?.count || 0;
  if (table === "crm_opportunities") return (await sql`SELECT COUNT(*)::int AS count FROM crm_opportunities`)[0]?.count || 0;
  if (table === "crm_units") return (await sql`SELECT COUNT(*)::int AS count FROM crm_units`)[0]?.count || 0;
  if (table === "crm_tag_definitions") return (await sql`SELECT COUNT(*)::int AS count FROM crm_tag_definitions`)[0]?.count || 0;
  if (table === "crm_pipeline_statuses") return (await sql`SELECT COUNT(*)::int AS count FROM crm_pipeline_statuses`)[0]?.count || 0;
  if (table === "crm_projects") return (await sql`SELECT COUNT(*)::int AS count FROM crm_projects`)[0]?.count || 0;
  if (table === "crm_base_sources") return (await sql`SELECT COUNT(*)::int AS count FROM crm_base_sources`)[0]?.count || 0;
  if (table === "crm_meta_forms") return (await sql`SELECT COUNT(*)::int AS count FROM crm_meta_forms`)[0]?.count || 0;
  if (table === "crm_settings") return (await sql`SELECT COUNT(*)::int AS count FROM crm_settings`)[0]?.count || 0;
  if (table === "crm_permissions") return (await sql`SELECT COUNT(*)::int AS count FROM crm_permissions`)[0]?.count || 0;
  if (table === "crm_audit_logs") return (await sql`SELECT COUNT(*)::int AS count FROM crm_audit_logs`)[0]?.count || 0;
  if (table === "crm_access_logs") return (await sql`SELECT COUNT(*)::int AS count FROM crm_access_logs`)[0]?.count || 0;
  if (table === "crm_integration_logs") return (await sql`SELECT COUNT(*)::int AS count FROM crm_integration_logs`)[0]?.count || 0;
  if (table === "crm_fup_lead_logs") return (await sql`SELECT COUNT(*)::int AS count FROM crm_fup_lead_logs`)[0]?.count || 0;
  if (table === "crm_lead_status_movements") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lead_status_movements`)[0]?.count || 0;
  if (table === "crm_sam_events") return (await sql`SELECT COUNT(*)::int AS count FROM crm_sam_events`)[0]?.count || 0;
  if (table === "crm_lev_sales") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lev_sales`)[0]?.count || 0;
  if (table === "crm_lev_receipts") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lev_receipts`)[0]?.count || 0;
  if (table === "crm_lev_settlements") return (await sql`SELECT COUNT(*)::int AS count FROM crm_lev_settlements`)[0]?.count || 0;
  if (table === "crm_knowledge_articles") return (await sql`SELECT COUNT(*)::int AS count FROM crm_knowledge_articles`)[0]?.count || 0;
  throw new Error(`Tabela estruturada inválida: ${table}`);
}

async function structuredSqlForMirror() {
  const sql = await getSql();
  if (!sql) return null;
  await ensureStructuredSchemaOnce(sql);
  return sql;
}

function mirrorStructuredError(scope, error) {
  console.warn(`[structured-db:${scope}] ${error.message || error}`);
}

async function mirrorStructuredLead(lead) {
  if (!lead?.id) return;
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    const fields = structuredLeadDbFields(lead);
    await sql`INSERT INTO crm_leads (id, name, email, phone, source, source_status, odysseia_status, assistant, external_id, status, in_pipeline, assigned_to, assigned_name, project, unit, unit_value, base_source_before_pipeline, previous_pipeline_source, created_at, updated_at, payload)
      VALUES (${lead.id}, ${lead.name || ""}, ${lead.email || ""}, ${lead.phone || ""}, ${fields.source}, ${fields.sourceStatus}, ${fields.odysseiaStatus}, ${fields.assistant}, ${fields.externalId}, ${lead.status || ""}, ${Boolean(lead.inPipeline)}, ${lead.assignedTo || null}, ${lead.assignedName || ""}, ${fields.project}, ${fields.unit}, ${fields.unitValue}, ${fields.baseSourceBeforePipeline}, ${fields.previousPipelineSource}, ${dbDate(lead.createdAt || lead.meta?.createdTime)}, ${dbDate(lead.updatedAt)}, ${JSON.stringify(lead)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, source = EXCLUDED.source, source_status = EXCLUDED.source_status, odysseia_status = EXCLUDED.odysseia_status, assistant = EXCLUDED.assistant, external_id = EXCLUDED.external_id, status = EXCLUDED.status, in_pipeline = EXCLUDED.in_pipeline, assigned_to = EXCLUDED.assigned_to, assigned_name = EXCLUDED.assigned_name, project = EXCLUDED.project, unit = EXCLUDED.unit, unit_value = EXCLUDED.unit_value, base_source_before_pipeline = EXCLUDED.base_source_before_pipeline, previous_pipeline_source = EXCLUDED.previous_pipeline_source, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`;
  } catch (error) {
    mirrorStructuredError("lead", error);
  }
}

async function deleteStructuredLead(leadId) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await sql`DELETE FROM crm_leads WHERE id = ${leadId}`;
    await sql`DELETE FROM crm_lead_comments WHERE lead_id = ${leadId}`;
    await sql`DELETE FROM crm_lead_tags WHERE lead_id = ${leadId}`;
    await sql`DELETE FROM crm_lead_favorites WHERE lead_id = ${leadId}`;
  } catch (error) {
    mirrorStructuredError("delete-lead", error);
  }
}

async function mirrorStructuredAuditLog(entry) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await sql`INSERT INTO crm_audit_logs (id, at, actor, actor_name, action, details, payload) VALUES (${logRowId("audit", entry, 0)}, ${dbDate(entry.at)}, ${entry.actor || ""}, ${entry.actorName || ""}, ${entry.action || ""}, ${JSON.stringify(entry.details || {})}::jsonb, ${JSON.stringify(entry)}::jsonb) ON CONFLICT (id) DO NOTHING`;
  } catch (error) {
    mirrorStructuredError("audit", error);
  }
}

async function mirrorStructuredIntegrationLog(entry) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await sql`INSERT INTO crm_integration_logs (id, at, provider, action, details, payload) VALUES (${logRowId("integration", entry, 0)}, ${dbDate(entry.at)}, ${entry.provider || ""}, ${entry.action || ""}, ${JSON.stringify(entry.details || {})}::jsonb, ${JSON.stringify(entry)}::jsonb) ON CONFLICT (id) DO NOTHING`;
  } catch (error) {
    mirrorStructuredError("integration", error);
  }
}

async function mirrorStructuredFupLeadLog(entry) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await sql`INSERT INTO crm_fup_lead_logs (id, at, lead_id, lead_name, actor, actor_name, action, details, payload) VALUES (${logRowId("fup", entry, 0)}, ${dbDate(entry.at)}, ${entry.leadId || ""}, ${entry.leadName || ""}, ${entry.actor || ""}, ${entry.actorName || ""}, ${entry.action || ""}, ${JSON.stringify(entry.details || {})}::jsonb, ${JSON.stringify(entry)}::jsonb) ON CONFLICT (id) DO NOTHING`;
  } catch (error) {
    mirrorStructuredError("fup", error);
  }
}

async function mirrorStructuredAccessLog(entry) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await sql`INSERT INTO crm_access_logs (id, at, actor, actor_name, role, action, details, ip, user_agent, payload)
      VALUES (${logRowId("access", entry, 0)}, ${dbDate(entry.at)}, ${entry.actor || ""}, ${entry.actorName || ""}, ${entry.role || ""}, ${entry.action || ""}, ${JSON.stringify(entry.details || {})}::jsonb, ${entry.ip || ""}, ${entry.userAgent || ""}, ${JSON.stringify(entry)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  } catch (error) {
    mirrorStructuredError("access", error);
  }
}

function samEventFromRow(row) {
  const payload = row?.payload || {};
  return {
    ...payload,
    id: row.id || payload.id,
    eventId: row.event_id || payload.eventId || "",
    eventType: row.event_type || payload.eventType || "",
    eventDatetime: row.event_datetime || payload.eventDatetime || "",
    email: row.email || payload.email || "",
    phone: row.phone || payload.phone || "",
    unit: row.unit || payload.unit || "",
    nextStatus: row.next_status || payload.nextStatus || "",
    status: row.status || payload.status || "",
    leadId: row.lead_id || payload.leadId || "",
    leadName: row.lead_name || payload.leadName || "",
    createdAt: row.created_at || payload.createdAt || "",
    resolvedAt: row.resolved_at || payload.resolvedAt || "",
    resolvedBy: row.resolved_by || payload.resolvedBy || ""
  };
}

function isContractSignedPipelineStatus(status) {
  const normalized = normalizeComparableText(status).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ["contrato_assinado", "contrato_100_assinado", "venda_finalizada", "contract_signed", "sale_completed"].includes(normalized);
}

function filledSamValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function applySamDataToLead(lead, event, fields = {}, projectDefinitions = [], options = {}) {
  const unit = normalizeUnitForMatch(filledSamValue(fields.unit, fields.desiredUnit, event.unit));
  const project = filledSamValue(fields.project, fields.desiredProject, event.project, projectNameForUnit(unit, projectDefinitions));
  const email = filledSamValue(fields.email, event.email);
  const phone = filledSamValue(fields.phone, event.phone);
  const unitValue = filledSamValue(fields.unitValue, fields.contractValue, event.contractValue, event.valorContrato);
  if (email) lead.email = email;
  if (phone) lead.phone = phone;
  if (!options.preserveOpportunityFields && unit) {
    lead.unit = unit;
    lead.desiredUnit = unit;
  }
  if (!options.preserveOpportunityFields && project) {
    lead.project = project;
    lead.desiredProject = project;
  }
  if (!options.preserveOpportunityFields && unitValue) lead.unitValue = unitValue;
  return { unit, project, email, phone, unitValue };
}

function levSaleFromSamLead(lead, event, fields = {}, settings = {}) {
  const unit = normalizeLevUnit(filledSamValue(fields.unit, fields.desiredUnit, lead.unit, lead.desiredUnit, event.unit));
  if (!unit || !isLikelyLevUnit(unit)) return null;
  const contractValue = parseMoney(filledSamValue(fields.contractValue, fields.unitValue, lead.unitValue, event.contractValue, event.valorContrato));
  const commissionPercent = Number(settings.commissionPercent || 0);
  return {
    id: `lev-sale-sam-${unit}`,
    sourceId: event.eventId || "",
    unit,
    client: String(lead.name || "").trim(),
    contractValue,
    signedAt: filledSamValue(fields.signedAt, event.eventDatetime, lead.samLastEvent?.eventDatetime, new Date().toISOString()),
    status: "Assinado",
    table: "",
    realEstate: filledSamValue(fields.realEstate, fields.realtorCompany),
    eligible: false,
    confirmedAt: "",
    confirmedBy: "",
    provisionDate: "",
    provisionEmailSentAt: "",
    invoiceNumber: "",
    invoiceIssuedAt: "",
    paidAt: "",
    commissionPercent,
    commissionValue: contractValue * (commissionPercent / 100),
    leadId: lead.id,
    leadName: lead.name || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function upsertStructuredLevSaleFromSam(sql, lead, event, fields = {}, opportunity = null) {
  if (!isContractSignedPipelineStatus(opportunity?.status || lead.status)) return null;
  const settingsRows = await sql`SELECT payload FROM crm_settings WHERE key = 'levFinanceSettings' LIMIT 1`;
  const settings = normalizeLevFinanceSettingsPayload(settingsRows[0]?.payload || {});
  const opportunityFields = {
    ...fields,
    unit: filledSamValue(opportunity?.unitSamCode, opportunity?.unit, fields.unit, event.unit),
    desiredUnit: filledSamValue(opportunity?.unit, opportunity?.unitSamCode, fields.desiredUnit, event.unit),
    project: filledSamValue(opportunity?.project, fields.project, event.project),
    unitValue: filledSamValue(opportunity?.unitValue, fields.unitValue, event.rawContractValue, event.contractValue),
    contractValue: filledSamValue(opportunity?.unitValue, fields.contractValue, event.rawContractValue, event.contractValue),
    signedAt: filledSamValue(opportunity?.contractSignedAt, fields.signedAt, event.eventDatetime)
  };
  const sale = levSaleFromSamLead(lead, event, opportunityFields, settings);
  if (!sale) return null;
  const unit = normalizeLevUnit(sale.unit);
  const existingRows = await sql`SELECT * FROM crm_lev_sales WHERE upper(unit) = ${unit} ORDER BY signed_at DESC NULLS LAST LIMIT 1`;
  const existing = existingRows.length ? levFinancePayloadFromRow(existingRows[0]) : null;
  const savedSale = existing ? { ...existing } : sale;
  if (existing) {
    for (const [key, value] of Object.entries(sale)) {
      if (value !== "" && value !== 0 && value !== null && value !== undefined) savedSale[key] = value;
    }
    savedSale.updatedAt = new Date().toISOString();
  }
  await saveStructuredLevSale(sql, savedSale);
  const settlementRows = await sql`SELECT * FROM crm_lev_settlements WHERE upper(unit) = ${unit} ORDER BY signed_at DESC NULLS LAST LIMIT 1`;
  const settlementDb = { levFinance: { settlements: settlementRows.length ? [levFinancePayloadFromRow(settlementRows[0])] : [] } };
  upsertLevSettlement(settlementDb, savedSale, settlementDb.levFinance.settlements[0]?.status || "Assinado", "Contrato assinado via SAM");
  await saveStructuredLevSettlement(sql, settlementDb.levFinance.settlements[0]);
  return savedSale;
}

async function reconcileStructuredSignedOpportunitiesToLev(sql) {
  const rows = await sql`SELECT o.*, l.name AS lead_name, l.payload AS lead_payload
    FROM crm_opportunities o
    JOIN crm_leads l ON l.id = o.lead_id
    WHERE COALESCE(NULLIF(o.unit_sam_code, ''), NULLIF(o.unit, '')) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM crm_lev_sales s
        WHERE upper(s.unit) = upper(COALESCE(NULLIF(o.unit_sam_code, ''), o.unit))
      )`;
  let created = 0;
  for (const row of rows) {
    const opportunity = structuredOpportunityFromRow(row);
    if (!isContractSignedPipelineStatus(opportunity.status)) continue;
    const lead = { ...(row.lead_payload || {}), id: opportunity.leadId, name: row.lead_name || row.lead_payload?.name || "", status: opportunity.status };
    const event = {
      eventId: `reconcile-${opportunity.id}`,
      eventDatetime: opportunity.contractSignedAt || opportunity.updatedAt || new Date().toISOString(),
      unit: opportunity.unitSamCode || opportunity.unit,
      project: opportunity.project || "",
      rawContractValue: opportunity.unitValue || "",
      contractValue: parseMoney(opportunity.unitValue || "")
    };
    const sale = await upsertStructuredLevSaleFromSam(sql, lead, event, {}, opportunity);
    if (sale) created += 1;
  }
  return created;
}

async function mirrorLevSaleToStructuredLead(sql, sale) {
  const unit = normalizeLevUnit(sale?.unit || "");
  if (!unit) return;
  const rows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags
    FROM crm_leads l
    WHERE l.unit = ${unit} OR l.payload->>'desiredUnit' = ${unit} OR l.payload->>'unit' = ${unit}
    LIMIT 5`;
  const projects = await structuredProjectDefinitions(sql);
  const project = projectNameForUnit(unit, projects);
  for (const row of rows) {
    const lead = structuredLeadFromRow(row, false, []);
    lead.unit = unit;
    lead.desiredUnit = unit;
    if (project) {
      lead.project = project;
      lead.desiredProject = project;
    }
    if (Number(sale.contractValue || 0) > 0) lead.unitValue = String(sale.contractValue);
    lead.updatedAt = new Date().toISOString();
    await saveStructuredLead(sql, lead);
  }
}

function contractSignedStatusFromDefinitions(statusDefinitions = []) {
  return statusDefinitions.find((item) => isContractSignedPipelineStatus(item.status))?.status
    || statusDefinitions.find((item) => normalizeComparableText(item.status).includes("contrato") && normalizeComparableText(item.status).includes("assinado"))?.status
    || "Contrato Assinado";
}

function filledFinanceValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

async function upsertStructuredLeadFromLevSale(sql, user, sale) {
  const unit = normalizeLevUnit(sale?.unit || "");
  if (!unit) throw new Error("Unidade obrigatória");
  const [projects, statusDefinitions] = await Promise.all([
    structuredProjectDefinitions(sql),
    structuredStatusDefinitions(sql)
  ]);
  const project = projectNameForUnit(unit, projects);
  const contractSignedStatus = contractSignedStatusFromDefinitions(statusDefinitions);
  const rows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags
    FROM crm_leads l
    WHERE l.unit = ${unit} OR l.payload->>'desiredUnit' = ${unit} OR l.payload->>'unit' = ${unit}
    ORDER BY l.updated_at DESC NULLS LAST
    LIMIT 1`;
  const now = new Date().toISOString();
  const existing = rows[0] ? structuredLeadFromRow(rows[0], false, []) : null;
  const lead = existing || {
    id: `lev-${unit.toLowerCase()}-${crypto.randomUUID()}`,
    name: filledFinanceValue(sale.client, unit),
    email: "",
    phone: "",
    source: "FINANCEIRO LEV",
    sourceStatus: "",
    odysseiaStatus: "",
    assistant: "Financeiro Lev",
    externalId: filledFinanceValue(sale.sourceId, sale.id),
    status: contractSignedStatus,
    inPipeline: true,
    assignedTo: null,
    assignedName: "",
    createdAt: now,
    comments: [],
    tags: [],
    favoritesByUser: {}
  };
  const updates = {
    name: filledFinanceValue(sale.client, lead.name),
    externalId: filledFinanceValue(sale.sourceId, sale.id, lead.externalId),
    source: filledFinanceValue(lead.source, "FINANCEIRO LEV"),
    assistant: filledFinanceValue(lead.assistant, "Financeiro Lev"),
    status: contractSignedStatus,
    inPipeline: true,
    unit,
    desiredUnit: unit,
    project: project || lead.project || "",
    desiredProject: project || lead.desiredProject || "",
    unitValue: Number(sale.contractValue || 0) > 0 ? String(sale.contractValue) : lead.unitValue,
    levFinanceSaleId: sale.id || "",
    levFinanceStatus: sale.status || "",
    updatedAt: now
  };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== "" && value !== null && value !== undefined) lead[key] = value;
  }
  await saveStructuredLead(sql, lead);
  await structuredAudit(user, "CREATE_LEAD_FROM_LEV_FINANCE", { leadId: lead.id, unit });
  await structuredFup(user, lead, existing ? "UPDATE_LEAD_FROM_LEV_FINANCE" : "CREATE_LEAD_FROM_LEV_FINANCE", { unit, saleId: sale.id || "" });
  return lead;
}

async function upsertStructuredLevFinanceFromLead(sql, user, lead) {
  const unit = normalizeLevUnit(filledFinanceValue(lead.unit, lead.desiredUnit));
  if (!unit || !isLikelyLevUnit(unit)) throw new Error("Informe uma unidade válida no lead antes de enviar ao Financeiro Lev");
  const stateDb = await structuredLevFinanceDb(sql);
  const commissionPercent = Number(stateDb.levFinance.settings?.commissionPercent || 0);
  const contractValue = parseMoney(filledFinanceValue(lead.unitValue, lead.value));
  const existing = stateDb.levFinance.sales.find((item) => normalizeLevUnit(item.unit) === unit);
  const now = new Date().toISOString();
  const sale = existing || {
    id: `lev-sale-lead-${unit}`,
    sourceId: lead.id,
    unit,
    createdAt: now
  };
  const updates = {
    sourceId: filledFinanceValue(sale.sourceId, lead.id),
    unit,
    client: filledFinanceValue(lead.name, sale.client, unit),
    contractValue: contractValue || Number(sale.contractValue || 0),
    signedAt: filledFinanceValue(lead.samLastEvent?.eventDatetime, lead.contractSignedAt, lead.updatedAt, lead.createdAt, sale.signedAt, now),
    status: "Assinado",
    table: sale.table || "",
    realEstate: sale.realEstate || "",
    eligible: Boolean(sale.eligible),
    confirmedAt: sale.confirmedAt || "",
    confirmedBy: sale.confirmedBy || "",
    provisionDate: sale.provisionDate || "",
    provisionEmailSentAt: sale.provisionEmailSentAt || "",
    invoiceNumber: sale.invoiceNumber || "",
    invoiceIssuedAt: sale.invoiceIssuedAt || "",
    paidAt: sale.paidAt || "",
    commissionPercent,
    commissionValue: (contractValue || Number(sale.contractValue || 0)) * (commissionPercent / 100),
    leadId: lead.id,
    leadName: lead.name || "",
    updatedAt: now
  };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== "" && value !== null && value !== undefined) sale[key] = value;
  }
  if (!existing) stateDb.levFinance.sales.unshift(sale);
  upsertLevSettlement(stateDb, sale, "Extraída, aguardando confirmação", "Lead enviado para Financeiro Lev");
  lead.unit = unit;
  lead.desiredUnit = unit;
  if (contractValue) lead.unitValue = String(contractValue);
  lead.levFinanceSaleId = sale.id;
  lead.updatedAt = now;
  await saveStructuredLead(sql, lead);
  await persistStructuredLevFinance(sql, stateDb.levFinance);
  await structuredAudit(user, "SEND_LEAD_TO_LEV_FINANCE", { leadId: lead.id, unit, saleId: sale.id });
  await structuredFup(user, lead, "SEND_LEAD_TO_LEV_FINANCE", { unit, saleId: sale.id });
  return { stateDb, sale, lead };
}

async function saveStructuredSamEvent(sql, event) {
  if (!event?.id) return;
  if (event.eventId) {
    await sql`INSERT INTO crm_sam_events (id, event_id, event_type, event_datetime, email, phone, unit, next_status, status, lead_id, lead_name, created_at, resolved_at, resolved_by, payload)
      VALUES (${event.id}, ${event.eventId || ""}, ${event.eventType || ""}, ${event.eventDatetime || ""}, ${event.email || ""}, ${event.phone || ""}, ${event.unit || ""}, ${event.nextStatus || ""}, ${event.status || ""}, ${event.leadId || ""}, ${event.leadName || ""}, ${dbDate(event.createdAt)}, ${dbDate(event.resolvedAt)}, ${event.resolvedBy || ""}, ${JSON.stringify(event)}::jsonb)
      ON CONFLICT (event_id) WHERE event_id IS NOT NULL AND event_id <> '' DO UPDATE SET event_type = EXCLUDED.event_type, event_datetime = EXCLUDED.event_datetime, email = EXCLUDED.email, phone = EXCLUDED.phone, unit = EXCLUDED.unit, next_status = EXCLUDED.next_status, status = EXCLUDED.status, lead_id = EXCLUDED.lead_id, lead_name = EXCLUDED.lead_name, created_at = EXCLUDED.created_at, resolved_at = EXCLUDED.resolved_at, resolved_by = EXCLUDED.resolved_by, payload = EXCLUDED.payload`;
    return;
  }
  await sql`INSERT INTO crm_sam_events (id, event_id, event_type, event_datetime, email, phone, unit, next_status, status, lead_id, lead_name, created_at, resolved_at, resolved_by, payload)
    VALUES (${event.id}, ${event.eventId || ""}, ${event.eventType || ""}, ${event.eventDatetime || ""}, ${event.email || ""}, ${event.phone || ""}, ${event.unit || ""}, ${event.nextStatus || ""}, ${event.status || ""}, ${event.leadId || ""}, ${event.leadName || ""}, ${dbDate(event.createdAt)}, ${dbDate(event.resolvedAt)}, ${event.resolvedBy || ""}, ${JSON.stringify(event)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, event_type = EXCLUDED.event_type, event_datetime = EXCLUDED.event_datetime, email = EXCLUDED.email, phone = EXCLUDED.phone, unit = EXCLUDED.unit, next_status = EXCLUDED.next_status, status = EXCLUDED.status, lead_id = EXCLUDED.lead_id, lead_name = EXCLUDED.lead_name, created_at = EXCLUDED.created_at, resolved_at = EXCLUDED.resolved_at, resolved_by = EXCLUDED.resolved_by, payload = EXCLUDED.payload`;
}

async function structuredSamEventsForState(db) {
  const fallback = (db.samEvents || []).slice(0, 500);
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return fallback;
    const rows = await sql`SELECT * FROM crm_sam_events ORDER BY created_at DESC NULLS LAST LIMIT 500`;
    return rows.map(samEventFromRow).filter((event) => event.id);
  } catch (error) {
    mirrorStructuredError("sam-events-state", error);
    return fallback;
  }
}

async function structuredSamEventById(sql, id) {
  const rows = await sql`SELECT * FROM crm_sam_events WHERE id = ${id} LIMIT 1`;
  return rows.length ? samEventFromRow(rows[0]) : null;
}

async function isDuplicateStructuredSamEvent(sql, eventId) {
  if (!eventId) return false;
  const rows = await sql`SELECT id FROM crm_sam_events WHERE event_id = ${eventId} LIMIT 1`;
  if (rows.length) return true;
  const logRows = await sql`SELECT id FROM crm_integration_logs
    WHERE provider = 'SAM'
      AND action IN ('STATUS_UPDATED', 'LEAD_NOT_FOUND', 'UNIT_MISMATCH', 'RECEIVED_MATCHED', 'RECEIVED_UNIT_MISMATCH', 'RECEIVED_NOT_FOUND')
      AND details->>'eventId' = ${eventId}
    LIMIT 1`;
  return Boolean(logRows.length);
}

async function findStructuredSamLeadCandidates(sql, { email, phone, name }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhoneDigits(phone);
  const normalizedName = String(name || "").trim().toLowerCase();
  if (!normalizedEmail && normalizedPhone.length < 8 && !normalizedName) return [];
  const phoneSuffix = normalizedPhone.length >= 8 ? normalizedPhone.slice(-8) : "";
  const rows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags
    FROM crm_leads l
    WHERE (${Boolean(normalizedEmail)} AND (lower(l.email) = ${normalizedEmail} OR lower(COALESCE(l.payload->>'assistant', '')) = ${normalizedEmail}))
      OR (${Boolean(phoneSuffix)} AND (
        regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') = ${normalizedPhone}
        OR regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') LIKE ${`%${phoneSuffix}`}
      ))
      OR (${Boolean(normalizedName)} AND lower(COALESCE(l.name, '')) = ${normalizedName})
    ORDER BY l.in_pipeline DESC, l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST
    LIMIT 20`;
  return rows.map((row) => structuredLeadFromRow(row, false, [])).filter((lead) => lead.id);
}

async function findStructuredLeadForSamManualLink(sql, search) {
  const query = String(search || "").trim();
  if (!query) return null;
  const normalizedQuery = normalizeComparableText(query);
  const email = normalizeEmail(query);
  const phone = normalizePhoneDigits(query);
  const phoneSuffix = phone.length >= 8 ? phone.slice(-8) : "";
  const rows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags
    FROM crm_leads l
    WHERE l.id = ${query}
      OR (${Boolean(email)} AND (lower(l.email) = ${email} OR lower(COALESCE(l.payload->>'assistant', '')) = ${email}))
      OR (${Boolean(phoneSuffix)} AND (
        regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') = ${phone}
        OR regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') LIKE ${`%${phoneSuffix}`}
      ))
      OR (${Boolean(normalizedQuery)} AND lower(COALESCE(l.name, '')) LIKE ${`%${String(query).toLowerCase()}%`})
    ORDER BY l.in_pipeline DESC, l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST
    LIMIT 1`;
  return rows.length ? structuredLeadFromRow(rows[0], false, []) : null;
}

async function findStructuredSamOpportunitiesByUnit(sql, unitInput) {
  const unit = normalizeUnitForMatch(unitInput);
  const compactUnit = unit.replace(/[^A-Z0-9]/g, "");
  if (!compactUnit) return [];
  const opportunityRows = await sql`SELECT * FROM crm_opportunities
    WHERE regexp_replace(upper(COALESCE(NULLIF(unit_sam_code, ''), unit, '')), '[^A-Z0-9]', '', 'g') = ${compactUnit}
    ORDER BY created_at ASC NULLS LAST, id ASC`;
  return opportunityRows.map(structuredOpportunityFromRow).filter((opportunity) => opportunity.id && opportunity.leadId);
}

function closestPreviousSamOpportunity(opportunities, nextStatus, definitions = []) {
  const positions = new Map(definitions.map((item, index) => [normalizeComparableText(item.status || item.name), Number(item.position ?? index)]));
  const target = positions.get(normalizeComparableText(nextStatus));
  if (!Number.isFinite(target)) return opportunities[0] || null;
  return [...opportunities].sort((a, b) => {
    const positionA = positions.get(normalizeComparableText(a.status));
    const positionB = positions.get(normalizeComparableText(b.status));
    const rank = (position) => {
      if (!Number.isFinite(position)) return 10000;
      if (position < target) return target - position;
      if (position === target) return 1000;
      return 2000 + position - target;
    };
    return rank(positionA) - rank(positionB) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  })[0] || null;
}

async function structuredIntegration(provider, action, details = {}) {
  const entry = { at: new Date().toISOString(), provider, action, details };
  await mirrorStructuredIntegrationLog(entry);
  return entry;
}

async function processSamWebhookStructured(payload) {
  const sql = await getSql();
  if (!sql) throw new Error("Postgres não está configurado neste ambiente.");
  await ensureStructuredSchemaOnce(sql);
  const eventId = String(payload.event_id || payload.eventId || payload.id || "").trim();
  const eventType = String(payload.event_type || payload.eventType || payload.status || payload.event || payload.movimento || "").trim();
  const eventDatetime = String(payload.event_datetime || payload.eventDatetime || "").trim();
  const email = String(payload.email || "").trim();
  const phone = String(payload.phone || payload.telefone || "").trim();
  const unit = normalizeUnitForMatch(payload.unit_code || payload.unitCode || payload.unit || payload.unidade);
  const contractValue = parseMoney(payload.contract_value || payload.contractValue || payload.valor_contrato || payload.valorContrato || payload.value || payload.valor);
  const rawContractValue = filledSamValue(payload.contract_value, payload.contractValue, payload.valor_contrato, payload.valorContrato, payload.value, payload.valor);
  if (!eventId) return { ok: false, httpStatus: 400, error: "event_id obrigatório" };
  if (await isDuplicateStructuredSamEvent(sql, eventId)) return { ok: true, status: "duplicate" };
  if (!eventType) return { ok: false, httpStatus: 400, error: "event_type obrigatório" };
  if (!email && !phone && !name) return { ok: false, httpStatus: 400, error: "Nome, e-mail ou telefone obrigatório" };
  const [unitOpportunities, contactLeads, statuses, projectDefinitions] = await Promise.all([
    findStructuredSamOpportunitiesByUnit(sql, unit),
    findStructuredSamLeadCandidates(sql, { email, phone, name }),
    structuredStatusDefinitions(sql),
    structuredProjectDefinitions(sql)
  ]);
  const nextStatus = samStatusToPipelineStatusFromList(statuses, eventType);
  const contactOpportunitiesByLead = await structuredOpportunitiesForLeadIds(sql, contactLeads.map((item) => item.id));
  const contactOpportunities = contactLeads.flatMap((item) => contactOpportunitiesByLead.get(item.id) || []);
  const matchingOpportunity = closestPreviousSamOpportunity(unitOpportunities.length ? unitOpportunities : contactOpportunities, nextStatus, statuses);
  let lead = matchingOpportunity ? contactLeads.find((item) => item.id === matchingOpportunity.leadId) : contactLeads[0] || null;
  if (!lead && matchingOpportunity) {
    const leadRows = await sql`SELECT * FROM crm_leads WHERE id = ${matchingOpportunity.leadId} LIMIT 1`;
    lead = leadRows.length ? structuredLeadFromRow(leadRows[0], false, []) : null;
  }
  const project = projectNameForUnit(unit, projectDefinitions);
  const opportunityRows = lead ? await structuredOpportunitiesForLeadIds(sql, [lead.id]) : new Map();
  const opportunities = lead ? (opportunityRows.get(lead.id) || []) : [];
  const opportunityOptions = opportunities.map(samOpportunityOption).filter((item) => item.id);
  const selectedOpportunity = matchingOpportunity?.leadId === lead?.id
    ? opportunities.find((opportunity) => opportunity.id === matchingOpportunity.id) || matchingOpportunity
    : null;
  const leadUnits = lead
    ? opportunities.length
      ? opportunities.flatMap(opportunityUnitsForMatch)
      : leadUnitsForMatch(lead)
    : [];
  const unitMatches = Boolean(lead && (selectedOpportunity || (!opportunities.length && (!unit || leadUnits.includes(unit)))));
  const event = {
    id: `sam-${crypto.randomUUID()}`,
    eventId,
    eventType,
    eventDatetime,
    email,
    phone,
    unit,
    project,
    contractValue,
    rawContractValue,
    nextStatus,
    status: unitMatches ? "matched" : lead ? "unit_mismatch" : "not_found",
    leadId: lead?.id || "",
    leadName: lead?.name || "",
    leadUnits,
    opportunityId: selectedOpportunity?.id || "",
    opportunityOptions,
    createdAt: new Date().toISOString(),
    resolvedAt: "",
    resolvedBy: "",
    resolution: ""
  };
  await saveStructuredSamEvent(sql, event);
  await structuredIntegration("SAM", unitMatches ? "RECEIVED_MATCHED" : lead ? "RECEIVED_UNIT_MISMATCH" : "RECEIVED_NOT_FOUND", {
    eventId,
    eventType,
    eventDatetime,
    leadId: event.leadId,
    unit,
    project,
    contractValue,
    nextStatus
  });
  await notifyStructuredSamMovement(sql, event).catch((error) => structuredIntegration("SAM", "WHATSAPP_ERROR", {
    eventId,
    samEventId: event.id,
    error: error.message || String(error)
  }));
  return {
    ok: true,
    status: "pending_review",
    reason: unitMatches ? "Lead encontrado. Aguardando confirmação no Pipeline." : lead ? "Lead encontrado, mas unidade divergente." : "Lead não encontrado no Pipeline.",
    sam_event_id: event.id,
    lead_id: event.leadId || undefined
  };
}

async function applyStructuredSamEventToLead(sql, user, event, lead, fields = {}) {
  const previousStatus = lead.status || "";
  const statuses = await structuredStatusDefinitions(sql);
  const projectDefinitions = await structuredProjectDefinitions(sql);
  const nextStatus = event.nextStatus || samStatusToPipelineStatusFromList(statuses, event.eventType);
  if (!nextStatus) {
    throw new Error("Código SAM sem status de pipeline vinculado.");
  }
  const existingOpportunities = await materializeLegacyOpportunityIfNeeded(sql, lead);
  const eventUnit = normalizeUnitForMatch(fields.unit || event.unit || "");
  const requestedOpportunityId = String(fields.opportunityId || "").trim();
  const shouldCreateOpportunity = Boolean(fields.createOpportunity);
  const shouldLinkLeadDirect = Boolean(fields.linkLeadDirect);
  const eventHadOpportunityOptions = Array.isArray(event.opportunityOptions) && event.opportunityOptions.length > 0;
  let opportunity = requestedOpportunityId
    ? existingOpportunities.find((item) => item.id === requestedOpportunityId)
    : existingOpportunities.find((item) => eventUnit && opportunityUnitsForMatch(item).includes(eventUnit));
  if (requestedOpportunityId && !opportunity) {
    throw new Error("Oportunidade selecionada não encontrada para este lead.");
  }
  if (!opportunity && shouldLinkLeadDirect && !eventHadOpportunityOptions) {
    opportunity = existingOpportunities[0] || leadOpportunitySnapshot(lead, {
      source: "SAM",
      status: nextStatus,
      project: fields.project || event.project || projectNameForUnit(eventUnit, projectDefinitions),
      unit: fields.unit || eventUnit,
      unitSamCode: eventUnit,
      unitValue: fields.unitValue || event.rawContractValue || event.contractValue || "",
      inPipeline: true,
      legacyMaterialized: true
    });
    if (!existingOpportunities.some((item) => item.id === opportunity.id)) existingOpportunities.push(opportunity);
  }
  const previousOpportunityStatus = opportunity?.status || previousStatus;
  if (!opportunity && !shouldCreateOpportunity) {
    event.status = "unit_mismatch";
    event.leadId = lead.id;
    event.leadName = lead.name || "";
    event.leadUnits = existingOpportunities.length
      ? existingOpportunities.flatMap(opportunityUnitsForMatch)
      : leadUnitsForMatch(lead);
    event.opportunityOptions = existingOpportunities.map(samOpportunityOption).filter((item) => item.id);
    event.resolution = "needs_opportunity_selection";
    await saveStructuredSamEvent(sql, event);
    throw new Error("Unidade não vinculada a nenhuma oportunidade. Gere uma nova oportunidade ou selecione uma oportunidade existente em Logs > SAM.");
  }
  if (!opportunity) {
    opportunity = leadOpportunitySnapshot(lead, {
      source: "SAM",
      status: nextStatus,
      project: fields.project || event.project || projectNameForUnit(eventUnit, projectDefinitions),
      unit: fields.unit || eventUnit,
      unitSamCode: eventUnit,
      unitValue: fields.unitValue || event.rawContractValue || event.contractValue || "",
      inPipeline: true
    });
    existingOpportunities.push(opportunity);
  } else {
    opportunity.status = nextStatus;
    if (fields.project || event.project) opportunity.project = fields.project || event.project;
    if (fields.unit || eventUnit) {
      opportunity.unit = fields.unit || opportunity.unit || eventUnit;
      opportunity.unitSamCode = eventUnit || opportunity.unitSamCode || normalizeUnitForMatch(opportunity.unit);
    }
    if (fields.unitValue || event.rawContractValue || event.contractValue) opportunity.unitValue = fields.unitValue || event.rawContractValue || String(event.contractValue || "");
    opportunity.updatedAt = new Date().toISOString();
  }
  if (isContractSignedPipelineStatus(nextStatus)) {
    opportunity.contractSignedAt = filledSamValue(event.eventDatetime, opportunity.contractSignedAt, new Date().toISOString());
  }
  lead.status = nextStatus;
  lead.inPipeline = true;
  const shouldApplySamOpportunityFieldsToLead = shouldLinkLeadDirect || (!requestedOpportunityId && !shouldCreateOpportunity);
  const appliedFields = applySamDataToLead(lead, event, fields, projectDefinitions, {
    preserveOpportunityFields: !shouldApplySamOpportunityFieldsToLead
  });
  lead.samLastEvent = {
    eventId: event.eventId,
    eventType: event.eventType,
    eventDatetime: event.eventDatetime,
    unit: event.unit,
    appliedAt: new Date().toISOString()
  };
  lead.updatedAt = lead.samLastEvent.appliedAt;
  event.status = "linked";
  event.leadId = lead.id;
  event.leadName = lead.name || "";
  event.opportunityId = opportunity.id;
  event.opportunityOptions = existingOpportunities.map((item) => item.id === opportunity.id ? opportunity : item).map(samOpportunityOption).filter((item) => item.id);
  event.resolution = "linked";
  event.resolvedAt = lead.updatedAt;
  event.resolvedBy = user.username;
  await saveStructuredOpportunity(sql, opportunity);
  lead.opportunities = existingOpportunities.map((item) => item.id === opportunity.id ? opportunity : item);
  await saveStructuredLead(sql, lead);
  await upsertStructuredUnitFromLeadSam(sql, lead, event, projectDefinitions);
  const levSale = await upsertStructuredLevSaleFromSam(sql, lead, event, fields, opportunity);
  await saveStructuredSamEvent(sql, event);
  await recordStructuredLeadStatusMovement(sql, {
    actor: user,
    lead,
    fromStatus: previousStatus,
    toStatus: lead.status,
    movementType: "sam",
    source: "sam",
    screen: "sam_review",
    statusAt: event.eventDatetime || lead.updatedAt,
    samEventId: event.id,
    details: { eventId: event.eventId, appliedFields, levSaleId: levSale?.id || "", opportunityId: opportunity.id, opportunityFromStatus: previousOpportunityStatus }
  });
  await enqueueStructuredMetaConversionForStatus(sql, user, lead, previousStatus, lead.status, {
    source: "sam",
    screen: "sam_review",
    statusAt: event.eventDatetime || lead.updatedAt,
    samEventId: event.id
  });
  await structuredIntegration("SAM", "LINKED_TO_LEAD", { eventId: event.eventId, samEventId: event.id, leadId: lead.id, opportunityId: opportunity.id, unit: opportunity.unitSamCode || opportunity.unit, from: previousOpportunityStatus, to: opportunity.status, levSaleId: levSale?.id || "" });
  await structuredFup(user, lead, "SAM_STATUS_LINKED", { eventId: event.eventId, opportunityId: opportunity.id, unit: opportunity.unitSamCode || opportunity.unit, from: previousOpportunityStatus, to: opportunity.status, appliedFields, levSaleId: levSale?.id || "" });
  return { previousStatus, nextStatus: lead.status, appliedFields, levSale };
}

function reopenSamEventForReview(event) {
  const previousTreatment = {
    status: event.status || "",
    resolution: event.resolution || "",
    resolvedAt: event.resolvedAt || "",
    resolvedBy: event.resolvedBy || "",
    opportunityId: event.opportunityId || ""
  };
  const unit = normalizeUnitForMatch(event.unit || "");
  const opportunities = Array.isArray(event.opportunityOptions) ? event.opportunityOptions : [];
  const hasMatchingOpportunity = opportunities.some((opportunity) => opportunityUnitsForMatch(opportunity).includes(unit));
  event.status = event.leadId
    ? hasMatchingOpportunity || (!opportunities.length && (event.leadUnits || []).map(normalizeUnitForMatch).includes(unit))
      ? "matched"
      : "unit_mismatch"
    : "not_found";
  event.resolution = "reopened";
  event.resolvedAt = "";
  event.resolvedBy = "";
  event.reopenedAt = new Date().toISOString();
  event.reopenedHistory = [
    ...(Array.isArray(event.reopenedHistory) ? event.reopenedHistory : []),
    previousTreatment
  ].slice(-10);
  return event;
}

async function structuredLogsForState(db) {
  const fallback = {
    integrationLog: db.integrationLog.slice(0, 50),
    auditLog: db.auditLog.slice(0, 25),
    fupLeadLog: (db.fupLeadLog || []).slice(0, 250),
    source: "legacy"
  };
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return fallback;
    const [integrationRows, auditRows, fupRows] = await Promise.all([
      sql`SELECT payload FROM crm_integration_logs ORDER BY at DESC NULLS LAST LIMIT 50`,
      sql`SELECT payload FROM crm_audit_logs ORDER BY at DESC NULLS LAST LIMIT 25`,
      sql`SELECT payload FROM crm_fup_lead_logs ORDER BY at DESC NULLS LAST LIMIT 250`
    ]);
    return {
      integrationLog: integrationRows.map((row) => row.payload || {}).filter((item) => item.at),
      auditLog: auditRows.map((row) => row.payload || {}).filter((item) => item.at),
      fupLeadLog: fupRows.map((row) => row.payload || {}).filter((item) => item.at),
      source: "structured"
    };
  } catch (error) {
    mirrorStructuredError("logs-state", error);
    return fallback;
  }
}

async function structuredConfigForState(db) {
  const fallback = {
    users: db.users.map(publicUser),
    projects: db.projects || DEFAULT_PROJECTS,
    pipelineStatuses: db.pipelineStatuses,
    source: "legacy"
  };
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return fallback;
    const [userRows, projectRows, statusRows] = await Promise.all([
      sql`SELECT payload FROM crm_users ORDER BY name ASC, username ASC`,
      sql`SELECT name FROM crm_projects ORDER BY position ASC, name ASC`,
      sql`SELECT status FROM crm_pipeline_statuses ORDER BY position ASC, status ASC`
    ]);
    const users = userRows.map((row) => row.payload || {}).filter((item) => item.id);
    const projects = projectRows.map((row) => row.name).filter(Boolean);
    const pipelineStatuses = statusRows.map((row) => row.status).filter(Boolean);
    if (!users.length || !projects.length || !pipelineStatuses.length) return fallback;
    return {
      users,
      projects,
      pipelineStatuses,
      source: "structured"
    };
  } catch (error) {
    mirrorStructuredError("config-state", error);
    return fallback;
  }
}

function structuredPermissionsFromRows(rows = []) {
  const permissions = { roles: {}, users: {} };
  for (const row of rows) {
    const bucket = row.owner_type === "role" ? permissions.roles : row.owner_type === "user" ? permissions.users : null;
    if (!bucket) continue;
    if (!bucket[row.owner_id]) bucket[row.owner_id] = {};
    bucket[row.owner_id][row.resource_id] = permissionCell(row.can_access, row.can_act);
  }
  return permissions;
}

function structuredBaseAccessFromPermissions(permissions = {}, sources = []) {
  const baseAccess = { roles: {}, users: {} };
  for (const role of ROLES) {
    const allowed = sources.filter((source) => normalizePermissionCell(permissions.roles?.[role]?.[basePermissionId(source)]).access);
    baseAccess.roles[role] = { enabled: allowed.length > 0, sources: allowed };
  }
  for (const [userId, rules] of Object.entries(permissions.users || {})) {
    const allowed = sources.filter((source) => normalizePermissionCell(rules?.[basePermissionId(source)]).access);
    if (allowed.length) baseAccess.users[userId] = { override: true, enabled: true, sources: allowed };
  }
  return baseAccess;
}

async function structuredUsers(sql, publicOnly = false) {
  const rows = await sql`SELECT * FROM crm_users ORDER BY name ASC, username ASC`;
  const users = rows.map((row) => structuredUserFromAuthRow(row)).filter((item) => item?.id);
  return publicOnly ? users.map((item) => publicUser(item)) : users;
}

async function structuredBaseSources(sql) {
  const rows = await sql`SELECT name FROM crm_base_sources ORDER BY name ASC`;
  const sources = rows.map((row) => row.name).filter(Boolean);
  return sources.length ? sources : allBaseSources({ leads: [] });
}

async function structuredStateForPermissions(sql, users = null) {
  const [sourceRows, permissionRows] = await Promise.all([
    structuredBaseSources(sql),
    sql`SELECT owner_type, owner_id, resource_id, can_access, can_act FROM crm_permissions`
  ]);
  const stateDb = {
    users: users || await structuredUsers(sql),
    leads: [],
    permissions: structuredPermissionsFromRows(permissionRows),
    baseAccess: {},
    baseAccessSources: sourceRows,
    pipelineStatuses: [],
    projects: []
  };
  stateDb.baseAccess = structuredBaseAccessFromPermissions(stateDb.permissions, sourceRows);
  ensurePermissions(stateDb);
  return stateDb;
}

async function saveStructuredPermissions(sql, permissions) {
  await sql`DELETE FROM crm_permissions`;
  const rows = [];
  for (const [scope, owners] of Object.entries(permissions || {})) {
    const ownerType = scope === "roles" ? "role" : scope === "users" ? "user" : "";
    if (!ownerType || !owners || typeof owners !== "object" || Array.isArray(owners)) continue;
    for (const [ownerId, rules] of Object.entries(owners)) {
      if (!rules || typeof rules !== "object" || Array.isArray(rules)) continue;
      for (const [resourceId, rawCell] of Object.entries(rules)) {
        const cell = normalizePermissionCell(rawCell);
        rows.push({
          owner_type: ownerType,
          owner_id: String(ownerId),
          resource_id: String(resourceId),
          can_access: Boolean(cell.access || cell.action),
          can_act: Boolean(cell.action)
        });
      }
    }
  }
  if (rows.length) {
    await sql`INSERT INTO crm_permissions (owner_type, owner_id, resource_id, can_access, can_act)
      SELECT owner_type, owner_id, resource_id, can_access, can_act
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
        AS item(owner_type text, owner_id text, resource_id text, can_access boolean, can_act boolean)
      ON CONFLICT (owner_type, owner_id, resource_id) DO UPDATE SET can_access = EXCLUDED.can_access, can_act = EXCLUDED.can_act`;
  }
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
}

async function structuredNotificationDb(sql) {
  const [users, statuses, formRows] = await Promise.all([
    structuredUsers(sql),
    structuredPipelineStatuses(sql),
    sql`SELECT payload FROM crm_meta_forms ORDER BY name ASC`
  ]);
  return {
    users,
    pipelineStatuses: statuses,
    integrations: {
      metaForms: {
        forms: formRows.map((row) => row.payload || {}).filter((item) => item.id)
      }
    },
    auditLog: [],
    integrationLog: [],
    fupLeadLog: []
  };
}

function samMovementNotificationText(event) {
  return [
    "Movimento recebido do SAM",
    "",
    `Empreendimento: ${event.project || "Não identificado"}`,
    `Unidade: ${event.unit || "-"}`,
    `Evento: ${event.eventType || "-"}`,
    `E-mail: ${event.email || "-"}`,
    `Status sugerido: ${event.nextStatus || "Não vinculado"}`,
    `Situação: ${event.status === "matched" ? "Lead encontrado" : event.status === "unit_mismatch" ? "Unidade divergente" : "Lead não encontrado"}`,
    event.leadName ? `Lead: ${event.leadName}` : ""
  ].filter(Boolean).join("\n");
}

async function notifyStructuredSamMovement(sql, event) {
  const db = await structuredNotificationDb(sql);
  const recipients = (db.users || []).filter((user) => {
    if (!user.active) return false;
    if (!["Admin TI", "Head Comercial", "Supervisor Comercial"].includes(user.role)) return false;
    return Boolean(user.notifications?.whatsapp);
  });
  if (!recipients.length) {
    await structuredIntegration("SAM", "WHATSAPP_NO_RECIPIENTS", { eventId: event.eventId, samEventId: event.id });
    return;
  }
  const text = samMovementNotificationText(event);
  for (const recipient of recipients) {
    const result = await sendUserWhatsappText(recipient, text);
    await structuredIntegration("SAM", result.sent ? "WHATSAPP_SENT" : "WHATSAPP_FAILED", {
      eventId: event.eventId,
      samEventId: event.id,
      userId: recipient.id,
      userName: recipient.name || recipient.username || "",
      reason: result.reason || "",
      providerId: result.id || ""
    });
  }
}

async function structuredSettingsMap(sql) {
  const rows = await sql`SELECT key, payload FROM crm_settings`;
  return Object.fromEntries(rows.map((row) => [row.key, row.payload || {}]));
}

async function structuredConfigStateBundle(sql) {
  const [userRows, projectRows, statusRows, tagRows, sourceRows, formRows, permissionRows, articleRows, settingsRows, unitRows] = await Promise.all([
    sql`SELECT * FROM crm_users ORDER BY name ASC, username ASC`,
    sql`SELECT name, position, payload FROM crm_projects ORDER BY position ASC, name ASC`,
    sql`SELECT status, position, payload FROM crm_pipeline_statuses ORDER BY position ASC, status ASC`,
    sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`,
    sql`SELECT name FROM crm_base_sources ORDER BY name ASC`,
    sql`SELECT payload FROM crm_meta_forms ORDER BY archived ASC, name ASC`,
    sql`SELECT owner_type, owner_id, resource_id, can_access, can_act FROM crm_permissions`,
    sql`SELECT payload FROM crm_knowledge_articles ORDER BY updated_at DESC NULLS LAST, title ASC`,
    sql`SELECT key, payload FROM crm_settings`,
    sql`SELECT * FROM crm_units ORDER BY project ASC, block ASC NULLS LAST, floor ASC NULLS LAST, stack ASC NULLS LAST, unit ASC`
  ]);
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.payload || {}]));
  const users = userRows.map((row) => publicUser(structuredUserFromAuthRow(row))).filter((item) => item.id);
  const projectDefinitions = projectRows.map((row, index) => normalizeProjectDefinition({ ...(row.payload || {}), name: row.name }, Number(row.position ?? index))).filter((item) => item.name);
  const statusDefinitions = statusRows.map((row, index) => normalizeStatusDefinition({ ...(row.payload || {}), status: row.status }, Number(row.position ?? index))).filter((item) => item.status);
  const projects = projectDefinitions.map((item) => item.name);
  const pipelineStatuses = statusDefinitions.map((item) => item.status);
  const tagDefinitions = tagRows.map((row) => row.payload || {}).filter((item) => item.id);
  const baseSources = sourceRows.map((row) => row.name).filter(Boolean);
  const forms = formRows.map((row) => row.payload || {}).filter((item) => item.id);
  const permissions = structuredPermissionsFromRows(permissionRows);
  const commercialSettings = normalizeCommercialSettingsPayload(settings.commercialSettings || {});
  const eventCaptureSettings = normalizeEventCaptureSettings(settings.eventCaptureSettings || {});
  const pipelineFrontSettings = normalizePipelineFrontSettings(settings.pipelineFrontSettings || {});
  const availabilitySettings = normalizeAvailabilitySettings(settings.availabilitySettings || {});
  const unitDefinitions = unitRows.map((row) => normalizeUnitDefinition({
    ...(row.payload || {}),
    id: row.id,
    project: row.project,
    unit: row.unit,
    block: row.block,
    floor: row.floor,
    column: row.stack,
    samCode: row.sam_code,
    status: row.status,
    leadId: row.lead_id,
    buyerName: row.buyer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })).filter((item) => item.id && item.project && item.unit);
  const integrations = {
    ...(settings.integrations || {}),
    metaForms: {
      ...(settings.integrations?.metaForms || {}),
      enabled: forms.length > 0,
      forms
    }
  };
  return {
    source: "structured",
    settings,
    users,
    projectDefinitions,
    statusDefinitions,
    projects: projects.length ? projects : DEFAULT_PROJECTS,
    pipelineStatuses,
    tagDefinitions: tagDefinitions.length ? tagDefinitions : DEFAULT_TAG_DEFINITIONS,
    baseSources,
    forms,
    unitDefinitions,
    availabilitySettings,
    permissions,
    integrations,
    knowledgeArticles: articleRows.map((row) => row.payload || {}).filter((item) => item.id),
    knowledgeChatSessions: Array.isArray(settings.knowledgeChatSessions) ? settings.knowledgeChatSessions : [],
    commercialSettings,
    eventCaptureSettings,
    pipelineFrontSettings
  };
}

async function cachedStructuredConfigState(sql) {
  const key = redisKey("config", "state");
  const cached = await redisGetJson(key);
  if (cached?.users && cached?.settings) return { ...cached, source: "redis" };
  const bundle = await structuredConfigStateBundle(sql);
  void redisSetJson(key, bundle, REDIS_CONFIG_TTL_SECONDS).catch((error) => mirrorStructuredError("redis-config-cache", error));
  return bundle;
}

async function saveStructuredSetting(sql, key, payload) {
  await sql`INSERT INTO crm_settings (key, payload, updated_at)
    VALUES (${key}, ${JSON.stringify(payload || {})}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
}

async function updateStructuredMetaConversionMapping(sql, type, key, mapping = {}, previousKey = "") {
  const normalizedType = type === "tag" ? "tagMappings" : "statusMappings";
  const currentRows = await sql`SELECT payload FROM crm_settings WHERE key = 'integrations' LIMIT 1`;
  const integrations = currentRows[0]?.payload || {};
  const metaConversions = normalizeMetaConversionsServer(integrations);
  const nextMappings = { ...(metaConversions[normalizedType] || {}) };
  if (previousKey && previousKey !== key) delete nextMappings[previousKey];
  const eventId = String(mapping.eventId || "").trim();
  const enabled = mapping.enabled === true && Boolean(eventId);
  if (eventId) {
    nextMappings[key] = { enabled, eventId };
  } else {
    delete nextMappings[key];
  }
  const nextIntegrations = {
    ...integrations,
    metaConversions: {
      ...metaConversions,
      [normalizedType]: nextMappings
    }
  };
  await saveStructuredSetting(sql, "integrations", nextIntegrations);
  return nextIntegrations.metaConversions;
}

async function removeStructuredMetaConversionMapping(sql, type, key) {
  return updateStructuredMetaConversionMapping(sql, type, key, {}, key);
}

function normalizeLevFinanceSettingsPayload(settings = {}) {
  return {
    commissionPercent: Math.max(0, Number(settings.commissionPercent || 0)),
    provisionTo: String(settings.provisionTo || "").trim(),
    provisionCc: String(settings.provisionCc || "").trim(),
    emailTemplate: normalizeLevFinanceEmailTemplate(settings.emailTemplate),
    paymentSchedule: (Array.isArray(settings.paymentSchedule) ? settings.paymentSchedule : DEFAULT_LEV_PAYMENT_SCHEDULE)
      .map((item) => ({
        start: String(item.start || "").trim(),
        end: String(item.end || "").trim(),
        paymentDate: String(item.paymentDate || "").trim()
      }))
      .filter((item) => item.start && item.end && item.paymentDate)
      .sort((a, b) => new Date(`${a.start}T00:00:00`).getTime() - new Date(`${b.start}T00:00:00`).getTime())
  };
}

function normalizeCommercialSettingsPayload(settings = {}) {
  const sessionTimeoutMinutes = Number(settings.sessionTimeoutMinutes || 15);
  return {
    monthlySalesGoal: Math.max(0, Number(settings.monthlySalesGoal || 0)),
    sessionTimeoutMinutes: Number.isFinite(sessionTimeoutMinutes)
      ? Math.min(240, Math.max(1, sessionTimeoutMinutes))
      : 15
  };
}

function normalizeEventCaptureSettings(settings = {}) {
  const template = settings.emailTemplate || {};
  const imageDataUrl = String(template.imageDataUrl || "");
  return {
    senderName: String(settings.senderName || "Comercial Mauad").trim() || "Comercial Mauad",
    subject: String(settings.subject || "Obrigado por nos visitar no 64º Aberto de Golfe").trim() || "Obrigado por nos visitar no 64º Aberto de Golfe",
    emailTemplate: {
      html: sanitizeRichHtml(template.html || DEFAULT_EVENT_CAPTURE_EMAIL_HTML),
      fontFamily: String(template.fontFamily || "Arial").trim() || "Arial",
      fontSize: String(template.fontSize || "14px").trim() || "14px",
      color: String(template.color || "#17202a").trim() || "#17202a",
      lineHeight: String(template.lineHeight || "1.6").trim() || "1.6",
      imageDataUrl: /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(imageDataUrl) && imageDataUrl.length <= 2000000 ? imageDataUrl : "",
      imagePosition: template.imagePosition === "bottom" ? "bottom" : "top"
    }
  };
}

function renderEventCaptureEmail(settings = {}, variables = {}) {
  return prepareEventCaptureEmail(settings, variables).html;
}

function prepareEventCaptureEmail(settings = {}, variables = {}) {
  const normalized = normalizeEventCaptureSettings(settings);
  let html = normalized.emailTemplate.html;
  Object.entries(variables).forEach(([key, value]) => {
    html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), escapeHtml(value));
  });
  const legacyImageHtml = normalized.emailTemplate.imageDataUrl
    ? `<div style="margin:16px 0;text-align:center"><img src="${normalized.emailTemplate.imageDataUrl}" alt="Golf Club Resort" style="display:block;width:100%;max-width:720px;height:auto;margin:0 auto;border:0"></div>`
    : "";
  html = normalized.emailTemplate.imagePosition === "bottom" ? `${html}${legacyImageHtml}` : `${legacyImageHtml}${html}`;
  html = html.replace(/max-width\s*:\s*720px/gi, "max-width:100%");
  const inlineContent = prepareInlineEmailImages(html, "imagem-captacao");
  return {
    html: `<div style="font-family:${escapeHtml(normalized.emailTemplate.fontFamily)};font-size:${escapeHtml(normalized.emailTemplate.fontSize)};color:${escapeHtml(normalized.emailTemplate.color)};line-height:${escapeHtml(normalized.emailTemplate.lineHeight)}">${inlineContent.html}</div>`,
    attachments: inlineContent.attachments
  };
}

function normalizePipelineFrontSettings(settings = {}) {
  return {
    mobileFiltersCollapsed: settings.mobileFiltersCollapsed !== false,
    mobileFooterStyle: settings.mobileFooterStyle === "full" ? "full" : "floating",
    mobileFooterTheme: settings.mobileFooterTheme === "light" ? "light" : "dark"
  };
}

function safeReportRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 12)
    .map((row) => [String(row?.[0] || "Não informado"), Number(row?.[1] || 0)]);
}

function salesReportFallbackSummary(report) {
  const metrics = report?.metrics || {};
  const achievement = Number.isFinite(Number(metrics.achievement)) ? `${Number(metrics.achievement).toFixed(1).replace(".", ",")}%` : "sem meta configurada";
  return `No período analisado, o comercial registrou ${Number(metrics.leads || 0).toLocaleString("pt-BR")} lead(s), ${Number(metrics.sales || 0).toLocaleString("pt-BR")} venda(s) e ${formatCurrency(metrics.totalSalesValue || 0)} em valor vendido. O atingimento da meta ficou em ${achievement}.`;
}

async function aiSalesReportSummary(report) {
  const fallback = salesReportFallbackSummary(report);
  if (!OPENAI_API_KEY) return fallback;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: [
          "Você escreve resumo executivo para relatório comercial imobiliário da Construtora Mauad.",
          "Use somente os dados recebidos. Não invente valores, causas, nomes ou conclusões não suportadas.",
          "Escreva em português do Brasil, com tom profissional e direto, em até 3 frases."
        ].join(" "),
        input: JSON.stringify({
          periodo: report?.period,
          empreendimento: report?.project,
          indicadores: report?.metrics,
          leadsPorOrigem: safeReportRows(report?.charts?.leadsByOrigin),
          vendasPorEmpreendimento: safeReportRows(report?.charts?.salesByProjectValue)
        }),
        max_output_tokens: 220
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return fallback;
    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((content) => content.text || "").join(" ").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function pdfTextHex(value) {
  const text = String(value ?? "");
  const bytes = [0xfe, 0xff];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return Buffer.from(bytes).toString("hex").toUpperCase();
}

function pdfWrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function createCommercialSalesReportPdf(report, summary) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const objects = [];
  const pages = [];
  let ops = [];
  let y = 42;

  const yPdf = (top) => pageHeight - top;
  const color = (hex) => {
    const clean = String(hex || "#111827").replace("#", "");
    const parts = [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16) / 255);
    return parts.map((part) => part.toFixed(3)).join(" ");
  };
  const rect = (x, top, width, height, fill) => {
    ops.push(`${color(fill)} rg ${x.toFixed(2)} ${(pageHeight - top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  };
  const text = (value, x, top, size = 10, bold = false, fill = "#111827") => {
    ops.push(`BT ${color(fill)} rg /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${yPdf(top).toFixed(2)} Tm <${pdfTextHex(value)}> Tj ET`);
  };
  const line = (x1, top1, x2, top2, stroke = "#38d9ff", width = 2) => {
    ops.push(`${color(stroke)} RG ${width} w ${x1.toFixed(2)} ${yPdf(top1).toFixed(2)} m ${x2.toFixed(2)} ${yPdf(top2).toFixed(2)} l S`);
  };
  const addPage = () => {
    if (ops.length) pages.push(ops.join("\n"));
    ops = [];
    y = 42;
  };
  const ensureSpace = (height) => {
    if (y + height > pageHeight - 42) addPage();
  };
  const paragraph = (value, x, maxWidth, size = 10, fill = "#475569") => {
    const maxChars = Math.max(20, Math.floor(maxWidth / (size * 0.48)));
    for (const part of pdfWrapText(value, maxChars)) {
      text(part, x, y, size, false, fill);
      y += size + 5;
    }
  };
  const sectionTitle = (value) => {
    ensureSpace(28);
    text(value, margin, y, 14, true, "#111827");
    y += 20;
  };
  const metricCard = (label, value, x, top, width) => {
    rect(x + 2, top + 3, width, 54, "#dbe4ed");
    rect(x, top, width, 54, "#ffffff");
    text(label, x + 12, top + 18, 8, true, "#64748b");
    text(value, x + 12, top + 39, 15, true, "#111827");
  };
  const barTable = (title, rows, money = false) => {
    const cleanRows = safeReportRows(rows);
    ensureSpace(70 + cleanRows.length * 18);
    sectionTitle(title);
    const max = Math.max(...cleanRows.map(([, value]) => value), 1);
    for (const [label, value] of cleanRows) {
      text(label.slice(0, 38), margin, y, 9, true, "#1f2937");
      rect(margin + 190, y - 8, 220, 10, "#e8eef5");
      rect(margin + 190, y - 8, Math.max(3, (value / max) * 220), 10, "#0f766e");
      text(money ? formatCurrency(value) : value.toLocaleString("pt-BR"), margin + 425, y, 9, true, "#111827");
      y += 18;
    }
    y += 8;
  };

  rect(0, 0, pageWidth, 112, "#061015");
  text("Pipeline Comercial | Construtora Mauad", margin, 42, 15, true, "#ffffff");
  text("Relatório Comercial de Vendas", margin, 72, 25, true, "#ffffff");
  text(`${report?.monthLabel || ""} • ${report?.period?.start || ""} a ${report?.period?.end || ""}`, margin, 96, 10, false, "#cbd5e1");
  y = 142;

  const metrics = report?.metrics || {};
  const achievement = Number.isFinite(Number(metrics.achievement)) ? `${Number(metrics.achievement).toFixed(1).replace(".", ",")}%` : "Sem meta";
  const cardWidth = (contentWidth - 24) / 4;
  metricCard("LEADS", Number(metrics.leads || 0).toLocaleString("pt-BR"), margin, y, cardWidth);
  metricCard("VENDAS", Number(metrics.sales || 0).toLocaleString("pt-BR"), margin + cardWidth + 8, y, cardWidth);
  metricCard("VALOR VENDIDO", formatCurrency(metrics.totalSalesValue || 0), margin + (cardWidth + 8) * 2, y, cardWidth);
  metricCard("ATINGIMENTO", achievement, margin + (cardWidth + 8) * 3, y, cardWidth);
  y += 86;

  sectionTitle("Resumo executivo");
  paragraph(summary, margin, contentWidth, 11, "#334155");
  y += 8;

  const charts = report?.charts || {};
  barTable("Leads por origem", charts.leadsByOrigin);
  barTable("Leads por status", charts.leadsByStatus);
  barTable("Vendas por corretor", charts.salesByBroker);
  barTable("Vendas por empreendimento", charts.salesByProjectValue, true);

  sectionTitle("Curva de vendas");
  const monthValues = safeReportRows(charts.monthlySalesValues || []);
  if (monthValues.length) {
    const chartTop = y + 8;
    const chartHeight = 110;
    const chartWidth = contentWidth;
    const max = Math.max(...monthValues.map(([, value]) => value), 1);
    let previous = null;
    monthValues.forEach(([label, value], index) => {
      const x = margin + (index / Math.max(monthValues.length - 1, 1)) * chartWidth;
      const pointY = chartTop + chartHeight - (value / max) * chartHeight;
      rect(x - 6, chartTop + chartHeight + 8, 12, 6, "#0f766e");
      text(label.slice(0, 3), x - 9, chartTop + chartHeight + 28, 7, true, "#64748b");
      if (previous) line(previous.x, previous.y, x, pointY, "#38d9ff", 2.6);
      rect(x - 3, pointY - 3, 6, 6, "#38d9ff");
      previous = { x, y: pointY };
    });
    y = chartTop + chartHeight + 42;
  } else {
    paragraph("Sem dados de curva mensal para este relatório.", margin, contentWidth);
  }

  addPage();

  const kids = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((content) => {
    const contentBuffer = Buffer.from(content, "utf8");
    const contentId = addObject(`<< /Length ${contentBuffer.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(`${pageId} 0 R`);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(chunks.join(""), "utf8");
}

function levFinancePayloadFromRow(row) {
  const payload = row?.payload || {};
  return {
    ...payload,
    id: row.id || payload.id || "",
    unit: normalizeLevUnit(row.unit || payload.unit || ""),
    client: row.client || payload.client || "",
    signedAt: payload.signedAt || payload.assinatura || row.signed_at || "",
    contractValue: Number(row.contract_value ?? payload.contractValue ?? 0),
    commissionValue: Number(row.commission_value ?? payload.commissionValue ?? 0),
    realEstate: row.realtor_company || payload.realEstate || payload.realtorCompany || "",
    realtorCompany: row.realtor_company || payload.realtorCompany || payload.realEstate || "",
    status: row.status || payload.status || "",
    invoiceNumber: row.nf_number || payload.invoiceNumber || payload.nfNumber || "",
    nfNumber: row.nf_number || payload.nfNumber || payload.invoiceNumber || "",
    paidAt: payload.paidAt || row.paid_at || ""
  };
}

function levReceiptPayloadFromRow(row) {
  const payload = row?.payload || {};
  return {
    ...payload,
    id: row.id || payload.id || "",
    unit: normalizeLevUnit(row.unit || payload.unit || ""),
    amount: Number(row.amount ?? payload.amount ?? 0),
    receivedAt: payload.receivedAt || payload.paidAt || row.paid_at || "",
    paidAt: payload.paidAt || payload.receivedAt || row.paid_at || ""
  };
}

async function saveStructuredLevSale(sql, sale) {
  if (!sale?.id && !sale?.unit) return;
  const payload = { ...sale, unit: normalizeLevUnit(sale.unit || "") };
  const id = String(payload.id || `lev-sale-${payload.unit || crypto.randomUUID()}`);
  payload.id = id;
  const signedAt = parseBrazilDate(payload.signedAt) || dbDate(payload.signedAt);
  await sql`INSERT INTO crm_lev_sales (id, unit, client, signed_at, contract_value, commission_value, realtor_company, status, nf_number, paid_at, payload)
    VALUES (${id}, ${payload.unit || ""}, ${payload.client || ""}, ${signedAt}, ${Number(payload.contractValue || 0)}, ${Number(payload.commissionValue || 0)}, ${payload.realtorCompany || payload.realEstate || ""}, ${payload.status || ""}, ${payload.invoiceNumber || payload.nfNumber || ""}, ${dbDate(payload.paidAt)}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET unit = EXCLUDED.unit, client = EXCLUDED.client, signed_at = EXCLUDED.signed_at, contract_value = EXCLUDED.contract_value, commission_value = EXCLUDED.commission_value, realtor_company = EXCLUDED.realtor_company, status = EXCLUDED.status, nf_number = EXCLUDED.nf_number, paid_at = EXCLUDED.paid_at, payload = EXCLUDED.payload`;
}

async function saveStructuredLevReceipt(sql, receipt) {
  if (!receipt?.unit && !receipt?.id) return;
  const payload = { ...receipt, unit: normalizeLevUnit(receipt.unit || "") };
  const id = String(payload.id || `lev-receipt-${crypto.randomUUID()}`);
  payload.id = id;
  await sql`INSERT INTO crm_lev_receipts (id, unit, amount, paid_at, payload)
    VALUES (${id}, ${payload.unit || ""}, ${Number(payload.amount || 0)}, ${dbDate(payload.receivedAt || payload.paidAt)}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET unit = EXCLUDED.unit, amount = EXCLUDED.amount, paid_at = EXCLUDED.paid_at, payload = EXCLUDED.payload`;
}

async function saveStructuredLevSettlement(sql, settlement) {
  if (!settlement?.id && !settlement?.unit) return;
  const payload = { ...settlement, unit: normalizeLevUnit(settlement.unit || "") };
  const id = String(payload.id || `lev-settlement-${payload.unit || crypto.randomUUID()}`);
  payload.id = id;
  const signedAt = parseBrazilDate(payload.signedAt) || dbDate(payload.signedAt);
  await sql`INSERT INTO crm_lev_settlements (id, unit, client, signed_at, contract_value, commission_value, realtor_company, status, nf_number, paid_at, payload)
    VALUES (${id}, ${payload.unit || ""}, ${payload.client || ""}, ${signedAt}, ${Number(payload.contractValue || 0)}, ${Number(payload.commissionValue || 0)}, ${payload.realtorCompany || payload.realEstate || ""}, ${payload.status || ""}, ${payload.invoiceNumber || payload.nfNumber || ""}, ${dbDate(payload.paidAt)}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET unit = EXCLUDED.unit, client = EXCLUDED.client, signed_at = EXCLUDED.signed_at, contract_value = EXCLUDED.contract_value, commission_value = EXCLUDED.commission_value, realtor_company = EXCLUDED.realtor_company, status = EXCLUDED.status, nf_number = EXCLUDED.nf_number, paid_at = EXCLUDED.paid_at, payload = EXCLUDED.payload`;
}

async function structuredLevFinanceDb(sql) {
  const [settingsRows, saleRows, receiptRows, settlementRows] = await Promise.all([
    sql`SELECT payload FROM crm_settings WHERE key = 'levFinanceSettings' LIMIT 1`,
    sql`SELECT * FROM crm_lev_sales ORDER BY signed_at DESC NULLS LAST, unit ASC`,
    sql`SELECT * FROM crm_lev_receipts ORDER BY paid_at DESC NULLS LAST, unit ASC`,
    sql`SELECT * FROM crm_lev_settlements ORDER BY signed_at DESC NULLS LAST, unit ASC`
  ]);
  const settings = normalizeLevFinanceSettingsPayload(settingsRows[0]?.payload || {});
  const sales = saleRows.map(levFinancePayloadFromRow).filter((item) => item.id || item.unit);
  const receipts = receiptRows.map(levReceiptPayloadFromRow).filter((item) => item.id || item.unit);
  const settlements = settlementRows.map(levFinancePayloadFromRow).filter((item) => item.id || item.unit);
  return {
    levFinance: {
      settings,
      sales,
      receipts,
      settlements,
      paidUnits: [...new Set([
        ...receipts.map((receipt) => receipt.unit),
        ...settlements.filter((settlement) => levSettlementIsPaidOrIgnored(settlement)).map((settlement) => settlement.unit)
      ].filter(Boolean))],
      defaultSettlementsCleared: true
    }
  };
}

async function persistStructuredLevFinance(sql, finance) {
  await Promise.all([
    sql`DELETE FROM crm_lev_sales`,
    sql`DELETE FROM crm_lev_receipts`,
    sql`DELETE FROM crm_lev_settlements`
  ]);
  for (const sale of finance.sales || []) await saveStructuredLevSale(sql, sale);
  for (const receipt of finance.receipts || []) await saveStructuredLevReceipt(sql, receipt);
  for (const settlement of finance.settlements || []) await saveStructuredLevSettlement(sql, settlement);
}

function normalizeMetaFormPayload(form) {
  const id = String(form?.id || form?.formId || "").trim();
  if (!id) return null;
  return {
    ...form,
    id,
    name: String(form?.name || "").trim(),
    project: String(form?.project || "").trim(),
    archived: Boolean(form?.archived),
    adUrl: String(form?.adUrl || form?.adURL || "").trim(),
    adLinks: Array.isArray(form?.adLinks) ? form.adLinks : [],
    questionLabels: form?.questionLabels || {},
    answerLabels: form?.answerLabels || {}
  };
}

async function saveStructuredMetaForms(sql, integrations = {}) {
  const currentRows = await sql`SELECT payload FROM crm_meta_forms ORDER BY archived ASC, name ASC`;
  const incomingForms = Array.isArray(integrations?.metaForms?.forms)
    ? integrations.metaForms.forms
    : currentRows.map((row) => row.payload || {});
  const forms = incomingForms.map(normalizeMetaFormPayload).filter(Boolean);
  await sql`DELETE FROM crm_meta_forms`;
  for (const form of forms) {
    await sql`INSERT INTO crm_meta_forms (id, name, project, archived, ad_url, payload)
      VALUES (${form.id}, ${form.name || ""}, ${form.project || ""}, ${Boolean(form.archived)}, ${form.adUrl || ""}, ${JSON.stringify(form)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, project = EXCLUDED.project, archived = EXCLUDED.archived, ad_url = EXCLUDED.ad_url, payload = EXCLUDED.payload`;
  }
  await saveStructuredSetting(sql, "integrations", integrations || {});
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
  return {
    ...(integrations || {}),
    metaForms: {
      ...(integrations?.metaForms || {}),
      enabled: forms.length > 0,
      forms
    }
  };
}

async function structuredKnowledgeArticles(sql) {
  const rows = await sql`SELECT payload FROM crm_knowledge_articles ORDER BY updated_at DESC NULLS LAST, title ASC`;
  return rows.map((row) => row.payload || {}).filter((article) => article.id);
}

async function saveStructuredKnowledgeArticle(sql, article) {
  if (!article?.id) return;
  await sql`INSERT INTO crm_knowledge_articles (id, title, category, published, updated_at, payload)
    VALUES (${article.id}, ${article.title || ""}, ${article.category || ""}, ${article.published !== false}, ${dbDate(article.updatedAt)}, ${JSON.stringify(article)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, published = EXCLUDED.published, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`;
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
}

async function structuredConfigDb(sql, { includeLeads = false } = {}) {
  const [users, statuses, projectRows, tagRows, formRows, articleRows, settings, unitDefinitions] = await Promise.all([
    structuredUsers(sql),
    structuredPipelineStatuses(sql),
    sql`SELECT name, position, payload FROM crm_projects ORDER BY position ASC, name ASC`,
    sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`,
    sql`SELECT payload FROM crm_meta_forms ORDER BY archived ASC, name ASC`,
    sql`SELECT payload FROM crm_knowledge_articles ORDER BY updated_at DESC NULLS LAST, title ASC`,
    structuredSettingsMap(sql),
    structuredUnitDefinitions(sql)
  ]);
  const forms = formRows.map((row) => row.payload || {}).filter((form) => form.id);
  const projectDefinitions = projectRows.map((row, index) => normalizeProjectDefinition({ ...(row.payload || {}), name: row.name }, Number(row.position ?? index))).filter((project) => project.name);
  const db = {
    roles: ROLES,
    users,
    projects: projectDefinitions.map((project) => project.name),
    projectDefinitions,
    unitDefinitions,
    availabilitySettings: normalizeAvailabilitySettings(settings.availabilitySettings || {}),
    pipelineStatuses: statuses,
    tagDefinitions: tagRows.map((row) => row.payload || {}).filter((tag) => tag.id),
    integrations: {
      ...(settings.integrations || {}),
      metaForms: {
        ...(settings.integrations?.metaForms || {}),
        enabled: forms.length > 0,
        forms
      }
    },
    knowledgeArticles: articleRows.map((row) => row.payload || {}).filter((article) => article.id),
    knowledgeChatSessions: Array.isArray(settings.knowledgeChatSessions) ? settings.knowledgeChatSessions : [],
    leads: [],
    auditLog: [],
    integrationLog: [],
    fupLeadLog: []
  };
  if (includeLeads) {
    const leadRows = await sql`SELECT l.*, false AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
      FROM crm_leads l
      LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
      GROUP BY l.id
      ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST`;
    db.leads = leadRows.map((row) => structuredLeadFromRow(row, false, row.tags)).filter((lead) => lead.id);
  }
  return db;
}

async function structuredBackupDb(sql) {
  const [
    userRows,
    leadRows,
    opportunityRows,
    commentRows,
    tagRows,
    favoriteRows,
    projectRows,
    statusRows,
    tagDefinitionRows,
    sourceRows,
    formRows,
    permissionRows,
    auditRows,
    accessRows,
    integrationRows,
    fupRows,
    movementRows,
    samRows,
    articleRows,
    unitRows,
    settings,
    finance,
    smlSaleRows,
    smlReceiptRows,
    smlSettlementRows,
    smlAuthorizationRows,
    metaHealthRows,
    metaConversionRows
  ] = await Promise.all([
    sql`SELECT * FROM crm_users ORDER BY name ASC, username ASC`,
    sql`SELECT * FROM crm_leads ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`,
    sql`SELECT * FROM crm_opportunities ORDER BY lead_id ASC, created_at ASC NULLS LAST, id ASC`,
    sql`SELECT lead_id, payload FROM crm_lead_comments ORDER BY created_at DESC NULLS LAST`,
    sql`SELECT lead_id, tag_id FROM crm_lead_tags ORDER BY lead_id ASC, tag_id ASC`,
    sql`SELECT lead_id, user_id, favorite FROM crm_lead_favorites ORDER BY lead_id ASC, user_id ASC`,
    sql`SELECT name, position, payload FROM crm_projects ORDER BY position ASC, name ASC`,
    sql`SELECT status, position, payload FROM crm_pipeline_statuses ORDER BY position ASC, status ASC`,
    sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`,
    sql`SELECT name FROM crm_base_sources ORDER BY name ASC`,
    sql`SELECT payload FROM crm_meta_forms ORDER BY archived ASC, name ASC`,
    sql`SELECT owner_type, owner_id, resource_id, can_access, can_act FROM crm_permissions`,
    sql`SELECT payload FROM crm_audit_logs ORDER BY at DESC NULLS LAST`,
    sql`SELECT payload FROM crm_access_logs ORDER BY at DESC NULLS LAST`,
    sql`SELECT payload FROM crm_integration_logs ORDER BY at DESC NULLS LAST`,
    sql`SELECT payload FROM crm_fup_lead_logs ORDER BY at DESC NULLS LAST`,
    sql`SELECT payload FROM crm_lead_status_movements ORDER BY moved_at DESC NULLS LAST`,
    sql`SELECT * FROM crm_sam_events ORDER BY created_at DESC NULLS LAST`,
    sql`SELECT payload FROM crm_knowledge_articles ORDER BY updated_at DESC NULLS LAST, title ASC`,
    sql`SELECT * FROM crm_units ORDER BY project ASC, block ASC NULLS LAST, floor ASC NULLS LAST, stack ASC NULLS LAST, unit ASC`,
    structuredSettingsMap(sql),
    structuredLevFinanceDb(sql),
    sql`SELECT * FROM crm_sml_sales ORDER BY unit ASC`,
    sql`SELECT * FROM crm_sml_receipts ORDER BY paid_at DESC NULLS LAST, unit ASC`,
    sql`SELECT * FROM crm_sml_settlements ORDER BY signed_at DESC NULLS LAST, unit ASC`,
    sql`SELECT * FROM crm_sml_authorization_links ORDER BY expires_at DESC`,
    sql`SELECT * FROM crm_meta_lead_health ORDER BY project ASC`,
    sql`SELECT * FROM crm_meta_conversion_events ORDER BY created_at DESC`
  ]);
  const commentsByLead = new Map();
  for (const row of commentRows) {
    if (!commentsByLead.has(row.lead_id)) commentsByLead.set(row.lead_id, []);
    const comment = row.payload || {};
    if (comment.id) commentsByLead.get(row.lead_id).push(comment);
  }
  const tagsByLead = new Map();
  for (const row of tagRows) {
    if (!tagsByLead.has(row.lead_id)) tagsByLead.set(row.lead_id, []);
    if (row.tag_id) tagsByLead.get(row.lead_id).push(row.tag_id);
  }
  const favoritesByLead = new Map();
  for (const row of favoriteRows) {
    if (!favoritesByLead.has(row.lead_id)) favoritesByLead.set(row.lead_id, {});
    favoritesByLead.get(row.lead_id)[row.user_id] = row.favorite !== false;
  }
  const opportunities = opportunityRows.map(structuredOpportunityFromRow).filter((opportunity) => opportunity.id && opportunity.leadId);
  const opportunitiesByLead = opportunities.reduce((map, opportunity) => {
    if (!map.has(opportunity.leadId)) map.set(opportunity.leadId, []);
    map.get(opportunity.leadId).push(opportunity);
    return map;
  }, new Map());
  const leads = leadRows.map((row) => {
    const lead = structuredLeadFromRow(row, false, tagsByLead.get(row.id) || []);
    lead.comments = commentsByLead.get(row.id) || lead.comments || [];
    lead.favoritesByUser = favoritesByLead.get(row.id) || lead.favoritesByUser || {};
    lead.opportunities = opportunitiesByLead.get(row.id) || [];
    return lead;
  }).filter((lead) => lead.id);
  const forms = formRows.map((row) => row.payload || {}).filter((form) => form.id);
  const baseSources = sourceRows.map((row) => row.name).filter(Boolean);
  const permissions = structuredPermissionsFromRows(permissionRows);
  const projectDefinitions = projectRows.map((row, index) => normalizeProjectDefinition({ ...(row.payload || {}), name: row.name }, Number(row.position ?? index))).filter((project) => project.name);
  const statusDefinitions = statusRows.map((row, index) => normalizeStatusDefinition({ ...(row.payload || {}), status: row.status }, Number(row.position ?? index))).filter((status) => status.status);
  const unitDefinitions = unitRows.map((row) => normalizeUnitDefinition({
    ...(row.payload || {}),
    id: row.id,
    project: row.project,
    unit: row.unit,
    block: row.block,
    floor: row.floor,
    column: row.stack,
    samCode: row.sam_code,
    status: row.status,
    leadId: row.lead_id,
    buyerName: row.buyer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })).filter((unit) => unit.id && unit.project && unit.unit);
  const db = {
    schemaVersion: APP_SCHEMA_VERSION,
    roles: ROLES,
    users: userRows.map(structuredUserFromAuthRow).filter((user) => user?.id),
    leads,
    opportunities,
    projects: projectDefinitions.map((project) => project.name),
    projectDefinitions,
    unitDefinitions,
    availabilitySettings: normalizeAvailabilitySettings(settings.availabilitySettings || {}),
    structuredSettings: settings,
    pipelineStatuses: statusDefinitions.map((status) => status.status),
    statusDefinitions,
    tagDefinitions: tagDefinitionRows.map((row) => row.payload || {}).filter((tag) => tag.id),
    integrations: {
      ...(settings.integrations || {}),
      metaForms: {
        ...(settings.integrations?.metaForms || {}),
        enabled: forms.length > 0,
        forms
      }
    },
    permissions,
    baseAccess: structuredBaseAccessFromPermissions(permissions, baseSources),
    baseAccessSources: baseSources,
    knowledgeArticles: articleRows.map((row) => row.payload || {}).filter((article) => article.id),
    knowledgeChatSessions: Array.isArray(settings.knowledgeChatSessions) ? settings.knowledgeChatSessions : [],
    auditLog: auditRows.map((row) => row.payload || {}).filter((item) => item.at),
    accessLog: accessRows.map((row) => row.payload || {}).filter((item) => item.at),
    integrationLog: integrationRows.map((row) => row.payload || {}).filter((item) => item.at),
    fupLeadLog: fupRows.map((row) => row.payload || {}).filter((item) => item.at),
    leadStatusMovements: movementRows.map((row) => row.payload || {}).filter((item) => item.id),
    samEvents: samRows.map(samEventFromRow).filter((event) => event.id),
    levFinance: finance.levFinance,
    smlFinance: {
      settings: settings.smlFinanceSettings || {},
      sales: smlSaleRows.map((row) => row.payload || {}).filter((item) => item.id),
      receipts: smlReceiptRows.map((row) => row.payload || {}).filter((item) => item.id),
      settlements: smlSettlementRows.map((row) => row.payload || {}).filter((item) => item.id),
      authorizationLinks: smlAuthorizationRows,
      rawSales: smlSaleRows,
      rawReceipts: smlReceiptRows,
      rawSettlements: smlSettlementRows
    },
    metaLeadHealth: metaHealthRows,
    metaConversionEvents: metaConversionRows,
    importSummary: { origin: "STRUCTURED_BACKUP", leadCount: leads.length, inactiveBrokerCount: 0 }
  };
  ensurePermissions(db);
  return db;
}

function normalizeBackupSettings(settings = {}) {
  return {
    enabled: settings.enabled !== false,
    emailEnabled: Boolean(settings.emailEnabled),
    emailTo: String(settings.emailTo || "").trim(),
    emailCc: String(settings.emailCc || "").trim(),
    driveEnabled: Boolean(settings.driveEnabled),
    driveWebhookUrl: String(settings.driveWebhookUrl || "").trim(),
    lastRun: settings.lastRun || null,
    history: (Array.isArray(settings.history) ? settings.history : []).slice(0, 15)
  };
}

function backupRecordCounts(db = {}) {
  return {
    users: Array.isArray(db.users) ? db.users.length : 0,
    leads: Array.isArray(db.leads) ? db.leads.length : 0,
    opportunities: Array.isArray(db.opportunities) ? db.opportunities.length : (db.leads || []).reduce((sum, lead) => sum + (Array.isArray(lead.opportunities) ? lead.opportunities.length : 0), 0),
    units: Array.isArray(db.unitDefinitions) ? db.unitDefinitions.length : 0,
    comments: Array.isArray(db.leads) ? db.leads.reduce((sum, lead) => sum + (Array.isArray(lead.comments) ? lead.comments.length : 0), 0) : 0,
    auditLog: Array.isArray(db.auditLog) ? db.auditLog.length : 0,
    integrationLog: Array.isArray(db.integrationLog) ? db.integrationLog.length : 0,
    accessLog: Array.isArray(db.accessLog) ? db.accessLog.length : 0,
    fupLeadLog: Array.isArray(db.fupLeadLog) ? db.fupLeadLog.length : 0,
    leadStatusMovements: Array.isArray(db.leadStatusMovements) ? db.leadStatusMovements.length : 0,
    levSales: Array.isArray(db.levFinance?.sales) ? db.levFinance.sales.length : 0,
    smlSales: Array.isArray(db.smlFinance?.rawSales) ? db.smlFinance.rawSales.length : 0,
    smlAuthorizationLinks: Array.isArray(db.smlFinance?.authorizationLinks) ? db.smlFinance.authorizationLinks.length : 0,
    metaLeadHealth: Array.isArray(db.metaLeadHealth) ? db.metaLeadHealth.length : 0,
    metaConversionEvents: Array.isArray(db.metaConversionEvents) ? db.metaConversionEvents.length : 0,
    samEvents: Array.isArray(db.samEvents) ? db.samEvents.length : 0,
    knowledgeArticles: Array.isArray(db.knowledgeArticles) ? db.knowledgeArticles.length : 0
  };
}

function validateStructuredBackupEnvelope(envelope = {}) {
  const errors = [];
  const warnings = [];
  const db = envelope.db || {};
  const requiredArrays = ["users", "leads", "projectDefinitions", "statusDefinitions", "tagDefinitions", "auditLog", "integrationLog", "fupLeadLog", "samEvents", "knowledgeArticles"];
  if (!envelope.exportedAt) errors.push("Data de exportação ausente.");
  if (envelope.source !== "structured") errors.push("Origem do backup inválida.");
  if (!db || typeof db !== "object") errors.push("Bloco db ausente ou inválido.");
  for (const key of requiredArrays) {
    if (!Array.isArray(db[key])) errors.push(`Campo ${key} deve ser uma lista.`);
  }
  if (!Array.isArray(db.levFinance?.sales)) errors.push("Campo levFinance.sales deve ser uma lista.");
  if (!Array.isArray(db.levFinance?.receipts)) errors.push("Campo levFinance.receipts deve ser uma lista.");
  if (!Array.isArray(db.levFinance?.settlements)) errors.push("Campo levFinance.settlements deve ser uma lista.");
  if (Array.isArray(db.users) && !db.users.some((user) => user.role === "Admin TI" && user.active !== false)) {
    warnings.push("Nenhum Admin TI ativo encontrado no backup.");
  }
  if (Array.isArray(db.leads) && !db.leads.length) warnings.push("Backup sem leads.");
  if (!Array.isArray(db.unitDefinitions)) warnings.push("Backup legado sem unidades do quadro de disponibilidade.");
  if (!Array.isArray(db.opportunities) && !(db.leads || []).some((lead) => Array.isArray(lead.opportunities))) warnings.push("Backup legado sem oportunidades separadas.");
  let json = "";
  try {
    json = JSON.stringify(envelope);
    JSON.parse(json);
  } catch (error) {
    errors.push(`JSON inválido: ${error.message}`);
  }
  const bytes = Buffer.byteLength(json || "{}", "utf8");
  const checksum = crypto.createHash("sha256").update(json || "{}").digest("hex");
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    bytes,
    checksum,
    counts: backupRecordCounts(db)
  };
}

async function deliverBackupToDrive(settings, filename, envelope, validation) {
  if (!settings.driveEnabled) return { skipped: true, reason: "Google Drive desativado" };
  if (!settings.driveWebhookUrl) return { sent: false, reason: "URL/Webhook do Google Drive não configurado" };
  try {
    const response = await fetch(settings.driveWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        contentType: "application/json",
        contentBase64: Buffer.from(JSON.stringify(envelope, null, 2), "utf8").toString("base64"),
        validation,
        generatedAt: envelope.exportedAt
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, reason: data.error || data.message || `HTTP ${response.status}` };
    return {
      sent: true,
      id: data.id || data.fileId || "",
      url: data.selectionUrl || data.webViewLink || data.url || data.alternateLink || "",
      folderUrl: data.folderUrl || ""
    };
  } catch (error) {
    return { sent: false, reason: externalFetchFailureReason("Google Drive", error) };
  }
}

async function deliverBackupByEmail(settings, filename, envelope, validation) {
  if (!settings.emailEnabled) return { skipped: true, reason: "E-mail desativado" };
  const counts = validation.counts || {};
  const html = `
    <div style="font-family:Arial,sans-serif;color:#17202c">
      <h2>Backup diário do Pipeline Mauad</h2>
      <p>Backup gerado em <strong>${escapeHtml(envelope.exportedAt)}</strong> e validado com sucesso.</p>
      <p><strong>Checksum SHA-256:</strong> ${escapeHtml(validation.checksum)}</p>
      <p><strong>Registros:</strong> ${Number(counts.leads || 0).toLocaleString("pt-BR")} leads, ${Number(counts.users || 0).toLocaleString("pt-BR")} usuários, ${Number(counts.auditLog || 0).toLocaleString("pt-BR")} logs de auditoria.</p>
      <p>O arquivo JSON está anexado a este e-mail.</p>
    </div>
  `;
  return sendEmailWithAttachments(settings.emailTo, settings.emailCc, `Backup Pipeline Mauad - ${filename}`, html, [{
    filename,
    content: Buffer.from(JSON.stringify(envelope, null, 2), "utf8").toString("base64")
  }]);
}

async function runStructuredBackup(sql, actor = { username: "backup-cron", name: "Backup Cron" }, options = {}) {
  const settingsRows = await sql`SELECT payload FROM crm_settings WHERE key = 'backupSettings' LIMIT 1`;
  const settings = normalizeBackupSettings(settingsRows[0]?.payload || {});
  if (options.scheduled && !settings.enabled) {
    return { ok: true, skipped: true, reason: "Backup diário desativado", settings };
  }
  const exportedAt = new Date().toISOString();
  const filename = `pipeline-mauad-backup-${exportedAt.slice(0, 10)}.json`;
  const envelope = {
    exportedAt,
    source: "structured",
    schemaVersion: APP_SCHEMA_VERSION,
    db: await structuredBackupDb(sql)
  };
  const validation = validateStructuredBackupEnvelope(envelope);
  const deliveries = {};
  if (validation.ok) {
    deliveries.email = await deliverBackupByEmail(settings, filename, envelope, validation);
    deliveries.googleDrive = await deliverBackupToDrive(settings, filename, envelope, validation);
  }
  const run = {
    id: `backup-${crypto.randomUUID()}`,
    at: exportedAt,
    status: validation.ok ? "success" : "failed",
    filename,
    validation,
    deliveries
  };
  const nextSettings = normalizeBackupSettings({
    ...settings,
    lastRun: run,
    history: [run, ...(settings.history || [])].slice(0, 15)
  });
  await saveStructuredSetting(sql, "backupSettings", nextSettings);
  await structuredAudit(actor, validation.ok ? "BACKUP_GENERATED" : "BACKUP_FAILED", {
    filename,
    validation,
    deliveries,
    scheduled: Boolean(options.scheduled)
  });
  return { ok: validation.ok, filename, validation, deliveries, settings: nextSettings };
}

function metaLeadLocalId(leadgenId) {
  return `meta-${String(leadgenId || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function metaLeadgenIdsFromWebhookPayload(payload = {}) {
  const ids = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) ids.push(String(change.value.leadgen_id).trim());
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

async function structuredMetaRuntimeDb(sql, leadgenIds = []) {
  const db = await structuredConfigDb(sql);
  const ids = [...new Set((leadgenIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return db;
  const localIds = ids.map(metaLeadLocalId);
  const externalIds = ids.map((id) => `META-${id}`);
  const rows = await sql`SELECT l.*, false AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
    FROM crm_leads l
    LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
    WHERE l.id = ANY(${localIds})
      OR l.payload->>'metaLeadId' = ANY(${ids})
      OR l.payload->>'externalId' = ANY(${externalIds})
    GROUP BY l.id`;
  db.leads = rows.map((row) => structuredLeadFromRow(row, false, row.tags)).filter((lead) => lead.id);
  return db;
}

async function persistStructuredMetaRuntimeLeads(sql, db, leadgenIds = []) {
  const ids = new Set((leadgenIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  for (const lead of db.leads || []) {
    const metaId = String(lead.metaLeadId || lead.meta?.leadgenId || "").trim();
    if (String(lead.id || "").startsWith("meta-") || ids.has(metaId)) await saveStructuredLead(sql, lead);
  }
}

async function syncRecentMetaLeadsStructured(sql, actor, { days = 7, limitPerForm = 200, formId = "" } = {}) {
  const configDb = await structuredConfigDb(sql);
  const requestedFormId = String(formId || "").trim();
  const forms = configuredMetaForms(configDb).filter((form) => !requestedFormId || form.id === requestedFormId);
  if (!forms.length) {
    throw new Error(requestedFormId
      ? `Formulário Meta ${requestedFormId} não está cadastrado como ativo`
      : "Cadastre pelo menos um ID de formulário do Meta");
  }
  const sinceIso = new Date(Date.now() - Math.max(1, Number(days) || 7) * 24 * 60 * 60 * 1000).toISOString();
  const result = {
    forms: forms.length,
    formId: requestedFormId,
    found: 0,
    created: 0,
    duplicates: 0,
    errors: []
  };
  const leadRefs = [];
  for (const form of forms) {
    try {
      const recentLeads = await fetchMetaFormLeads(form.id, { sinceIso, limit: limitPerForm });
      result.found += recentLeads.length;
      for (const item of recentLeads) {
        if (item.id) leadRefs.push({ leadgenId: String(item.id), formId: form.id });
      }
    } catch (error) {
      result.errors.push({ formId: form.id, error: error.message });
      await structuredIntegration("META", "SYNC_FORM_ERROR", { formId: form.id, error: error.message });
    }
  }
  const db = await structuredMetaRuntimeDb(sql, leadRefs.map((item) => item.leadgenId));
  for (const item of leadRefs) {
    try {
      const imported = await importMetaLeadById(db, actor, item.leadgenId, { form_id: item.formId });
      if (imported.status === "created") result.created += 1;
      else result.duplicates += 1;
    } catch (error) {
      result.errors.push({ formId: item.formId, leadgenId: item.leadgenId, error: error.message });
      integrationEvent(db, "META", "SYNC_LEAD_ERROR", { formId: item.formId, leadgenId: item.leadgenId, error: error.message });
    }
  }
  await persistStructuredMetaRuntimeLeads(sql, db, leadRefs.map((item) => item.leadgenId));
  integrationEvent(db, "META", "SYNC_RECENT", {
    days,
    formId: requestedFormId,
    forms: result.forms,
    found: result.found,
    created: result.created,
    duplicates: result.duplicates,
    errors: result.errors.length
  });
  audit(db, actor, "SYNC_META_RECENT", {
    days,
    formId: requestedFormId,
    forms: result.forms,
    found: result.found,
    created: result.created,
    duplicates: result.duplicates,
    errors: result.errors.length
  });
  return result;
}

function projectForMetaHealthLead(lead = {}) {
  const payload = lead.payload || {};
  const opportunities = Array.isArray(payload.opportunities) ? payload.opportunities : [];
  return String(
    lead.project ||
    payload.desiredProject ||
    payload.project ||
    payload.empreendimento ||
    opportunities[0]?.project ||
    "Sem empreendimento"
  ).trim() || "Sem empreendimento";
}

function minutesBetweenDates(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, (endTime - startTime) / 60000);
}

function formatMetaHealthMinutes(minutes) {
  const value = Number(minutes || 0);
  if (value >= 1440) return `${(value / 1440).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s)`;
  if (value >= 60) return `${(value / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} hora(s)`;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} minuto(s)`;
}

async function metaHealthRecipients(sql) {
  const users = await structuredUsers(sql);
  return users.filter((user) => (
    user.active &&
    META_HEALTH_NOTIFICATION_ROLES.has(user.role) &&
    user.notifications?.whatsapp &&
    user.notifications?.metaHealthWhatsapp
  ));
}

async function analyzeStructuredMetaLeadHealth(sql, { notify = false } = {}) {
  const now = new Date();
  const rows = await sql`SELECT id, name, project, created_at, payload
    FROM crm_leads
    WHERE upper(COALESCE(source, payload->>'source', '')) = 'META'
      AND created_at IS NOT NULL
      AND created_at >= now() - interval '45 days'
    ORDER BY created_at ASC`;
  const groups = new Map();
  for (const row of rows) {
    const project = projectForMetaHealthLead(row);
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(row);
  }
  const health = [];
  const alerts = [];
  let sent = 0;
  for (const [project, leads] of groups.entries()) {
    const ordered = leads
      .map((lead) => ({ ...lead, createdAtMs: new Date(lead.created_at).getTime() }))
      .filter((lead) => Number.isFinite(lead.createdAtMs))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    if (!ordered.length) continue;
    const gaps = [];
    for (let index = 1; index < ordered.length; index += 1) {
      gaps.push(Math.max(0, (ordered[index].createdAtMs - ordered[index - 1].createdAtMs) / 60000));
    }
    const averageGapMinutes = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
    const lastLeadAt = new Date(ordered[ordered.length - 1].createdAtMs);
    const currentGapMinutes = minutesBetweenDates(lastLeadAt, now);
    const isAbnormal = gaps.length >= META_HEALTH_MIN_SAMPLE &&
      currentGapMinutes >= META_HEALTH_MIN_GAP_MINUTES &&
      averageGapMinutes > 0 &&
      currentGapMinutes >= averageGapMinutes * META_HEALTH_ALERT_FACTOR;
    const previousRows = await sql`SELECT alerted_at FROM crm_meta_lead_health WHERE project = ${project} LIMIT 1`;
    const previousAlertAt = previousRows[0]?.alerted_at ? new Date(previousRows[0].alerted_at) : null;
    const cooldownMs = Math.max(1, META_HEALTH_ALERT_COOLDOWN_HOURS) * 60 * 60 * 1000;
    const canAlert = isAbnormal && (!previousAlertAt || now.getTime() - previousAlertAt.getTime() >= cooldownMs);
    const payload = {
      project,
      leadCount: ordered.length,
      lastLeadId: ordered[ordered.length - 1]?.id || "",
      lastLeadName: ordered[ordered.length - 1]?.name || "",
      averageGapMinutes,
      currentGapMinutes,
      factor: META_HEALTH_ALERT_FACTOR,
      minSample: META_HEALTH_MIN_SAMPLE,
      minGapMinutes: META_HEALTH_MIN_GAP_MINUTES
    };
    await sql`INSERT INTO crm_meta_lead_health (project, last_lead_at, average_gap_minutes, current_gap_minutes, sample_size, status, alerted_at, updated_at, payload)
      VALUES (${project}, ${lastLeadAt.toISOString()}, ${averageGapMinutes}, ${currentGapMinutes}, ${gaps.length}, ${isAbnormal ? "alert" : "ok"}, ${notify && canAlert ? now.toISOString() : previousRows[0]?.alerted_at || null}, now(), ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (project) DO UPDATE SET
        last_lead_at = EXCLUDED.last_lead_at,
        average_gap_minutes = EXCLUDED.average_gap_minutes,
        current_gap_minutes = EXCLUDED.current_gap_minutes,
        sample_size = EXCLUDED.sample_size,
        status = EXCLUDED.status,
        alerted_at = EXCLUDED.alerted_at,
        updated_at = now(),
        payload = EXCLUDED.payload`;
    const item = { ...payload, status: isAbnormal ? "alert" : "ok", canAlert };
    health.push(item);
    if (notify && canAlert) {
      const recipients = await metaHealthRecipients(sql);
      const text = [
        `Alerta Meta Leads - ${project}`,
        "",
        `O intervalo sem novos leads está acima do comportamento médio.`,
        `Último lead: ${lastLeadAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        `Tempo atual sem lead: ${formatMetaHealthMinutes(currentGapMinutes)}`,
        `Média histórica: ${formatMetaHealthMinutes(averageGapMinutes)}`,
        "",
        "Verifique crédito, campanha, conjunto de anúncios, formulário e entrega no Meta."
      ].join("\n");
      if (!recipients.length) {
        await structuredIntegration("META", "HEALTH_ALERT_NO_RECIPIENTS", { project, currentGapMinutes, averageGapMinutes });
      }
      for (const recipient of recipients) {
        const result = await sendUserWhatsappText(recipient, text);
        sent += result.sent ? 1 : 0;
        await structuredIntegration("META", result.sent ? "HEALTH_ALERT_SENT" : "HEALTH_ALERT_FAILED", {
          project,
          userId: recipient.id,
          user: recipient.name,
          currentGapMinutes,
          averageGapMinutes,
          reason: result.reason || ""
        });
      }
      alerts.push(item);
    }
  }
  return { checkedAt: now.toISOString(), projects: health, alerts, sent };
}

async function replaceStructuredProjects(sql, projects) {
  await sql`DELETE FROM crm_projects`;
  for (const [position, projectInput] of projects.entries()) {
    const project = normalizeProjectDefinition(projectInput, position);
    if (!project.name) continue;
    await sql`INSERT INTO crm_projects (name, position, payload)
      VALUES (${project.name}, ${position}, ${JSON.stringify(project)}::jsonb)`;
  }
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
}

async function replaceStructuredStatuses(sql, statuses) {
  await sql`DELETE FROM crm_pipeline_statuses`;
  for (const [position, statusInput] of statuses.entries()) {
    const definition = normalizeStatusDefinition(statusInput, position);
    if (!definition.status) continue;
    await sql`INSERT INTO crm_pipeline_statuses (status, position, payload) VALUES (${definition.status}, ${position}, ${JSON.stringify(definition)}::jsonb)`;
  }
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
}

async function fastStructuredSettingsRoutes(req, res, url) {
  if (!DATABASE_URL) return false;
  const method = req.method;
  const isSettingsRoute =
    url.pathname === "/api/integrations" ||
    url.pathname.startsWith("/api/integrations/meta/") ||
    url.pathname.startsWith("/api/integrations/email/") ||
    url.pathname.startsWith("/api/integrations/chatwoot/") ||
    url.pathname === "/api/commercial-settings" ||
    url.pathname === "/api/event-capture-settings" ||
    url.pathname === "/api/pipeline-front-settings" ||
    url.pathname === "/api/knowledge" ||
    url.pathname.startsWith("/api/knowledge/") ||
    url.pathname === "/api/projects" ||
    url.pathname.startsWith("/api/projects/") ||
    url.pathname === "/api/units" ||
    url.pathname.startsWith("/api/units/") ||
    url.pathname === "/api/availability-settings" ||
    url.pathname === "/api/statuses" ||
    url.pathname.startsWith("/api/statuses/") ||
    url.pathname === "/api/tags" ||
    url.pathname.startsWith("/api/tags/");
  if (!isSettingsRoute) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;

    if (url.pathname === "/api/integrations" && method === "PUT") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const integrations = await saveStructuredMetaForms(sql, body.integrations || {});
      await structuredAudit(user, "UPDATE_INTEGRATIONS", {});
      return sendJson(res, 200, { integrations, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/commercial-settings" && method === "PUT") {
      if (!canManageCommercialSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const commercialSettings = normalizeCommercialSettingsPayload(body);
      await saveStructuredSetting(sql, "commercialSettings", commercialSettings);
      await structuredAudit(user, "UPDATE_COMMERCIAL_SETTINGS", {
        monthlySalesGoal: commercialSettings.monthlySalesGoal,
        sessionTimeoutMinutes: commercialSettings.sessionTimeoutMinutes
      });
      return sendJson(res, 200, { commercialSettings, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/event-capture-settings" && method === "PUT") {
      if (!canManageEventCaptureSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const eventCaptureSettings = normalizeEventCaptureSettings(await readBody(req));
      await saveStructuredSetting(sql, "eventCaptureSettings", eventCaptureSettings);
      await structuredAudit(user, "UPDATE_EVENT_CAPTURE_SETTINGS", { senderName: eventCaptureSettings.senderName, subject: eventCaptureSettings.subject });
      return sendJson(res, 200, { eventCaptureSettings, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/pipeline-front-settings" && method === "PUT") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const pipelineFrontSettings = normalizePipelineFrontSettings(body);
      await saveStructuredSetting(sql, "pipelineFrontSettings", pipelineFrontSettings);
      await structuredAudit(user, "UPDATE_PIPELINE_FRONT_SETTINGS", pipelineFrontSettings);
      return sendJson(res, 200, { pipelineFrontSettings, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/integrations/meta/import-lead" && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const leadgenId = String(body.leadgenId || "").trim();
      const db = await structuredMetaRuntimeDb(sql, [leadgenId]);
      try {
        const imported = await importMetaLeadById(db, user, leadgenId, {});
        if (imported.lead) await saveStructuredLead(sql, imported.lead);
        return sendJson(res, 200, { ok: true, status: imported.status, lead: publicLead(imported.lead, user), dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "MANUAL_IMPORT_ERROR", { leadgenId, error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (url.pathname === "/api/integrations/meta/sync-recent" && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      try {
        const result = await syncRecentMetaLeadsStructured(sql, user, { days: Number(body.days || 7), formId: body.formId });
        return sendJson(res, 200, { ok: true, ...result, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "SYNC_MANUAL_ERROR", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (url.pathname === "/api/integrations/meta/subscribe-page" && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const pageId = String(body.pageId || "").trim();
      try {
        const result = await subscribeMetaLeadgenPage(pageId);
        await structuredIntegration("META", "PAGE_SUBSCRIBED", { pageId, fields: "leadgen" });
        await structuredAudit(user, "SUBSCRIBE_META_PAGE", { pageId });
        return sendJson(res, 200, { ok: true, ...result, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "PAGE_SUBSCRIBE_ERROR", { pageId, error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (url.pathname === "/api/integrations/meta/diagnostics" && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      try {
        const db = await structuredConfigDb(sql);
        const diagnostics = await diagnoseMeta(db);
        await structuredAudit(user, "DIAGNOSE_META", { forms: diagnostics.forms.length });
        return sendJson(res, 200, { ok: true, diagnostics, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "DIAGNOSTIC_ERROR", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (url.pathname === "/api/integrations/email/test" && method === "POST") {
      if (user.role !== "Admin TI") return sendJson(res, 403, { error: "Sem permissão" });
      const result = await sendEmailDiagnostics(user);
      if (!result.sent) {
        await structuredIntegration("EMAIL", "TEST_EMAIL_FAILED", { to: "renat.cg@gmail.com", reason: result.reason });
        return sendJson(res, 400, { error: result.reason || "Não foi possível enviar o e-mail de teste" });
      }
      await structuredIntegration("EMAIL", "TEST_EMAIL_SENT", { to: "renat.cg@gmail.com", id: result.id || "", from: result.from || "" });
      await structuredAudit(user, "SEND_TEST_EMAIL", { to: "renat.cg@gmail.com", id: result.id || "", from: result.from || "" });
      return sendJson(res, 200, { ok: true, email: result, to: "renat.cg@gmail.com", from: result.from || EMAIL_FROM, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/integrations/chatwoot/diagnostics" && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      try {
        const diagnostics = await diagnoseChatwoot();
        await structuredIntegration("CHATWOOT", "DIAGNOSTIC_OK", {
          accountId: diagnostics.accountId,
          inboxes: diagnostics.inboxes.length,
          agents: diagnostics.agents.length,
          teams: diagnostics.teams.length
        });
        await structuredAudit(user, "DIAGNOSE_CHATWOOT", { accountId: diagnostics.accountId, inboxes: diagnostics.inboxes.length });
        return sendJson(res, 200, { ok: true, diagnostics, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("CHATWOOT", "DIAGNOSTIC_ERROR", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (url.pathname === "/api/integrations/meta/capi-diagnostics" && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      try {
        const diagnostics = await metaCapiDiagnostics(sql);
        const events = await metaCapiRowsForState(sql);
        await structuredAudit(user, "DIAGNOSE_META_CAPI", {
          queue: diagnostics.queue,
          checks: diagnostics.checks.map((check) => ({ label: check.label, ok: check.ok }))
        });
        return sendJson(res, 200, { ok: true, diagnostics, events, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "CAPI_DIAGNOSTIC_ERROR", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (url.pathname === "/api/integrations/meta/capi-events" && method === "GET") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const events = await metaCapiRowsForState(sql);
      return sendJson(res, 200, { ok: true, events, dataSources: { action: "structured" } });
    }

    const capiResendMatch = url.pathname.match(/^\/api\/integrations\/meta\/capi-events\/([^/]+)\/resend$/);
    if (capiResendMatch && method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const eventId = decodeURIComponent(capiResendMatch[1]);
      const existing = await sql`SELECT id FROM crm_meta_conversion_events WHERE id = ${eventId} LIMIT 1`;
      if (!existing[0]) return sendJson(res, 404, { error: "Evento não encontrado" });
      await sendStructuredMetaConversionEvent(sql, eventId);
      const rows = await sql`
        SELECT e.*, l.name AS lead_name
        FROM crm_meta_conversion_events e
        LEFT JOIN crm_leads l ON l.id = e.lead_id
        WHERE e.id = ${eventId}
        LIMIT 1
      `;
      await structuredAudit(user, "RESEND_META_CAPI_EVENT", { eventId });
      return sendJson(res, 200, { ok: true, event: publicMetaConversionEvent(rows[0]), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/knowledge" && method === "POST") {
      if (!canCreateKnowledge(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const articleData = normalizeKnowledgePayload(body);
      if (!articleData.title) return sendJson(res, 400, { error: "Título obrigatório" });
      if (!articleData.content) return sendJson(res, 400, { error: "Conteúdo obrigatório" });
      const now = new Date().toISOString();
      const article = {
        id: `kb-${crypto.randomUUID()}`,
        ...articleData,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.name || user.username
      };
      await saveStructuredKnowledgeArticle(sql, article);
      await structuredAudit(user, "CREATE_KNOWLEDGE_ARTICLE", { articleId: article.id, title: article.title });
      const db = await structuredConfigDb(sql);
      return sendJson(res, 201, { knowledgeArticles: visibleKnowledgeArticles(db, user), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/knowledge/ask" && method === "POST") {
      const body = await readBody(req);
      const question = String(body.question || "").trim();
      if (!question) return sendJson(res, 400, { error: "Digite uma pergunta." });
      const db = await structuredConfigDb(sql);
      const now = new Date().toISOString();
      let session = (db.knowledgeChatSessions || []).find((item) => item.id === String(body.sessionId || "") && item.userId === user.id);
      if (!session) {
        session = {
          id: `kc-${crypto.randomUUID()}`,
          userId: user.id,
          title: question.slice(0, 64) || "Nova conversa",
          messages: [],
          generatedTutorialId: "",
          createdAt: now,
          updatedAt: now
        };
        db.knowledgeChatSessions.unshift(session);
      }
      try {
        const result = await answerKnowledgeQuestion(db, user, question);
        session.messages.push({ role: "user", text: question, sources: [], at: now });
        session.messages.push({ role: "assistant", text: result.answer, sources: result.sources || [], at: new Date().toISOString() });
        session.messages = session.messages.slice(-30);
        session.updatedAt = new Date().toISOString();
        if (!session.title || session.title === "Nova conversa") session.title = question.slice(0, 64) || "Nova conversa";
        const tutorialDraft = await generateTutorialDraftFromSession(db, user, session);
        if (tutorialDraft) await saveStructuredKnowledgeArticle(sql, tutorialDraft);
        await saveStructuredSetting(sql, "knowledgeChatSessions", db.knowledgeChatSessions || []);
        await structuredAudit(user, "ASK_KNOWLEDGE_AI", { question: question.slice(0, 180) });
        return sendJson(res, 200, {
          ...result,
          session: publicKnowledgeChatSession(session),
          knowledgeChatSessions: userKnowledgeChatSessions(db, user),
          tutorialDraft: tutorialDraft ? publicKnowledgeArticle(tutorialDraft) : null,
          knowledgeArticles: tutorialDraft ? visibleKnowledgeArticles(db, user) : undefined,
          dataSources: { action: "structured" }
        });
      } catch (error) {
        await structuredAudit(user, "ASK_KNOWLEDGE_AI_ERROR", { error: error.message, question: question.slice(0, 180) });
        return sendJson(res, 400, { error: error.message });
      }
    }

    const knowledgeMatch = url.pathname.match(/^\/api\/knowledge\/([^/]+)$/);
    if (knowledgeMatch && method === "PATCH") {
      if (!canManageKnowledge(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const rows = await sql`SELECT payload FROM crm_knowledge_articles WHERE id = ${knowledgeMatch[1]} LIMIT 1`;
      const article = rows[0]?.payload;
      if (!article?.id) return notFound(res);
      const body = await readBody(req);
      const articleData = normalizeKnowledgePayload(body, article);
      if (!articleData.title) return sendJson(res, 400, { error: "Título obrigatório" });
      if (!articleData.content) return sendJson(res, 400, { error: "Conteúdo obrigatório" });
      Object.assign(article, articleData, { updatedAt: new Date().toISOString(), updatedBy: user.name || user.username });
      await saveStructuredKnowledgeArticle(sql, article);
      await structuredAudit(user, "UPDATE_KNOWLEDGE_ARTICLE", { articleId: article.id, title: article.title });
      const db = await structuredConfigDb(sql);
      return sendJson(res, 200, { knowledgeArticles: visibleKnowledgeArticles(db, user), dataSources: { action: "structured" } });
    }

    if (knowledgeMatch && method === "DELETE") {
      if (!canManageKnowledge(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const rows = await sql`SELECT payload FROM crm_knowledge_articles WHERE id = ${knowledgeMatch[1]} LIMIT 1`;
      const article = rows[0]?.payload;
      if (!article?.id) return notFound(res);
      await sql`DELETE FROM crm_knowledge_articles WHERE id = ${article.id}`;
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "DELETE_KNOWLEDGE_ARTICLE", { articleId: article.id, title: article.title });
      const db = await structuredConfigDb(sql);
      return sendJson(res, 200, { knowledgeArticles: visibleKnowledgeArticles(db, user), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/projects" && method === "POST") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
      const projectDefinitions = await structuredProjectDefinitions(sql);
      if (projectDefinitions.some((project) => project.name.toLowerCase() === name.toLowerCase())) return sendJson(res, 400, { error: "Empreendimento já existe" });
      projectDefinitions.push(normalizeProjectDefinition({
        name,
        unitPrefixes: body.unitPrefixes,
        availabilityEnabled: body.availabilityEnabled !== false,
        blockDefinitions: body.blockDefinitions || [],
        visualMap: body.visualMap || {}
      }, projectDefinitions.length));
      await replaceStructuredProjects(sql, projectDefinitions);
      await structuredAudit(user, "CREATE_PROJECT", { name });
      return sendJson(res, 201, { projects: projectDefinitions.map((project) => project.name), projectDefinitions, dataSources: { action: "structured" } });
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch && method === "PATCH") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const projectDefinitions = await structuredProjectDefinitions(sql);
      const projects = projectDefinitions.map((project) => project.name);
      const index = Number(projectMatch[1]);
      const oldName = projects[index];
      if (!oldName) return notFound(res);
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
      if (projects.some((project, projectIndex) => projectIndex !== index && project.toLowerCase() === name.toLowerCase())) {
        return sendJson(res, 400, { error: "Empreendimento já existe" });
      }
      projectDefinitions[index] = normalizeProjectDefinition({
        ...projectDefinitions[index],
        name,
        unitPrefixes: body.unitPrefixes,
        availabilityEnabled: body.availabilityEnabled !== false,
        blockDefinitions: Array.isArray(body.blockDefinitions) ? body.blockDefinitions : projectDefinitions[index].blockDefinitions,
        visualMap: Object.prototype.hasOwnProperty.call(body, "visualMap") ? body.visualMap : projectDefinitions[index].visualMap
      }, index);
      await replaceStructuredProjects(sql, projectDefinitions);
      const leadRows = await sql`SELECT l.*, false AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
        FROM crm_leads l
        LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
        WHERE l.project = ${oldName} OR l.payload->>'desiredProject' = ${oldName}
        GROUP BY l.id`;
      for (const row of leadRows) {
        const lead = structuredLeadFromRow(row, false, row.tags);
        if (lead.desiredProject === oldName) lead.desiredProject = name;
        if (lead.project === oldName) lead.project = name;
        lead.updatedAt = new Date().toISOString();
        await saveStructuredLead(sql, lead);
      }
      const formRows = await sql`SELECT payload FROM crm_meta_forms WHERE project = ${oldName} OR payload->>'project' = ${oldName}`;
      for (const row of formRows) {
        const form = normalizeMetaFormPayload({ ...(row.payload || {}), project: name });
        if (!form) continue;
        await sql`INSERT INTO crm_meta_forms (id, name, project, archived, ad_url, payload)
          VALUES (${form.id}, ${form.name || ""}, ${form.project || ""}, ${Boolean(form.archived)}, ${form.adUrl || ""}, ${JSON.stringify(form)}::jsonb)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, project = EXCLUDED.project, archived = EXCLUDED.archived, ad_url = EXCLUDED.ad_url, payload = EXCLUDED.payload`;
      }
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "UPDATE_PROJECT", { oldName, name });
      return sendJson(res, 200, { projects: projectDefinitions.map((project) => project.name), projectDefinitions, dataSources: { action: "structured" } });
    }

    if (projectMatch && method === "DELETE") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const projectDefinitions = await structuredProjectDefinitions(sql);
      const projects = projectDefinitions.map((project) => project.name);
      const index = Number(projectMatch[1]);
      const [deletedDefinition] = projectDefinitions.splice(index, 1);
      const deleted = deletedDefinition?.name;
      if (!deleted) return notFound(res);
      await replaceStructuredProjects(sql, projectDefinitions);
      const formRows = await sql`SELECT payload FROM crm_meta_forms WHERE project = ${deleted} OR payload->>'project' = ${deleted}`;
      for (const row of formRows) {
        const form = normalizeMetaFormPayload({ ...(row.payload || {}), project: "" });
        if (!form) continue;
        await sql`INSERT INTO crm_meta_forms (id, name, project, archived, ad_url, payload)
          VALUES (${form.id}, ${form.name || ""}, ${form.project || ""}, ${Boolean(form.archived)}, ${form.adUrl || ""}, ${JSON.stringify(form)}::jsonb)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, project = EXCLUDED.project, archived = EXCLUDED.archived, ad_url = EXCLUDED.ad_url, payload = EXCLUDED.payload`;
      }
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "DELETE_PROJECT", { name: deleted });
      return sendJson(res, 200, { projects: projectDefinitions.map((project) => project.name), projectDefinitions, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/availability-settings" && method === "PUT") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const availabilitySettings = normalizeAvailabilitySettings(body);
      await saveStructuredSetting(sql, "availabilitySettings", availabilitySettings);
      await structuredAudit(user, "UPDATE_AVAILABILITY_SETTINGS", {});
      return sendJson(res, 200, { availabilitySettings, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/units/generate" && method === "POST") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const generatedUnits = await generateStructuredUnitsForBlock(sql, String(body.project || "").trim(), String(body.blockId || body.block || "").trim());
      await structuredAudit(user, "GENERATE_UNITS", { project: body.project, block: body.block || body.blockId, count: generatedUnits.length });
      return sendJson(res, 201, { generated: generatedUnits.length, unitDefinitions: await structuredUnitDefinitions(sql), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/units/import-lev-sales" && method === "POST") {
      if (!(user.role === "Admin TI" && String(user.username || "").toLowerCase() === "admin")) return sendJson(res, 403, { error: "Sem permissão" });
      const result = await importStructuredLevSalesToUnits(sql);
      await structuredAudit(user, "IMPORT_LEV_SALES_TO_UNITS", result);
      return sendJson(res, 200, { ok: true, ...result, unitDefinitions: await structuredUnitDefinitions(sql), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/units" && method === "POST") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const unit = await saveStructuredUnit(sql, body, await structuredProjectDefinitions(sql));
      await structuredAudit(user, "CREATE_UNIT", { project: unit.project, unit: unit.unit });
      return sendJson(res, 201, { unit, unitDefinitions: await structuredUnitDefinitions(sql), dataSources: { action: "structured" } });
    }

    const unitMatch = url.pathname.match(/^\/api\/units\/([^/]+)$/);
    if (unitMatch && method === "PATCH") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const rows = await sql`SELECT payload FROM crm_units WHERE id = ${decodeURIComponent(unitMatch[1])} LIMIT 1`;
      if (!rows[0]) return notFound(res);
      const body = await readBody(req);
      const unit = await saveStructuredUnit(sql, { ...(rows[0].payload || {}), ...body, id: decodeURIComponent(unitMatch[1]) }, await structuredProjectDefinitions(sql));
      await structuredAudit(user, "UPDATE_UNIT", { project: unit.project, unit: unit.unit });
      return sendJson(res, 200, { unit, unitDefinitions: await structuredUnitDefinitions(sql), dataSources: { action: "structured" } });
    }

    if (unitMatch && method === "DELETE") {
      if (user.role !== "Admin TI") return sendJson(res, 403, { error: "Exclusão permitida somente para Admin TI" });
      const unitId = decodeURIComponent(unitMatch[1]);
      const rows = await sql`SELECT project, unit FROM crm_units WHERE id = ${unitId} LIMIT 1`;
      if (!rows[0]) return notFound(res);
      await sql`DELETE FROM crm_units WHERE id = ${unitId}`;
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "DELETE_UNIT", { project: rows[0].project, unit: rows[0].unit });
      return sendJson(res, 200, { unitDefinitions: await structuredUnitDefinitions(sql), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/statuses" && method === "POST") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
      const statusDefinitions = await structuredStatusDefinitions(sql);
      if (statusDefinitions.some((status) => status.status.toLowerCase() === name.toLowerCase())) return sendJson(res, 400, { error: "Status já existe" });
      statusDefinitions.push(normalizeStatusDefinition({ status: name, samCodes: body.samCodes, advanceMode: body.advanceMode, availabilityColor: body.availabilityColor }, statusDefinitions.length));
      await replaceStructuredStatuses(sql, statusDefinitions);
      if (canManageSettings(user) && ("metaConversionEnabled" in body || "metaConversionEventId" in body)) {
        await updateStructuredMetaConversionMapping(sql, "status", name, {
          enabled: body.metaConversionEnabled === true,
          eventId: body.metaConversionEventId
        });
      }
      await structuredAudit(user, "CREATE_STATUS", { name });
      return sendJson(res, 201, { pipelineStatuses: statusDefinitions.map((status) => status.status), statusDefinitions, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/statuses/reorder" && method === "PUT") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const currentStatuses = await structuredPipelineStatuses(sql);
      const statuses = Array.isArray(body.statuses) ? body.statuses.map((status) => String(status).trim()).filter(Boolean) : [];
      if (statuses.length !== currentStatuses.length || new Set(statuses).size !== currentStatuses.length) {
        return sendJson(res, 400, { error: "Sequência inválida" });
      }
      for (const status of currentStatuses) {
        if (!statuses.includes(status)) return sendJson(res, 400, { error: "Sequência inválida" });
      }
      const currentDefinitions = await structuredStatusDefinitions(sql);
      const nextDefinitions = statuses.map((status, position) => normalizeStatusDefinition(currentDefinitions.find((item) => item.status === status) || { status }, position));
      await replaceStructuredStatuses(sql, nextDefinitions);
      await structuredAudit(user, "REORDER_STATUS", { statuses });
      return sendJson(res, 200, { pipelineStatuses: statuses, dataSources: { action: "structured" } });
    }

    const statusMatch = url.pathname.match(/^\/api\/statuses\/(\d+)$/);
    if (statusMatch && method === "PATCH") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const statusDefinitions = await structuredStatusDefinitions(sql);
      const statuses = statusDefinitions.map((status) => status.status);
      const index = Number(statusMatch[1]);
      const oldName = statuses[index];
      if (!oldName) return notFound(res);
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
      if (statuses.some((status, idx) => idx !== index && status.toLowerCase() === name.toLowerCase())) return sendJson(res, 400, { error: "Status já existe" });
      statusDefinitions[index] = normalizeStatusDefinition({ ...statusDefinitions[index], status: name, samCodes: body.samCodes, advanceMode: body.advanceMode, availabilityColor: body.availabilityColor }, index);
      await replaceStructuredStatuses(sql, statusDefinitions);
      if (canManageSettings(user) && ("metaConversionEnabled" in body || "metaConversionEventId" in body)) {
        await updateStructuredMetaConversionMapping(sql, "status", name, {
          enabled: body.metaConversionEnabled === true,
          eventId: body.metaConversionEventId
        }, oldName);
      }
      const leadRows = await sql`SELECT l.*, false AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
        FROM crm_leads l
        LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
        WHERE l.in_pipeline = true AND l.status = ${oldName}
        GROUP BY l.id`;
      for (const row of leadRows) {
        const lead = structuredLeadFromRow(row, false, row.tags);
        lead.status = name;
        lead.updatedAt = new Date().toISOString();
        await saveStructuredLead(sql, lead);
      }
      await structuredAudit(user, "UPDATE_STATUS", { oldName, name });
      return sendJson(res, 200, { pipelineStatuses: statusDefinitions.map((status) => status.status), statusDefinitions, dataSources: { action: "structured" } });
    }

    if (statusMatch && method === "DELETE") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const statusDefinitions = await structuredStatusDefinitions(sql);
      const statuses = statusDefinitions.map((item) => item.status);
      const index = Number(statusMatch[1]);
      const status = statuses[index];
      if (!status) return notFound(res);
      const rows = await sql`SELECT COUNT(*)::int AS count FROM crm_leads WHERE in_pipeline = true AND status = ${status}`;
      if (Number(rows[0]?.count || 0) > 0) return sendJson(res, 400, { error: "Não é possível excluir status usado por leads" });
      statusDefinitions.splice(index, 1);
      await replaceStructuredStatuses(sql, statusDefinitions);
      await removeStructuredMetaConversionMapping(sql, "status", status);
      await structuredAudit(user, "DELETE_STATUS", { status });
      return sendJson(res, 200, { pipelineStatuses: statusDefinitions.map((item) => item.status), statusDefinitions, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/tags" && method === "POST") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
      const rows = await sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`;
      const tags = rows.map((row) => row.payload || {}).filter((tag) => tag.id);
      if (tags.some((tag) => String(tag.name || "").toLowerCase() === name.toLowerCase())) return sendJson(res, 400, { error: "Etiqueta já existe" });
      const tag = { id: `tag-${crypto.randomUUID()}`, name, color: cleanColor(body.color) };
      await sql`INSERT INTO crm_tag_definitions (id, name, color, payload)
        VALUES (${tag.id}, ${tag.name}, ${tag.color}, ${JSON.stringify(tag)}::jsonb)`;
      if (canManageSettings(user) && ("metaConversionEnabled" in body || "metaConversionEventId" in body)) {
        await updateStructuredMetaConversionMapping(sql, "tag", tag.id, {
          enabled: body.metaConversionEnabled === true,
          eventId: body.metaConversionEventId
        });
      }
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "CREATE_TAG", { name });
      return sendJson(res, 201, { tagDefinitions: [...tags, tag], dataSources: { action: "structured" } });
    }

    const tagMatch = url.pathname.match(/^\/api\/tags\/([^/]+)$/);
    if (tagMatch && method === "PATCH") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const rows = await sql`SELECT payload FROM crm_tag_definitions WHERE id = ${tagMatch[1]} LIMIT 1`;
      const tag = rows[0]?.payload;
      if (!tag?.id) return notFound(res);
      const body = await readBody(req);
      const oldName = tag.name;
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
      const allRows = await sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`;
      const tags = allRows.map((row) => row.payload || {}).filter((item) => item.id);
      if (tags.some((item) => item.id !== tag.id && String(item.name || "").toLowerCase() === name.toLowerCase())) return sendJson(res, 400, { error: "Etiqueta já existe" });
      tag.name = name;
      tag.color = cleanColor(body.color);
      await sql`UPDATE crm_tag_definitions SET name = ${tag.name}, color = ${tag.color}, payload = ${JSON.stringify(tag)}::jsonb WHERE id = ${tag.id}`;
      if (canManageSettings(user) && ("metaConversionEnabled" in body || "metaConversionEventId" in body)) {
        await updateStructuredMetaConversionMapping(sql, "tag", tag.id, {
          enabled: body.metaConversionEnabled === true,
          eventId: body.metaConversionEventId
        });
      }
      if (oldName && oldName !== name) {
        await sql`UPDATE crm_lead_tags SET tag_id = ${name} WHERE tag_id = ${oldName}`;
        const leadRows = await sql`SELECT l.*, false AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
          FROM crm_leads l
          LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
          WHERE l.payload->'tags' ? ${oldName}
          GROUP BY l.id`;
        for (const row of leadRows) {
          const lead = structuredLeadFromRow(row, false, row.tags);
          lead.tags = (lead.tags || []).map((item) => item === oldName ? name : item);
          lead.updatedAt = new Date().toISOString();
          await saveStructuredLead(sql, lead);
        }
      }
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "UPDATE_TAG", { oldName, name });
      const nextRows = await sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`;
      return sendJson(res, 200, { tagDefinitions: nextRows.map((row) => row.payload || {}).filter((item) => item.id), dataSources: { action: "structured" } });
    }

    if (tagMatch && method === "DELETE") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const rows = await sql`SELECT payload FROM crm_tag_definitions WHERE id = ${tagMatch[1]} LIMIT 1`;
      const tag = rows[0]?.payload;
      if (!tag?.id) return notFound(res);
      await sql`DELETE FROM crm_tag_definitions WHERE id = ${tag.id}`;
      await sql`DELETE FROM crm_lead_tags WHERE tag_id = ${tag.name} OR tag_id = ${tag.id}`;
      await removeStructuredMetaConversionMapping(sql, "tag", tag.id);
      const leadRows = await sql`SELECT l.*, false AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
        FROM crm_leads l
        LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
        WHERE l.payload->'tags' ? ${tag.name}
        GROUP BY l.id`;
      for (const row of leadRows) {
        const lead = structuredLeadFromRow(row, false, row.tags);
        lead.tags = (lead.tags || []).filter((item) => item !== tag.name && item !== tag.id);
        lead.updatedAt = new Date().toISOString();
        await saveStructuredLead(sql, lead);
      }
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "DELETE_TAG", { name: tag.name });
      const nextRows = await sql`SELECT payload FROM crm_tag_definitions ORDER BY name ASC`;
      return sendJson(res, 200, { tagDefinitions: nextRows.map((row) => row.payload || {}).filter((item) => item.id), dataSources: { action: "structured" } });
    }

    return false;
  } catch (error) {
    mirrorStructuredError("fast-settings", error);
    sendJson(res, 500, { error: "Erro interno", detail: error.message });
    return true;
  }
}

function smlSettingsPayload(value = {}) {
  const legacyMessage = String(value.authorizationMessage || "Olá,\n\nAcesse o link abaixo usando seu e-mail e a senha informada para confirmar as vendas autorizadas para emissão de nota.\n\nO link é temporário e expira no prazo configurado.").trim();
  const template = value.authorizationEmailTemplate || {};
  return {
    commissionPercent: Math.max(0, Number(value.commissionPercent || 0)),
    authorizationExpiryHours: Math.min(720, Math.max(1, Number(value.authorizationExpiryHours || 48))),
    authorizationTo: String(value.authorizationTo || "").trim().toLowerCase(),
    authorizationCc: String(value.authorizationCc || "").trim(),
    authorizationSubject: String(value.authorizationSubject || "Confirmação de vendas — Saint Michel").trim(),
    authorizationMessage: legacyMessage,
    authorizationEmailTemplate: {
      html: sanitizeRichHtml(template.html || legacyMessage.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")),
      fontFamily: String(template.fontFamily || "Arial").trim() || "Arial",
      fontSize: String(template.fontSize || "14px").trim() || "14px",
      color: String(template.color || "#101828").trim() || "#101828",
      lineHeight: String(template.lineHeight || "1.5").trim() || "1.5"
    }
  };
}

function prepareSmlAuthorizationEmail(settings, variables = {}) {
  const template = settings.authorizationEmailTemplate || {};
  let html = String(template.html || "");
  Object.entries(variables).forEach(([key, value]) => {
    html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), String(value ?? ""));
  });
  const content = prepareInlineEmailImages(html, "imagem-convite-sml");
  return {
    html: `<div style="font-family:${escapeHtml(template.fontFamily || "Arial")};font-size:${escapeHtml(template.fontSize || "14px")};color:${escapeHtml(template.color || "#101828")};line-height:${escapeHtml(template.lineHeight || "1.5")}">${content.html}</div>`,
    attachments: content.attachments
  };
}

function parseSmlWorkbook(base64, commissionPercent) {
  const workbook = XLSX.read(Buffer.from(String(base64 || "").replace(/^data:.*?;base64,/, ""), "base64"), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não possui uma aba legível.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === "unidade"));
  if (headerIndex < 0) throw new Error("Coluna Unidade não encontrada.");
  const headers = rows[headerIndex].map((cell) => String(cell).trim().toLowerCase());
  const index = (name) => headers.indexOf(name.toLowerCase());
  const required = ["venda", "unidade", "cliente", "valor prop.", "sinal", "financiamento", "corretor"];
  if (required.some((name) => index(name) < 0)) throw new Error(`A planilha deve conter: ${required.join(", ")}.`);
  return rows.slice(headerIndex + 1).map((row, position) => {
    const unit = String(row[index("unidade")] || "").trim().toUpperCase();
    const contractValue = Number(row[index("valor prop.")] || 0);
    return {
      id: `sml-sale-${String(row[index("venda")] || position + 1).trim()}`,
      externalSaleId: String(row[index("venda")] || "").trim(),
      unit,
      client: String(row[index("cliente")] || "").trim(),
      signedAt: "",
      contractValue,
      signalValue: Number(row[index("sinal")]) || 0,
      financingValue: Number(row[index("financiamento")]) || 0,
      commissionPercent,
      commissionValue: Math.round(contractValue * commissionPercent) / 100,
      realEstate: String(row[index("corretor")] || "").trim(),
      status: "Pendente",
      source: "Relatório de Valores de Venda SML",
      importedAt: new Date().toISOString()
    };
  }).filter((sale) => sale.unit && sale.client && sale.contractValue > 0);
}

async function fastStructuredSmlFinanceRoutes(req, res, url) {
  if (!DATABASE_URL || !url.pathname.startsWith("/api/sml-finance/")) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const method = req.method;
    const publicMatch = url.pathname.match(/^\/api\/sml-finance\/public\/([^/]+)\/(login|confirm)$/);
    if (publicMatch) {
      if (method !== "POST") return sendJson(res, 405, { error: "Método inválido" });
      const body = await readBody(req);
      const tokenHash = crypto.createHash("sha256").update(publicMatch[1]).digest("hex");
      const links = await sql`SELECT * FROM crm_sml_authorization_links WHERE token_hash = ${tokenHash} LIMIT 1`;
      const link = links[0];
      if (!link || new Date(link.expires_at) <= new Date()) return sendJson(res, 410, { error: "Link inválido ou expirado" });
      if (String(body.email || "").trim().toLowerCase() !== String(link.email).toLowerCase() || !verifyPasswordSafe(String(body.password || ""), link.password_hash)) return sendJson(res, 401, { error: "E-mail ou senha inválidos" });
      const saleIds = Array.isArray(link.sale_ids) ? link.sale_ids : [];
      const saleRows = await sql`SELECT payload FROM crm_sml_sales ORDER BY unit ASC`;
      const allowedIds = new Set(saleIds.map(String));
      const sales = saleRows.map((row) => row.payload || {}).filter((sale) => allowedIds.has(String(sale.id)) && sale.status === "Pendente");
      if (publicMatch[2] === "login") return sendJson(res, 200, { sales, expiresAt: link.expires_at });
      const confirmedIds = new Set(Array.isArray(body.saleIds) ? body.saleIds.map(String) : []);
      const confirmed = sales.filter((sale) => confirmedIds.has(sale.id));
      const isTest = Boolean(link.payload?.test);
      if (!isTest) {
        for (const sale of confirmed) {
          const next = { ...sale, status: "Aguardando autorização", smlConfirmedAt: new Date().toISOString() };
          await sql`UPDATE crm_sml_sales SET status = ${next.status}, payload = ${JSON.stringify(next)}::jsonb WHERE id = ${sale.id}`;
        }
      }
      await sql`UPDATE crm_sml_authorization_links SET confirmed_at = now(), payload = ${JSON.stringify({ ...(link.payload || {}), confirmedIds: confirmed.map((sale) => sale.id) })}::jsonb WHERE id = ${link.id}`;
      return sendJson(res, 200, { ok: true, confirmed: confirmed.length, test: isTest });
    }

    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const settingsRows = await sql`SELECT payload FROM crm_settings WHERE key = 'smlFinanceSettings' LIMIT 1`;
    const settings = smlSettingsPayload(settingsRows[0]?.payload || {});

    if (method === "PUT" && url.pathname === "/api/sml-finance/settings") {
      const next = smlSettingsPayload(await readBody(req));
      await saveStructuredSetting(sql, "smlFinanceSettings", next);
      await structuredAudit(user, "UPDATE_SML_FINANCE_SETTINGS", { commissionPercent: next.commissionPercent, authorizationExpiryHours: next.authorizationExpiryHours });
      return sendJson(res, 200, { smlFinance: { settings: next, sales: [], receipts: [], settlements: [] } });
    }
    if (method === "POST" && url.pathname === "/api/sml-finance/import-preview") {
      const body = await readBody(req);
      const sales = parseSmlWorkbook(body.fileBase64, settings.commissionPercent);
      const existing = await sql`SELECT id, unit, payload FROM crm_sml_sales`;
      const existingByUnit = new Map(existing.map((row) => [String(row.unit || "").trim().toUpperCase(), row.payload || { id: row.id, unit: row.unit }]));
      const byUnit = new Map();
      for (const sale of sales) {
        const unit = String(sale.unit || "").trim().toUpperCase();
        if (!byUnit.has(unit)) byUnit.set(unit, []);
        byUnit.get(unit).push(sale);
      }
      const preview = sales.map((sale) => {
        const unit = String(sale.unit || "").trim().toUpperCase();
        const databaseConflict = existingByUnit.get(unit) || null;
        const fileConflicts = byUnit.get(unit) || [];
        return { ...sale, duplicate: Boolean(databaseConflict), databaseConflict, fileConflict: fileConflicts.length > 1, fileConflictIds: fileConflicts.map((item) => item.id) };
      });
      const fileConflicts = [...byUnit.entries()].filter(([, items]) => items.length > 1).map(([unit, items]) => ({ unit, sales: items }));
      return sendJson(res, 200, { preview, fileConflicts, databaseConflicts: preview.filter((sale) => sale.databaseConflict).map((sale) => ({ incoming: sale, existing: sale.databaseConflict })), commissionPercent: settings.commissionPercent });
    }
    if (method === "POST" && url.pathname === "/api/sml-finance/import") {
      const body = await readBody(req);
      const sales = Array.isArray(body.sales) ? body.sales : [];
      const units = sales.map((sale) => String(sale.unit || "").trim().toUpperCase()).filter(Boolean);
      const repeatedUnits = [...new Set(units.filter((unit, index) => units.indexOf(unit) !== index))];
      if (repeatedUnits.length) return sendJson(res, 409, { error: `Há unidades repetidas na importação: ${repeatedUnits.join(", ")}` });
      const existingUnits = await sql`SELECT unit, payload FROM crm_sml_sales`;
      const existingByUnit = new Map(existingUnits.map((row) => [String(row.unit || "").trim().toUpperCase(), row.payload || { unit: row.unit }]));
      const databaseConflicts = units.filter((unit) => existingByUnit.has(unit)).map((unit) => ({ unit, existing: existingByUnit.get(unit) }));
      if (databaseConflicts.length) return sendJson(res, 409, { error: `As unidades ${databaseConflicts.map((item) => item.unit).join(", ")} já existem no Financeiro SML.`, conflicts: databaseConflicts });
      let imported = 0;
      for (const raw of sales) {
        const contractValue = Number(raw.contractValue || 0);
        const sale = { ...raw, signedAt: "", contractValue, commissionPercent: settings.commissionPercent, commissionValue: Math.round(contractValue * settings.commissionPercent) / 100, status: "Pendente", importedAt: new Date().toISOString() };
        if (!sale.id || !sale.unit || !sale.client || contractValue <= 0) continue;
        await sql`INSERT INTO crm_sml_sales (id, unit, client, signed_at, contract_value, signal_value, financing_value, commission_value, realtor_company, zero_entry, status, nf_number, paid_at, payload) VALUES (${sale.id}, ${sale.unit}, ${sale.client}, null, ${sale.contractValue}, ${Number(sale.signalValue || 0)}, ${Number(sale.financingValue || 0)}, ${sale.commissionValue}, ${sale.realEstate || ""}, false, ${sale.status}, '', null, ${JSON.stringify(sale)}::jsonb) ON CONFLICT (id) DO NOTHING`;
        imported += 1;
      }
      await structuredAudit(user, "IMPORT_SML_SALES", { imported });
      return sendJson(res, 200, { ok: true, imported });
    }
    if (method === "POST" && url.pathname === "/api/sml-finance/identify-zero-entry") {
      const saleRows = await sql`SELECT id, payload FROM crm_sml_sales ORDER BY unit ASC`;
      let identified = 0;
      for (const row of saleRows) {
        const sale = row.payload || {};
        const signal = Number(sale.signalValue || 0);
        const financing = Number(sale.financingValue || 0);
        const contract = Number(sale.contractValue || 0);
        const eligible = !sale.zeroEntryDismissed && signal < 1000 && Math.abs((signal + financing) - contract) <= 0.01;
        const next = { ...sale, zeroEntry: eligible };
        if (eligible) identified += 1;
        await sql`UPDATE crm_sml_sales SET zero_entry = ${eligible}, payload = ${JSON.stringify(next)}::jsonb WHERE id = ${row.id}`;
      }
      const refreshed = await sql`SELECT payload FROM crm_sml_sales ORDER BY signed_at DESC NULLS LAST, unit ASC`;
      await structuredAudit(user, "IDENTIFY_SML_ZERO_ENTRY", { identified });
      return sendJson(res, 200, { identified, sales: refreshed.map((row) => row.payload || {}) });
    }
    const zeroEntryMatch = url.pathname.match(/^\/api\/sml-finance\/sales\/([^/]+)\/zero-entry$/);
    if (method === "PATCH" && zeroEntryMatch) {
      const id = decodeURIComponent(zeroEntryMatch[1]);
      const rows = await sql`SELECT payload FROM crm_sml_sales WHERE id = ${id} LIMIT 1`;
      const sale = rows[0]?.payload;
      if (!sale) return sendJson(res, 404, { error: "Venda não encontrada" });
      const next = { ...sale, zeroEntry: false, zeroEntryDismissed: true, zeroEntryDismissedAt: new Date().toISOString(), zeroEntryDismissedBy: user.id };
      await sql`UPDATE crm_sml_sales SET zero_entry = false, payload = ${JSON.stringify(next)}::jsonb WHERE id = ${id}`;
      await structuredAudit(user, "UNCHECK_SML_ZERO_ENTRY", { id, unit: sale.unit });
      return sendJson(res, 200, { sale: next });
    }
    if (method === "POST" && ["/api/sml-finance/send-authorization", "/api/sml-finance/send-authorization-test"].includes(url.pathname)) {
      const isTest = url.pathname.endsWith("-test");
      const targetEmail = isTest ? "renat.cg@gmail.com" : settings.authorizationTo;
      if (!targetEmail) return sendJson(res, 400, { error: "Configure o e-mail do financeiro SML" });
      const saleRows = await sql`SELECT payload FROM crm_sml_sales WHERE status = 'Pendente' ORDER BY unit ASC`;
      const sales = saleRows.map((row) => row.payload || {});
      if (!sales.length) return sendJson(res, 400, { error: "Não há vendas pendentes" });
      const token = crypto.randomBytes(32).toString("hex");
      const password = crypto.randomBytes(5).toString("base64url").toUpperCase();
      const expiresAt = new Date(Date.now() + settings.authorizationExpiryHours * 3600000);
      const id = `sml-auth-${crypto.randomUUID()}`;
      await sql`INSERT INTO crm_sml_authorization_links (id, token_hash, email, password_hash, sale_ids, expires_at, payload) VALUES (${id}, ${crypto.createHash("sha256").update(token).digest("hex")}, ${targetEmail}, ${hashPassword(password)}, ${JSON.stringify(sales.map((sale) => sale.id))}::jsonb, ${expiresAt}, ${JSON.stringify({ createdBy: user.id, test: isTest })}::jsonb)`;
      const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const link = `${origin}/autorizacao-sml/${token}`;
      const subject = `${isTest ? "[TESTE] " : ""}${settings.authorizationSubject}`;
      const accessBlock = `<p><a href="${link}">Acessar confirmação de vendas</a></p><p><strong>E-mail:</strong> ${escapeHtml(targetEmail)}<br><strong>Senha:</strong> ${escapeHtml(password)}</p><p>Este acesso expira em ${settings.authorizationExpiryHours} horas.</p>`;
      const emailContent = prepareSmlAuthorizationEmail(settings, {
        link_confirmacao: `<a href="${link}">Acessar confirmação de vendas</a>`,
        email_acesso: escapeHtml(targetEmail),
        senha_acesso: escapeHtml(password),
        horas_validade: String(settings.authorizationExpiryHours)
      });
      const templateSource = settings.authorizationEmailTemplate?.html || "";
      const hasAccessVariables = ["link_confirmacao", "email_acesso", "senha_acesso", "horas_validade"].every((key) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "i").test(templateSource));
      const email = await sendEmailWithCcFrom(LEV_FINANCE_EMAIL_FROM, targetEmail, isTest ? "" : settings.authorizationCc, subject, `${isTest ? "<p><strong>Este é um teste. Nenhuma confirmação alterará as vendas.</strong></p>" : ""}${emailContent.html}${hasAccessVariables ? "" : accessBlock}`, { attachments: emailContent.attachments });
      await structuredAudit(user, isTest ? "SEND_SML_AUTHORIZATION_TEST" : "SEND_SML_AUTHORIZATION", { count: sales.length, expiresAt: expiresAt.toISOString(), sent: email.sent, to: targetEmail });
      return sendJson(res, 200, { ok: true, sent: email.sent, reason: email.reason || "", expiresAt: expiresAt.toISOString(), to: targetEmail, test: isTest });
    }
    return false;
  } catch (error) {
    mirrorStructuredError("sml-finance", error);
    return sendJson(res, 500, { error: error.message || "Erro no Financeiro SML" });
  }
}

function readEventCaptureSession(req) {
  const authorization = String(req.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (!signature || Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.type === "event-capture" && payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

async function transcribeEventCaptureAudio(audioDataUrl) {
  if (!OPENAI_API_KEY) throw new Error("Transcrição por IA ainda não configurada.");
  const dataUrl = String(audioDataUrl || "");
  const separatorIndex = dataUrl.indexOf(",");
  const metadata = separatorIndex >= 0 ? dataUrl.slice(0, separatorIndex) : "";
  const mimeType = String(metadata.slice(5).split(";")[0] || "").toLowerCase();
  const base64Payload = separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1).replace(/\s/g, "") : "";
  if (!metadata.toLowerCase().startsWith("data:audio/") || !/;base64$/i.test(metadata) || !base64Payload || !/^[a-z0-9+/]+={0,2}$/i.test(base64Payload)) {
    throw new Error("Áudio inválido.");
  }
  const buffer = Buffer.from(base64Payload, "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error("O áudio deve ter no máximo 8 MB.");
  const extension = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("mpeg") || mimeType.includes("mp3")
          ? "mp3"
          : "webm";
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("file", new Blob([buffer], { type: mimeType }), `captacao.${extension}`);
  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form
  });
  const transcription = await transcriptionResponse.json().catch(() => ({}));
  if (!transcriptionResponse.ok) throw new Error(transcription.error?.message || "Não foi possível transcrever o áudio.");
  const transcript = String(transcription.text || "").trim();
  const extractionResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: "Extraia nome completo, email e telefone de uma transcrição em português. Não invente dados. Quando uma informação não estiver presente, use uma string vazia.",
      input: transcript,
      text: {
        format: {
          type: "json_schema",
          name: "event_capture_fields",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" }
            },
            required: ["name", "email", "phone"],
            additionalProperties: false
          }
        }
      },
      max_output_tokens: 300
    })
  });
  const extraction = await extractionResponse.json().catch(() => ({}));
  if (!extractionResponse.ok) throw new Error(extraction.error?.message || "Não foi possível organizar os dados transcritos.");
  const text = extraction.output_text || extraction.output?.flatMap((item) => item.content || []).map((content) => content.text || "").join("").trim();
  const fields = JSON.parse(text || "{}");
  return { transcript, fields: { name: String(fields.name || ""), email: String(fields.email || ""), phone: String(fields.phone || "") } };
}

async function fastStructuredEventCaptureRoutes(req, res, url) {
  if (!DATABASE_URL || !url.pathname.startsWith("/api/event-capture/golf-64")) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    if (req.method === "GET" && url.pathname === "/api/event-capture/golf-64/brokers") {
      const rows = await sql`SELECT payload FROM crm_users WHERE active = true ORDER BY name ASC`;
      const brokers = rows.map((row) => row.payload || {}).filter(isAssignableBroker).map((broker) => ({
        id: broker.id,
        name: broker.name || broker.username || "Corretor",
        hasWhatsapp: Boolean(broker.notifications?.whatsappNumber)
      }));
      return sendJson(res, 200, { brokers });
    }
    if (req.method === "POST" && url.pathname === "/api/event-capture/golf-64/session") {
      const body = await readBody(req);
      const broker = await activeStructuredBroker(sql, String(body.brokerId || ""));
      if (!broker) return sendJson(res, 400, { error: "Selecione um corretor ativo." });
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      const token = signSession({ type: "event-capture", brokerId: broker.id, expiresAt });
      return sendJson(res, 200, { token, expiresAt, broker: { id: broker.id, name: broker.name || broker.username || "Corretor" } });
    }
    const captureSession = readEventCaptureSession(req);
    if (!captureSession) return sendJson(res, 401, { error: "Sessão expirada. Identifique novamente o corretor." });
    const broker = await activeStructuredBroker(sql, captureSession.brokerId);
    if (!broker) return sendJson(res, 401, { error: "Corretor indisponível. Inicie uma nova sessão." });
    if (req.method === "POST" && url.pathname === "/api/event-capture/golf-64/transcribe") {
      const body = await readBody(req);
      return sendJson(res, 200, await transcribeEventCaptureAudio(body.audioDataUrl));
    }
    if (req.method === "POST" && url.pathname === "/api/event-capture/golf-64/leads") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, "").length < 10) return sendJson(res, 400, { error: "Preencha nome completo, e-mail e telefone válidos." });
      const phoneDigits = phone.replace(/\D/g, "");
      const duplicateRows = await sql`SELECT id, name, email, phone FROM crm_leads WHERE lower(email) = ${email} OR regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phoneDigits} LIMIT 1`;
      if (duplicateRows.length) {
        const duplicate = duplicateRows[0];
        return sendJson(res, 409, { error: `Este contato já está cadastrado como ${duplicate.name || "lead"} (${duplicate.email || duplicate.phone || "dados coincidentes"}).` });
      }
      const whatsappNumber = formatWhatsappNumber(broker.notifications?.whatsappNumber);
      if (!whatsappNumber) return sendJson(res, 400, { error: `O WhatsApp de ${broker.name || "corretor"} precisa ser cadastrado antes desta captação.` });
      const statusRows = await sql`SELECT status FROM crm_pipeline_statuses WHERE lower(status) = lower('Atendimento') LIMIT 1`;
      const status = statusRows[0]?.status;
      if (!status) return sendJson(res, 400, { error: "Cadastre o status Atendimento no pipeline antes de usar esta captação." });
      const now = new Date().toISOString();
      const lead = {
        id: `lead-${crypto.randomUUID()}`,
        externalId: `EVENTO-GOLF64-${Date.now()}`,
        name,
        email,
        phone,
        source: "64 OPEN",
        status,
        inPipeline: true,
        assignedTo: broker.id,
        assignedName: broker.name || broker.username || "",
        desiredProject: "Golf Club Resort",
        project: "Golf Club Resort",
        tags: [],
        comments: [],
        favorite: false,
        favoritesByUser: {},
        order: Date.now(),
        createdAt: now,
        updatedAt: now
      };
      await saveStructuredLead(sql, lead);
      await sql`INSERT INTO crm_base_sources (name) VALUES (${lead.source}) ON CONFLICT DO NOTHING`;
      const comments = [];
      if (body.audioDataUrl) comments.push({
        id: `comment-${crypto.randomUUID()}`,
        leadId: lead.id,
        authorId: broker.id,
        authorName: broker.name || "Corretor",
        text: `Áudio da captação no 64º Aberto de Golfe. Transcrição: ${String(body.transcript || "Não disponível").trim()}`,
        audioDataUrl: String(body.audioDataUrl),
        audioMimeType: String(body.audioDataUrl).match(/^data:([^;]+)/)?.[1] || "audio/webm",
        compulsory: true,
        fromUser: false,
        createdAt: now
      });
      const captureSettingsRows = await sql`SELECT payload FROM crm_settings WHERE key = 'eventCaptureSettings' LIMIT 1`;
      const captureSettings = normalizeEventCaptureSettings(captureSettingsRows[0]?.payload || {});
      const emailContent = prepareEventCaptureEmail(captureSettings, { nome_lead: name, nome_corretor: broker.name || "corretor" });
      const emailResult = await sendEmailWithCcFrom(`${captureSettings.senderName} <comercial@golfclubresort.com.br>`, email, "", captureSettings.subject, emailContent.html, {
        apiKey: RESEND_API_KEY_GOLF,
        apiKeyLabel: "RESEND_API_KEY_GOLF",
        attachments: emailContent.attachments
      });
      comments.push({
        id: `comment-${crypto.randomUUID()}`,
        leadId: lead.id,
        authorId: broker.id,
        authorName: broker.name || "Corretor",
        text: emailResult.sent ? `E-mail de agradecimento enviado para ${email}.` : `Não foi possível enviar o e-mail de agradecimento para ${email}: ${emailResult.reason || "falha não informada"}.`,
        compulsory: true,
        fromUser: false,
        createdAt: new Date().toISOString()
      });
      for (const comment of comments) {
        await sql`INSERT INTO crm_lead_comments (id, lead_id, author_user_id, author_name, comment_text, from_user, deleted, created_at, payload) VALUES (${comment.id}, ${lead.id}, ${broker.id}, ${broker.name || ""}, ${comment.text}, false, false, ${dbDate(comment.createdAt)}, ${JSON.stringify(comment)}::jsonb)`;
      }
      const actor = { id: broker.id, username: broker.username || "", name: broker.name || "", role: broker.role || "Corretor" };
      await recordStructuredLeadStatusMovement(sql, { actor, lead, fromStatus: "", toStatus: status, movementType: "create", source: "64 OPEN", screen: "event_capture", statusAt: now });
      await structuredAudit(actor, "CREATE_EVENT_LEAD", { leadId: lead.id, event: "64º Aberto de Golfe", emailSent: emailResult.sent });
      await structuredFup(actor, lead, "CREATE_LEAD", { source: lead.source, assignedTo: lead.assignedName, project: lead.desiredProject });
      const whatsappText = `Olá, ${broker.name || "corretor"}. Sou ${name} e nos encontramos no 64º Aberto de Golfe, em Teresópolis.`;
      return sendJson(res, 201, { ok: true, leadId: lead.id, emailSent: emailResult.sent, whatsappUrl: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappText)}` });
    }
    return false;
  } catch (error) {
    mirrorStructuredError("event-capture", error);
    return sendJson(res, 500, { error: error.message || "Erro na captação do evento." });
  }
}

async function fastStructuredLevFinanceRoutes(req, res, url) {
  if (!DATABASE_URL || !url.pathname.startsWith("/api/lev-finance/")) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });

    const method = req.method;
    const stateDb = await structuredLevFinanceDb(sql);

    if (method === "PUT" && url.pathname === "/api/lev-finance/settings") {
      const body = await readBody(req);
      const currentSettings = stateDb.levFinance.settings || {};
      const nextSettings = normalizeLevFinanceSettingsPayload({
        commissionPercent: body.commissionPercent,
        provisionTo: body.provisionTo,
        provisionCc: body.provisionCc,
        emailTemplate: body.emailTemplate || currentSettings.emailTemplate,
        paymentSchedule: Array.isArray(body.paymentSchedule) ? body.paymentSchedule : currentSettings.paymentSchedule
      });
      stateDb.levFinance.settings = nextSettings;
      await saveStructuredSetting(sql, "levFinanceSettings", nextSettings);
      await structuredAudit(user, "UPDATE_LEV_FINANCE_SETTINGS", { commissionPercent: nextSettings.commissionPercent });
      return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), dataSources: { action: "structured" } });
    }

    if (method === "DELETE" && url.pathname === "/api/lev-finance/data") {
      if (!canResetLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const cleared = {
        sales: stateDb.levFinance.sales.length,
        receipts: stateDb.levFinance.receipts.length,
        paidUnits: stateDb.levFinance.paidUnits.length,
        settlements: stateDb.levFinance.settlements.length
      };
      stateDb.levFinance.sales = [];
      stateDb.levFinance.receipts = [];
      stateDb.levFinance.paidUnits = [];
      stateDb.levFinance.settlements = [];
      stateDb.levFinance.defaultSettlementsCleared = true;
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      await structuredAudit(user, "RESET_LEV_FINANCE_DATA", cleared);
      return sendJson(res, 200, { ok: true, cleared, levFinance: publicLevFinance(stateDb), dataSources: { action: "structured" } });
    }

    if (method === "POST" && url.pathname === "/api/lev-finance/extract") {
      const body = await readBody(req);
      const imageDataUrl = String(body.imageDataUrl || "");
      if (!imageDataUrl.startsWith("data:image/")) return sendJson(res, 400, { error: "Envie uma imagem válida" });
      let rawSales;
      try {
        rawSales = await extractLevSalesFromImage(imageDataUrl);
      } catch (error) {
        await structuredIntegration("LEV_FINANCE", "IMAGE_EXTRACTION_FAILED", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
      const extraction = buildLevExtractionPreview(stateDb, rawSales);
      await structuredAudit(user, "PREVIEW_LEV_SALES_IMAGE", extraction.summary);
      return sendJson(res, 200, { ...extraction, dataSources: { action: "structured" } });
    }

    if (method === "POST" && url.pathname === "/api/lev-finance/import-extracted") {
      const body = await readBody(req);
      const rawSales = Array.isArray(body.sales) ? body.sales : [];
      if (!rawSales.length) return sendJson(res, 400, { error: "Nenhuma venda válida para importar" });
      const settled = levFinanceSettledUnits(stateDb);
      let created = 0;
      let duplicates = 0;
      let paidSkipped = 0;
      let invalidSkipped = 0;
      for (const raw of rawSales) {
        const sale = normalizeLevSale(raw, stateDb.levFinance.settings);
        if (levSaleValidation(stateDb, sale).length) {
          invalidSkipped += 1;
          continue;
        }
        if (settled.has(sale.unit)) {
          paidSkipped += 1;
          continue;
        }
        if (stateDb.levFinance.sales.some((item) => normalizeLevUnit(item.unit) === sale.unit)) {
          duplicates += 1;
          continue;
        }
        stateDb.levFinance.sales.push(sale);
        await mirrorLevSaleToStructuredLead(sql, sale);
        upsertLevSettlement(stateDb, sale, "Extraída, aguardando confirmação", "Imagem submetida no Financeiro Lev");
        created += 1;
      }
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      const summary = { extracted: rawSales.length, created, duplicates, paidSkipped, invalidSkipped };
      await structuredAudit(user, "IMPORT_LEV_SALES_IMAGE", summary);
      return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), summary, dataSources: { action: "structured" } });
    }

    if (method === "POST" && url.pathname === "/api/lev-finance/receipts") {
      const body = await readBody(req);
      const units = String(body.units || "")
        .split(/[\n,;]+/)
        .map((unit) => normalizeLevUnit(unit))
        .filter(Boolean);
      if (!units.length) return sendJson(res, 400, { error: "Informe ao menos uma unidade paga" });
      const amount = parseMoney(body.amount);
      const receivedAt = String(body.receivedAt || saoPauloDateOnly()).trim();
      for (const unit of units) {
        if (!stateDb.levFinance.paidUnits.includes(unit)) stateDb.levFinance.paidUnits.push(unit);
        const sale = stateDb.levFinance.sales.find((item) => normalizeLevUnit(item.unit) === unit) || { unit, commissionValue: amount };
        upsertLevSettlement(stateDb, sale, "Paga", String(body.note || "Recebimento registrado").trim() || "Recebimento registrado");
        stateDb.levFinance.receipts.unshift({
          id: `lev-receipt-${crypto.randomUUID()}`,
          unit,
          amount,
          receivedAt,
          note: String(body.note || "").trim(),
          createdAt: new Date().toISOString(),
          createdBy: user.username
        });
      }
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      await structuredAudit(user, "REGISTER_LEV_RECEIPTS", { units: units.length, amount });
      return sendJson(res, 201, { levFinance: publicLevFinance(stateDb), dataSources: { action: "structured" } });
    }

    if (method === "POST" && url.pathname === "/api/lev-finance/send-to-mauad") {
      const pendingSales = stateDb.levFinance.sales.filter((sale) => isLikelyLevUnit(sale.unit) && levRecordIsPendingMauad(sale) && levRecordIsConfirmedForMauad(sale));
      if (!pendingSales.length) return sendJson(res, 400, { error: "Nenhuma venda confirmada para enviar" });
      const email = await sendLevMauadPendingEmail(sql, stateDb, pendingSales);
      if (!email.sent) {
        await structuredIntegration("LEV_FINANCE", "MAUAD_PENDING_EMAIL_FAILED", { reason: email.reason, count: pendingSales.length });
        return sendJson(res, 400, { error: email.reason || "Não foi possível enviar o e-mail para a Mauad" });
      }
      const now = new Date().toISOString();
      for (const sale of pendingSales) {
        sale.status = "Aguardando autorização";
        sale.authorizationRequestedAt = now;
        sale.authorizationEmailId = email.id || "";
        sale.updatedAt = now;
        upsertLevSettlement(stateDb, sale, "Aguardando autorização", "Enviado para autorização da Mauad");
        await mirrorLevSaleToStructuredLead(sql, sale);
      }
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      await structuredAudit(user, "SEND_LEV_PENDING_TO_MAUAD", { count: pendingSales.length, emailId: email.id || "" });
      return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), email, count: pendingSales.length, dataSources: { action: "structured" } });
    }

    if (method === "POST" && url.pathname === "/api/lev-finance/send-to-mauad-test") {
      const testTo = "renat.cg@gmail.com";
      const pendingSales = stateDb.levFinance.sales.filter((sale) => isLikelyLevUnit(sale.unit) && levRecordIsPendingMauad(sale) && levRecordIsConfirmedForMauad(sale));
      if (!pendingSales.length) return sendJson(res, 400, { error: "Nenhuma venda confirmada para testar" });
      const email = await sendLevMauadPendingEmail(sql, stateDb, pendingSales, {
        to: testTo,
        cc: "",
        subjectPrefix: "[TESTE] ",
        emailOptions: { apiKey: RESEND_API_KEY_TESTE, apiKeyLabel: "RESEND_API_KEY_TESTE" }
      });
      if (!email.sent) {
        await structuredIntegration("LEV_FINANCE", "MAUAD_PENDING_TEST_EMAIL_FAILED", { reason: email.reason, count: pendingSales.length, to: testTo });
        return sendJson(res, 400, { error: email.reason || "Não foi possível enviar o teste para o e-mail autorizado" });
      }
      await structuredAudit(user, "SEND_LEV_PENDING_TEST_TO_MAUAD", { count: pendingSales.length, emailId: email.id || "", to: testTo });
      return sendJson(res, 200, { email, count: pendingSales.length, to: testTo, dataSources: { action: "structured" } });
    }

    const levRecordMatch = url.pathname.match(/^\/api\/lev-finance\/records\/([^/]+)$/);
    if (levRecordMatch && method === "PATCH") {
      const body = await readBody(req);
      const { sale, settlement, unit } = findLevFinanceRecord(stateDb, levRecordMatch[1]);
      if (!sale && !settlement) return notFound(res);
      let targetSale = sale;
      const action = String(body.action || "edit");

      if (action === "edit") {
        applyLevRecordFields(stateDb, sale, settlement, body.fields || {});
      } else if (action === "confirm") {
        targetSale = targetSale || saleFromSettlement(stateDb, settlement);
        targetSale.eligible = true;
        targetSale.status = "Confirmada";
        targetSale.confirmedAt = new Date().toISOString();
        targetSale.confirmedBy = user.username;
        targetSale.commissionPercent = Number(stateDb.levFinance.settings.commissionPercent || targetSale.commissionPercent || 0);
        targetSale.commissionValue = Number(targetSale.contractValue || 0) * (targetSale.commissionPercent / 100);
        upsertLevSettlement(stateDb, targetSale, "Confirmada", "Venda confirmada para envio em lote à Mauad");
        targetSale.updatedAt = new Date().toISOString();
        await mirrorLevSaleToStructuredLead(sql, targetSale);
        await persistStructuredLevFinance(sql, stateDb.levFinance);
        await structuredAudit(user, "CONFIRM_LEV_SALE_ELIGIBILITY", { saleId: targetSale.id, unit: targetSale.unit, batchEmailPending: true });
        return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), email: { sent: false, reason: "Envio em lote pendente" }, dataSources: { action: "structured" } });
      } else if (action === "invoice_issued") {
        targetSale = targetSale || saleFromSettlement(stateDb, settlement);
        targetSale.eligible = true;
        targetSale.status = "NF Emitida";
        targetSale.invoiceNumber = String(body.invoiceNumber || "").trim();
        targetSale.invoiceIssuedAt = String(body.invoiceIssuedAt || saoPauloDateOnly()).trim();
        targetSale.updatedAt = new Date().toISOString();
        upsertLevSettlement(stateDb, targetSale, "NF Emitida", "NF registrada no Financeiro Lev");
      } else if (action === "paid") {
        targetSale = targetSale || saleFromSettlement(stateDb, settlement);
        targetSale.status = "Paga";
        targetSale.paidAt = String(body.paidAt || saoPauloDateOnly()).trim();
        targetSale.updatedAt = new Date().toISOString();
        if (!stateDb.levFinance.paidUnits.includes(targetSale.unit)) stateDb.levFinance.paidUnits.push(targetSale.unit);
        upsertLevSettlement(stateDb, targetSale, "Paga", "Pagamento registrado no Financeiro Lev");
        if (!stateDb.levFinance.receipts.some((receipt) => normalizeLevUnit(receipt.unit) === normalizeLevUnit(targetSale.unit) && receipt.receivedAt === targetSale.paidAt)) {
          stateDb.levFinance.receipts.unshift({
            id: `lev-receipt-${crypto.randomUUID()}`,
            unit: targetSale.unit,
            amount: Number(targetSale.commissionValue || 0),
            receivedAt: targetSale.paidAt,
            note: targetSale.invoiceNumber ? `NF ${targetSale.invoiceNumber}` : "NF paga",
            createdAt: new Date().toISOString(),
            createdBy: user.username
          });
        }
      } else if (action === "ignore") {
        const reason = String(body.reason || body.fields?.ignoreReason || "").trim();
        if (!reason) return sendJson(res, 400, { error: "Informe o motivo para ignorar" });
        targetSale = targetSale || saleFromSettlement(stateDb, settlement);
        targetSale.status = "Ignorada";
        targetSale.ignoreReason = reason;
        targetSale.ignoredAt = new Date().toISOString();
        targetSale.updatedAt = new Date().toISOString();
        upsertLevSettlement(stateDb, targetSale, "Ignorada", reason);
      } else if (action === "create_pipeline_lead") {
        targetSale = targetSale || saleFromSettlement(stateDb, settlement);
        if (!targetSale) return sendJson(res, 400, { error: "Registro financeiro inválido" });
        const lead = await upsertStructuredLeadFromLevSale(sql, user, targetSale);
        targetSale.leadId = lead.id;
        targetSale.leadName = lead.name || "";
        targetSale.updatedAt = new Date().toISOString();
        upsertLevSettlement(stateDb, targetSale, targetSale.status || "Extraída, aguardando confirmação", "Lead criado a partir do Financeiro Lev");
        await persistStructuredLevFinance(sql, stateDb.levFinance);
        await structuredAudit(user, "CREATE_PIPELINE_LEAD_FROM_LEV_RECORD", { leadId: lead.id, unit: normalizeLevUnit(targetSale.unit || unit) });
        return sendJson(res, 200, { lead: publicLead(lead, user), levFinance: publicLevFinance(stateDb), dataSources: { action: "structured" } });
      } else {
        return sendJson(res, 400, { error: "Ação inválida" });
      }

      await mirrorLevSaleToStructuredLead(sql, targetSale || sale || settlement);
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      await structuredAudit(user, "UPDATE_LEV_FINANCE_RECORD", { action, unit: normalizeLevUnit(unit || targetSale?.unit || settlement?.unit) });
      return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), dataSources: { action: "structured" } });
    }

    if (levRecordMatch && method === "DELETE") {
      const { sale, settlement, unit } = findLevFinanceRecord(stateDb, levRecordMatch[1]);
      if (!sale && !settlement) return notFound(res);
      deleteLevFinanceRecord(stateDb, sale, settlement, unit);
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      await structuredAudit(user, "DELETE_LEV_FINANCE_RECORD", { unit: normalizeLevUnit(unit || sale?.unit || settlement?.unit) });
      return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), dataSources: { action: "structured" } });
    }

    const levConfirmMatch = url.pathname.match(/^\/api\/lev-finance\/sales\/([^/]+)\/confirm$/);
    if (levConfirmMatch && method === "POST") {
      const sale = stateDb.levFinance.sales.find((item) => item.id === levConfirmMatch[1]);
      if (!sale) return notFound(res);
      sale.eligible = true;
      sale.status = "Confirmada";
      sale.confirmedAt = new Date().toISOString();
      sale.confirmedBy = user.username;
      sale.commissionPercent = Number(stateDb.levFinance.settings.commissionPercent || sale.commissionPercent || 0);
      sale.commissionValue = Number(sale.contractValue || 0) * (sale.commissionPercent / 100);
      upsertLevSettlement(stateDb, sale, "Confirmada", "Venda confirmada para envio em lote à Mauad");
      sale.updatedAt = new Date().toISOString();
      await mirrorLevSaleToStructuredLead(sql, sale);
      await persistStructuredLevFinance(sql, stateDb.levFinance);
      await structuredAudit(user, "CONFIRM_LEV_SALE_ELIGIBILITY", { saleId: sale.id, unit: sale.unit, batchEmailPending: true });
      return sendJson(res, 200, { levFinance: publicLevFinance(stateDb), email: { sent: false, reason: "Envio em lote pendente" }, dataSources: { action: "structured" } });
    }

    return false;
  } catch (error) {
    mirrorStructuredError("fast-lev-finance", error);
    sendJson(res, 500, { error: "Erro interno", detail: error.message });
    return true;
  }
}

async function fastStructuredSalesReportRoutes(req, res, url) {
  if (!DATABASE_URL || url.pathname !== "/api/sales-report/pdf") return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (!canAccessCommercialSalesReport(user)) return sendJson(res, 403, { error: "Sem permissão" });
    if (req.method !== "POST") return notFound(res);
    const report = await readBody(req);
    const summary = await aiSalesReportSummary(report);
    const pdf = createCommercialSalesReportPdf(report, summary);
    await structuredAudit(user, "EXPORT_COMMERCIAL_SALES_REPORT_PDF", {
      month: report?.period?.month || "",
      sales: report?.metrics?.sales || 0,
      totalSalesValue: report?.metrics?.totalSalesValue || 0
    });
    return sendBuffer(res, 200, pdf, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-comercial-${String(report?.period?.month || "mauad")}.pdf"`
    });
  } catch (error) {
    mirrorStructuredError("sales-report-pdf", error);
    sendJson(res, 500, { error: "Erro ao gerar PDF", detail: error.message });
    return true;
  }
}

async function fastStructuredBackupRoutes(req, res, url) {
  const backupPaths = new Set([
    "/api/admin/export-db",
    "/api/admin/import-db",
    "/api/admin/backup-settings",
    "/api/admin/backup/run",
    "/api/admin/backup/validate",
    "/api/cron/daily-backup"
  ]);
  if (!DATABASE_URL || !backupPaths.has(url.pathname)) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);

    if (url.pathname === "/api/cron/daily-backup") {
      const auth = req.headers.authorization || "";
      if (!BACKUP_SECRET) return sendJson(res, 500, { error: "BACKUP_SECRET/CRON_SECRET ausente" });
      if (auth !== `Bearer ${BACKUP_SECRET}`) return sendJson(res, 401, { error: "Não autorizado" });
      if (req.method !== "GET" && req.method !== "POST") return false;
      const result = await runStructuredBackup(sql, { username: "backup-cron", name: "Backup Cron", role: "Sistema" }, { scheduled: true });
      return sendJson(res, result.ok ? 200 : 500, { ...result, dataSources: { action: "structured" } });
    }

    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });

    if (url.pathname === "/api/admin/backup-settings" && req.method === "GET") {
      const settingsRows = await sql`SELECT payload FROM crm_settings WHERE key = 'backupSettings' LIMIT 1`;
      return sendJson(res, 200, {
        backupSettings: normalizeBackupSettings(settingsRows[0]?.payload || {}),
        dataSources: { action: "structured" }
      });
    }

    if (url.pathname === "/api/admin/backup-settings" && req.method === "PATCH") {
      const body = await readBody(req);
      const currentRows = await sql`SELECT payload FROM crm_settings WHERE key = 'backupSettings' LIMIT 1`;
      const nextSettings = normalizeBackupSettings({
        ...(currentRows[0]?.payload || {}),
        ...body
      });
      await saveStructuredSetting(sql, "backupSettings", nextSettings);
      await structuredAudit(user, "UPDATE_BACKUP_SETTINGS", {
        enabled: nextSettings.enabled,
        emailEnabled: nextSettings.emailEnabled,
        driveEnabled: nextSettings.driveEnabled
      });
      return sendJson(res, 200, { backupSettings: nextSettings, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/admin/backup/validate" && req.method === "GET") {
      const envelope = {
        exportedAt: new Date().toISOString(),
        source: "structured",
        schemaVersion: APP_SCHEMA_VERSION,
        db: await structuredBackupDb(sql)
      };
      const validation = validateStructuredBackupEnvelope(envelope);
      await structuredAudit(user, validation.ok ? "BACKUP_VALIDATED" : "BACKUP_VALIDATION_FAILED", { validation });
      return sendJson(res, validation.ok ? 200 : 500, { validation, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/admin/backup/run" && req.method === "POST") {
      const result = await runStructuredBackup(sql, user, { scheduled: false });
      return sendJson(res, result.ok ? 200 : 500, { ...result, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/admin/export-db" && req.method === "GET") {
      const exported = await structuredBackupDb(sql);
      const envelope = {
        exportedAt: new Date().toISOString(),
        source: "structured",
        schemaVersion: APP_SCHEMA_VERSION,
        db: exported
      };
      const validation = validateStructuredBackupEnvelope(envelope);
      if (!validation.ok) return sendJson(res, 500, { error: "Backup inválido", validation });
      await structuredAudit(user, "EXPORT_STRUCTURED_DATABASE", { leads: exported.leads.length, users: exported.users.length });
      return sendJson(res, 200, {
        ...envelope,
        validation,
        dataSources: { action: "structured" }
      }, {
        "Content-Disposition": `attachment; filename="pipeline-mauad-backup-${saoPauloDateOnly()}.json"`
      });
    }

    if (url.pathname === "/api/admin/import-db" && req.method === "POST") {
      const body = await readBody(req);
      const incoming = body.db || body;
      if (!incoming || !Array.isArray(incoming.users) || !Array.isArray(incoming.leads)) {
        return sendJson(res, 400, { error: "Base inválida" });
      }
      const imported = migrateDb(structuredClone(incoming));
      await syncStructuredDb(imported, user);
      await structuredAudit(user, "IMPORT_STRUCTURED_DATABASE", { leads: imported.leads.length, users: imported.users.length });
      return sendJson(res, 200, {
        ok: true,
        leads: imported.leads.length,
        users: imported.users.length,
        source: "structured",
        dataSources: { action: "structured" }
      });
    }

    return false;
  } catch (error) {
    mirrorStructuredError("fast-backup", error);
    sendJson(res, 500, { error: "Erro interno no backup", detail: error.message });
    return true;
  }
}

async function fastStructuredOperationalRoutes(req, res, url) {
  if (!DATABASE_URL) return false;
  const paths = new Set(["/api/access-log", "/api/logs/fup-lead", "/api/structured-db/diagnostics", "/api/structured-db/sync", "/api/structured-db/reset"]);
  if (!paths.has(url.pathname)) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;

    if (url.pathname === "/api/access-log" && req.method === "POST") {
      const body = await readBody(req);
      const pathName = String(body.path || "");
      const details = { path: pathName, view: body.view || "" };
      await structuredAccess(user, "VIEW", details, req);
      const leadId = String(body.leadId || pathName.match(/^\/leads\/([^/?#]+)/)?.[1] || "").trim();
      if (leadId) {
        const lead = await structuredLeadById(sql, decodeURIComponent(leadId), user);
        if (lead) await structuredFup(user, lead, "VIEW_LEAD_DETAIL", { path: pathName });
      }
      return sendJson(res, 200, { ok: true, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/logs/fup-lead" && req.method === "DELETE") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const rows = await sql`SELECT COUNT(*)::int AS count FROM crm_fup_lead_logs`;
      const cleared = Number(rows[0]?.count || 0);
      await sql`DELETE FROM crm_fup_lead_logs`;
      await structuredAudit(user, "CLEAR_FUP_LEAD_LOG", { cleared });
      return sendJson(res, 200, { ok: true, cleared, dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/structured-db/diagnostics" && req.method === "GET") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      return sendJson(res, 200, { diagnostics: await structuredDbDiagnostics(null), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/structured-db/sync" && req.method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const dataset = String(body.dataset || "all").trim();
      if (dataset !== "all") structuredDataset(dataset);
      const summary = { dataset, structuredOnly: true };
      const runId = crypto.randomUUID();
      await sql`INSERT INTO crm_structured_sync_runs (id, status, finished_at, summary) VALUES (${runId}, 'success', now(), ${JSON.stringify(summary)}::jsonb)`;
      await structuredAudit(user, "CHECK_STRUCTURED_DATABASE", summary);
      return sendJson(res, 200, { runId, summary, diagnostics: await structuredDbDiagnostics(null), dataSources: { action: "structured" } });
    }

    if (url.pathname === "/api/structured-db/reset" && req.method === "POST") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      return sendJson(res, 400, { error: "Reiniciar dados foi desativado porque o banco estruturado já é a fonte oficial." });
    }

    return false;
  } catch (error) {
    mirrorStructuredError("fast-operational", error);
    sendJson(res, 500, { error: "Erro interno", detail: error.message });
    return true;
  }
}

async function fastStructuredMetaRoutes(req, res, url) {
  if (!DATABASE_URL) return false;
  const method = req.method;
  const isMetaRoute = url.pathname === "/api/webhooks/meta" || url.pathname === "/api/cron/meta-sync" || url.pathname === "/api/cron/meta-health";
  if (!isMetaRoute) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);

    if (method === "GET" && url.pathname === "/api/webhooks/meta") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && META_VERIFY_TOKEN && token === META_VERIFY_TOKEN) {
        await structuredIntegration("META", "WEBHOOK_VERIFIED", {});
        return send(res, 200, challenge || "", { "Content-Type": "text/plain; charset=utf-8" });
      }
      await structuredIntegration("META", "WEBHOOK_VERIFY_FAILED", { mode });
      return send(res, 403, "Token inválido", { "Content-Type": "text/plain; charset=utf-8" });
    }

    if (method === "POST" && url.pathname === "/api/webhooks/meta") {
      const rawBody = await readRawBody(req);
      const signature = verifyMetaSignature(req, rawBody);
      if (!signature.ok) {
        await structuredIntegration("META", "WEBHOOK_SIGNATURE_FAILED", { error: signature.error });
        return sendJson(res, signature.status, { error: signature.error });
      }
      let payload;
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        await structuredIntegration("META", "WEBHOOK_INVALID_JSON", {});
        return sendJson(res, 400, { error: "Payload inválido" });
      }
      const leadgenIds = metaLeadgenIdsFromWebhookPayload(payload);
      const db = await structuredMetaRuntimeDb(sql, leadgenIds);
      const result = await processMetaWebhook(db, payload);
      await persistStructuredMetaRuntimeLeads(sql, db, leadgenIds);
      return sendJson(res, 200, { ok: !result.errors.length, ...result, dataSources: { action: "structured" } });
    }

    if (method === "GET" && url.pathname === "/api/cron/meta-sync") {
      const secret = process.env.CRON_SECRET || "";
      if (!secret) return sendJson(res, 500, { error: "CRON_SECRET ausente" });
      if (req.headers.authorization !== `Bearer ${secret}`) return sendJson(res, 401, { error: "Não autorizado" });
      try {
        const result = await syncRecentMetaLeadsStructured(sql, { username: "meta-cron", name: "Meta Cron" }, { days: Number(url.searchParams.get("days") || 2) });
        return sendJson(res, 200, { ok: true, ...result, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "SYNC_CRON_ERROR", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (method === "GET" && url.pathname === "/api/cron/meta-health") {
      const secret = process.env.CRON_SECRET || "";
      if (!secret) return sendJson(res, 500, { error: "CRON_SECRET ausente" });
      if (req.headers.authorization !== `Bearer ${secret}`) return sendJson(res, 401, { error: "Não autorizado" });
      try {
        const result = await analyzeStructuredMetaLeadHealth(sql, { notify: true });
        return sendJson(res, 200, { ok: true, ...result, dataSources: { action: "structured" } });
      } catch (error) {
        await structuredIntegration("META", "HEALTH_CRON_ERROR", { error: error.message });
        return sendJson(res, 400, { error: error.message });
      }
    }

    return false;
  } catch (error) {
    mirrorStructuredError("fast-meta", error);
    await structuredIntegration("META", "WEBHOOK_RUNTIME_ERROR", { path: url.pathname, error: error.message }).catch(() => {});
    sendJson(res, 500, { error: "Erro interno", detail: error.message });
    return true;
  }
}

async function fastStructuredStateResponse(req, res, url) {
  if (!DATABASE_URL || req.method !== "GET" || url.pathname !== "/api/state") return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (canAccessCommercialSalesReport(user) || canAccessLevFinance(user)) {
      await reconcileStructuredSignedOpportunitiesToLev(sql).catch((error) => mirrorStructuredError("lev-opportunity-reconciliation", error));
    }
    await ensureStructuredAvailabilityUnits(sql).catch((error) => mirrorStructuredError("availability-unit-recovery", error));
    const [
      configBundle,
      integrationRows,
      auditRows,
      accessRows,
      fupRows,
      samRows,
      metaConversionRows,
      saleRows,
      receiptRows,
      settlementRows,
      smlSaleRows,
      smlReceiptRows,
      smlSettlementRows,
      presenceRows
    ] = await Promise.all([
      cachedStructuredConfigState(sql),
      canManageSettings(user) ? sql`SELECT payload FROM crm_integration_logs ORDER BY at DESC NULLS LAST LIMIT 50` : Promise.resolve([]),
      canManageSettings(user) ? sql`SELECT payload FROM crm_audit_logs ORDER BY at DESC NULLS LAST LIMIT 25` : Promise.resolve([]),
      canManageSettings(user) ? sql`SELECT payload FROM crm_access_logs ORDER BY at DESC NULLS LAST LIMIT 1000` : Promise.resolve([]),
      (canManageSettings(user) || canAccessCommercialSalesReport(user)) ? sql`SELECT payload FROM crm_fup_lead_logs ORDER BY at DESC NULLS LAST LIMIT 1000` : Promise.resolve([]),
      canManageSettings(user) ? sql`SELECT * FROM crm_sam_events ORDER BY created_at DESC NULLS LAST LIMIT 500` : Promise.resolve([]),
      canManageSettings(user) ? metaCapiRowsForState(sql) : Promise.resolve([]),
      (canAccessCommercialSalesReport(user) || canAccessLevFinance(user)) ? sql`SELECT payload FROM crm_lev_sales ORDER BY signed_at DESC NULLS LAST, unit ASC` : Promise.resolve([]),
      canAccessLevFinance(user) ? sql`SELECT payload FROM crm_lev_receipts ORDER BY paid_at DESC NULLS LAST, unit ASC` : Promise.resolve([]),
      (canAccessCommercialSalesReport(user) || canAccessLevFinance(user)) ? sql`SELECT payload FROM crm_lev_settlements ORDER BY signed_at DESC NULLS LAST, unit ASC` : Promise.resolve([]),
      canAccessLevFinance(user) ? sql`SELECT payload FROM crm_sml_sales ORDER BY signed_at DESC NULLS LAST, unit ASC` : Promise.resolve([]),
      canAccessLevFinance(user) ? sql`SELECT payload FROM crm_sml_receipts ORDER BY paid_at DESC NULLS LAST, unit ASC` : Promise.resolve([]),
      canAccessLevFinance(user) ? sql`SELECT payload FROM crm_sml_settlements ORDER BY signed_at DESC NULLS LAST, unit ASC` : Promise.resolve([]),
      sql`SELECT payload FROM crm_access_logs ORDER BY at DESC NULLS LAST LIMIT 2000`
    ]);
    const {
      settings,
      users,
      projectDefinitions,
      statusDefinitions,
      projects,
      pipelineStatuses,
      tagDefinitions,
      baseSources,
      permissions,
      commercialSettings,
      eventCaptureSettings,
      pipelineFrontSettings,
      integrations,
      knowledgeArticles,
      knowledgeChatSessions,
      unitDefinitions,
      availabilitySettings
    } = configBundle;
    const userPresence = buildUserPresence(users, presenceRows, sessionTtlMsFromCommercialSettings(commercialSettings), await redisPresenceForUsers(users));
    const marketingRows = await sql`SELECT data FROM crm_marketing_state WHERE id = 'main' LIMIT 1`;
    const structuredMarketing = normalizeMarketingData(marketingRows[0]?.data);
    const stateDb = {
      roles: ROLES,
      users,
      projects: projects.length ? projects : DEFAULT_PROJECTS,
      pipelineStatuses,
      tagDefinitions: tagDefinitions.length ? tagDefinitions : DEFAULT_TAG_DEFINITIONS,
      leads: [],
      integrations,
      permissions,
      baseAccessSources: baseSources,
      unitDefinitions,
      availabilitySettings,
      baseAccess: structuredBaseAccessFromPermissions(permissions, baseSources.length ? baseSources : allBaseSources({ leads: [] })),
      knowledgeArticles,
      knowledgeChatSessions,
      commercialSettings,
      eventCaptureSettings,
      pipelineFrontSettings,
      levFinance: {
        settings: settings.levFinanceSettings || {},
        sales: saleRows.map((row) => row.payload || {}).filter((item) => item.id || item.unit),
        receipts: receiptRows.map((row) => row.payload || {}).filter((item) => item.id || item.unit),
        paidUnits: [],
        settlements: settlementRows.map((row) => row.payload || {}).filter((item) => item.id || item.unit)
      },
      smlFinance: {
        settings: settings.smlFinanceSettings || {},
        sales: smlSaleRows.map((row) => row.payload || {}).filter((item) => item.id || item.unit),
        receipts: smlReceiptRows.map((row) => row.payload || {}).filter((item) => item.id || item.unit),
        paidUnits: [],
        settlements: smlSettlementRows.map((row) => row.payload || {}).filter((item) => item.id || item.unit)
      }
    };
    ensurePermissions(stateDb);
    return sendJson(res, 200, {
      user: publicUser(user),
      roles: ROLES,
      projects: stateDb.projects,
      projectDefinitions,
      unitDefinitions: stateDb.unitDefinitions || [],
      availabilitySettings: stateDb.availabilitySettings || normalizeAvailabilitySettings({}),
      pipelineStatuses: stateDb.pipelineStatuses,
      statusDefinitions,
      tagDefinitions: stateDb.tagDefinitions,
      users: stateDb.users,
      userPresence,
      leads: [],
      integrations: canManageSettings(user) ? stateDb.integrations : null,
      baseAccess: canManagePipelineSettings(user) ? stateDb.baseAccess : null,
      permissions: canManagePipelineSettings(user) ? stateDb.permissions : null,
      currentPermissions: stateDb.permissions.users?.[user.id] || {},
      permissionResources: canManagePipelineSettings(user) ? permissionResources(stateDb) : [],
      baseAccessSources: allBaseSources(stateDb),
      accessibleBaseSources: accessibleBaseSources(stateDb, user),
      actionableBaseSources: allBaseSources(stateDb).filter((source) => permissionForUser(stateDb, user, basePermissionId(source)).action),
      knowledgeCategories: KNOWLEDGE_CATEGORIES,
      knowledgeArticles: visibleKnowledgeArticles(stateDb, user),
      knowledgeChatSessions: userKnowledgeChatSessions(stateDb, user),
      canManageKnowledge: canManageKnowledge(user),
      canCreateKnowledge: canCreateKnowledge(user),
      integrationLog: integrationRows.map((row) => row.payload || {}).filter((item) => item.at),
      auditLog: auditRows.map((row) => row.payload || {}).filter((item) => item.at),
      samEvents: samRows.map(samEventFromRow).filter((event) => event.id),
      metaConversionEvents: metaConversionRows,
      accessLog: accessRows.map((row) => row.payload || {}).filter((item) => item.at),
      fupLeadLog: fupRows.map((row) => row.payload || {}).filter((item) => item.at),
      dataSources: {
        state: "structured",
        logs: "structured",
        config: configBundle.source || "structured",
        presence: redisEnabled() ? "redis" : "structured"
      },
      commercialSettings: stateDb.commercialSettings,
      eventCaptureSettings: canManageEventCaptureSettings(user) ? stateDb.eventCaptureSettings : null,
      pipelineFrontSettings: stateDb.pipelineFrontSettings,
      backupSettings: canManageSettings(user) ? normalizeBackupSettings(settings.backupSettings || {}) : null,
      marketing: structuredMarketing,
      levFinance: (canAccessCommercialSalesReport(user) || canAccessLevFinance(user)) ? publicLevFinance(stateDb) : null,
      smlFinance: canAccessLevFinance(user) ? stateDb.smlFinance : null
    });
  } catch (error) {
    mirrorStructuredError("state", error);
    sendJson(res, 500, { error: "Erro ao carregar estado estruturado", detail: error.message });
    return true;
  }
}

async function fastStructuredMarketingRoutes(req, res, url) {
  if (!DATABASE_URL || !url.pathname.startsWith("/api/marketing/")) return false;
  const supported = url.pathname === "/api/marketing/budget-categories"
    || url.pathname === "/api/marketing/budget-entries"
    || /^\/api\/marketing\/reconciliation\/[^/]+\/create-expense$/.test(url.pathname)
    || /^\/api\/marketing\/provisions\/[^/]+\/pay$/.test(url.pathname);
  if (!supported || req.method !== "POST") return false;
  try {
    const sql = await getSql();
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    const permission = await structuredPermissionForUser(sql, user, "screen:marketing");
    if (!permission.action) return sendJson(res, 403, { error: "Sem permissão" }), true;
    const rows = await sql`SELECT data FROM crm_marketing_state WHERE id = 'main' LIMIT 1`;
    const marketing = normalizeMarketingData(rows[0]?.data);
    const body = await readBody(req);
    let result;
    let auditAction;
    let auditDetails;

    if (url.pathname === "/api/marketing/budget-categories") {
      const name = String(body.name || "").trim();
      const group = String(body.group || "").trim();
      if (!name || !marketing.budgetGroups.includes(group)) return sendJson(res, 400, { error: "Nome e grupo financeiro válido são obrigatórios" }), true;
      if (marketing.budgetCategories.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return sendJson(res, 409, { error: "Categoria já cadastrada" }), true;
      const category = { id: `mkt-cat-${crypto.randomUUID()}`, name, group, active: true, createdAt: new Date().toISOString(), createdBy: user.username };
      marketing.budgetCategories.push(category);
      result = { category };
      auditAction = "CREATE_MARKETING_BUDGET_CATEGORY";
      auditDetails = { categoryId: category.id, name, group };
    } else if (url.pathname === "/api/marketing/budget-entries") {
      const category = marketing.budgetCategories.find((item) => item.id === body.categoryId && item.active !== false);
      const competence = String(body.competence || "").slice(0, 7);
      const amount = Number(body.amount);
      const project = String(body.project || "").trim();
      if (!category || !/^\d{4}-\d{2}$/.test(competence) || !project || !Number.isFinite(amount) || amount < 0) return sendJson(res, 400, { error: "Categoria, empreendimento, competência e valor válido são obrigatórios" }), true;
      const entry = { id: `mkt-budget-${crypto.randomUUID()}`, categoryId: category.id, categoryName: category.name, group: category.group, project, competence, amount, notes: String(body.notes || "").trim(), createdAt: new Date().toISOString(), createdBy: user.username };
      marketing.budgetEntries.push(entry);
      result = { entry };
      auditAction = "CREATE_MARKETING_BUDGET_ENTRY";
      auditDetails = { entryId: entry.id, categoryId: category.id, project, competence, amount };
    } else if (url.pathname.includes("/reconciliation/")) {
      const reconciliationId = decodeURIComponent(url.pathname.match(/^\/api\/marketing\/reconciliation\/([^/]+)\/create-expense$/)[1]);
      const candidate = marketing.reconciliationQueue.find((item) => item.id === reconciliationId);
      if (!candidate || candidate.status !== "pending") return sendJson(res, candidate ? 400 : 404, { error: candidate ? "Item de conciliação já tratado" : "Item de conciliação não encontrado" }), true;
      const expense = { ...candidate.expense, id: `mkt-exp-${crypto.randomUUID()}`, project: String(body.project || candidate.expense?.project || "").trim(), source: "manual_reconciliation", reconciliationId, createdAt: new Date().toISOString(), createdBy: user.username };
      if (!expense.project || !expense.paymentDate || !Number.isFinite(Number(expense.paidAmount))) return sendJson(res, 400, { error: "Empreendimento, data de pagamento e valor são obrigatórios" }), true;
      marketing.actualExpenses.push(expense);
      Object.assign(candidate, { status: "created_historical_expense", resolvedAt: new Date().toISOString(), resolvedBy: user.username, expenseId: expense.id });
      result = { expense, reconciliation: candidate };
      auditAction = "CREATE_MARKETING_HISTORICAL_EXPENSE";
      auditDetails = { reconciliationId, expenseId: expense.id, project: expense.project, paidAmount: expense.paidAmount };
    } else {
      const provisioningId = decodeURIComponent(url.pathname.match(/^\/api\/marketing\/provisions\/([^/]+)\/pay$/)[1]);
      const existingExpense = marketing.actualExpenses.find((item) => item.provisioningId === provisioningId);
      if (existingExpense) return sendJson(res, 200, { expense: existingExpense, idempotent: true, marketing }), true;
      const paidAmount = Number(body.paidAmount);
      const paymentDate = String(body.paymentDate || "").slice(0, 10);
      if (!body.project || !paymentDate || !Number.isFinite(paidAmount)) return sendJson(res, 400, { error: "Empreendimento, data de pagamento e valor são obrigatórios" }), true;
      const now = new Date().toISOString();
      let provision = marketing.provisions.find((item) => item.id === provisioningId);
      if (!provision) { provision = { id: provisioningId, createdAt: now }; marketing.provisions.push(provision); }
      Object.assign(provision, { eventId: String(body.eventId || provision.eventId || ""), eventName: String(body.eventName || provision.eventName || ""), project: String(body.project), supplier: String(body.supplier || ""), label: String(body.label || ""), expectedAmount: Number(body.expectedAmount || paidAmount), paidAmount, paymentDate, document: String(body.document || ""), status: "paid", paidAt: now, paidBy: user.username, updatedAt: now });
      const expense = { id: `mkt-exp-${crypto.randomUUID()}`, project: provision.project, projectCode: provision.project === "Reserva Guinle" ? "RGL" : provision.project === "Golf Club Resort" ? "GOLF" : "", creditorName: provision.supplier, financialPlanName: "Ações e eventos", document: provision.document, paymentDate, originalAmount: provision.expectedAmount, paidAmount, notes: provision.label || provision.eventName, source: "provisioning", provisioningId, eventId: provision.eventId, createdAt: now, createdBy: user.username };
      marketing.actualExpenses.push(expense);
      result = { provision, expense };
      auditAction = "PAY_MARKETING_PROVISION";
      auditDetails = { provisioningId, expenseId: expense.id, eventId: provision.eventId, project: provision.project, paidAmount, paymentDate };
    }

    await sql`UPDATE crm_marketing_state SET data = ${JSON.stringify(marketing)}::jsonb, updated_at = now() WHERE id = 'main'`;
    await structuredAudit(user, auditAction, auditDetails);
    return sendJson(res, 201, { ...result, marketing }), true;
  } catch (error) {
    mirrorStructuredError("marketing", error);
    return sendJson(res, 500, { error: "Erro ao atualizar Marketing", detail: error.message }), true;
  }
}

async function fastStructuredPresenceResponse(req, res, url) {
  if (!DATABASE_URL || req.method !== "GET" || url.pathname !== "/api/presence") return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql, { refreshCookie: false, touchPresence: false });
    if (!user) return true;
    const [userRows, settingsRows, presenceRows] = await Promise.all([
      sql`SELECT * FROM crm_users WHERE active = true ORDER BY name ASC, username ASC`,
      sql`SELECT payload FROM crm_settings WHERE key = 'commercialSettings' LIMIT 1`,
      sql`SELECT payload FROM crm_access_logs ORDER BY at DESC NULLS LAST LIMIT 1000`
    ]);
    const users = userRows.map((row) => publicUser(structuredUserFromAuthRow(row))).filter((item) => item.id);
    const commercialSettings = normalizeCommercialSettingsPayload(settingsRows[0]?.payload || {});
    void redisTouchPresence(user, 90 * 1000, req).catch((error) => mirrorStructuredError("redis-presence-poll", error));
    const userPresence = buildUserPresence(users, presenceRows, sessionTtlMsFromCommercialSettings(commercialSettings), await redisPresenceForUsers(users));
    return sendJson(res, 200, {
      users,
      userPresence,
      dataSources: { presence: redisEnabled() ? "redis" : "structured" }
    });
  } catch (error) {
    mirrorStructuredError("presence", error);
    sendJson(res, 500, { error: "Erro ao carregar presença", detail: error.message });
    return true;
  }
}

async function structuredLeadsForState(db, user, scope = "all") {
  const fallbackLeads = visibleLeads(db, user).filter((lead) => leadMatchesScope(lead, scope));
  const fallback = {
    leads: fallbackLeads.map((lead) => publicLeadSummary(lead, user)),
    source: "legacy"
  };
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return fallback;
    let rows;
    if (scope === "pipeline") {
      rows = await sql`SELECT payload FROM crm_leads WHERE in_pipeline = true ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`;
    } else if (scope === "bases") {
      rows = await sql`SELECT payload FROM crm_leads
        WHERE in_pipeline = false
          OR source IN ('META', 'Stand', 'Lista RMeirelles')
          OR payload->>'sourceStatus' IS NOT NULL
          OR payload->>'odysseiaStatus' IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`;
    } else {
      rows = await sql`SELECT payload FROM crm_leads ORDER BY in_pipeline DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST`;
    }
    let leads = await attachStructuredOpportunities(sql, rows.map((row) => row.payload || {}).filter((item) => item.id));
    if (scope === "pipeline") leads = await attachStructuredCommentPreviews(sql, leads);
    const visibleStructuredLeads = visibleLeadsFromList(db, user, leads).filter((lead) => leadMatchesScope(lead, scope));
    if (fallbackLeads.length && visibleStructuredLeads.length < Math.floor(fallbackLeads.length * 0.95)) return fallback;
    return {
      leads: visibleStructuredLeads.map((lead) => publicLeadSummary(lead, user)),
      source: "structured"
    };
  } catch (error) {
    mirrorStructuredError("leads-state", error);
    return fallback;
  }
}

async function structuredUserFromSession(req, res, sql, options = {}) {
  const refreshCookie = options.refreshCookie !== false;
  const touchPresence = options.touchPresence !== false;
  const session = readSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Login necessário" });
    return null;
  }
  const rows = await sql`SELECT * FROM crm_users WHERE id = ${session.userId} AND active = true LIMIT 1`;
  const user = structuredUserFromAuthRow(rows[0]);
  if (!user?.id) {
    sendJson(res, 401, { error: "Usuário inativo" });
    return null;
  }
  const ttlMs = await structuredSessionTtlMs(sql);
  if (refreshCookie) res.setHeader("Set-Cookie", sessionCookie(user.id, ttlMs));
  if (touchPresence) void redisTouchPresence(user, ttlMs, req).catch((error) => mirrorStructuredError("redis-presence", error));
  return user;
}

function structuredUserFromAuthRow(row) {
  if (!row) return null;
  return {
    ...(row.payload || {}),
    id: row.id,
    username: row.username || row.payload?.username || "",
    name: row.name || row.payload?.name || "",
    role: row.role || row.payload?.role || "",
    active: row.active !== false,
    operatesAsBroker: Boolean(row.operates_as_broker ?? row.payload?.operatesAsBroker),
    notifications: row.notifications || row.payload?.notifications || {},
    photoUrl: row.photo_url || row.payload?.photoUrl || "",
    passwordHash: row.password_hash || "",
    passwordSetup: row.password_setup || row.payload?.passwordSetup || null
  };
}

function parseDataImage(photoUrl) {
  const match = String(photoUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return null;
  try {
    return {
      contentType: match[1],
      buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64")
    };
  } catch {
    return null;
  }
}

async function structuredUserBySetupToken(sql, token) {
  const tokenHash = hashToken(String(token || ""));
  if (!tokenHash) return null;
  const rows = await sql`SELECT * FROM crm_users WHERE password_setup->>'tokenHash' = ${tokenHash} LIMIT 1`;
  const user = structuredUserFromAuthRow(rows[0]);
  if (!user?.passwordSetup?.expiresAt) return null;
  if (new Date(user.passwordSetup.expiresAt).getTime() <= Date.now()) return null;
  return user;
}

async function fastStructuredAuthRoutes(req, res, url) {
  if (!DATABASE_URL) return false;
  const userPhotoMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/photo$/);
  const authPaths = new Set(["/api/login", "/api/logout", "/api/me", "/api/profile", "/api/password/setup/validate", "/api/password/setup"]);
  if (!authPaths.has(url.pathname) && !userPhotoMatch) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);

    if (req.method === "GET" && userPhotoMatch) {
      const viewer = await structuredUserFromSession(req, res, sql);
      if (!viewer) return true;
      const targetId = decodeURIComponent(userPhotoMatch[1] || "");
      const rows = await sql`SELECT * FROM crm_users WHERE id = ${targetId} AND active = true LIMIT 1`;
      const target = structuredUserFromAuthRow(rows[0]);
      const image = parseDataImage(target?.photoUrl || "");
      if (!image?.buffer?.length) return notFound(res);
      return sendBuffer(res, 200, image.buffer, {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=300"
      });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(req);
      const login = String(body.username || "").trim().toLowerCase();
      const rows = await sql`SELECT * FROM crm_users WHERE lower(username) = ${login} AND active = true LIMIT 1`;
      const user = structuredUserFromAuthRow(rows[0]);
      const password = String(body.password || "");
      if (!user) {
        return sendJson(res, 401, { error: "Usuário ou senha inválidos" });
      }
      if (!user.passwordHash && !user.passwordSetup) {
        return sendJson(res, 401, { error: "Usuário ou senha inválidos" });
      }
      if (!user.passwordHash) return sendJson(res, 403, { error: "Senha ainda não cadastrada. Use o link enviado por e-mail." });
      if (!verifyPasswordSafe(password, user.passwordHash)) {
        return sendJson(res, 401, { error: "Usuário ou senha inválidos" });
      }
      void structuredAudit(user, "LOGIN", { path: "/login", view: "Login", source: "structured" })
        .catch((error) => mirrorStructuredError("login-audit", error));
      void structuredAccess(user, "LOGIN", { path: "/login", view: "Login", source: "structured" }, req)
        .catch((error) => mirrorStructuredError("login-access", error));
      const ttlMs = await structuredSessionTtlMs(sql);
      void redisTouchPresence(user, ttlMs, req, true).catch((error) => mirrorStructuredError("redis-login-presence", error));
      return sendJson(res, 200, { user: publicUser(user), dataSources: { auth: "structured" } }, {
        "Set-Cookie": sessionCookie(user.id, ttlMs)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      const session = readSession(req);
      if (session?.userId) {
        const rows = await sql`SELECT * FROM crm_users WHERE id = ${session.userId} LIMIT 1`;
        const logoutUser = structuredUserFromAuthRow(rows[0]);
        if (logoutUser?.id) {
          await redisClearPresence(logoutUser.id);
          void structuredAccess(logoutUser, "LOGOUT", { path: "/logout", view: "Logout", source: "structured" }, req)
            .catch((error) => mirrorStructuredError("logout-access", error));
        }
      }
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = await structuredUserFromSession(req, res, sql);
      if (!user) return true;
      return sendJson(res, 200, { user: publicUser(user), dataSources: { auth: "structured" } });
    }

    if (req.method === "PATCH" && url.pathname === "/api/profile") {
      const user = await structuredUserFromSession(req, res, sql);
      if (!user) return true;
      const targetRows = await sql`SELECT * FROM crm_users WHERE id = ${user.id} LIMIT 1`;
      const target = structuredUserFromAuthRow(targetRows[0]);
      if (!target) return notFound(res);
      const body = await readBody(req);
      if (Object.prototype.hasOwnProperty.call(body, "name")) {
        const nextName = String(body.name || "").trim();
        if (!nextName) return sendJson(res, 400, { error: "Nome de exibição é obrigatório" });
        target.name = nextName;
      }
      if (Object.prototype.hasOwnProperty.call(body, "notifications")) {
        target.notifications = normalizeNotificationPreferences(body.notifications);
      }
      if (Object.prototype.hasOwnProperty.call(body, "photoUrl")) {
        const photoUrl = String(body.photoUrl || "");
        if (photoUrl && !photoUrl.startsWith("data:image/")) return sendJson(res, 400, { error: "Foto inválida" });
        if (photoUrl.length > 650000) return sendJson(res, 400, { error: "Foto muito grande" });
        target.photoUrl = photoUrl;
      }
      target.updatedAt = new Date().toISOString();
      await saveStructuredUser(sql, target);
      await structuredAudit(user, "UPDATE_OWN_PROFILE", { userId: target.id });
      return sendJson(res, 200, { user: publicUser(target), dataSources: { action: "structured" } });
    }

    if (req.method === "POST" && url.pathname === "/api/password/setup/validate") {
      const body = await readBody(req);
      const target = await structuredUserBySetupToken(sql, body.token);
      if (!target) return false;
      return sendJson(res, 200, { user: { name: target.name, username: target.username }, dataSources: { auth: "structured" } });
    }

    if (req.method === "POST" && url.pathname === "/api/password/setup") {
      const body = await readBody(req);
      const target = await structuredUserBySetupToken(sql, body.token);
      if (!target) return false;
      const password = String(body.password || "");
      if (password !== String(body.confirmPassword || "")) return sendJson(res, 400, { error: "As senhas não conferem" });
      const policyError = validatePasswordPolicy(password);
      if (policyError) return sendJson(res, 400, { error: policyError });
      target.passwordHash = hashPassword(password);
      target.passwordSetup = null;
      target.updatedAt = new Date().toISOString();
      await saveStructuredUser(sql, target);
      await structuredAudit(target, "SET_PASSWORD", { userId: target.id, source: "structured" });
      return sendJson(res, 200, { ok: true, dataSources: { auth: "structured" } });
    }
    return false;
  } catch (error) {
    mirrorStructuredError("auth", error);
    return false;
  }
}

async function fastStructuredUserPermissionRoutes(req, res, url) {
  if (!DATABASE_URL) return false;
  const isUserCollection = url.pathname === "/api/users";
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  const inviteMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/invite$/);
  const notificationTestMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/notification-test$/);
  const assignmentNotificationTestMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/assignment-notification-test$/);
  const isBaseAccess = url.pathname === "/api/base-access";
  const isPermissions = url.pathname === "/api/permissions";
  if (!isUserCollection && !userMatch && !inviteMatch && !notificationTestMatch && !assignmentNotificationTestMatch && !isBaseAccess && !isPermissions) return false;

  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;

    if (isUserCollection && req.method === "POST") {
      if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const username = String(body.username || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) return sendJson(res, 400, { error: "E-mail inválido ou já existente" });
      const existingRows = await sql`SELECT id FROM crm_users WHERE lower(username) = ${username} LIMIT 1`;
      if (existingRows.length) return sendJson(res, 400, { error: "E-mail inválido ou já existente" });
      if (!manageableRoles(user).includes(body.role)) return sendJson(res, 400, { error: "Perfil inválido" });
      const now = new Date().toISOString();
      const newUser = {
        id: `user-${crypto.randomUUID()}`,
        name: String(body.name || username).trim(),
        username,
        role: body.role,
        active: Boolean(body.active),
        operatesAsBroker: ["Head Comercial", "Supervisor Comercial"].includes(body.role) && Boolean(body.operatesAsBroker),
        notifications: normalizeNotificationPreferences(body.notifications),
        passwordHash: null,
        createdAt: now,
        updatedAt: now
      };
      const token = createPasswordSetup(newUser);
      await saveStructuredUser(sql, newUser);
      const permissionDb = await structuredStateForPermissions(sql, await structuredUsers(sql));
      await saveStructuredPermissions(sql, permissionDb.permissions);
      const invitation = await sendPasswordSetupEmail(req, newUser, token);
      await structuredAudit(user, "CREATE_USER", { userId: newUser.id, role: newUser.role, invitationSent: invitation.sent });
      return sendJson(res, 201, { user: publicUser(newUser), invitation, dataSources: { action: "structured" } });
    }

    if (userMatch && req.method === "PATCH") {
      if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const targetRows = await sql`SELECT * FROM crm_users WHERE id = ${decodeURIComponent(userMatch[1])} LIMIT 1`;
      const target = structuredUserFromAuthRow(targetRows[0]);
      if (!target) return notFound(res);
      if (!manageableRoles(user).includes(target.role)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      if (Object.prototype.hasOwnProperty.call(body, "role") && !manageableRoles(user).includes(body.role)) {
        return sendJson(res, 400, { error: "Perfil inválido" });
      }
      if (Object.prototype.hasOwnProperty.call(body, "username")) {
        if (user.role !== "Admin TI") return sendJson(res, 403, { error: "Apenas Admin TI pode alterar o e-mail de acesso" });
        const nextUsername = String(body.username || "").trim().toLowerCase();
        const isBuiltinAdmin = target.role === "Admin TI" && String(target.username || "").toLowerCase() === "admin";
        if (!isBuiltinAdmin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextUsername)) return sendJson(res, 400, { error: "E-mail inválido" });
        const emailRows = await sql`SELECT id FROM crm_users WHERE lower(username) = ${nextUsername} AND id <> ${target.id} LIMIT 1`;
        if (emailRows.length) return sendJson(res, 400, { error: "Este e-mail já está em uso por outro usuário" });
        if (!isBuiltinAdmin || nextUsername !== "admin") target.username = nextUsername;
      }
      const currentAssignableBroker = isAssignableBroker(target);
      const willDeactivateBroker = currentAssignableBroker && target.active && body.active === false;
      let reassignedLeads = 0;
      if (willDeactivateBroker) {
        const assignedRows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags FROM crm_leads l WHERE l.in_pipeline = true AND l.assigned_to = ${target.id}`;
        if (assignedRows.length) {
          const replacement = body.reassignTo ? await activeStructuredBroker(sql, body.reassignTo) : null;
          if (!replacement || replacement.id === target.id) {
            return sendJson(res, 409, {
              error: "Escolha um corretor ativo para receber os leads antes de inativar este corretor",
              requiresReassignment: true,
              leadCount: assignedRows.length
            });
          }
          for (const row of assignedRows) {
            const lead = structuredLeadFromRow(row, false, []);
            lead.assignedTo = replacement.id;
            lead.assignedName = replacement.name;
            lead.updatedAt = new Date().toISOString();
            await saveStructuredLead(sql, lead);
            await structuredFup(user, lead, "ASSIGN_BROKER", { from: target.name || "", to: replacement.name || "", reason: "Inativação de usuário" });
            reassignedLeads += 1;
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, "name")) target.name = String(body.name || "").trim();
      if (Object.prototype.hasOwnProperty.call(body, "role")) target.role = body.role;
      if (Object.prototype.hasOwnProperty.call(body, "active")) target.active = Boolean(body.active);
      if (Object.prototype.hasOwnProperty.call(body, "operatesAsBroker")) {
        target.operatesAsBroker = ["Head Comercial", "Supervisor Comercial"].includes(target.role) && Boolean(body.operatesAsBroker);
      }
      if (Object.prototype.hasOwnProperty.call(body, "notifications")) {
        target.notifications = normalizeNotificationPreferences(body.notifications);
      }
      target.updatedAt = new Date().toISOString();
      await saveStructuredUser(sql, target);
      await structuredAudit(user, "UPDATE_USER", { userId: target.id, changes: body, reassignedLeads });
      return sendJson(res, 200, { user: publicUser(target), dataSources: { action: "structured" } });
    }

    if (inviteMatch && req.method === "POST") {
      if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const targetRows = await sql`SELECT * FROM crm_users WHERE id = ${decodeURIComponent(inviteMatch[1])} LIMIT 1`;
      const target = structuredUserFromAuthRow(targetRows[0]);
      if (!target) return notFound(res);
      if (!manageableRoles(user).includes(target.role)) return sendJson(res, 403, { error: "Sem permissão" });
      if (!target.active) return sendJson(res, 400, { error: "Ative o usuário antes de enviar convite" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.username)) return sendJson(res, 400, { error: "Usuário sem e-mail válido" });
      const token = createPasswordSetup(target);
      target.updatedAt = new Date().toISOString();
      await saveStructuredUser(sql, target);
      const invitation = await sendPasswordSetupEmail(req, target, token);
      await structuredAudit(user, "SEND_PASSWORD_INVITE", { userId: target.id, invitationSent: invitation.sent });
      return sendJson(res, 200, { user: publicUser(target), invitation, dataSources: { action: "structured" } });
    }

    if (notificationTestMatch && req.method === "POST") {
      if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const targetRows = await sql`SELECT * FROM crm_users WHERE id = ${decodeURIComponent(notificationTestMatch[1])} LIMIT 1`;
      const target = structuredUserFromAuthRow(targetRows[0]);
      if (!target) return notFound(res);
      if (!manageableRoles(user).includes(target.role) && target.id !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
      if (target.role !== "Admin TI") return sendJson(res, 403, { error: "Teste disponível apenas para usuários Admin TI" });
      if (!target.active) return sendJson(res, 400, { error: "Ative o usuário antes de testar notificações" });
      const results = await sendLeadNotificationTest(await structuredNotificationDb(sql), user, target);
      return sendJson(res, 200, { results, dataSources: { action: "structured" } });
    }

    if (assignmentNotificationTestMatch && req.method === "POST") {
      if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const targetRows = await sql`SELECT * FROM crm_users WHERE id = ${decodeURIComponent(assignmentNotificationTestMatch[1])} LIMIT 1`;
      const target = structuredUserFromAuthRow(targetRows[0]);
      if (!target) return notFound(res);
      if (!manageableRoles(user).includes(target.role) && target.id !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
      if (target.role !== "Admin TI") return sendJson(res, 403, { error: "Teste disponível apenas para usuários Admin TI" });
      if (!target.active) return sendJson(res, 400, { error: "Ative o usuário antes de testar notificações" });
      const results = await sendLeadAssignmentNotificationTest(await structuredNotificationDb(sql), user, target);
      return sendJson(res, 200, { results, dataSources: { action: "structured" } });
    }

    if (userMatch && req.method === "DELETE") {
      if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const targetId = decodeURIComponent(userMatch[1]);
      const targetRows = await sql`SELECT * FROM crm_users WHERE id = ${targetId} LIMIT 1`;
      const target = structuredUserFromAuthRow(targetRows[0]);
      if (!target) return notFound(res);
      if (target.id === user.id) return sendJson(res, 400, { error: "Não é possível excluir o próprio usuário" });
      const leadRows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags FROM crm_leads l WHERE l.assigned_to = ${target.id}`;
      for (const row of leadRows) {
        const lead = structuredLeadFromRow(row, false, []);
        lead.assignedTo = null;
        lead.assignedName = "";
        lead.updatedAt = new Date().toISOString();
        await saveStructuredLead(sql, lead);
        await structuredFup(user, lead, "UNASSIGN_BROKER", { from: target.name || "", to: "", reason: "Exclusão de usuário" });
      }
      await sql`DELETE FROM crm_permissions WHERE owner_type = 'user' AND owner_id = ${target.id}`;
      await sql`DELETE FROM crm_lead_favorites WHERE user_id = ${target.id}`;
      await sql`DELETE FROM crm_users WHERE id = ${target.id}`;
      void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
      await structuredAudit(user, "DELETE_USER", { userId: target.id });
      return sendJson(res, 200, { ok: true, dataSources: { action: "structured" } });
    }

    if (isBaseAccess && req.method === "PUT") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const users = await structuredUsers(sql);
      const stateDb = await structuredStateForPermissions(sql, users);
      const sourceSet = new Set(allBaseSources(stateDb));
      const next = stateDb.permissions;
      const roleRules = body.roles && typeof body.roles === "object" && !Array.isArray(body.roles) ? body.roles : {};
      for (const role of ROLES) {
        const rule = roleRules[role] || {};
        const sources = Array.isArray(rule.sources) ? [...new Set(rule.sources.map((source) => String(source || "").trim()).filter((source) => sourceSet.has(source)))] : [];
        for (const source of sourceSet) {
          const allowed = Boolean(rule.enabled) && (!sources.length || sources.includes(source));
          next.roles[role][basePermissionId(source)] = role === "Admin TI" ? permissionCell(true, true) : permissionCell(allowed, allowed && role !== "Diretoria");
        }
      }
      const userRules = body.users && typeof body.users === "object" && !Array.isArray(body.users) ? body.users : {};
      const validUserIds = new Set(users.map((item) => item.id));
      for (const [userId, rule] of Object.entries(userRules)) {
        if (!validUserIds.has(userId) || !rule || typeof rule !== "object" || Array.isArray(rule)) continue;
        const targetUser = users.find((item) => item.id === userId);
        const sources = Array.isArray(rule.sources) ? [...new Set(rule.sources.map((source) => String(source || "").trim()).filter((source) => sourceSet.has(source)))] : [];
        for (const source of sourceSet) {
          if (!rule.override) {
            next.users[userId][basePermissionId(source)] = { ...(next.roles[targetUser.role]?.[basePermissionId(source)] || permissionCell(false, false)) };
            continue;
          }
          const allowed = Boolean(rule.enabled) && (!sources.length || sources.includes(source));
          next.users[userId][basePermissionId(source)] = targetUser.role === "Admin TI" ? permissionCell(true, true) : permissionCell(allowed, allowed);
        }
      }
      await saveStructuredPermissions(sql, next);
      const refreshedDb = await structuredStateForPermissions(sql, users);
      await structuredAudit(user, "UPDATE_BASE_ACCESS", { roles: Object.keys(roleRules).length, users: Object.keys(userRules).length });
      return sendJson(res, 200, {
        baseAccess: structuredBaseAccessFromPermissions(refreshedDb.permissions, allBaseSources(refreshedDb)),
        baseAccessSources: allBaseSources(refreshedDb),
        accessibleBaseSources: accessibleBaseSources(refreshedDb, user),
        actionableBaseSources: allBaseSources(refreshedDb).filter((source) => permissionForUser(refreshedDb, user, basePermissionId(source)).action),
        permissions: refreshedDb.permissions,
        currentPermissions: refreshedDb.permissions.users?.[user.id] || {},
        leads: [],
        dataSources: { action: "structured" }
      });
    }

    if (isPermissions && req.method === "PUT") {
      if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const users = await structuredUsers(sql);
      const stateDb = await structuredStateForPermissions(sql, users);
      const resources = permissionResources(stateDb);
      const resourceIds = new Set(resources.map((resource) => resource.id));
      const next = stateDb.permissions;

      if (body.roles && typeof body.roles === "object" && !Array.isArray(body.roles)) {
        for (const role of ROLES) {
          const roleRules = body.roles[role];
          if (!roleRules || typeof roleRules !== "object" || Array.isArray(roleRules)) continue;
          next.roles[role] = next.roles[role] || {};
          for (const [resourceId, cell] of Object.entries(roleRules)) {
            if (!resourceIds.has(resourceId)) continue;
            next.roles[role][resourceId] = role === "Admin TI" ? permissionCell(true, true) : normalizePermissionCell(cell);
          }
        }
      }

      const applyToUsers = Boolean(body.applyToUsers);
      if (applyToUsers && body.roles) {
        for (const target of users) {
          next.users[target.id] = next.users[target.id] || {};
          for (const resource of resources) {
            next.users[target.id][resource.id] = { ...(next.roles[target.role]?.[resource.id] || permissionCell(false, false)) };
          }
        }
      }

      if (body.users && typeof body.users === "object" && !Array.isArray(body.users)) {
        const validUserIds = new Set(users.map((item) => item.id));
        for (const [userId, userRules] of Object.entries(body.users)) {
          if (!validUserIds.has(userId) || !userRules || typeof userRules !== "object" || Array.isArray(userRules)) continue;
          next.users[userId] = next.users[userId] || {};
          for (const [resourceId, cell] of Object.entries(userRules)) {
            if (!resourceIds.has(resourceId)) continue;
            const targetUser = users.find((item) => item.id === userId);
            next.users[userId][resourceId] = targetUser?.role === "Admin TI" ? permissionCell(true, true) : normalizePermissionCell(cell);
          }
        }
      }

      await saveStructuredPermissions(sql, next);
      const refreshedDb = await structuredStateForPermissions(sql, users);
      await structuredAudit(user, "UPDATE_PERMISSIONS", { scope: body.users ? "users" : "roles", applyToUsers });
      return sendJson(res, 200, {
        permissions: refreshedDb.permissions,
        currentPermissions: refreshedDb.permissions.users?.[user.id] || {},
        permissionResources: resources,
        accessibleBaseSources: accessibleBaseSources(refreshedDb, user),
        actionableBaseSources: allBaseSources(refreshedDb).filter((source) => permissionForUser(refreshedDb, user, basePermissionId(source)).action),
        leads: [],
        dataSources: { action: "structured" }
      });
    }

    return false;
  } catch (error) {
    mirrorStructuredError("users-permissions", error);
    sendJson(res, 500, { error: "Erro interno em usuários/permissões", detail: error.message });
    return true;
  }
}

function publicStructuredLeadSummary(row, user) {
  const payload = row.payload || {};
  const rowInPipeline = row.in_pipeline === true || String(payload.inPipeline || payload.in_pipeline || "").toLowerCase() === "true";
  const lead = {
    ...payload,
    id: row.id || payload.id,
    name: row.name || payload.name || "",
    email: row.email || payload.email || "",
    phone: row.phone || payload.phone || "",
    source: row.source || payload.source || "",
    sourceStatus: row.source_status || "",
    odysseiaStatus: row.odysseia_status || "",
    status: row.status || payload.status || "",
    inPipeline: rowInPipeline,
    assignedTo: row.assigned_to || payload.assignedTo || "",
    assignedName: row.assigned_name || payload.assignedName || "",
    project: row.project || payload.project || payload.empreendimento || payload.desiredProject || "",
    unit: row.unit || payload.unit || payload.unidade || payload.desiredUnit || "",
    unitValue: row.unit_value || payload.unitValue || payload.valorUnidade || "",
    baseSourceBeforePipeline: row.base_source_before_pipeline || payload.baseSourceBeforePipeline || "",
    previousPipelineSource: row.previous_pipeline_source || payload.previousPipelineSource || "",
    assistant: row.assistant || "",
    externalId: row.external_id || "",
    createdAt: row.created_at || payload.createdAt || payload.meta?.createdTime || "",
    updatedAt: row.updated_at || payload.updatedAt || "",
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : (payload.tags || payload.tagIds || []),
    favorite: Boolean(row.favorite)
  };
  return publicLeadSummary(lead, user);
}

function structuredLeadFromRow(row, favorite = false, tags = []) {
  const payload = row?.payload || {};
  const rowInPipeline = row?.in_pipeline === true || String(payload.inPipeline || payload.in_pipeline || "").toLowerCase() === "true";
  const lead = {
    ...payload,
    id: row.id || payload.id,
    name: row.name || payload.name || "",
    email: row.email || payload.email || "",
    phone: row.phone || payload.phone || "",
    source: row.source || payload.source || "",
    sourceStatus: row.source_status || "",
    odysseiaStatus: row.odysseia_status || "",
    status: row.status || payload.status || "",
    inPipeline: rowInPipeline,
    assignedTo: row.assigned_to || payload.assignedTo || "",
    assignedName: row.assigned_name || payload.assignedName || "",
    project: row.project || payload.project || payload.empreendimento || payload.desiredProject || "",
    unit: row.unit || payload.unit || payload.unidade || payload.desiredUnit || "",
    unitValue: row.unit_value || payload.unitValue || payload.valorUnidade || "",
    baseSourceBeforePipeline: row.base_source_before_pipeline || payload.baseSourceBeforePipeline || "",
    previousPipelineSource: row.previous_pipeline_source || payload.previousPipelineSource || "",
    assistant: row.assistant || "",
    externalId: row.external_id || "",
    createdAt: row.created_at || payload.createdAt || payload.meta?.createdTime || "",
    updatedAt: row.updated_at || payload.updatedAt || "",
    tags: Array.isArray(tags) ? tags.filter(Boolean) : (payload.tags || payload.tagIds || []),
    favorite: Boolean(favorite),
    favoritesByUser: { ...(payload.favoritesByUser || {}) }
  };
  lead.favoritesByUser = { ...lead.favoritesByUser };
  return lead;
}

function structuredOpportunityFromRow(row) {
  const payload = row?.payload || {};
  return {
    ...payload,
    id: row.id || payload.id,
    leadId: row.lead_id || payload.leadId || "",
    status: row.status || payload.status || "",
    inPipeline: Boolean(row.in_pipeline ?? payload.inPipeline ?? true),
    assignedTo: row.assigned_to || payload.assignedTo || "",
    assignedName: row.assigned_name || payload.assignedName || "",
    project: row.project || payload.project || payload.desiredProject || "",
    unit: row.unit || payload.unit || payload.desiredUnit || "",
    unitSamCode: row.unit_sam_code || payload.unitSamCode || payload.samUnitCode || "",
    unitValue: row.unit_value || payload.unitValue || payload.value || "",
    source: row.source || payload.source || "",
    createdAt: row.created_at || payload.createdAt || "",
    updatedAt: row.updated_at || payload.updatedAt || ""
  };
}

async function structuredOpportunitiesForLeadIds(sql, leadIds = []) {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await sql`SELECT * FROM crm_opportunities WHERE lead_id = ANY(${ids}) ORDER BY created_at ASC NULLS LAST, id ASC`;
  return rows.reduce((map, row) => {
    const opportunity = structuredOpportunityFromRow(row);
    if (!map.has(opportunity.leadId)) map.set(opportunity.leadId, []);
    map.get(opportunity.leadId).push(opportunity);
    return map;
  }, new Map());
}

async function attachStructuredOpportunities(sql, leads = []) {
  const byLead = await structuredOpportunitiesForLeadIds(sql, leads.map((lead) => lead.id));
  return leads.map((lead) => ({
    ...lead,
    opportunities: byLead.get(lead.id) || []
  }));
}

async function attachStructuredCommentPreviews(sql, leads = []) {
  const leadIds = leads.map((lead) => lead.id).filter(Boolean);
  if (!leadIds.length) return leads;
  const rows = await sql`SELECT lead_id, payload FROM crm_lead_comments WHERE lead_id = ANY(${leadIds}) AND deleted = false ORDER BY created_at DESC NULLS LAST`;
  const commentsByLead = new Map();
  for (const row of rows) {
    const comment = row.payload || {};
    if (!comment.id) continue;
    if (!commentsByLead.has(row.lead_id)) commentsByLead.set(row.lead_id, []);
    commentsByLead.get(row.lead_id).push(comment);
  }
  return leads.map((lead) => {
    const comments = commentsByLead.get(lead.id) || [];
    return {
      ...lead,
      comments: comments.slice(0, 3),
      commentCount: comments.length
    };
  });
}

function leadOpportunitySnapshot(lead, overrides = {}) {
  const project = overrides.project ?? (lead.desiredProject || lead.project || "");
  const unit = overrides.unit ?? (lead.desiredUnit || lead.unit || "");
  return {
    id: overrides.id || `opp-${crypto.randomUUID()}`,
    leadId: lead.id,
    name: lead.name || "",
    source: overrides.source ?? (lead.source || ""),
    status: overrides.status ?? (lead.status || ""),
    inPipeline: overrides.inPipeline ?? Boolean(lead.inPipeline),
    assignedTo: overrides.assignedTo ?? (lead.assignedTo || ""),
    assignedName: overrides.assignedName ?? (lead.assignedName || ""),
    project,
    unit,
    unitSamCode: overrides.unitSamCode ?? normalizeUnitForMatch(unit),
    unitValue: overrides.unitValue ?? (lead.unitValue || lead.value || ""),
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    legacyMaterialized: Boolean(overrides.legacyMaterialized)
  };
}

function opportunityHasMeaning(opportunity) {
  return Boolean(opportunity?.status || opportunity?.project || opportunity?.unit || opportunity?.unitSamCode || opportunity?.assignedTo || opportunity?.unitValue);
}

async function saveStructuredOpportunity(sql, opportunity) {
  await sql`INSERT INTO crm_opportunities (id, lead_id, status, in_pipeline, assigned_to, assigned_name, project, unit, unit_sam_code, unit_value, source, created_at, updated_at, payload)
    VALUES (${opportunity.id}, ${opportunity.leadId}, ${opportunity.status || ""}, ${Boolean(opportunity.inPipeline)}, ${opportunity.assignedTo || null}, ${opportunity.assignedName || ""}, ${opportunity.project || ""}, ${opportunity.unit || ""}, ${opportunity.unitSamCode || ""}, ${opportunity.unitValue || ""}, ${opportunity.source || ""}, ${dbDate(opportunity.createdAt)}, ${dbDate(opportunity.updatedAt)}, ${JSON.stringify(opportunity)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, in_pipeline = EXCLUDED.in_pipeline, assigned_to = EXCLUDED.assigned_to, assigned_name = EXCLUDED.assigned_name, project = EXCLUDED.project, unit = EXCLUDED.unit, unit_sam_code = EXCLUDED.unit_sam_code, unit_value = EXCLUDED.unit_value, source = EXCLUDED.source, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`;
}

async function materializeLegacyOpportunityIfNeeded(sql, lead) {
  const existing = await structuredOpportunitiesForLeadIds(sql, [lead.id]);
  const opportunities = existing.get(lead.id) || [];
  const legacy = leadOpportunitySnapshot(lead, { legacyMaterialized: true, createdAt: lead.createdAt || new Date().toISOString(), updatedAt: lead.updatedAt || new Date().toISOString() });
  if (!opportunityHasMeaning(legacy)) return opportunities;
  if (opportunities.length) {
    const legacyUnits = opportunityUnitsForMatch(legacy);
    const alreadyRepresented = legacyUnits.length && opportunities.some((opportunity) => {
      const units = opportunityUnitsForMatch(opportunity);
      return legacyUnits.some((unit) => units.includes(unit));
    });
    if (alreadyRepresented || !legacyUnits.length) return opportunities;
  }
  await saveStructuredOpportunity(sql, legacy);
  return [legacy, ...opportunities];
}

async function structuredLeadById(sql, leadId, user) {
  const rows = await sql`SELECT l.*, COALESCE(f.favorite, false) AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
    FROM crm_leads l
    LEFT JOIN crm_lead_favorites f ON f.lead_id = l.id AND f.user_id = ${user.id}
    LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
    WHERE l.id = ${leadId}
    GROUP BY l.id, f.favorite
    LIMIT 1`;
  if (!rows.length) return null;
  const commentRows = await sql`SELECT payload FROM crm_lead_comments WHERE lead_id = ${leadId} ORDER BY created_at DESC NULLS LAST`;
  const lead = structuredLeadFromRow(rows[0], rows[0].favorite, rows[0].tags);
  lead.comments = commentRows.map((row) => row.payload || {}).filter((comment) => comment.id);
  lead.opportunities = (await structuredOpportunitiesForLeadIds(sql, [leadId])).get(leadId) || [];
  lead.favoritesByUser[user.id] = Boolean(rows[0].favorite);
  return lead;
}

async function saveStructuredLead(sql, lead) {
  const fields = structuredLeadDbFields(lead);
  await sql`INSERT INTO crm_leads (id, name, email, phone, source, source_status, odysseia_status, assistant, external_id, status, in_pipeline, assigned_to, assigned_name, project, unit, unit_value, base_source_before_pipeline, previous_pipeline_source, created_at, updated_at, payload)
    VALUES (${lead.id}, ${lead.name || ""}, ${lead.email || ""}, ${lead.phone || ""}, ${fields.source}, ${fields.sourceStatus}, ${fields.odysseiaStatus}, ${fields.assistant}, ${fields.externalId}, ${lead.status || ""}, ${Boolean(lead.inPipeline)}, ${lead.assignedTo || null}, ${lead.assignedName || ""}, ${fields.project}, ${fields.unit}, ${fields.unitValue}, ${fields.baseSourceBeforePipeline}, ${fields.previousPipelineSource}, ${dbDate(lead.createdAt || lead.meta?.createdTime)}, ${dbDate(lead.updatedAt)}, ${JSON.stringify(lead)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, source = EXCLUDED.source, source_status = EXCLUDED.source_status, odysseia_status = EXCLUDED.odysseia_status, assistant = EXCLUDED.assistant, external_id = EXCLUDED.external_id, status = EXCLUDED.status, in_pipeline = EXCLUDED.in_pipeline, assigned_to = EXCLUDED.assigned_to, assigned_name = EXCLUDED.assigned_name, project = EXCLUDED.project, unit = EXCLUDED.unit, unit_value = EXCLUDED.unit_value, base_source_before_pipeline = EXCLUDED.base_source_before_pipeline, previous_pipeline_source = EXCLUDED.previous_pipeline_source, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`;
}

async function recordStructuredLeadStatusMovement(sql, {
  actor = {},
  lead,
  fromStatus = "",
  toStatus = "",
  movementType = "manual",
  source = "",
  screen = "",
  movedAt = "",
  statusAt = "",
  samEventId = "",
  details = {}
} = {}) {
  if (!lead?.id || !toStatus) return null;
  const recordedAt = movedAt || new Date().toISOString();
  const entry = {
    id: `status-move-${crypto.randomUUID()}`,
    leadId: lead.id,
    leadName: lead.name || "",
    fromStatus: String(fromStatus || ""),
    toStatus: String(toStatus || ""),
    movedAt: recordedAt,
    statusAt: statusAt || recordedAt,
    actorId: actor.id || "",
    actorUsername: actor.username || "",
    actorName: actor.name || actor.username || "",
    actorRole: actor.role || "",
    movementType,
    source,
    screen,
    samEventId,
    details: details || {}
  };
  await sql`INSERT INTO crm_lead_status_movements (
    id, lead_id, lead_name, from_status, to_status, moved_at, status_at,
    actor_id, actor_username, actor_name, actor_role, movement_type, source, screen,
    sam_event_id, details, payload
  ) VALUES (
    ${entry.id}, ${entry.leadId}, ${entry.leadName}, ${entry.fromStatus}, ${entry.toStatus},
    ${dbDate(entry.movedAt)}, ${dbDate(entry.statusAt)}, ${entry.actorId}, ${entry.actorUsername},
    ${entry.actorName}, ${entry.actorRole}, ${entry.movementType}, ${entry.source}, ${entry.screen},
    ${entry.samEventId}, ${JSON.stringify(entry.details)}::jsonb, ${JSON.stringify(entry)}::jsonb
  )`;
  return entry;
}

async function mirrorStructuredLeadStatusMovement(params) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await recordStructuredLeadStatusMovement(sql, params);
  } catch (error) {
    mirrorStructuredError("lead-status-movement", error);
  }
}

async function structuredAudit(actor, action, details) {
  await mirrorStructuredAuditLog({ at: new Date().toISOString(), actor: actor.username, actorName: actor.name, action, details });
}

async function structuredFup(actor, lead, action, details = {}) {
  await mirrorStructuredFupLeadLog({
    at: new Date().toISOString(),
    actor: actor.username,
    actorName: actor.name,
    userId: actor.id,
    leadId: lead.id,
    leadName: lead.name || "",
    action,
    details
  });
}

async function structuredAccess(actor, action, details, req) {
  await mirrorStructuredAccessLog({
    at: new Date().toISOString(),
    userId: actor.id || "",
    actor: actor.username,
    actorName: actor.name,
    role: actor.role,
    action,
    details,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 220)
  });
}

async function redisTouchPresence(user, ttlMs = DEFAULT_SESSION_TTL_MS, req, resetOnlineSince = false) {
  if (!user?.id || !redisEnabled()) return null;
  const key = redisKey("presence", "user", user.id);
  const existing = resetOnlineSince ? null : await redisGetJson(key);
  const now = new Date().toISOString();
  const payload = {
    userId: user.id,
    username: user.username || "",
    name: user.name || "",
    role: user.role || "",
    online: true,
    onlineSince: existing?.onlineSince || now,
    lastAccessAt: now,
    ip: req ? clientIp(req) : "",
    userAgent: req ? String(req.headers["user-agent"] || "").slice(0, 220) : ""
  };
  await redisSetJson(key, payload, Math.ceil(Math.max(ttlMs, 60 * 1000) / 1000) + 30);
  return payload;
}

async function redisClearPresence(userId) {
  if (!userId || !redisEnabled()) return;
  await redisDelete(redisKey("presence", "user", userId));
}

async function redisPresenceForUsers(users = []) {
  if (!redisEnabled() || !users.length) return [];
  const commands = users
    .filter((user) => user?.id)
    .map((user) => ["GET", redisKey("presence", "user", user.id)]);
  const results = await redisPipeline(commands);
  if (!results) return [];
  return results.map((value) => {
    if (!value) return null;
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function buildUserPresence(users = [], accessLogs = [], timeoutMs = DEFAULT_SESSION_TTL_MS, redisPresence = []) {
  const now = Date.now();
  const logsByActor = new Map();
  const redisByUser = new Map(redisPresence.map((entry) => [String(entry.userId || ""), entry]));
  for (const row of accessLogs) {
    const entry = row?.payload || row || {};
    const actor = String(entry.actor || "").trim().toLowerCase();
    const userId = String(entry.userId || "").trim();
    const at = new Date(entry.at || 0).getTime();
    if ((!actor && !userId) || !Number.isFinite(at) || at <= 0) continue;
    const normalizedEntry = { ...entry, atMs: at };
    if (actor) {
      if (!logsByActor.has(actor)) logsByActor.set(actor, []);
      logsByActor.get(actor).push(normalizedEntry);
    }
    if (userId) {
      if (!logsByActor.has(userId)) logsByActor.set(userId, []);
      logsByActor.get(userId).push(normalizedEntry);
    }
  }
  return users.map((user) => {
    const actor = String(user.username || "").trim().toLowerCase();
    const userId = String(user.id || "").trim();
    const logs = ([...(logsByActor.get(userId) || []), ...(logsByActor.get(actor) || [])])
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.id === entry.id && candidate.at === entry.at) === index)
      .sort((a, b) => a.atMs - b.atMs);
    const last = logs[logs.length - 1] || null;
    const lastLogin = [...logs].reverse().find((entry) => entry.action === "LOGIN");
    const sessions = [];
    for (let index = 0; index < logs.length; index += 1) {
      const entry = logs[index];
      if (entry.action !== "LOGIN") continue;
      const nextLoginIndex = logs.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.action === "LOGIN");
      const sliceEnd = nextLoginIndex > -1 ? nextLoginIndex : logs.length;
      const sessionLogs = logs.slice(index, sliceEnd);
      const explicitLogout = sessionLogs.find((candidate) => candidate.action === "LOGOUT");
      const end = explicitLogout || sessionLogs[sessionLogs.length - 1];
      const duration = Math.min(12 * 60 * 60 * 1000, Math.max(60 * 1000, end.atMs - entry.atMs));
      sessions.push(duration / 60000);
    }
    const averageSessionMinutes = sessions.length
      ? sessions.reduce((sum, value) => sum + value, 0) / sessions.length
      : 0;
    const redisEntry = redisByUser.get(userId);
    const redisLastAt = new Date(redisEntry?.lastAccessAt || 0).getTime();
    const redisOnline = Boolean(redisEntry?.online && Number.isFinite(redisLastAt) && now - redisLastAt <= timeoutMs + 30 * 1000);
    return {
      userId: user.id,
      online: redisOnline || Boolean(last && last.action !== "LOGOUT" && now - last.atMs <= timeoutMs),
      lastAccessAt: redisEntry?.lastAccessAt || (last ? new Date(last.atMs).toISOString() : ""),
      onlineSince: redisEntry?.onlineSince || (lastLogin ? new Date(lastLogin.atMs).toISOString() : (last ? new Date(last.atMs).toISOString() : "")),
      averageSessionMinutes: Math.round(averageSessionMinutes)
    };
  });
}

function canAccessStructuredLead(user, lead) {
  if (!lead) return false;
  if (user.role === "Admin TI") return true;
  if (lead.inPipeline) {
    if (user.role === "Corretor") return lead.assignedTo === user.id;
    return ["Head Comercial", "Supervisor Comercial", "Diretoria"].includes(user.role);
  }
  return false;
}

async function activeStructuredBroker(sql, userId) {
  if (!userId) return null;
  const rows = await sql`SELECT payload FROM crm_users WHERE id = ${userId} AND active = true LIMIT 1`;
  const user = rows[0]?.payload;
  return user && isAssignableBroker(user) ? user : null;
}

async function firstStructuredPipelineStatus(sql) {
  const rows = await sql`SELECT status FROM crm_pipeline_statuses ORDER BY position ASC, status ASC LIMIT 1`;
  return rows[0]?.status || "";
}

async function structuredPipelineStatuses(sql) {
  const rows = await sql`SELECT status FROM crm_pipeline_statuses ORDER BY position ASC, status ASC`;
  return rows.map((row) => row.status).filter(Boolean);
}

function normalizeListFromText(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProjectDefinition(input, position = 0) {
  const name = String(input?.name || input || "").trim();
  const unitPrefixes = Array.isArray(input?.unitPrefixes)
    ? input.unitPrefixes
    : normalizeListFromText(input?.unitPrefixes);
  const blockDefinitions = Array.isArray(input?.blockDefinitions)
    ? input.blockDefinitions.map((block, index) => normalizeProjectBlockDefinition(block, index)).filter((block) => block.block)
    : [];
  return {
    name,
    position,
    unitPrefixes: [...new Set(unitPrefixes.map((prefix) => normalizeUnitForMatch(prefix)).filter(Boolean))],
    availabilityEnabled: input?.availabilityEnabled !== false,
    blockDefinitions,
    visualMap: normalizeProjectVisualMap(input?.visualMap || {})
  };
}

function normalizeProjectVisualMap(input = {}) {
  const visualMap = input && typeof input === "object" ? input : {};
  return {
    image: String(visualMap.image || "").trim(),
    hotspots: normalizeProjectVisualMapHotspots(visualMap.hotspots || [])
  };
}

function normalizeProjectVisualMapPoint(input = {}) {
  const rawX = Number(input?.x);
  const rawY = Number(input?.y);
  const x = Math.max(0, Math.min(100, Number.isFinite(rawX) ? rawX : 0));
  const y = Math.max(0, Math.min(100, Number.isFinite(rawY) ? rawY : 0));
  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3))
  };
}

function normalizeProjectVisualMapHotspots(input = []) {
  return (Array.isArray(input) ? input : []).map((hotspot, index) => {
    const unitId = String(hotspot?.unitId || "").trim();
    const unitSamCode = String(hotspot?.unitSamCode || "").trim();
    const unit = String(hotspot?.unit || "").trim();
    const stableKey = unitId || unitSamCode || unit || String(index);
    const id = String(hotspot?.id || `hotspot-${crypto.createHash("sha1").update(stableKey).digest("hex").slice(0, 10)}`).trim();
    const points = (Array.isArray(hotspot?.points) ? hotspot.points : []).map(normalizeProjectVisualMapPoint);
    return { id, unitId, unitSamCode, unit, points };
  }).filter((hotspot) => hotspot.unitId || hotspot.unitSamCode || hotspot.unit || hotspot.points.length);
}

function normalizeProjectBlockDefinition(input = {}, position = 0) {
  const block = String(input.block || input.name || input.code || "").trim().replace(/^0+(\d+)$/, "$1");
  const floorCount = Math.max(0, Number.parseInt(input.floorCount ?? input.floors ?? input.totalFloors ?? 0, 10) || 0);
  const columnCount = Math.max(0, Number.parseInt(input.columnCount ?? input.columnsPerFloor ?? input.columns ?? 0, 10) || 0);
  const penthouseFloors = Array.isArray(input.penthouseFloors)
    ? input.penthouseFloors
    : normalizeListFromText(input.penthouseFloors);
  const structureType = String(input.structureType || input.type || "").toLocaleLowerCase("pt-BR").includes("quadra") ? "Quadra" : "Bloco";
  const layoutType = String(input.layoutType || input.developmentType || "").toLocaleLowerCase("pt-BR") === "horizontal" ? "Horizontal" : "Vertical";
  const houseStart = Math.max(0, Number.parseInt(input.houseStart ?? input.startNumber ?? 0, 10) || 0);
  const houseEnd = Math.max(0, Number.parseInt(input.houseEnd ?? input.endNumber ?? 0, 10) || 0);
  const hasPenthouse = input.hasPenthouse !== undefined
    ? Boolean(input.hasPenthouse)
    : penthouseFloors.length > 0;
  return {
    id: String(input.id || `block-${crypto.createHash("sha1").update(`${block}:${position}`).digest("hex").slice(0, 10)}`).trim(),
    block,
    structureType,
    layoutType,
    displayName: String(input.displayName || input.label || "").trim(),
    housePrefix: String(input.housePrefix || "").trim().toUpperCase(),
    houseStart,
    houseEnd,
    position: Number(input.position ?? position) || position,
    floorCount,
    columnCount,
    hasPenthouse,
    penthouseFloors: [...new Set(penthouseFloors.map((floor) => String(floor || "").trim()).filter(Boolean))]
  };
}

function normalizeAvailabilitySettings(input = {}) {
  const defaultStatusMappings = [
    { id: "available", label: "Disponível", color: "#22c55e", pipelineStatuses: ["Disponível", "Livre"], samCodes: [] },
    { id: "reserved", label: "Reservada", color: "#f59e0b", pipelineStatuses: ["Reservado", "Reserva", "Reserva criada"], samCodes: ["reservation_created", "reserva"] },
    { id: "contract_issued", label: "Contrato emitido", color: "#00a8ff", pipelineStatuses: ["Contrato Emitido"], samCodes: ["contract_issued", "contrato_emitido"] },
    { id: "sold", label: "Vendida", color: "#dc2626", pipelineStatuses: ["Contrato Assinado", "Venda Finalizada"], samCodes: ["contract_signed", "contrato_assinado", "venda_finalizada"] },
    { id: "blocked", label: "Bloqueada", color: "#64748b", pipelineStatuses: ["Bloqueada"], samCodes: ["bloqueada"] },
    { id: "exchange", label: "Permutante", color: "#7c3aed", pipelineStatuses: ["Permutante"], samCodes: ["permutante"] }
  ];
  const incomingMappings = Array.isArray(input.statusMappings) ? input.statusMappings : [];
  const byId = new Map(defaultStatusMappings.map((item) => [item.id, item]));
  incomingMappings.forEach((item, index) => {
    const label = String(item?.label || "").trim();
    const id = String(item?.id || label || `availability-status-${index}`).trim();
    if (!id || !label) return;
    byId.set(id, {
      ...(byId.get(id) || {}),
      id,
      label,
      color: String(item.color || item.availabilityColor || byId.get(id)?.color || "#e5e7eb").trim(),
      pipelineStatuses: [...new Set(normalizeListFromText(Array.isArray(item.pipelineStatuses) ? item.pipelineStatuses.join("\n") : item.pipelineStatuses))],
      samCodes: [...new Set(normalizeListFromText(Array.isArray(item.samCodes) ? item.samCodes.join("\n") : item.samCodes))],
      position: Number(item.position ?? index) || index
    });
  });
  const statusMappings = [...byId.values()].map((item, index) => ({
    id: String(item.id || `availability-status-${index}`).trim(),
    label: String(item.label || "").trim(),
    color: String(item.color || "#e5e7eb").trim(),
    pipelineStatuses: [...new Set(normalizeListFromText(Array.isArray(item.pipelineStatuses) ? item.pipelineStatuses.join("\n") : item.pipelineStatuses))],
    samCodes: [...new Set(normalizeListFromText(Array.isArray(item.samCodes) ? item.samCodes.join("\n") : item.samCodes))],
    position: Number(item.position ?? index) || index
  })).filter((item) => item.label).sort((a, b) => a.position - b.position);
  return {
    architectureOptions: [...new Set(normalizeListFromText(Array.isArray(input.architectureOptions) ? input.architectureOptions.join("\n") : input.architectureOptions))],
    typologyOptions: [...new Set(normalizeListFromText(Array.isArray(input.typologyOptions) ? input.typologyOptions.join("\n") : input.typologyOptions))],
    statusMappings
  };
}

function inferUnitFloor(unit) {
  const normalized = normalizeUnitForMatch(unit);
  const match = normalized.match(/(\d)\d{2}$/);
  return match?.[1] || "";
}

function inferUnitStack(unit) {
  const normalized = normalizeUnitForMatch(unit);
  const match = normalized.match(/\d(\d{2})$/);
  return match?.[1] || "";
}

function padUnitNumber(value, size = 2) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(size, "0").slice(-size) : "";
}

function primaryProjectPrefix(projectDefinition = {}, projectName = "") {
  const prefix = (projectDefinition.unitPrefixes || []).find(Boolean);
  if (prefix) return normalizeUnitForMatch(prefix).slice(0, 3);
  return normalizeUnitForMatch(projectName).slice(0, 3);
}

function generatedUnitCodes(projectDefinition = {}, input = {}) {
  const projectName = String(projectDefinition.name || input.project || "").trim();
  const block = padUnitNumber(input.block, 2);
  const floorRaw = String(input.floor || "").replace(/\D/g, "");
  const column = padUnitNumber(input.column || input.stack, 2);
  if (!projectName || !block || !floorRaw || !column) return { unit: "", samCode: "" };
  const floorDisplay = String(Number.parseInt(floorRaw, 10) || floorRaw);
  const floorForSam = padUnitNumber(floorRaw, 2);
  const unitNumber = `${floorDisplay}${column}`;
  const samUnitNumber = `${floorForSam}${column}`;
  const prefix = primaryProjectPrefix(projectDefinition, projectName);
  return {
    unit: `${block}-${unitNumber}`,
    samCode: `${prefix}${block}${samUnitNumber}`.toUpperCase()
  };
}

function normalizeUnitDefinition(input = {}) {
  const generated = generatedUnitCodes(input.projectDefinition || {}, input);
  const unit = String(input.unit || input.name || generated.unit || "").trim().toUpperCase();
  const id = String(input.id || (input.project && unit ? `unit-${crypto.createHash("sha1").update(`${input.project}:${unit}`).digest("hex").slice(0, 18)}` : `unit-${crypto.randomUUID()}`)).trim();
  const payload = {
    id,
    project: String(input.project || "").trim(),
    unit,
    block: String(input.block || "").trim(),
    floor: String(input.floor || inferUnitFloor(unit)).trim(),
    column: String(input.column || input.stack || inferUnitStack(unit)).trim(),
    samCode: String(input.samCode || input.sam_code || generated.samCode || "").trim().toUpperCase(),
    usefulArea: String(input.usefulArea || "").trim(),
    privateArea: String(input.privateArea || "").trim(),
    sunPosition: String(input.sunPosition || "").trim(),
    unitType: String(input.unitType || "").trim(),
    architecture: String(input.architecture || "").trim(),
    typology: String(input.typology || "").trim(),
    idealFraction: String(input.idealFraction || "").trim(),
    view: String(input.view || "").trim(),
    floorPlanName: String(input.floorPlanName || "").trim(),
    floorPlanMime: String(input.floorPlanMime || "").trim(),
    floorPlanDataUrl: String(input.floorPlanDataUrl || "").trim(),
    attachments: Array.isArray(input.attachments) ? input.attachments.filter((item) => item && item.name && item.dataUrl).map((item) => ({ id: String(item.id || `attachment-${crypto.randomUUID()}`), name: String(item.name || ""), mime: String(item.mime || ""), dataUrl: String(item.dataUrl || ""), createdAt: item.createdAt || new Date().toISOString() })) : [],
    floorKind: String(input.floorKind || "").trim(),
    structureType: String(input.structureType || "").trim(),
    status: String(input.status || "").trim(),
    leadId: String(input.leadId || input.lead_id || "").trim(),
    buyerName: String(input.buyerName || input.buyer_name || "").trim(),
    linkName: String(input.linkName || "").trim(),
    linkEmail: String(input.linkEmail || "").trim(),
    linkPhone: String(input.linkPhone || "").trim(),
    linkType: String(input.linkType || "").trim(),
    purchaseBuyerName: String(input.purchaseBuyerName || "").trim(),
    purchaseSignedAt: input.purchaseSignedAt || "",
    purchaseValue: Number(input.purchaseValue || 0),
    purchaseSource: String(input.purchaseSource || "").trim(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    createdAt: input.createdAt || new Date().toISOString()
  };
  return payload;
}

function normalizeStatusDefinition(input, position = 0) {
  const status = String(input?.status || input?.name || input || "").trim();
  const samCodes = Array.isArray(input?.samCodes)
    ? input.samCodes
    : normalizeListFromText(input?.samCodes);
  const advanceMode = String(input?.advanceMode || "").trim() === "sam_only" ? "sam_only" : "manual";
  return {
    status,
    position,
    advanceMode,
    availabilityColor: String(input?.availabilityColor || "").trim(),
    samCodes: [...new Set(samCodes.map((code) => String(code || "").trim()).filter(Boolean))]
  };
}

async function structuredProjectDefinitions(sql) {
  const rows = await sql`SELECT name, position, payload FROM crm_projects ORDER BY position ASC, name ASC`;
  return rows.map((row, index) => normalizeProjectDefinition({ ...(row.payload || {}), name: row.name }, Number(row.position ?? index))).filter((item) => item.name);
}

function projectNameForUnit(unit, projectDefinitions = []) {
  const normalizedUnit = normalizeUnitForMatch(unit);
  if (!normalizedUnit) return "";
  const match = projectDefinitions.find((project) => (project.unitPrefixes || []).some((prefix) => normalizedUnit.startsWith(normalizeUnitForMatch(prefix))));
  return match?.name || "";
}

async function structuredStatusDefinitions(sql) {
  const rows = await sql`SELECT status, position, payload FROM crm_pipeline_statuses ORDER BY position ASC, status ASC`;
  return rows.map((row, index) => normalizeStatusDefinition({ ...(row.payload || {}), status: row.status }, Number(row.position ?? index))).filter((item) => item.status);
}

async function structuredUnitDefinitions(sql) {
  const rows = await sql`SELECT * FROM crm_units ORDER BY project ASC, block ASC NULLS LAST, floor ASC NULLS LAST, stack ASC NULLS LAST, unit ASC`;
  return rows.map((row) => normalizeUnitDefinition({
    ...(row.payload || {}),
    id: row.id,
    project: row.project,
    unit: row.unit,
    block: row.block,
    floor: row.floor,
    column: row.stack,
    samCode: row.sam_code,
    status: row.status,
    leadId: row.lead_id,
    buyerName: row.buyer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })).filter((item) => item.id && item.project && item.unit);
}

async function saveStructuredUnit(sql, unitInput, projectDefinitions = []) {
  const projectDefinition = projectDefinitions.find((project) => project.name === unitInput.project) || {};
  const unit = normalizeUnitDefinition({ ...unitInput, projectDefinition });
  if (!unit.project) throw new Error("Empreendimento obrigatório");
  if (!unit.unit) throw new Error("Unidade obrigatória");
  const now = new Date().toISOString();
  unit.updatedAt = now;
  unit.createdAt = unit.createdAt || now;
  await sql`INSERT INTO crm_units (id, project, unit, block, floor, stack, sam_code, status, lead_id, buyer_name, payload, created_at, updated_at)
    VALUES (${unit.id}, ${unit.project}, ${unit.unit}, ${unit.block}, ${unit.floor}, ${unit.column}, ${unit.samCode}, ${unit.status}, ${unit.leadId}, ${unit.buyerName}, ${JSON.stringify(unit)}::jsonb, ${unit.createdAt}, ${unit.updatedAt})
    ON CONFLICT (project, unit) DO UPDATE SET
      id = EXCLUDED.id,
      block = EXCLUDED.block,
      floor = EXCLUDED.floor,
      stack = EXCLUDED.stack,
      sam_code = EXCLUDED.sam_code,
      status = EXCLUDED.status,
      lead_id = EXCLUDED.lead_id,
      buyer_name = EXCLUDED.buyer_name,
      payload = EXCLUDED.payload,
      updated_at = EXCLUDED.updated_at`;
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
  return unit;
}

function generatedUnitsForBlock(projectDefinition = {}, blockDefinition = {}) {
  const units = [];
  if (blockDefinition.layoutType === "Horizontal") {
    const start = Number(blockDefinition.houseStart || 0);
    const end = Number(blockDefinition.houseEnd || 0);
    const housePrefix = String(blockDefinition.housePrefix || "").trim().toUpperCase();
    const numberSize = Math.max(2, String(end).length);
    for (let number = start; number <= end; number += 1) {
      const houseNumber = String(number).padStart(numberSize, "0");
      const unit = `${housePrefix}${houseNumber}`;
      if (!unit) continue;
      units.push({
        project: projectDefinition.name,
        unit,
        block: String(blockDefinition.block || "").trim(),
        floor: "",
        column: houseNumber,
        samCode: `${primaryProjectPrefix(projectDefinition, projectDefinition.name)}${unit}`.toUpperCase(),
        floorKind: "Casa",
        structureType: blockDefinition.structureType || "Quadra"
      });
    }
    return units;
  }
  const floorCount = Number(blockDefinition.floorCount || 0);
  const totalFloors = floorCount + (blockDefinition.hasPenthouse ? 1 : 0);
  const columnCount = Number(blockDefinition.columnCount || 0);
  for (let floor = 1; floor <= totalFloors; floor += 1) {
    for (let column = 1; column <= columnCount; column += 1) {
      const codes = generatedUnitCodes(projectDefinition, {
        project: projectDefinition.name,
        block: blockDefinition.block,
        floor,
        column
      });
      if (!codes.unit || !codes.samCode) continue;
      units.push({
        project: projectDefinition.name,
        unit: codes.unit,
        block: padUnitNumber(blockDefinition.block, 2),
        floor: String(floor),
        column: padUnitNumber(column, 2),
        samCode: codes.samCode,
        floorKind: blockDefinition.hasPenthouse && floor === totalFloors ? "Cobertura" : (blockDefinition.penthouseFloors || []).includes(String(floor)) ? "Cobertura" : "Tipo",
        structureType: blockDefinition.structureType || "Bloco"
      });
    }
  }
  return units;
}

async function ensureStructuredAvailabilityUnits(sql) {
  const countRows = await sql`SELECT COUNT(*)::int AS count FROM crm_units`;
  if (Number(countRows[0]?.count || 0) > 0) return 0;
  const projectDefinitions = await structuredProjectDefinitions(sql);
  let created = 0;
  for (const project of projectDefinitions) {
    for (const block of project.blocks || []) {
      for (const unit of generatedUnitsForBlock(project, block)) {
        await saveStructuredUnit(sql, unit, projectDefinitions);
        created += 1;
      }
    }
  }
  if (created) await importStructuredLevSalesToUnits(sql);
  return created;
}

function saleSignedAtIsoForUnit(record = {}) {
  const date = parseBrazilDate(record.signedAt || record.assinatura || record.signatureDate || record.contractSignedAt);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function levAvailabilitySaleFromLeadRow(row = {}) {
  const payload = row.payload || {};
  const status = row.status || payload.status || "";
  if (!isContractSignedPipelineStatus(status)) return null;
  const unit = normalizeLevUnit(row.unit || payload.unit || payload.desiredUnit || payload.unidade || "");
  if (!unit) return null;
  return {
    id: `lead-sale-${row.id || payload.id || unit}`,
    unit,
    client: row.name || payload.name || payload.client || "",
    signedAt: payload.contractSignedAt
      || payload.signedAt
      || payload.purchaseSignedAt
      || payload.samLastEvent?.eventDatetime
      || row.updated_at
      || row.created_at
      || "",
    contractValue: parseMoney(row.unit_value || payload.unitValue || payload.valorUnidade || payload.contractValue || payload.valorContrato || ""),
    status,
    project: row.project || payload.project || payload.desiredProject || payload.empreendimento || "",
    leadId: row.id || payload.id || "",
    leadName: row.name || payload.name || "",
    source: "Lead em Contrato Assinado"
  };
}

async function structuredLevAvailabilityRecords(sql) {
  const stateDb = await structuredLevFinanceDb(sql);
  const financeRecords = (stateDb.levFinance.settlements || []).map((record) => ({
    ...record,
    source: record.source || "Financeiro Lev"
  }));
  return {
    financeRecords,
    leadRecords: [],
    records: financeRecords
  };
}

function projectForAvailabilitySale(unitCode, sale = {}, projectDefinitions = []) {
  return projectNameForUnit(unitCode, projectDefinitions) || String(sale.project || "").trim();
}

async function importStructuredLevSalesToUnits(sql) {
  const projectDefinitions = await structuredProjectDefinitions(sql);
  const { financeRecords, leadRecords, records } = await structuredLevAvailabilityRecords(sql);
  const byUnit = new Map();
  let skipped = 0;
  for (const record of records) {
    const unitCode = normalizeLevUnit(record.unit || "");
    const status = levStatusKeyServer(record.status);
    if (!unitCode || /[,.]/.test(unitCode) || unitCode.includes("R$") || status.includes("nao contabilizada")) {
      skipped += 1;
      continue;
    }
    if (!projectForAvailabilitySale(unitCode, record, projectDefinitions)) {
      skipped += 1;
      continue;
    }
    const current = byUnit.get(unitCode) || {};
    byUnit.set(unitCode, {
      ...current,
      ...record,
      unit: unitCode,
      client: record.client || current.client || "",
      signedAt: record.signedAt || current.signedAt || "",
      contractValue: Number(record.contractValue || current.contractValue || 0),
      status: record.status || current.status || ""
    });
  }

  let imported = 0;
  for (const sale of byUnit.values()) {
    const unitCode = normalizeLevUnit(sale.unit);
    const existingRows = await sql`SELECT payload FROM crm_units WHERE sam_code = ${unitCode} OR unit = ${unitCode} LIMIT 1`;
    const existing = existingRows[0]?.payload;
    if (!existing) {
      skipped += 1;
      continue;
    }
    const project = existing.project || projectForAvailabilitySale(unitCode, sale, projectDefinitions);
    if (!project) {
      skipped += 1;
      continue;
    }
    const next = normalizeUnitDefinition({
      ...existing,
      project: existing.project || project,
      unit: existing.unit || unitCode,
      samCode: existing.samCode || unitCode,
      status: "Vendida",
      buyerName: existing.buyerName || sale.client || "",
      purchaseBuyerName: sale.client || existing.purchaseBuyerName || existing.buyerName || "",
      purchaseSignedAt: saleSignedAtIsoForUnit(sale) || existing.purchaseSignedAt || "",
      purchaseValue: Number(sale.contractValue || existing.purchaseValue || 0),
      purchaseSource: sale.source || "Financeiro Lev",
      leadId: existing.leadId || sale.leadId || ""
    });
    if (!next.block) next.block = "1";
    if (!next.floor) next.floor = inferUnitFloor(unitCode);
    if (!next.column) next.column = inferUnitStack(unitCode);
    await saveStructuredUnit(sql, next, projectDefinitions);
    imported += 1;
  }
  return {
    imported,
    skipped,
    eligible: byUnit.size,
    sources: {
      levFinance: financeRecords.length,
      contractSignedLeads: leadRecords.length,
      total: records.length
    }
  };
}

async function generateStructuredUnitsForBlock(sql, projectName, blockIdOrCode) {
  const projectDefinitions = await structuredProjectDefinitions(sql);
  const projectDefinition = projectDefinitions.find((project) => project.name === projectName);
  if (!projectDefinition) throw new Error("Empreendimento não encontrado");
  const blockDefinition = (projectDefinition.blockDefinitions || []).find((block) => block.id === blockIdOrCode || block.block === blockIdOrCode);
  if (!blockDefinition) throw new Error("Bloco não encontrado");
  const generatedUnits = generatedUnitsForBlock(projectDefinition, blockDefinition);
  for (const unit of generatedUnits) {
    await saveStructuredUnit(sql, unit, projectDefinitions);
  }
  return generatedUnits;
}

async function upsertStructuredUnitFromLeadSam(sql, lead, event, projectDefinitions = []) {
  const unitCode = String(event?.unit || lead?.desiredUnit || "").trim().toUpperCase();
  if (!unitCode) return null;
  const project = String(lead?.desiredProject || projectNameForUnit(unitCode, projectDefinitions) || "").trim();
  if (!project) return null;
  const existingRows = await sql`SELECT payload FROM crm_units WHERE project = ${project} AND unit = ${unitCode} LIMIT 1`;
  const existing = existingRows[0]?.payload || {};
  const next = normalizeUnitDefinition({
    ...existing,
    project,
    unit: unitCode,
    status: lead?.status || existing.status || "",
    leadId: lead?.id || existing.leadId || "",
    buyerName: lead?.name || existing.buyerName || ""
  });
  if (!next.block) next.block = "1";
  if (!next.floor) next.floor = inferUnitFloor(unitCode);
  if (!next.column) next.column = inferUnitStack(unitCode);
  return saveStructuredUnit(sql, next, projectDefinitions);
}

async function isStructuredSamOnlyStatus(sql, status) {
  const target = String(status || "").trim();
  if (!target) return false;
  const definitions = await structuredStatusDefinitions(sql);
  return definitions.some((item) => item.status === target && item.advanceMode === "sam_only");
}

async function structuredProjectNames(sql) {
  const rows = await sql`SELECT name FROM crm_projects ORDER BY position ASC, name ASC`;
  return rows.map((row) => row.name).filter(Boolean);
}

async function normalizeStructuredManualLeadPayload(sql, body) {
  const projects = await structuredProjectNames(sql);
  return normalizeManualLeadPayload({ projects: projects.length ? projects : DEFAULT_PROJECTS }, body);
}

async function findStructuredManualLeadDuplicate(sql, payload) {
  const email = normalizeEmail(payload.email);
  const phone = normalizePhoneDigits(payload.phone);
  if (!email && phone.length < 8) return null;
  const phoneSuffix = phone.length >= 8 ? phone.slice(-8) : "";
  const rows = await sql`SELECT l.*, false AS favorite, '{}'::text[] AS tags
    FROM crm_leads l
    WHERE l.in_pipeline = false
      AND (
        (${Boolean(email)} AND (lower(l.email) = ${email} OR lower(COALESCE(l.payload->>'assistant', '')) = ${email}))
        OR (${Boolean(phoneSuffix)} AND (
          regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') = ${phone}
          OR regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') LIKE ${`%${phoneSuffix}`}
        ))
      )
    ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST
    LIMIT 1`;
  return rows.length ? structuredLeadFromRow(rows[0], false, []) : null;
}

async function structuredPermissionForUser(sql, user, resourceId) {
  if (user.role === "Admin TI") return permissionCell(true, true);
  const userRows = await sql`SELECT can_access, can_act FROM crm_permissions WHERE owner_type = 'user' AND owner_id = ${user.id} AND resource_id = ${resourceId} LIMIT 1`;
  if (userRows.length) return permissionCell(userRows[0].can_access, userRows[0].can_act);
  const roleRows = await sql`SELECT can_access, can_act FROM crm_permissions WHERE owner_type = 'role' AND owner_id = ${user.role} AND resource_id = ${resourceId} LIMIT 1`;
  if (roleRows.length) return permissionCell(roleRows[0].can_access, roleRows[0].can_act);
  return permissionCell(false, false);
}

async function structuredCanAccessBaseLead(sql, user, lead) {
  const sources = baseSourcesForLead(lead);
  if (!sources.length) return false;
  for (const source of sources) {
    for (const alias of structuredBaseSourceAliases(source)) {
      const permission = await structuredPermissionForUser(sql, user, basePermissionId(alias));
      if (permission.access) return true;
    }
  }
  return false;
}

async function structuredCanActBaseLead(sql, user, lead) {
  if (!(await structuredCanAccessBaseLead(sql, user, lead))) return false;
  for (const source of baseSourcesForLead(lead)) {
    for (const alias of structuredBaseSourceAliases(source)) {
      const permission = await structuredPermissionForUser(sql, user, basePermissionId(alias));
      if (permission.action) return true;
    }
  }
  return false;
}

async function fastStructuredLeadsResponse(req, res, url) {
  if (!DATABASE_URL || req.method !== "GET" || url.pathname !== "/api/leads") return false;
  const requestedScope = String(url.searchParams.get("scope") || "all");
  const scope = ["pipeline", "bases", "all"].includes(requestedScope) ? requestedScope : "all";
  const pageLimit = Math.min(300, Math.max(25, Number(url.searchParams.get("limit") || 150)));
  const pageOffset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const sourceFilter = String(url.searchParams.get("source") || "TODOS");
  const searchFilter = String(url.searchParams.get("search") || "").trim().toLowerCase();
  const favoriteOnly = url.searchParams.get("favorite") === "1";
  const sortKey = ["name", "phone", "email", "status", "broker", "source"].includes(String(url.searchParams.get("sort") || "")) ? String(url.searchParams.get("sort")) : "name";
  const sortDirection = url.searchParams.get("direction") === "desc" ? "desc" : "asc";
  try {
    const sql = await getSql();
    if (!sql) return false;
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    let rows = [];
    let allowedSources = [];
    if (scope === "pipeline") {
      rows = user.role === "Corretor"
        ? await sql`SELECT l.*, COALESCE(f.favorite, false) AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
            FROM crm_leads l
            LEFT JOIN crm_lead_favorites f ON f.lead_id = l.id AND f.user_id = ${user.id}
            LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
            WHERE (l.in_pipeline = true OR lower(COALESCE(l.payload->>'inPipeline', l.payload->>'in_pipeline', 'false')) = 'true') AND l.assigned_to = ${user.id}
            GROUP BY l.id, f.favorite
            ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST`
        : await sql`SELECT l.*, COALESCE(f.favorite, false) AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
            FROM crm_leads l
            LEFT JOIN crm_lead_favorites f ON f.lead_id = l.id AND f.user_id = ${user.id}
            LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
            WHERE (l.in_pipeline = true OR lower(COALESCE(l.payload->>'inPipeline', l.payload->>'in_pipeline', 'false')) = 'true')
            GROUP BY l.id, f.favorite
            ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST`;
    } else if (scope === "bases") {
      const allSources = await sql`SELECT name FROM crm_base_sources ORDER BY name ASC`;
      if (!allSources.length) return false;
      allowedSources = user.role === "Admin TI"
        ? allSources.map((row) => row.name)
        : (await sql`SELECT resource_id FROM crm_permissions WHERE owner_type = 'user' AND owner_id = ${user.id} AND can_access = true
            UNION
            SELECT resource_id FROM crm_permissions WHERE owner_type = 'role' AND owner_id = ${user.role} AND can_access = true`)
            .map((row) => String(row.resource_id || "").replace(/^base:/, ""))
            .filter((source) => allSources.some((item) => item.name === source));
      if (user.role !== "Admin TI" && !allowedSources.length) return false;
      if (!allowedSources.length) return sendJson(res, 200, { leads: [], scope, dataSources: { leads: "structured" } });
      const sourceIsAll = sourceFilter === "TODOS" || !sourceFilter;
      const allowedIsAll = user.role === "Admin TI";
      const sourceFilterAliases = sourceIsAll ? [""] : structuredBaseSourceAliases(sourceFilter);
      const allowedSourceAliases = allowedIsAll ? [""] : structuredBaseSourceAliasesMany(allowedSources);
      const searchLike = `%${searchFilter}%`;
      const summaryRows = await sql`SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(CASE WHEN NOT (l.in_pipeline = true OR lower(COALESCE(l.payload->>'inPipeline', l.payload->>'in_pipeline', 'false')) = 'true') THEN 1 ELSE 0 END), 0)::int AS pending,
          COALESCE(SUM(CASE WHEN (l.in_pipeline = true OR lower(COALESCE(l.payload->>'inPipeline', l.payload->>'in_pipeline', 'false')) = 'true') THEN 1 ELSE 0 END), 0)::int AS rescued
        FROM crm_leads l
        LEFT JOIN crm_lead_favorites f ON f.lead_id = l.id AND f.user_id = ${user.id}
        WHERE (${sourceIsAll}
            OR l.source = ANY(${sourceFilterAliases})
            OR l.base_source_before_pipeline = ANY(${sourceFilterAliases})
            OR l.previous_pipeline_source = ANY(${sourceFilterAliases})
          )
          AND (${allowedIsAll}
            OR l.source = ANY(${allowedSourceAliases})
            OR l.base_source_before_pipeline = ANY(${allowedSourceAliases})
            OR l.previous_pipeline_source = ANY(${allowedSourceAliases})
          )
          AND (${!favoriteOnly} OR COALESCE(f.favorite, false) = true)
          AND (${!searchFilter} OR lower(concat_ws(' ', l.name, l.phone, l.email, l.assigned_name, l.source, l.status, l.assistant, l.external_id)) LIKE ${searchLike})`;
      const page = summaryRows[0] || { total: 0, pending: 0, rescued: 0 };
      rows = await sql`SELECT l.*, COALESCE(f.favorite, false) AS favorite, COALESCE(array_agg(t.tag_id) FILTER (WHERE t.tag_id IS NOT NULL), '{}'::text[]) AS tags
          FROM crm_leads l
          LEFT JOIN crm_lead_favorites f ON f.lead_id = l.id AND f.user_id = ${user.id}
          LEFT JOIN crm_lead_tags t ON t.lead_id = l.id
          WHERE (${sourceIsAll}
              OR l.source = ANY(${sourceFilterAliases})
              OR l.base_source_before_pipeline = ANY(${sourceFilterAliases})
              OR l.previous_pipeline_source = ANY(${sourceFilterAliases})
            )
            AND (${allowedIsAll}
              OR l.source = ANY(${allowedSourceAliases})
              OR l.base_source_before_pipeline = ANY(${allowedSourceAliases})
              OR l.previous_pipeline_source = ANY(${allowedSourceAliases})
            )
            AND (${!favoriteOnly} OR COALESCE(f.favorite, false) = true)
            AND (${!searchFilter} OR lower(concat_ws(' ', l.name, l.phone, l.email, l.assigned_name, l.source, l.status, l.assistant, l.external_id)) LIKE ${searchLike})
          GROUP BY l.id, f.favorite
          ORDER BY
            CASE WHEN (l.in_pipeline = true OR lower(COALESCE(l.payload->>'inPipeline', l.payload->>'in_pipeline', 'false')) = 'true') THEN 0 ELSE 1 END ASC,
            CASE WHEN ${sortKey} = 'name' AND ${sortDirection} = 'asc' THEN lower(l.name) END ASC NULLS LAST,
            CASE WHEN ${sortKey} = 'name' AND ${sortDirection} = 'desc' THEN lower(l.name) END DESC NULLS LAST,
            CASE WHEN ${sortKey} = 'phone' AND ${sortDirection} = 'asc' THEN lower(l.phone) END ASC NULLS LAST,
            CASE WHEN ${sortKey} = 'phone' AND ${sortDirection} = 'desc' THEN lower(l.phone) END DESC NULLS LAST,
            CASE WHEN ${sortKey} = 'email' AND ${sortDirection} = 'asc' THEN lower(COALESCE(l.email, l.assistant)) END ASC NULLS LAST,
            CASE WHEN ${sortKey} = 'email' AND ${sortDirection} = 'desc' THEN lower(COALESCE(l.email, l.assistant)) END DESC NULLS LAST,
            CASE WHEN ${sortKey} = 'status' AND ${sortDirection} = 'asc' THEN lower(l.status) END ASC NULLS LAST,
            CASE WHEN ${sortKey} = 'status' AND ${sortDirection} = 'desc' THEN lower(l.status) END DESC NULLS LAST,
            CASE WHEN ${sortKey} = 'broker' AND ${sortDirection} = 'asc' THEN lower(l.assigned_name) END ASC NULLS LAST,
            CASE WHEN ${sortKey} = 'broker' AND ${sortDirection} = 'desc' THEN lower(l.assigned_name) END DESC NULLS LAST,
            CASE WHEN ${sortKey} = 'source' AND ${sortDirection} = 'asc' THEN lower(l.source) END ASC NULLS LAST,
            CASE WHEN ${sortKey} = 'source' AND ${sortDirection} = 'desc' THEN lower(l.source) END DESC NULLS LAST,
            lower(l.name) ASC NULLS LAST
          LIMIT ${pageLimit} OFFSET ${pageOffset}`;
      const leads = await attachStructuredOpportunities(sql, rows.map((row) => structuredLeadFromRow(row, row.favorite, row.tags)));
      return sendJson(res, 200, {
        leads: leads.map((lead) => publicLeadSummary(lead, user)),
        scope,
        page: {
          total: Number(page.total || 0),
          pending: Number(page.pending || 0),
          rescued: Number(page.rescued || 0),
          limit: pageLimit,
          offset: pageOffset + rows.length,
          hasMore: pageOffset + rows.length < Number(page.total || 0)
        },
        dataSources: { leads: "structured" }
      });
    } else {
      return false;
    }
    if (scope === "bases" && user.role !== "Admin TI") {
      rows = rows.filter((row) => baseSourcesForLead({
        source: row.source,
        baseSourceBeforePipeline: row.base_source_before_pipeline,
        previousPipelineSource: row.previous_pipeline_source
      }).some((source) => allowedSources.includes(source)));
    }
    let leads = await attachStructuredOpportunities(sql, rows.map((row) => structuredLeadFromRow(row, row.favorite, row.tags)));
    if (scope === "pipeline") leads = await attachStructuredCommentPreviews(sql, leads);
    return sendJson(res, 200, {
      leads: leads.map((lead) => publicLeadSummary(lead, user)),
      scope,
      dataSources: { leads: "structured" }
    });
  } catch (error) {
    mirrorStructuredError("fast-leads", error);
    return false;
  }
}

async function fastStructuredManualLeadRoutes(req, res, url) {
  if (!DATABASE_URL || req.method !== "POST") return false;
  if (!["/api/leads", "/api/leads/check-duplicate", "/api/leads/resolve-manual-duplicate"].includes(url.pathname)) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);

    if (url.pathname === "/api/leads/check-duplicate") {
      const normalized = await normalizeStructuredManualLeadPayload(sql, body);
      if (normalized.error) return sendJson(res, 400, { error: normalized.error });
      const duplicate = await findStructuredManualLeadDuplicate(sql, normalized.lead);
      return sendJson(res, 200, {
        duplicate: duplicate ? publicLead(duplicate, user) : null,
        baseName: duplicate ? baseNameForLead(duplicate) : "",
        dataSources: { action: "structured" }
      });
    }

    const statuses = await structuredPipelineStatuses(sql);
    if (!statuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de adicionar leads" });

    if (url.pathname === "/api/leads/resolve-manual-duplicate") {
      const duplicateId = String(body.duplicateId || "");
      const duplicate = await structuredLeadById(sql, duplicateId, user);
      if (!duplicate) return notFound(res);
      if (duplicate.inPipeline) return sendJson(res, 400, { error: "Este lead já está no pipeline" });
      const mode = String(body.mode || "");
      if (!["overwrite", "rescue"].includes(mode)) return sendJson(res, 400, { error: "Escolha inválida" });
      const normalized = await normalizeStructuredManualLeadPayload(sql, body.lead || {});
      if (normalized.error) return sendJson(res, 400, { error: normalized.error });
      const payload = normalized.lead;
      const requestedStatus = String(body.lead?.status || "").trim();
      const status = statuses.includes(requestedStatus) ? requestedStatus : statuses[0];
      const assignedUser = user.role === "Corretor"
        ? user
        : body.lead?.assignedTo
          ? await activeStructuredBroker(sql, body.lead.assignedTo)
          : null;
      if (body.lead?.assignedTo && user.role !== "Corretor" && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
      const duplicatePreviousStatus = duplicate.status || duplicate.sourceStatus || duplicate.odysseiaStatus || "";
      if (mode === "overwrite") {
        duplicate.name = payload.name;
        duplicate.phone = payload.phone;
        duplicate.email = payload.email;
        duplicate.desiredProject = payload.desiredProject;
        duplicate.desiredUnit = payload.desiredUnit;
        duplicate.unitValue = payload.unitValue;
        duplicate.notes = payload.notes;
        duplicate.impactedBySocial = payload.impactedBySocial;
      }
      rememberLeadBaseOrigin(duplicate);
      duplicate.manualLeadSource = payload.source;
      duplicate.inPipeline = true;
      duplicate.status = status;
      duplicate.assignedTo = assignedUser?.id || null;
      duplicate.assignedName = assignedUser?.name || "";
      duplicate.order = Date.now();
      duplicate.rescuedAt = new Date().toISOString();
      duplicate.updatedAt = duplicate.rescuedAt;
      duplicate.manualDuplicateResolution = mode;
      await saveStructuredLead(sql, duplicate);
      await recordStructuredLeadStatusMovement(sql, {
        actor: user,
        lead: duplicate,
        fromStatus: duplicatePreviousStatus,
        toStatus: duplicate.status,
        movementType: "rescue",
        source: "manual_duplicate_resolution",
        screen: "manual_lead_modal",
        statusAt: duplicate.rescuedAt,
        details: { mode, assignedTo: duplicate.assignedName || "", source: duplicate.source }
      });
      await structuredAudit(user, "RESOLVE_MANUAL_DUPLICATE_LEAD", { leadId: duplicate.id, mode, source: duplicate.source });
      await structuredFup(user, duplicate, "RESCUE_BASE_LEAD", { source: duplicate.source, mode, assignedTo: duplicate.assignedName || "" });
      if (assignedUser) await notifyLeadAssignment(await structuredNotificationDb(sql), duplicate, assignedUser, false);
      return sendJson(res, 200, { lead: publicLead(duplicate, user), dataSources: { action: "structured" } });
    }

    const normalized = await normalizeStructuredManualLeadPayload(sql, body);
    if (normalized.error) return sendJson(res, 400, { error: normalized.error });
    const payload = normalized.lead;
    const duplicate = await findStructuredManualLeadDuplicate(sql, payload);
    if (duplicate) {
      return sendJson(res, 409, {
        error: `Lead já existente na base ${baseNameForLead(duplicate)}`,
        duplicate: publicLead(duplicate, user),
        baseName: baseNameForLead(duplicate)
      });
    }
    const requestedStatus = String(body.status || "").trim();
    const status = statuses.includes(requestedStatus) ? requestedStatus : statuses[0];
    const assignedUser = user.role === "Corretor"
      ? user
      : body.assignedTo
        ? await activeStructuredBroker(sql, body.assignedTo)
        : null;
    if (body.assignedTo && user.role !== "Corretor" && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
    const now = new Date().toISOString();
    const lead = {
      id: `lead-${crypto.randomUUID()}`,
      externalId: `MANUAL-${Date.now()}`,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      assistant: "",
      source: payload.source,
      status,
      inPipeline: true,
      favorite: false,
      favoritesByUser: {},
      assignedTo: assignedUser?.id || null,
      assignedName: assignedUser?.name || "",
      desiredProject: payload.desiredProject,
      desiredUnit: payload.desiredUnit,
      unitValue: payload.unitValue,
      notes: payload.notes,
      impactedBySocial: payload.impactedBySocial,
      tags: [],
      comments: [],
      order: Date.now(),
      createdAt: now,
      updatedAt: now
    };
    await saveStructuredLead(sql, lead);
    await recordStructuredLeadStatusMovement(sql, {
      actor: user,
      lead,
      fromStatus: "",
      toStatus: lead.status,
      movementType: "create",
      source: "manual",
      screen: "manual_lead_modal",
      statusAt: now,
      details: { source: lead.source, assignedTo: lead.assignedName || "" }
    });
    await sql`INSERT INTO crm_base_sources (name) VALUES (${lead.source}) ON CONFLICT DO NOTHING`;
    await structuredAudit(user, "CREATE_LEAD", { leadId: lead.id, source: lead.source });
    await structuredFup(user, lead, "CREATE_LEAD", { source: lead.source, assignedTo: lead.assignedName || "" });
    if (assignedUser) await notifyLeadAssignment(await structuredNotificationDb(sql), lead, assignedUser, false);
    return sendJson(res, 201, { lead: publicLead(lead, user), dataSources: { action: "structured" } });
  } catch (error) {
    mirrorStructuredError("manual-lead", error);
    sendJson(res, 500, { error: "Erro interno no cadastro manual estruturado", detail: error.message });
    return true;
  }
}

async function fastStructuredSamWebhook(req, res, url) {
  if (!DATABASE_URL || req.method !== "POST" || url.pathname !== "/api/webhooks/sam") return false;
  try {
    const auth = verifySamJwt(req);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
    let body;
    try {
      body = await readBody(req);
    } catch {
      await structuredIntegration("SAM", "INVALID_JSON", {});
      return sendJson(res, 400, { error: "Payload inválido" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      await structuredIntegration("SAM", "INVALID_PAYLOAD_TYPE", { type: Array.isArray(body) ? "array" : typeof body });
      return sendJson(res, 400, { error: "Payload deve ser um objeto JSON" });
    }
    const forbiddenFields = ["cpf", "cnpj", "documento", "document", "nome", "name", "corretor", "broker", "imobiliaria", "imobiliária", "realEstate", "project", "projeto"];
    const receivedForbidden = forbiddenFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
    if (receivedForbidden.length) {
      await structuredIntegration("SAM", "FORBIDDEN_FIELDS_REJECTED", { fields: receivedForbidden });
      return sendJson(res, 400, { error: "Payload contém campos não permitidos", fields: receivedForbidden });
    }
    const result = await processSamWebhookStructured(body);
    const { httpStatus = 200, ...responseBody } = result;
    return sendJson(res, httpStatus, responseBody);
  } catch (error) {
    console.error("SAM_WEBHOOK_STRUCTURED_ERROR", error);
    try {
      await structuredIntegration("SAM", "WEBHOOK_PROCESS_ERROR", { error: error.message });
    } catch (logError) {
      console.error("SAM_WEBHOOK_STRUCTURED_LOG_ERROR", logError);
    }
    return sendJson(res, 500, { error: "Erro interno no webhook SAM", detail: error.message });
  }
}

async function fastStructuredSamEventAction(req, res, url) {
  if (!DATABASE_URL || req.method !== "POST") return false;
  const match = url.pathname.match(/^\/api\/sam-events\/([^/]+)\/(link|ignore|reopen|reprocess)$/);
  if (!match) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureStructuredSchemaOnce(sql);
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const event = await structuredSamEventById(sql, match[1]);
    if (!event) return notFound(res);
    const body = await readBody(req);
    if (match[2] === "reopen") {
      if (!["linked", "ignored"].includes(event.status)) return sendJson(res, 400, { error: "Evento ainda está pendente" });
      reopenSamEventForReview(event);
      await saveStructuredSamEvent(sql, event);
      await structuredIntegration("SAM", "REOPENED", { eventId: event.eventId, samEventId: event.id, status: event.status });
      await structuredAudit(user, "REOPEN_SAM_EVENT", { samEventId: event.id, eventId: event.eventId, status: event.status });
      return sendJson(res, 200, { samEvent: event });
    }
    if (match[2] === "reprocess") {
      if (!event.leadId) return sendJson(res, 400, { error: "Evento sem lead vinculado para reprocessar" });
      const lead = await structuredLeadById(sql, event.leadId, user);
      if (!lead) return sendJson(res, 404, { error: "Lead vinculado não encontrado" });
      const opportunities = (await structuredOpportunitiesForLeadIds(sql, [lead.id])).get(lead.id) || [];
      const eventUnit = normalizeUnitForMatch(event.unit || "");
      const eventOpportunity = event.opportunityId ? opportunities.find((opportunity) => opportunity.id === event.opportunityId) : null;
      const eventOpportunityMatchesUnit = Boolean(eventOpportunity && eventUnit && opportunityUnitsForMatch(eventOpportunity).includes(eventUnit));
      const fields = {
        ...(body.fields && typeof body.fields === "object" ? body.fields : {}),
        opportunityId: eventOpportunityMatchesUnit ? event.opportunityId : "",
        createOpportunity: !eventOpportunityMatchesUnit,
        linkLeadDirect: false
      };
      const result = await applyStructuredSamEventToLead(sql, user, event, lead, fields);
      await structuredAudit(user, "REPROCESS_SAM_EVENT", { samEventId: event.id, eventId: event.eventId, leadId: lead.id, opportunityId: event.opportunityId || "", from: result.previousStatus, to: result.nextStatus });
      return sendJson(res, 200, { samEvent: event, lead: publicLead(lead, user), levSale: result.levSale || null });
    }
    if (event.status === "linked" || event.status === "ignored") return sendJson(res, 400, { error: "Evento já tratado" });
    if (match[2] === "ignore") {
      event.status = "ignored";
      event.resolution = "ignored";
      event.resolvedAt = new Date().toISOString();
      event.resolvedBy = user.username;
      event.ignoreReason = String(body.reason || "").trim();
      await saveStructuredSamEvent(sql, event);
      await structuredIntegration("SAM", "IGNORED", { eventId: event.eventId, samEventId: event.id, reason: event.ignoreReason });
      await structuredAudit(user, "IGNORE_SAM_EVENT", { samEventId: event.id, eventId: event.eventId });
      return sendJson(res, 200, { samEvent: event });
    }
    const lead = body.search
      ? await findStructuredLeadForSamManualLink(sql, body.search)
      : await structuredLeadById(sql, body.leadId || event.leadId, user);
    if (!lead) return sendJson(res, 404, { error: "Lead não encontrado" });
    const fields = {
      ...(body.fields && typeof body.fields === "object" ? body.fields : {}),
      opportunityId: body.opportunityId || body.fields?.opportunityId || "",
      createOpportunity: Boolean(body.createOpportunity || body.fields?.createOpportunity),
      linkLeadDirect: Boolean(body.linkLeadDirect || body.fields?.linkLeadDirect)
    };
    const result = await applyStructuredSamEventToLead(sql, user, event, lead, fields);
    await structuredAudit(user, "LINK_SAM_EVENT", { samEventId: event.id, eventId: event.eventId, leadId: lead.id, from: result.previousStatus, to: result.nextStatus, levSaleId: result.levSale?.id || "" });
    return sendJson(res, 200, { samEvent: event, lead: publicLead(lead, user), levSale: result.levSale || null });
  } catch (error) {
    console.error("SAM_EVENT_STRUCTURED_ACTION_ERROR", error);
    return sendJson(res, 500, { error: "Erro ao tratar evento SAM", detail: error.message });
  }
}

async function fastStructuredLeadAction(req, res, url) {
  if (!DATABASE_URL || !url.pathname.startsWith("/api/leads/")) return false;
  if (url.pathname === "/api/leads/check-duplicate" || url.pathname === "/api/leads/resolve-manual-duplicate") return false;
  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  const rescueMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rescue$/);
  const rollbackMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rollback$/);
  const sendToLevFinanceMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/send-to-lev-finance$/);
  const opportunityCreateMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/opportunities$/);
  const opportunityUpdateMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/opportunities\/([^/]+)$/);
  const commentMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/comments$/);
  const commentDeleteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/comments\/([^/]+)$/);
  if (!leadMatch && !rescueMatch && !rollbackMatch && !sendToLevFinanceMatch && !opportunityCreateMatch && !opportunityUpdateMatch && !commentMatch && !commentDeleteMatch) return false;
  try {
    const sql = await getSql();
    if (!sql) return false;
    const user = await structuredUserFromSession(req, res, sql);
    if (!user) return true;
    const leadId = decodeURIComponent(leadMatch?.[1] || rescueMatch?.[1] || rollbackMatch?.[1] || sendToLevFinanceMatch?.[1] || opportunityCreateMatch?.[1] || opportunityUpdateMatch?.[1] || commentMatch?.[1] || commentDeleteMatch?.[1] || "");
    const lead = await structuredLeadById(sql, leadId, user);
    if (!lead) {
      notFound(res);
      return true;
    }

    if (rescueMatch && req.method === "POST") {
      if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
      if (!(await structuredCanActBaseLead(sql, user, lead))) return sendJson(res, 403, { error: "Sem permissão para resgatar este lead" });
      if (lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está no pipeline" });
      const firstStatus = await firstStructuredPipelineStatus(sql);
      if (!firstStatus) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de resgatar leads" });
      rememberLeadBaseOrigin(lead);
      const body = await readBody(req);
      const previousStatus = lead.status || lead.sourceStatus || lead.odysseiaStatus || "";
      lead.inPipeline = true;
      lead.status = firstStatus;
      if (user.role === "Corretor" || (canOperateAsBroker(user) && body.assignToSelf)) {
        lead.assignedTo = user.id;
        lead.assignedName = user.name;
      }
      lead.order = Date.now();
      lead.rescuedAt = new Date().toISOString();
      lead.updatedAt = lead.rescuedAt;
      await saveStructuredLead(sql, lead);
      await recordStructuredLeadStatusMovement(sql, {
        actor: user,
        lead,
        fromStatus: previousStatus,
        toStatus: lead.status,
        movementType: "rescue",
        source: "base",
        screen: String(body.movementSource || "base"),
        statusAt: lead.rescuedAt,
        details: { source: lead.source, assignedTo: lead.assignedName || "" }
      });
      await enqueueStructuredMetaConversionForStatus(sql, user, lead, previousStatus, lead.status, {
        source: "base",
        screen: String(body.movementSource || "base"),
        statusAt: lead.rescuedAt
      });
      await structuredAudit(user, "RESCUE_BASE_LEAD", { leadId: lead.id, source: lead.source });
      await structuredFup(user, lead, "RESCUE_BASE_LEAD", { source: lead.source, assignedTo: lead.assignedName || "" });
      return sendJson(res, 200, { lead: publicLead(lead, user), dataSources: { action: "structured" } });
    }

    if (rollbackMatch && req.method === "POST") {
      if (!canManageLeads(user) && !(user.role === "Corretor" && lead.assignedTo === user.id)) return sendJson(res, 403, { error: "Sem permissão" });
      if (!lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está apenas na base" });
      const body = await readBody(req);
      const pipelineSource = lead.source || "";
      const previousSource = lead.baseSourceBeforePipeline || lead.previousPipelineSource || lead.source || "Pipeline GDrive";
      const previousStatus = lead.baseStatusBeforePipeline || lead.sourceStatus || lead.odysseiaStatus || lead.status || "Base";
      const pipelineStatus = lead.status || "";
      lead.inPipeline = false;
      lead.source = previousSource;
      lead.sourceStatus = previousStatus;
      lead.previousPipelineSource = pipelineSource;
      lead.status = previousStatus;
      lead.assignedTo = null;
      lead.assignedName = "";
      lead.rolledBackAt = new Date().toISOString();
      lead.updatedAt = lead.rolledBackAt;
      await saveStructuredLead(sql, lead);
      await recordStructuredLeadStatusMovement(sql, {
        actor: user,
        lead,
        fromStatus: pipelineStatus,
        toStatus: lead.status,
        movementType: "rollback",
        source: "base",
        screen: String(body.movementSource || "base"),
        statusAt: lead.rolledBackAt,
        details: { source: lead.source, previousSource }
      });
      await structuredAudit(user, "ROLLBACK_BASE_LEAD", { leadId: lead.id, source: lead.source, previousSource });
      await structuredFup(user, lead, "ROLLBACK_BASE_LEAD", { source: lead.source, previousSource });
      return sendJson(res, 200, { lead: publicLead(lead, user), dataSources: { action: "structured" } });
    }

    if (!canAccessStructuredLead(user, lead)) return sendJson(res, 403, { error: "Sem permissão" });

    if (leadMatch && req.method === "GET") {
      return sendJson(res, 200, { lead: publicLead(lead, user) });
    }

    if (sendToLevFinanceMatch && req.method === "POST") {
      if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
      if (!isContractSignedPipelineStatus(lead.status)) return sendJson(res, 400, { error: "O lead precisa estar em Contrato Assinado" });
      try {
        const result = await upsertStructuredLevFinanceFromLead(sql, user, lead);
        return sendJson(res, 200, {
          lead: publicLead(result.lead, user),
          levFinance: publicLevFinance(result.stateDb),
          sale: result.sale,
          dataSources: { action: "structured" }
        });
      } catch (error) {
        return sendJson(res, 400, { error: error.message || "Não foi possível enviar ao Financeiro Lev" });
      }
    }

    if (opportunityCreateMatch && req.method === "POST") {
      if (!canEditLead(user, lead) || !lead.inPipeline) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const previousOpportunities = await materializeLegacyOpportunityIfNeeded(sql, lead);
      const assignedUser = body.assignedTo ? await activeStructuredBroker(sql, body.assignedTo) : null;
      if (body.assignedTo && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
      const opportunity = leadOpportunitySnapshot(lead, {
        status: body.status || await firstStructuredPipelineStatus(sql) || lead.status || "",
        project: body.project || body.desiredProject || "",
        unit: body.unit || body.desiredUnit || "",
        unitSamCode: normalizeUnitForMatch(body.unitSamCode || body.samUnitCode || body.unit || body.desiredUnit),
        unitValue: body.unitValue || "",
        assignedTo: assignedUser?.id || (user.role === "Corretor" ? user.id : ""),
        assignedName: assignedUser?.name || (user.role === "Corretor" ? user.name : ""),
        source: body.source || "Manual",
        inPipeline: true
      });
      await saveStructuredOpportunity(sql, opportunity);
      lead.inPipeline = true;
      lead.updatedAt = opportunity.updatedAt;
      await saveStructuredLead(sql, lead);
      lead.opportunities = [...previousOpportunities, opportunity];
      await structuredAudit(user, "CREATE_OPPORTUNITY", { leadId: lead.id, opportunityId: opportunity.id, project: opportunity.project, unit: opportunity.unitSamCode || opportunity.unit });
      await structuredFup(user, lead, "CREATE_OPPORTUNITY", { opportunityId: opportunity.id, project: opportunity.project, unit: opportunity.unitSamCode || opportunity.unit, status: opportunity.status });
      return sendJson(res, 201, { lead: publicLead(lead, user), opportunity, dataSources: { action: "structured" } });
    }

    if (opportunityUpdateMatch && req.method === "PATCH") {
      if (!canAccessStructuredLead(user, lead)) return sendJson(res, 403, { error: "Sem permissão" });
      const opportunityId = decodeURIComponent(opportunityUpdateMatch[2]);
      const opportunities = (await structuredOpportunitiesForLeadIds(sql, [lead.id])).get(lead.id) || [];
      const opportunity = opportunities.find((item) => item.id === opportunityId);
      if (!opportunity) return sendJson(res, 404, { error: "Oportunidade não encontrada" });
      if (user.role === "Corretor" && opportunity.assignedTo !== user.id && lead.assignedTo !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const previousStatus = opportunity.status || "";
      const previousAssignedTo = opportunity.assignedTo || "";
      const previousAssignedName = opportunity.assignedName || "";
      if (Object.prototype.hasOwnProperty.call(body, "assignedTo")) {
        const assignedUser = body.assignedTo ? await activeStructuredBroker(sql, body.assignedTo) : null;
        if (body.assignedTo && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
        opportunity.assignedTo = assignedUser?.id || "";
        opportunity.assignedName = assignedUser?.name || "";
      }
      for (const key of ["status", "project", "unit", "unitValue", "order"]) {
        if (Object.prototype.hasOwnProperty.call(body, key)) opportunity[key] = body[key];
      }
      if (Object.prototype.hasOwnProperty.call(body, "unitSamCode")) opportunity.unitSamCode = normalizeUnitForMatch(body.unitSamCode);
      else if (Object.prototype.hasOwnProperty.call(body, "unit")) opportunity.unitSamCode = normalizeUnitForMatch(body.unit);
      opportunity.updatedAt = new Date().toISOString();
      await saveStructuredOpportunity(sql, opportunity);
      lead.updatedAt = opportunity.updatedAt;
      await saveStructuredLead(sql, lead);
      lead.opportunities = opportunities.map((item) => item.id === opportunity.id ? opportunity : item);
      if (isContractSignedPipelineStatus(opportunity.status) && Object.prototype.hasOwnProperty.call(body, "unitValue")) {
        await upsertStructuredLevSaleFromSam(sql, lead, {
          eventId: `opportunity-value-${opportunity.id}`,
          eventDatetime: opportunity.contractSignedAt || opportunity.updatedAt,
          unit: opportunity.unitSamCode || opportunity.unit,
          project: opportunity.project || "",
          rawContractValue: opportunity.unitValue || "",
          contractValue: parseMoney(opportunity.unitValue || "")
        }, { unitValue: opportunity.unitValue || "", contractValue: opportunity.unitValue || "" }, opportunity);
      }
      if (opportunity.status && opportunity.status !== previousStatus) {
        await recordStructuredLeadStatusMovement(sql, {
          actor: user,
          lead,
          fromStatus: previousStatus,
          toStatus: opportunity.status,
          movementType: Object.prototype.hasOwnProperty.call(body, "order") ? "manual_drag" : "manual",
          source: "opportunity",
          screen: String(body.movementSource || "kanban"),
          statusAt: opportunity.updatedAt,
          details: { opportunityId: opportunity.id, unit: opportunity.unitSamCode || opportunity.unit }
        });
        await structuredFup(user, lead, "CHANGE_OPPORTUNITY_STATUS", { opportunityId: opportunity.id, from: previousStatus, to: opportunity.status, unit: opportunity.unitSamCode || opportunity.unit });
      }
      if (Object.prototype.hasOwnProperty.call(body, "assignedTo") && (opportunity.assignedTo || "") !== previousAssignedTo) {
        await structuredFup(user, lead, opportunity.assignedTo ? "ASSIGN_OPPORTUNITY_BROKER" : "UNASSIGN_OPPORTUNITY_BROKER", { opportunityId: opportunity.id, from: previousAssignedName, to: opportunity.assignedName || "" });
        if (opportunity.assignedTo) {
          const assignedUser = await activeStructuredBroker(sql, opportunity.assignedTo);
          if (assignedUser) await notifyLeadAssignment(await structuredNotificationDb(sql), { ...lead, assignedTo: opportunity.assignedTo, assignedName: opportunity.assignedName, desiredProject: opportunity.project, desiredUnit: opportunity.unitSamCode || opportunity.unit, unitValue: opportunity.unitValue }, assignedUser, Boolean(previousAssignedTo));
        }
      }
      return sendJson(res, 200, { lead: publicLead(lead, user), opportunity, dataSources: { action: "structured" } });
    }

    if (leadMatch && req.method === "DELETE") {
      if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
      await sql`DELETE FROM crm_opportunities WHERE lead_id = ${lead.id}`;
      await sql`DELETE FROM crm_lead_comments WHERE lead_id = ${lead.id}`;
      await sql`DELETE FROM crm_lead_tags WHERE lead_id = ${lead.id}`;
      await sql`DELETE FROM crm_lead_favorites WHERE lead_id = ${lead.id}`;
      await sql`DELETE FROM crm_leads WHERE id = ${lead.id}`;
      await structuredAudit(user, "DELETE_LEAD", { leadId: lead.id, leadName: lead.name || "", source: lead.source || "" });
      await structuredFup(user, lead, "DELETE_LEAD", { source: lead.source || "", status: lead.status || "" });
      return sendJson(res, 200, { ok: true, dataSources: { action: "structured" } });
    }

    if (leadMatch && req.method === "PATCH") {
      if (user.role === "Corretor" && lead.assignedTo !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const previousStatus = lead.status;
      const previousAssignedTo = lead.assignedTo || null;
      const previousAssignedName = lead.assignedName || "";
      const previousOrder = Number(lead.order || 0);
      const previousFavorite = Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite);
      const previousTags = new Set((lead.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean));
      const hasStatusPayload = Object.prototype.hasOwnProperty.call(body, "status");
      const hasManualSamStatusDate = Object.prototype.hasOwnProperty.call(body, "manualSamStatusDate") || Object.prototype.hasOwnProperty.call(body, "samStatusDate");
      const bodyStatusIsSamOnly = hasStatusPayload && await isStructuredSamOnlyStatus(sql, body.status);
      const changingToSamOnlyStatus = hasStatusPayload && body.status !== previousStatus && bodyStatusIsSamOnly;
      const datingCurrentSamOnlyStatus = hasManualSamStatusDate && hasStatusPayload && body.status === previousStatus && bodyStatusIsSamOnly;
      let manualSamStatusAt = "";
      if (changingToSamOnlyStatus || datingCurrentSamOnlyStatus) {
        if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão para avanço histórico SAM." });
        manualSamStatusAt = parseManualSamStatusDate(body.manualSamStatusDate || body.samStatusDate);
        if (!manualSamStatusAt) return sendJson(res, 400, { error: "Informe a data em que o lead atingiu este status." });
      }
      const detailFields = ["name", "phone", "email", "assistant", "desiredProject", "desiredUnit", "unitValue", "notes", "tags"];
      const allowed = canManageLeads(user) && lead.inPipeline
        ? ["status", "favorite", "assignedTo", "order", ...detailFields]
        : canEditLead(user, lead) && lead.inPipeline
          ? ["status", "favorite", "order", ...detailFields]
          : ["favorite"];
      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        if (key === "tags") {
          lead.tags = Array.isArray(body.tags)
            ? [...new Set(body.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 12)
            : [];
        } else if (key === "favorite") {
          const favorite = Boolean(body.favorite);
          lead.favoritesByUser[user.id] = favorite;
          lead.favorite = Object.values(lead.favoritesByUser).some(Boolean);
          await sql`INSERT INTO crm_lead_favorites (lead_id, user_id, favorite) VALUES (${lead.id}, ${user.id}, ${favorite}) ON CONFLICT (lead_id, user_id) DO UPDATE SET favorite = EXCLUDED.favorite`;
        } else if (key === "assignedTo") {
          const assignedUser = body.assignedTo ? await activeStructuredBroker(sql, body.assignedTo) : null;
          if (body.assignedTo && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
          lead.assignedTo = assignedUser?.id || null;
          lead.assignedName = assignedUser?.name || "";
        } else {
          lead[key] = body[key];
        }
      }
      if (manualSamStatusAt) {
        lead.manualSamStatusHistory = Array.isArray(lead.manualSamStatusHistory) ? lead.manualSamStatusHistory : [];
        lead.manualSamStatusHistory.unshift({
          status: lead.status,
          statusAt: manualSamStatusAt,
          registeredAt: new Date().toISOString(),
          registeredBy: user.id,
          registeredByName: user.name || user.username || ""
        });
        lead.samLastEvent = {
          eventId: "manual-historical",
          eventType: "manual_historical_status",
          eventDatetime: manualSamStatusAt,
          unit: lead.desiredUnit || lead.unit || "",
          project: lead.desiredProject || "",
          nextStatus: lead.status,
          appliedAt: new Date().toISOString(),
          manual: true
        };
      }
      if (body.status && body.status !== previousStatus && !Object.prototype.hasOwnProperty.call(body, "order")) lead.order = Date.now();
      lead.updatedAt = new Date().toISOString();
      await saveStructuredLead(sql, lead);
      if (Object.prototype.hasOwnProperty.call(body, "tags")) {
        await sql`DELETE FROM crm_lead_tags WHERE lead_id = ${lead.id}`;
        for (const tag of lead.tags || []) {
          await sql`INSERT INTO crm_lead_tags (lead_id, tag_id) VALUES (${lead.id}, ${String(tag)}) ON CONFLICT DO NOTHING`;
        }
        const addedTags = (lead.tags || []).filter((tag) => !previousTags.has(String(tag || "").trim()));
        await enqueueStructuredMetaConversionsForTags(sql, user, lead, addedTags, {
          source: "user",
          screen: String(body.movementSource || "lead_detail")
        });
      }
      await structuredAudit(user, "UPDATE_LEAD", { leadId: lead.id, changes: body });
      if (Object.prototype.hasOwnProperty.call(body, "assignedTo") && (lead.assignedTo || null) !== previousAssignedTo) {
        await structuredFup(user, lead, lead.assignedTo ? "ASSIGN_BROKER" : "UNASSIGN_BROKER", { from: previousAssignedName, to: lead.assignedName || "" });
        if (lead.assignedTo) {
          const assignedUser = await activeStructuredBroker(sql, lead.assignedTo);
          if (assignedUser) {
            await notifyLeadAssignment(await structuredNotificationDb(sql), lead, assignedUser, Boolean(previousAssignedTo));
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, "status") && lead.status !== previousStatus) {
        await recordStructuredLeadStatusMovement(sql, {
          actor: user,
          lead,
          fromStatus: previousStatus,
          toStatus: lead.status,
          movementType: manualSamStatusAt ? "historical_manual" : "manual",
          source: manualSamStatusAt ? "manual_sam_history" : "user",
          screen: String(body.movementSource || (Object.prototype.hasOwnProperty.call(body, "order") ? "kanban" : "lead_detail")),
          statusAt: manualSamStatusAt || lead.updatedAt,
          details: { manualSamStatusAt, order: Object.prototype.hasOwnProperty.call(body, "order") ? Number(lead.order || 0) : undefined }
        });
        await enqueueStructuredMetaConversionForStatus(sql, user, lead, previousStatus, lead.status, {
          source: manualSamStatusAt ? "manual_sam_history" : "user",
          screen: String(body.movementSource || (Object.prototype.hasOwnProperty.call(body, "order") ? "kanban" : "lead_detail")),
          statusAt: manualSamStatusAt || lead.updatedAt
        });
        await structuredFup(user, lead, manualSamStatusAt ? "CHANGE_STATUS_SAM_HISTORICAL" : "CHANGE_STATUS", { from: previousStatus, to: lead.status, manualSamStatusAt });
      } else if (manualSamStatusAt) {
        await recordStructuredLeadStatusMovement(sql, {
          actor: user,
          lead,
          fromStatus: lead.status,
          toStatus: lead.status,
          movementType: "historical_date",
          source: "manual_sam_history",
          screen: String(body.movementSource || "lead_detail"),
          statusAt: manualSamStatusAt,
          details: { manualSamStatusAt }
        });
        await structuredFup(user, lead, "SET_SAM_STATUS_DATE", { status: lead.status, manualSamStatusAt });
      }
      if (Object.prototype.hasOwnProperty.call(body, "order") && Number(lead.order || 0) !== previousOrder) {
        await structuredFup(user, lead, "CHANGE_ORDER_MANUAL", { from: previousOrder, to: Number(lead.order || 0), status: lead.status });
      }
      if (Object.prototype.hasOwnProperty.call(body, "favorite")) {
        const nextFavorite = Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite);
        if (nextFavorite !== previousFavorite) await structuredFup(user, lead, nextFavorite ? "FAVORITE_LEAD" : "UNFAVORITE_LEAD", {});
      }
      return sendJson(res, 200, { lead: publicLead(lead, user) });
    }

    if (commentMatch && req.method === "POST") {
      if (!canEditLead(user, lead) || !lead.inPipeline) return sendJson(res, 403, { error: "Sem permissão" });
      const body = await readBody(req);
      const text = String(body.text || "").trim();
      if (!text) return sendJson(res, 400, { error: "Comentário obrigatório" });
      const comment = {
        id: `comment-${crypto.randomUUID()}`,
        text,
        fromUser: Boolean(body.fromUser),
        createdAt: new Date().toISOString(),
        authorId: user.id,
        authorName: user.name
      };
      lead.comments = [comment, ...(lead.comments || [])];
      lead.updatedAt = comment.createdAt;
      await sql`INSERT INTO crm_lead_comments (id, lead_id, author_user_id, author_name, comment_text, from_user, deleted, created_at, payload) VALUES (${comment.id}, ${lead.id}, ${user.id}, ${user.name || ""}, ${comment.text}, ${comment.fromUser}, false, ${dbDate(comment.createdAt)}, ${JSON.stringify(comment)}::jsonb)`;
      await saveStructuredLead(sql, lead);
      await structuredAudit(user, "COMMENT_LEAD", { leadId: lead.id });
      await structuredFup(user, lead, "COMMENT_LEAD", { commentId: comment.id, fromUser: comment.fromUser });
      return sendJson(res, 201, { lead: publicLead(lead, user), comment });
    }

    if (commentDeleteMatch && req.method === "DELETE") {
      if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
      const commentId = decodeURIComponent(commentDeleteMatch[2]);
      const comments = Array.isArray(lead.comments) ? lead.comments : [];
      const index = comments.findIndex((comment) => comment.id === commentId);
      if (index === -1) {
        notFound(res);
        return true;
      }
      const comment = comments[index];
      if (user.role === "Admin TI") {
        comments.splice(index, 1);
        await sql`DELETE FROM crm_lead_comments WHERE id = ${commentId}`;
        await structuredAudit(user, "DELETE_COMMENT_PERMANENT", { leadId: lead.id, commentId });
      } else if (["Head Comercial", "Supervisor Comercial"].includes(user.role)) {
        comment.deletedAt = new Date().toISOString();
        comment.deletedBy = user.id;
        comment.deletedByName = user.name;
        comment.deletedText = comment.deletedText || comment.text;
        comment.text = "";
        await sql`UPDATE crm_lead_comments SET deleted = true, payload = ${JSON.stringify(comment)}::jsonb WHERE id = ${commentId}`;
        await structuredAudit(user, "DELETE_COMMENT_SOFT", { leadId: lead.id, commentId });
      } else {
        return sendJson(res, 403, { error: "Sem permissão" });
      }
      lead.comments = comments;
      lead.updatedAt = new Date().toISOString();
      await saveStructuredLead(sql, lead);
      return sendJson(res, 200, { lead: publicLead(lead, user) });
    }
    return false;
  } catch (error) {
    mirrorStructuredError("fast-lead-action", error);
    sendJson(res, 500, { error: "Erro interno" });
    return true;
  }
}

async function mirrorStructuredUser(user) {
  if (!user?.id) return;
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await saveStructuredUser(sql, user);
  } catch (error) {
    mirrorStructuredError("user", error);
  }
}

async function saveStructuredUser(sql, user) {
  await sql`INSERT INTO crm_users (id, username, name, role, active, operates_as_broker, notifications, password_hash, password_setup, photo_url, created_at, updated_at, payload)
    VALUES (${user.id}, ${user.username || ""}, ${user.name || ""}, ${user.role || ""}, ${user.active !== false}, ${Boolean(user.operatesAsBroker)}, ${JSON.stringify(user.notifications || {})}::jsonb, ${user.passwordHash || null}, ${JSON.stringify(user.passwordSetup || null)}::jsonb, ${user.photoUrl || ""}, ${dbDate(user.createdAt)}, ${dbDate(user.updatedAt)}, ${JSON.stringify(publicUser(user))}::jsonb)
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, name = EXCLUDED.name, role = EXCLUDED.role, active = EXCLUDED.active, operates_as_broker = EXCLUDED.operates_as_broker, notifications = EXCLUDED.notifications, password_hash = EXCLUDED.password_hash, password_setup = EXCLUDED.password_setup, photo_url = EXCLUDED.photo_url, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`;
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
}

async function deleteStructuredUser(userId) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    await sql`DELETE FROM crm_users WHERE id = ${userId}`;
    void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
  } catch (error) {
    mirrorStructuredError("delete-user", error);
  }
}

async function mirrorStructuredProjects(db) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    const definitions = Array.isArray(db.projectDefinitions) && db.projectDefinitions.length
      ? db.projectDefinitions
      : (db.projects || []).map((name, position) => ({ name, position }));
    await replaceStructuredProjects(sql, definitions);
  } catch (error) {
    mirrorStructuredError("projects", error);
  }
}

async function mirrorStructuredStatuses(db) {
  try {
    const sql = await structuredSqlForMirror();
    if (!sql) return;
    const definitions = Array.isArray(db.statusDefinitions) && db.statusDefinitions.length
      ? db.statusDefinitions
      : (db.pipelineStatuses || []).map((status, position) => ({ status, position }));
    await replaceStructuredStatuses(sql, definitions);
  } catch (error) {
    mirrorStructuredError("statuses", error);
  }
}

async function insertStructuredDataset(sql, db, key) {
  const summary = { [key]: 0 };
  ensurePermissions(db);
  if (key === "users") {
    for (const user of db.users || []) {
      await saveStructuredUser(sql, user);
      summary.users += 1;
    }
  } else if (key === "leads") {
    const leads = db.leads || [];
    const offset = await countStructuredTable(sql, "crm_leads");
    const limit = 500;
    const batch = leads.slice(offset, offset + limit);
    summary.offset = offset;
    summary.totalJson = leads.length;
    summary.remaining = Math.max(0, leads.length - offset - batch.length);
    for (const lead of batch) {
      const fields = structuredLeadDbFields(lead);
      await sql`INSERT INTO crm_leads (id, name, email, phone, source, source_status, odysseia_status, assistant, external_id, status, in_pipeline, assigned_to, assigned_name, project, unit, unit_value, base_source_before_pipeline, previous_pipeline_source, created_at, updated_at, payload) VALUES (${lead.id}, ${lead.name || ""}, ${lead.email || ""}, ${lead.phone || ""}, ${fields.source}, ${fields.sourceStatus}, ${fields.odysseiaStatus}, ${fields.assistant}, ${fields.externalId}, ${lead.status || ""}, ${Boolean(lead.inPipeline)}, ${lead.assignedTo || null}, ${lead.assignedName || ""}, ${fields.project}, ${fields.unit}, ${fields.unitValue}, ${fields.baseSourceBeforePipeline}, ${fields.previousPipelineSource}, ${dbDate(lead.createdAt || lead.meta?.createdTime)}, ${dbDate(lead.updatedAt)}, ${JSON.stringify(lead)}::jsonb)`;
      summary.leads += 1;
    }
  } else if (key === "opportunities") {
    const candidates = [
      ...(Array.isArray(db.opportunities) ? db.opportunities : []),
      ...(db.leads || []).flatMap((lead) => (lead.opportunities || []).map((opportunity) => ({ ...opportunity, leadId: opportunity.leadId || lead.id })))
    ];
    const opportunities = [...new Map(candidates.filter((item) => item?.id && item?.leadId).map((item) => [item.id, item])).values()];
    for (const opportunity of opportunities) {
      await saveStructuredOpportunity(sql, opportunity);
      summary.opportunities += 1;
    }
  } else if (key === "units") {
    const projectDefinitions = Array.isArray(db.projectDefinitions) ? db.projectDefinitions : [];
    for (const unit of db.unitDefinitions || db.units || []) {
      await saveStructuredUnit(sql, unit, projectDefinitions);
      summary.units += 1;
    }
  } else if (key === "comments") {
    for (const lead of db.leads || []) {
      for (const comment of lead.comments || []) {
        await sql`INSERT INTO crm_lead_comments (id, lead_id, author_user_id, author_name, comment_text, from_user, deleted, created_at, payload) VALUES (${comment.id || crypto.randomUUID()}, ${lead.id}, ${comment.userId || comment.authorId || ""}, ${comment.userName || comment.authorName || comment.author || ""}, ${comment.text || ""}, ${Boolean(comment.fromUser)}, ${Boolean(comment.deletedAt || comment.deleted)}, ${dbDate(comment.at || comment.createdAt)}, ${JSON.stringify(comment)}::jsonb)`;
        summary.comments += 1;
      }
    }
  } else if (key === "tags") {
    for (const lead of db.leads || []) {
      for (const tagId of lead.tags || lead.tagIds || []) {
        await sql`INSERT INTO crm_lead_tags (lead_id, tag_id) VALUES (${lead.id}, ${String(tagId)}) ON CONFLICT DO NOTHING`;
        summary.tags += 1;
      }
    }
  } else if (key === "tagDefinitions") {
    for (const tag of db.tagDefinitions || []) {
      await sql`INSERT INTO crm_tag_definitions (id, name, color, payload) VALUES (${tag.id}, ${tag.name || ""}, ${tag.color || "#475467"}, ${JSON.stringify(tag)}::jsonb) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, payload = EXCLUDED.payload`;
      summary.tagDefinitions += 1;
    }
  } else if (key === "favorites") {
    for (const lead of db.leads || []) {
      for (const [userId, favorite] of Object.entries(lead.favoritesByUser || {})) {
        await sql`INSERT INTO crm_lead_favorites (lead_id, user_id, favorite) VALUES (${lead.id}, ${userId}, ${Boolean(favorite)}) ON CONFLICT DO NOTHING`;
        summary.favorites += 1;
      }
    }
  } else if (key === "statuses") {
    const definitions = Array.isArray(db.statusDefinitions) && db.statusDefinitions.length
      ? db.statusDefinitions
      : (db.pipelineStatuses || []).map((status, position) => ({ status, position }));
    for (const [position, statusInput] of definitions.entries()) {
      const definition = normalizeStatusDefinition(statusInput, position);
      if (!definition.status) continue;
      await sql`INSERT INTO crm_pipeline_statuses (status, position, payload) VALUES (${definition.status}, ${position}, ${JSON.stringify(definition)}::jsonb)`;
      summary.statuses += 1;
    }
  } else if (key === "projects") {
    const definitions = Array.isArray(db.projectDefinitions) && db.projectDefinitions.length
      ? db.projectDefinitions
      : (db.projects || []).map((name, position) => ({ name, position }));
    for (const [position, projectInput] of definitions.entries()) {
      const project = normalizeProjectDefinition(projectInput, position);
      if (!project.name) continue;
      await sql`INSERT INTO crm_projects (name, position, payload) VALUES (${project.name}, ${position}, ${JSON.stringify(project)}::jsonb)`;
      summary.projects += 1;
    }
  } else if (key === "baseSources") {
    for (const source of allBaseSources(db)) {
      await sql`INSERT INTO crm_base_sources (name) VALUES (${source})`;
      summary.baseSources += 1;
    }
  } else if (key === "metaForms") {
    for (const form of db.integrations?.metaForms?.forms || []) {
      if (!form.id) continue;
      await sql`INSERT INTO crm_meta_forms (id, name, project, archived, ad_url, payload) VALUES (${form.id}, ${form.name || ""}, ${form.project || ""}, ${Boolean(form.archived)}, ${form.adUrl || form.adURL || ""}, ${JSON.stringify(form)}::jsonb)`;
      summary.metaForms += 1;
    }
  } else if (key === "settings") {
    const settings = {
      integrations: db.integrations || {},
      levFinanceSettings: db.levFinance?.settings || {},
      baseAccess: db.baseAccess || {},
      knowledgeChatSessions: db.knowledgeChatSessions || []
    };
    for (const [keyName, payload] of Object.entries(settings)) {
      await sql`INSERT INTO crm_settings (key, payload, updated_at) VALUES (${keyName}, ${JSON.stringify(payload)}::jsonb, now()) ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
      summary.settings += 1;
    }
  } else if (key === "permissions") {
    for (const [ownerType, owners] of Object.entries(db.permissions || {})) {
      if (!["roles", "users"].includes(ownerType) || !owners || typeof owners !== "object") continue;
      for (const [ownerId, rules] of Object.entries(owners)) {
        for (const [resourceId, cell] of Object.entries(rules || {})) {
          await sql`INSERT INTO crm_permissions (owner_type, owner_id, resource_id, can_access, can_act) VALUES (${ownerType === "roles" ? "role" : "user"}, ${ownerId}, ${resourceId}, ${Boolean(cell.access || cell.action)}, ${Boolean(cell.action)})`;
          summary.permissions += 1;
        }
      }
    }
  } else if (key === "auditLogs") {
    for (const [index, item] of (db.auditLog || []).entries()) {
      await sql`INSERT INTO crm_audit_logs (id, at, actor, actor_name, action, details, payload) VALUES (${logRowId("audit", item, index)}, ${dbDate(item.at)}, ${item.actor || ""}, ${item.actorName || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${JSON.stringify(item)}::jsonb)`;
      summary.auditLogs += 1;
    }
  } else if (key === "integrationLogs") {
    for (const [index, item] of (db.integrationLog || []).entries()) {
      await sql`INSERT INTO crm_integration_logs (id, at, provider, action, details, payload) VALUES (${logRowId("integration", item, index)}, ${dbDate(item.at)}, ${item.provider || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${JSON.stringify(item)}::jsonb)`;
      summary.integrationLogs += 1;
    }
  } else if (key === "fupLeadLogs") {
    for (const [index, item] of (db.fupLeadLog || []).entries()) {
      await sql`INSERT INTO crm_fup_lead_logs (id, at, lead_id, lead_name, actor, actor_name, action, details, payload) VALUES (${logRowId("fup", item, index)}, ${dbDate(item.at)}, ${item.leadId || ""}, ${item.leadName || ""}, ${item.actor || ""}, ${item.actorName || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${JSON.stringify(item)}::jsonb)`;
      summary.fupLeadLogs += 1;
    }
  } else if (key === "leadStatusMovements") {
    for (const item of db.leadStatusMovements || []) {
      await recordStructuredLeadStatusMovement(sql, {
        actor: {
          id: item.actorId || "",
          username: item.actorUsername || "",
          name: item.actorName || "",
          role: item.actorRole || ""
        },
        lead: { id: item.leadId, name: item.leadName || "" },
        fromStatus: item.fromStatus || "",
        toStatus: item.toStatus || "",
        movementType: item.movementType || "imported",
        source: item.source || "backup",
        screen: item.screen || "",
        movedAt: item.movedAt || "",
        statusAt: item.statusAt || item.movedAt || "",
        samEventId: item.samEventId || "",
        details: item.details || {}
      });
      summary.leadStatusMovements += 1;
    }
  } else if (key === "samEvents") {
    for (const item of db.samEvents || []) {
      await saveStructuredSamEvent(sql, item);
      summary.samEvents += 1;
    }
  } else if (key === "levSales") {
    for (const sale of db.levFinance?.sales || []) {
      await saveStructuredLevSale(sql, sale);
      summary.levSales += 1;
    }
  } else if (key === "levReceipts") {
    for (const receipt of db.levFinance?.receipts || []) {
      await saveStructuredLevReceipt(sql, receipt);
      summary.levReceipts += 1;
    }
  } else if (key === "levSettlements") {
    for (const settlement of db.levFinance?.settlements || []) {
      await saveStructuredLevSettlement(sql, settlement);
      summary.levSettlements += 1;
    }
  } else if (key === "knowledgeArticles") {
    for (const article of db.knowledgeArticles || []) {
      await sql`INSERT INTO crm_knowledge_articles (id, title, category, published, updated_at, payload) VALUES (${article.id}, ${article.title || ""}, ${article.category || ""}, ${article.published !== false}, ${dbDate(article.updatedAt)}, ${JSON.stringify(article)}::jsonb)`;
      summary.knowledgeArticles += 1;
    }
  } else {
    structuredDataset(key);
  }
  return summary;
}

async function syncStructuredDataset(db, actor, key, options = {}) {
  structuredDataset(key);
  const sql = await getSql();
  if (!sql) throw new Error("Postgres não está configurado neste ambiente.");
  await ensureStructuredSchemaOnce(sql);
  const runId = crypto.randomUUID();
  const shouldReset = Boolean(options.reset);
  const startedSummary = { dataset: key, reset: shouldReset };
  await sql`INSERT INTO crm_structured_sync_runs (id, status, summary) VALUES (${runId}, 'running', ${JSON.stringify(startedSummary)}::jsonb)`;
  try {
    if (shouldReset) await clearStructuredDataset(sql, key);
    const summary = { dataset: key, reset: shouldReset, ...(await insertStructuredDataset(sql, db, key)) };
    await sql`UPDATE crm_structured_sync_runs SET status = 'success', finished_at = now(), summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${runId}`;
    void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
    audit(db, actor, "SYNC_STRUCTURED_DATASET", summary);
    return { runId, summary };
  } catch (error) {
    await sql`UPDATE crm_structured_sync_runs SET status = 'error', finished_at = now(), error = ${error.message} WHERE id = ${runId}`;
    throw error;
  }
}

async function resetStructuredDataset(db, actor, key) {
  structuredDataset(key);
  const sql = await getSql();
  if (!sql) throw new Error("Postgres não está configurado neste ambiente.");
  await ensureStructuredSchemaOnce(sql);
  await clearStructuredDataset(sql, key);
  const summary = { dataset: key, resetOnly: true };
  const runId = crypto.randomUUID();
  await sql`INSERT INTO crm_structured_sync_runs (id, status, finished_at, summary) VALUES (${runId}, 'reset', now(), ${JSON.stringify(summary)}::jsonb)`;
  void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
  audit(db, actor, "RESET_STRUCTURED_DATASET", summary);
  return { runId, summary };
}

async function syncStructuredDb(db, actor) {
  const sql = await getSql();
  if (!sql) throw new Error("Postgres não está configurado neste ambiente.");
  await ensureStructuredSchemaOnce(sql);
  const runId = crypto.randomUUID();
  await sql`INSERT INTO crm_structured_sync_runs (id, status, summary) VALUES (${runId}, 'running', '{}'::jsonb)`;
  const summary = { users: 0, leads: 0, opportunities: 0, units: 0, comments: 0, tags: 0, tagDefinitions: 0, favorites: 0, statuses: 0, projects: 0, baseSources: 0, metaForms: 0, settings: 0, permissions: 0, auditLogs: 0, accessLogs: 0, integrationLogs: 0, fupLeadLogs: 0, leadStatusMovements: 0, samEvents: 0, levSales: 0, levReceipts: 0, levSettlements: 0, smlSales: 0, smlReceipts: 0, smlSettlements: 0, smlAuthorizationLinks: 0, metaLeadHealth: 0, metaConversionEvents: 0, knowledgeArticles: 0 };
  try {
    ensurePermissions(db);
    await clearStructuredTables(sql);
    for (const user of db.users || []) {
      await saveStructuredUser(sql, user);
      summary.users += 1;
    }
    for (const lead of db.leads || []) {
      const fields = structuredLeadDbFields(lead);
      await sql`INSERT INTO crm_leads (id, name, email, phone, source, source_status, odysseia_status, assistant, external_id, status, in_pipeline, assigned_to, assigned_name, project, unit, unit_value, base_source_before_pipeline, previous_pipeline_source, created_at, updated_at, payload) VALUES (${lead.id}, ${lead.name || ""}, ${lead.email || ""}, ${lead.phone || ""}, ${fields.source}, ${fields.sourceStatus}, ${fields.odysseiaStatus}, ${fields.assistant}, ${fields.externalId}, ${lead.status || ""}, ${Boolean(lead.inPipeline)}, ${lead.assignedTo || null}, ${lead.assignedName || ""}, ${fields.project}, ${fields.unit}, ${fields.unitValue}, ${fields.baseSourceBeforePipeline}, ${fields.previousPipelineSource}, ${dbDate(lead.createdAt || lead.meta?.createdTime)}, ${dbDate(lead.updatedAt)}, ${JSON.stringify(lead)}::jsonb)`;
      summary.leads += 1;
      for (const comment of lead.comments || []) {
        await sql`INSERT INTO crm_lead_comments (id, lead_id, author_user_id, author_name, comment_text, from_user, deleted, created_at, payload) VALUES (${comment.id || crypto.randomUUID()}, ${lead.id}, ${comment.userId || comment.authorId || ""}, ${comment.userName || comment.authorName || comment.author || ""}, ${comment.text || ""}, ${Boolean(comment.fromUser)}, ${Boolean(comment.deletedAt || comment.deleted)}, ${dbDate(comment.at || comment.createdAt)}, ${JSON.stringify(comment)}::jsonb)`;
        summary.comments += 1;
      }
      for (const tagId of lead.tags || lead.tagIds || []) {
        await sql`INSERT INTO crm_lead_tags (lead_id, tag_id) VALUES (${lead.id}, ${String(tagId)}) ON CONFLICT DO NOTHING`;
        summary.tags += 1;
      }
      for (const [userId, favorite] of Object.entries(lead.favoritesByUser || {})) {
        await sql`INSERT INTO crm_lead_favorites (lead_id, user_id, favorite) VALUES (${lead.id}, ${userId}, ${Boolean(favorite)}) ON CONFLICT DO NOTHING`;
        summary.favorites += 1;
      }
    }
    const opportunityCandidates = [
      ...(Array.isArray(db.opportunities) ? db.opportunities : []),
      ...(db.leads || []).flatMap((lead) => Array.isArray(lead.opportunities) ? lead.opportunities : [])
    ];
    const opportunitiesById = new Map(opportunityCandidates.filter((opportunity) => opportunity?.id && opportunity?.leadId).map((opportunity) => [opportunity.id, opportunity]));
    for (const opportunity of opportunitiesById.values()) {
      await saveStructuredOpportunity(sql, opportunity);
      summary.opportunities += 1;
    }
    const statusDefinitions = Array.isArray(db.statusDefinitions) && db.statusDefinitions.length
      ? db.statusDefinitions
      : (db.pipelineStatuses || []).map((status, position) => ({ status, position }));
    for (const [position, statusInput] of statusDefinitions.entries()) {
      const definition = normalizeStatusDefinition(statusInput, position);
      if (!definition.status) continue;
      await sql`INSERT INTO crm_pipeline_statuses (status, position, payload) VALUES (${definition.status}, ${position}, ${JSON.stringify(definition)}::jsonb)`;
      summary.statuses += 1;
    }
    const projectDefinitions = Array.isArray(db.projectDefinitions) && db.projectDefinitions.length
      ? db.projectDefinitions
      : (db.projects || []).map((name, position) => ({ name, position }));
    for (const [position, projectInput] of projectDefinitions.entries()) {
      const project = normalizeProjectDefinition(projectInput, position);
      if (!project.name) continue;
      await sql`INSERT INTO crm_projects (name, position, payload) VALUES (${project.name}, ${position}, ${JSON.stringify(project)}::jsonb)`;
      summary.projects += 1;
    }
    for (const unit of db.unitDefinitions || []) {
      await saveStructuredUnit(sql, unit, projectDefinitions);
      summary.units += 1;
    }
    for (const tag of db.tagDefinitions || []) {
      await sql`INSERT INTO crm_tag_definitions (id, name, color, payload) VALUES (${tag.id}, ${tag.name || ""}, ${tag.color || "#475467"}, ${JSON.stringify(tag)}::jsonb) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, payload = EXCLUDED.payload`;
      summary.tagDefinitions += 1;
    }
    for (const source of allBaseSources(db)) {
      await sql`INSERT INTO crm_base_sources (name) VALUES (${source})`;
      summary.baseSources += 1;
    }
    for (const form of db.integrations?.metaForms?.forms || []) {
      await sql`INSERT INTO crm_meta_forms (id, name, project, archived, ad_url, payload) VALUES (${form.id}, ${form.name || ""}, ${form.project || ""}, ${Boolean(form.archived)}, ${form.adUrl || form.adURL || ""}, ${JSON.stringify(form)}::jsonb)`;
      summary.metaForms += 1;
    }
    for (const [keyName, payload] of Object.entries({
      ...(db.structuredSettings && typeof db.structuredSettings === "object" ? db.structuredSettings : {}),
      integrations: db.integrations || {},
      levFinanceSettings: db.levFinance?.settings || {},
      baseAccess: db.baseAccess || {},
      knowledgeChatSessions: db.knowledgeChatSessions || [],
      availabilitySettings: db.availabilitySettings || normalizeAvailabilitySettings({})
    })) {
      await sql`INSERT INTO crm_settings (key, payload, updated_at) VALUES (${keyName}, ${JSON.stringify(payload)}::jsonb, now()) ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
      summary.settings += 1;
    }
    for (const [ownerType, owners] of Object.entries(db.permissions || {})) {
      if (!["roles", "users"].includes(ownerType) || !owners || typeof owners !== "object") continue;
      for (const [ownerId, rules] of Object.entries(owners)) {
        for (const [resourceId, cell] of Object.entries(rules || {})) {
          await sql`INSERT INTO crm_permissions (owner_type, owner_id, resource_id, can_access, can_act) VALUES (${ownerType === "roles" ? "role" : "user"}, ${ownerId}, ${resourceId}, ${Boolean(cell.access || cell.action)}, ${Boolean(cell.action)})`;
          summary.permissions += 1;
        }
      }
    }
    for (const [index, item] of (db.auditLog || []).entries()) {
      await sql`INSERT INTO crm_audit_logs (id, at, actor, actor_name, action, details, payload) VALUES (${logRowId("audit", item, index)}, ${dbDate(item.at)}, ${item.actor || ""}, ${item.actorName || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${JSON.stringify(item)}::jsonb)`;
      summary.auditLogs += 1;
    }
    for (const [index, item] of (db.accessLog || []).entries()) {
      await sql`INSERT INTO crm_access_logs (id, at, actor, actor_name, role, action, details, ip, user_agent, payload) VALUES (${logRowId("access", item, index)}, ${dbDate(item.at)}, ${item.actor || ""}, ${item.actorName || ""}, ${item.role || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${item.ip || ""}, ${item.userAgent || ""}, ${JSON.stringify(item)}::jsonb)`;
      summary.accessLogs += 1;
    }
    for (const [index, item] of (db.integrationLog || []).entries()) {
      await sql`INSERT INTO crm_integration_logs (id, at, provider, action, details, payload) VALUES (${logRowId("integration", item, index)}, ${dbDate(item.at)}, ${item.provider || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${JSON.stringify(item)}::jsonb)`;
      summary.integrationLogs += 1;
    }
    for (const [index, item] of (db.fupLeadLog || []).entries()) {
      await sql`INSERT INTO crm_fup_lead_logs (id, at, lead_id, lead_name, actor, actor_name, action, details, payload) VALUES (${logRowId("fup", item, index)}, ${dbDate(item.at)}, ${item.leadId || ""}, ${item.leadName || ""}, ${item.actor || ""}, ${item.actorName || ""}, ${item.action || ""}, ${JSON.stringify(item.details || {})}::jsonb, ${JSON.stringify(item)}::jsonb)`;
      summary.fupLeadLogs += 1;
    }
    for (const item of db.leadStatusMovements || []) {
      await recordStructuredLeadStatusMovement(sql, {
        actor: {
          id: item.actorId || "",
          username: item.actorUsername || "",
          name: item.actorName || "",
          role: item.actorRole || ""
        },
        lead: { id: item.leadId, name: item.leadName || "" },
        fromStatus: item.fromStatus || "",
        toStatus: item.toStatus || "",
        movementType: item.movementType || "imported",
        source: item.source || "backup",
        screen: item.screen || "",
        movedAt: item.movedAt || "",
        statusAt: item.statusAt || item.movedAt || "",
        samEventId: item.samEventId || "",
        details: item.details || {}
      });
      summary.leadStatusMovements += 1;
    }
    for (const item of db.samEvents || []) {
      await saveStructuredSamEvent(sql, item);
      summary.samEvents += 1;
    }
    for (const sale of db.levFinance?.sales || []) {
      await saveStructuredLevSale(sql, sale);
      summary.levSales += 1;
    }
    for (const receipt of db.levFinance?.receipts || []) {
      await saveStructuredLevReceipt(sql, receipt);
      summary.levReceipts += 1;
    }
    for (const settlement of db.levFinance?.settlements || []) {
      await saveStructuredLevSettlement(sql, settlement);
      summary.levSettlements += 1;
    }
    for (const row of db.smlFinance?.rawSales || []) {
      await sql`INSERT INTO crm_sml_sales (id, unit, client, signed_at, contract_value, signal_value, financing_value, commission_value, realtor_company, zero_entry, status, nf_number, paid_at, payload) VALUES (${row.id}, ${row.unit || ""}, ${row.client || ""}, ${dbDate(row.signed_at)}, ${Number(row.contract_value || 0)}, ${Number(row.signal_value || 0)}, ${Number(row.financing_value || 0)}, ${Number(row.commission_value || 0)}, ${row.realtor_company || ""}, ${Boolean(row.zero_entry)}, ${row.status || ""}, ${row.nf_number || ""}, ${dbDate(row.paid_at)}, ${JSON.stringify(row.payload || {})}::jsonb)`;
      summary.smlSales += 1;
    }
    for (const row of db.smlFinance?.rawReceipts || []) {
      await sql`INSERT INTO crm_sml_receipts (id, unit, amount, paid_at, payload) VALUES (${row.id}, ${row.unit || ""}, ${Number(row.amount || 0)}, ${dbDate(row.paid_at)}, ${JSON.stringify(row.payload || {})}::jsonb)`;
      summary.smlReceipts += 1;
    }
    for (const row of db.smlFinance?.rawSettlements || []) {
      await sql`INSERT INTO crm_sml_settlements (id, unit, client, signed_at, contract_value, commission_value, realtor_company, status, nf_number, paid_at, payload) VALUES (${row.id}, ${row.unit || ""}, ${row.client || ""}, ${dbDate(row.signed_at)}, ${Number(row.contract_value || 0)}, ${Number(row.commission_value || 0)}, ${row.realtor_company || ""}, ${row.status || ""}, ${row.nf_number || ""}, ${dbDate(row.paid_at)}, ${JSON.stringify(row.payload || {})}::jsonb)`;
      summary.smlSettlements += 1;
    }
    for (const row of db.smlFinance?.authorizationLinks || []) {
      await sql`INSERT INTO crm_sml_authorization_links (id, token_hash, email, password_hash, sale_ids, expires_at, confirmed_at, payload) VALUES (${row.id}, ${row.token_hash}, ${row.email}, ${row.password_hash}, ${JSON.stringify(row.sale_ids || [])}::jsonb, ${dbDate(row.expires_at)}, ${dbDate(row.confirmed_at)}, ${JSON.stringify(row.payload || {})}::jsonb)`;
      summary.smlAuthorizationLinks += 1;
    }
    for (const row of db.metaLeadHealth || []) {
      await sql`INSERT INTO crm_meta_lead_health (project, last_lead_at, average_gap_minutes, current_gap_minutes, sample_size, status, alerted_at, updated_at, payload) VALUES (${row.project}, ${dbDate(row.last_lead_at)}, ${Number(row.average_gap_minutes || 0)}, ${Number(row.current_gap_minutes || 0)}, ${Number(row.sample_size || 0)}, ${row.status || "ok"}, ${dbDate(row.alerted_at)}, ${dbDate(row.updated_at)}, ${JSON.stringify(row.payload || {})}::jsonb)`;
      summary.metaLeadHealth += 1;
    }
    for (const row of db.metaConversionEvents || []) {
      await sql`INSERT INTO crm_meta_conversion_events (id, lead_id, source_type, source_key, event_id, event_name, status, attempts, last_error, payload, response, created_at, sent_at) VALUES (${row.id}, ${row.lead_id}, ${row.source_type}, ${row.source_key}, ${row.event_id}, ${row.event_name}, ${row.status || "pending"}, ${Number(row.attempts || 0)}, ${row.last_error || null}, ${JSON.stringify(row.payload || {})}::jsonb, ${JSON.stringify(row.response || {})}::jsonb, ${dbDate(row.created_at)}, ${dbDate(row.sent_at)})`;
      summary.metaConversionEvents += 1;
    }
    for (const article of db.knowledgeArticles || []) {
      await sql`INSERT INTO crm_knowledge_articles (id, title, category, published, updated_at, payload) VALUES (${article.id}, ${article.title || ""}, ${article.category || ""}, ${article.published !== false}, ${dbDate(article.updatedAt)}, ${JSON.stringify(article)}::jsonb)`;
      summary.knowledgeArticles += 1;
    }
    await sql`UPDATE crm_structured_sync_runs SET status = 'success', finished_at = now(), summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${runId}`;
    void invalidateStructuredConfigCache().catch((error) => mirrorStructuredError("redis-config-invalidate", error));
    audit(db, actor, "SYNC_STRUCTURED_DATABASE", summary);
    return { runId, summary };
  } catch (error) {
    await sql`UPDATE crm_structured_sync_runs SET status = 'error', finished_at = now(), summary = ${JSON.stringify(summary)}::jsonb, error = ${error.message} WHERE id = ${runId}`;
    throw error;
  }
}

async function structuredDbDiagnostics(db) {
  const sql = await getSql();
  if (!sql) throw new Error("Postgres não está configurado neste ambiente.");
  await ensureStructuredSchemaOnce(sql);
  const count = (table) => countStructuredTable(sql, table);
  const structured = {
    users: await count("crm_users"), leads: await count("crm_leads"), opportunities: await count("crm_opportunities"), units: await count("crm_units"), comments: await count("crm_lead_comments"),
    tags: await count("crm_lead_tags"), favorites: await count("crm_lead_favorites"), statuses: await count("crm_pipeline_statuses"),
    tagDefinitions: await count("crm_tag_definitions"), projects: await count("crm_projects"), baseSources: await count("crm_base_sources"), metaForms: await count("crm_meta_forms"),
    settings: await count("crm_settings"),
    permissions: await count("crm_permissions"), auditLogs: await count("crm_audit_logs"), accessLogs: await count("crm_access_logs"), integrationLogs: await count("crm_integration_logs"),
    fupLeadLogs: await count("crm_fup_lead_logs"), leadStatusMovements: await count("crm_lead_status_movements"), samEvents: await count("crm_sam_events"), levSales: await count("crm_lev_sales"), levReceipts: await count("crm_lev_receipts"), levSettlements: await count("crm_lev_settlements"),
    knowledgeArticles: await count("crm_knowledge_articles")
  };
  let json = { ...structured };
  if (db) {
    const permissions = ensurePermissions(db);
    json = {
      users: (db.users || []).length,
      leads: (db.leads || []).length,
      opportunities: Array.isArray(db.opportunities) ? db.opportunities.length : (db.leads || []).reduce((total, lead) => total + (lead.opportunities || []).length, 0),
      units: (db.unitDefinitions || []).length,
      comments: (db.leads || []).reduce((total, lead) => total + (lead.comments || []).length, 0),
      tags: (db.leads || []).reduce((total, lead) => total + (lead.tags || lead.tagIds || []).length, 0),
      tagDefinitions: (db.tagDefinitions || []).length,
      favorites: (db.leads || []).reduce((total, lead) => total + Object.keys(lead.favoritesByUser || {}).length, 0),
      statuses: (db.pipelineStatuses || []).length,
      projects: (db.projects || []).length,
      baseSources: allBaseSources(db).length,
      metaForms: (db.integrations?.metaForms?.forms || []).length,
      settings: 4,
      permissions: Object.values(permissions.roles || {}).reduce((total, rules) => total + Object.keys(rules || {}).length, 0) + Object.values(permissions.users || {}).reduce((total, rules) => total + Object.keys(rules || {}).length, 0),
      auditLogs: (db.auditLog || []).length,
      accessLogs: (db.accessLog || []).length,
      integrationLogs: (db.integrationLog || []).length,
      fupLeadLogs: (db.fupLeadLog || []).length,
      leadStatusMovements: (db.leadStatusMovements || []).length,
      samEvents: (db.samEvents || []).length,
      levSales: (db.levFinance?.sales || []).length,
      levReceipts: (db.levFinance?.receipts || []).length,
      levSettlements: (db.levFinance?.settlements || []).length,
      knowledgeArticles: (db.knowledgeArticles || []).length
    };
  }
  const latestRun = await sql`SELECT id, started_at, finished_at, status, summary, error FROM crm_structured_sync_runs ORDER BY started_at DESC LIMIT 1`;
  const recentRuns = await sql`SELECT id, started_at, finished_at, status, summary, error FROM crm_structured_sync_runs ORDER BY started_at DESC LIMIT 200`;
  const latestRuns = {};
  for (const run of recentRuns) {
    const summary = typeof run.summary === "string" ? safeJsonParse(run.summary, {}) : run.summary || {};
    const dataset = summary.dataset;
    if (dataset && !latestRuns[dataset]) latestRuns[dataset] = { ...run, summary };
  }
  const comparisons = Object.keys(json).map((key) => ({ key, json: json[key] || 0, structured: structured[key] || 0, ok: (json[key] || 0) === (structured[key] || 0) }));
  return { json, structured, comparisons, latestRun: latestRun[0] || null, latestRuns, mode: db ? "legacy-comparison" : "structured-only" };
}

function routeStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const publicPages = {
    "/politica-de-privacidade": "/politica-de-privacidade.html",
    "/exclusao-de-dados": "/exclusao-de-dados.html",
    "/termos-de-servico": "/termos-de-servico.html"
  };
  const routedRequest = publicPages[requested] || (path.extname(requested) ? requested : "/index.html");
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
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https://api.qrserver.com; media-src 'self' data: blob:; base-uri 'none'; frame-ancestors 'none'",
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
    return sendJson(res, 200, { ok: !result.errors.length, ...result });
  }

  if (method === "GET" && url.pathname === "/api/cron/meta-sync") {
    const secret = process.env.CRON_SECRET || "";
    if (!secret) return sendJson(res, 500, { error: "CRON_SECRET ausente" });
    if (req.headers.authorization !== `Bearer ${secret}`) return sendJson(res, 401, { error: "Não autorizado" });
    try {
      const result = await syncRecentMetaLeads(db, { username: "meta-cron" }, { days: Number(url.searchParams.get("days") || 2) });
      await saveDb(db);
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      integrationEvent(db, "META", "SYNC_CRON_ERROR", { error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (method === "POST" && url.pathname === "/api/webhooks/sam") {
    try {
      const auth = verifySamJwt(req);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
      let body;
      try {
        body = await readBody(req);
      } catch {
        integrationEvent(db, "SAM", "INVALID_JSON", {});
        await saveDb(db);
        return sendJson(res, 400, { error: "Payload inválido" });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        integrationEvent(db, "SAM", "INVALID_PAYLOAD_TYPE", { type: Array.isArray(body) ? "array" : typeof body });
        await saveDb(db);
        return sendJson(res, 400, { error: "Payload deve ser um objeto JSON" });
      }
      const forbiddenFields = ["cpf", "cnpj", "documento", "document", "nome", "name", "corretor", "broker", "imobiliaria", "imobiliária", "realEstate", "project", "projeto"];
      const receivedForbidden = forbiddenFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
      if (receivedForbidden.length) {
        integrationEvent(db, "SAM", "FORBIDDEN_FIELDS_REJECTED", { fields: receivedForbidden });
        await saveDb(db);
        return sendJson(res, 400, { error: "Payload contém campos não permitidos", fields: receivedForbidden });
      }
      const result = await processSamWebhook(db, body);
      await saveDb(db);
      const { httpStatus = 200, ...responseBody } = result;
      return sendJson(res, httpStatus, responseBody);
    } catch (error) {
      console.error("SAM_WEBHOOK_PROCESS_ERROR", error);
      try {
        integrationEvent(db, "SAM", "WEBHOOK_PROCESS_ERROR", { error: error.message });
        await saveDb(db);
      } catch (logError) {
        console.error("SAM_WEBHOOK_LOG_ERROR", logError);
      }
      return sendJson(res, 500, { error: "Erro interno no webhook SAM", detail: error.message });
    }
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
    const structuredLogs = canManageSettings(user) ? await structuredLogsForState(db) : { integrationLog: [], auditLog: [], fupLeadLog: [] };
    const structuredConfig = await structuredConfigForState(db);
    const structuredSamEvents = canManageSettings(user) ? await structuredSamEventsForState(db) : [];
    return sendJson(res, 200, {
      user: publicUser(user),
      roles: db.roles,
      projects: structuredConfig.projects,
      projectDefinitions: structuredConfig.projectDefinitions || [],
      unitDefinitions: structuredConfig.unitDefinitions || [],
      availabilitySettings: structuredConfig.availabilitySettings || normalizeAvailabilitySettings({}),
      pipelineStatuses: structuredConfig.pipelineStatuses,
      tagDefinitions: db.tagDefinitions || [],
      users: structuredConfig.users,
      leads: [],
      integrations: canManageSettings(user) ? db.integrations : null,
      baseAccess: canManagePipelineSettings(user) ? db.baseAccess : null,
      permissions: canManagePipelineSettings(user) ? ensurePermissions(db) : null,
      currentPermissions: ensurePermissions(db).users?.[user.id] || {},
      permissionResources: canManagePipelineSettings(user) ? permissionResources(db) : [],
      baseAccessSources: allBaseSources(db),
      accessibleBaseSources: accessibleBaseSources(db, user),
      actionableBaseSources: allBaseSources(db).filter((source) => permissionForUser(db, user, basePermissionId(source)).action),
      knowledgeCategories: KNOWLEDGE_CATEGORIES,
      knowledgeArticles: visibleKnowledgeArticles(db, user),
      knowledgeChatSessions: userKnowledgeChatSessions(db, user),
      canManageKnowledge: canManageKnowledge(user),
      canCreateKnowledge: canCreateKnowledge(user),
      integrationLog: structuredLogs.integrationLog,
      auditLog: structuredLogs.auditLog,
      samEvents: structuredSamEvents,
      accessLog: canManageSettings(user) ? db.accessLog.slice(0, 100) : [],
      fupLeadLog: structuredLogs.fupLeadLog,
      dataSources: {
        logs: structuredLogs.source,
        config: structuredConfig.source
      },
      marketing: normalizeMarketingData(db.marketing),
      levFinance: canAccessLevFinance(user) ? publicLevFinance(db) : null
    });
  }

  if (url.pathname === "/api/marketing/budget-categories" && method === "POST") {
    if (!permissionForUser(db, user, "screen:marketing").action) return sendJson(res, 403, { error: "Sem permissão" });
    const marketing = normalizeMarketingData(db.marketing);
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const group = String(body.group || "").trim();
    if (!name || !marketing.budgetGroups.includes(group)) return sendJson(res, 400, { error: "Nome e grupo financeiro válido são obrigatórios" });
    if (marketing.budgetCategories.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return sendJson(res, 409, { error: "Categoria já cadastrada" });
    const category = { id: `mkt-cat-${crypto.randomUUID()}`, name, group, active: true, createdAt: new Date().toISOString(), createdBy: user.username };
    marketing.budgetCategories.push(category);
    db.marketing = marketing;
    audit(db, user, "CREATE_MARKETING_BUDGET_CATEGORY", { categoryId: category.id, name, group });
    await saveDb(db);
    return sendJson(res, 201, { category, marketing });
  }

  if (url.pathname === "/api/marketing/budget-entries" && method === "POST") {
    if (!permissionForUser(db, user, "screen:marketing").action) return sendJson(res, 403, { error: "Sem permissão" });
    const marketing = normalizeMarketingData(db.marketing);
    const body = await readBody(req);
    const category = marketing.budgetCategories.find((item) => item.id === body.categoryId && item.active !== false);
    const competence = String(body.competence || "").slice(0, 7);
    const amount = Number(body.amount);
    const project = String(body.project || "").trim();
    if (!category || !/^\d{4}-\d{2}$/.test(competence) || !project || !Number.isFinite(amount) || amount < 0) return sendJson(res, 400, { error: "Categoria, empreendimento, competência e valor válido são obrigatórios" });
    const entry = { id: `mkt-budget-${crypto.randomUUID()}`, categoryId: category.id, categoryName: category.name, group: category.group, project, competence, amount, notes: String(body.notes || "").trim(), createdAt: new Date().toISOString(), createdBy: user.username };
    marketing.budgetEntries.push(entry);
    db.marketing = marketing;
    audit(db, user, "CREATE_MARKETING_BUDGET_ENTRY", { entryId: entry.id, categoryId: category.id, project, competence, amount });
    await saveDb(db);
    return sendJson(res, 201, { entry, marketing });
  }

  const marketingReconciliationCreateMatch = url.pathname.match(/^\/api\/marketing\/reconciliation\/([^/]+)\/create-expense$/);
  if (marketingReconciliationCreateMatch && method === "POST") {
    if (!permissionForUser(db, user, "screen:marketing").action) return sendJson(res, 403, { error: "Sem permissão" });
    const marketing = normalizeMarketingData(db.marketing);
    const candidate = marketing.reconciliationQueue.find((item) => item.id === marketingReconciliationCreateMatch[1]);
    if (!candidate) return sendJson(res, 404, { error: "Item de conciliação não encontrado" });
    if (candidate.status !== "pending") return sendJson(res, 400, { error: "Item de conciliação já tratado" });
    const body = await readBody(req);
    const expense = {
      ...candidate.expense,
      id: `mkt-exp-${crypto.randomUUID()}`,
      project: String(body.project || candidate.expense?.project || "").trim(),
      source: "manual_reconciliation",
      reconciliationId: candidate.id,
      createdAt: new Date().toISOString(),
      createdBy: user.username
    };
    if (!expense.project || !expense.paymentDate || !Number.isFinite(Number(expense.paidAmount))) {
      return sendJson(res, 400, { error: "Empreendimento, data de pagamento e valor são obrigatórios" });
    }
    marketing.actualExpenses.push(expense);
    candidate.status = "created_historical_expense";
    candidate.resolvedAt = new Date().toISOString();
    candidate.resolvedBy = user.username;
    candidate.expenseId = expense.id;
    db.marketing = marketing;
    audit(db, user, "CREATE_MARKETING_HISTORICAL_EXPENSE", { reconciliationId: candidate.id, expenseId: expense.id, project: expense.project, paidAmount: expense.paidAmount });
    await saveDb(db);
    return sendJson(res, 201, { expense, reconciliation: candidate, marketing });
  }

  const marketingProvisionPayMatch = url.pathname.match(/^\/api\/marketing\/provisions\/([^/]+)\/pay$/);
  if (marketingProvisionPayMatch && method === "POST") {
    if (!permissionForUser(db, user, "screen:marketing").action) return sendJson(res, 403, { error: "Sem permissão" });
    const marketing = normalizeMarketingData(db.marketing);
    const provisioningId = decodeURIComponent(marketingProvisionPayMatch[1]);
    const existingExpense = marketing.actualExpenses.find((item) => item.provisioningId === provisioningId);
    if (existingExpense) return sendJson(res, 200, { expense: existingExpense, idempotent: true, marketing });
    const body = await readBody(req);
    const paidAmount = Number(body.paidAmount);
    const paymentDate = String(body.paymentDate || "").slice(0, 10);
    if (!body.project || !paymentDate || !Number.isFinite(paidAmount)) return sendJson(res, 400, { error: "Empreendimento, data de pagamento e valor são obrigatórios" });
    const now = new Date().toISOString();
    let provision = marketing.provisions.find((item) => item.id === provisioningId);
    if (!provision) {
      provision = { id: provisioningId, createdAt: now };
      marketing.provisions.push(provision);
    }
    Object.assign(provision, {
      eventId: String(body.eventId || provision.eventId || ""),
      eventName: String(body.eventName || provision.eventName || ""),
      project: String(body.project),
      supplier: String(body.supplier || ""),
      label: String(body.label || ""),
      expectedAmount: Number(body.expectedAmount || paidAmount),
      paidAmount,
      paymentDate,
      document: String(body.document || ""),
      status: "paid",
      paidAt: now,
      paidBy: user.username,
      updatedAt: now
    });
    const expense = {
      id: `mkt-exp-${crypto.randomUUID()}`,
      project: provision.project,
      projectCode: provision.project === "Reserva Guinle" ? "RGL" : provision.project === "Golf Club Resort" ? "GOLF" : "",
      creditorName: provision.supplier,
      financialPlanCode: "",
      financialPlanName: "Ações e eventos",
      document: provision.document,
      paymentDate,
      originalAmount: provision.expectedAmount,
      paidAmount,
      notes: provision.label || provision.eventName,
      source: "provisioning",
      provisioningId,
      eventId: provision.eventId,
      createdAt: now,
      createdBy: user.username
    };
    marketing.actualExpenses.push(expense);
    db.marketing = marketing;
    audit(db, user, "PAY_MARKETING_PROVISION", { provisioningId, expenseId: expense.id, eventId: provision.eventId, project: provision.project, paidAmount, paymentDate });
    await saveDb(db);
    return sendJson(res, 201, { provision, expense, marketing });
  }

  const samEventActionMatch = url.pathname.match(/^\/api\/sam-events\/([^/]+)\/(link|ignore)$/);
  if (samEventActionMatch && method === "POST") {
    if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const event = (db.samEvents || []).find((item) => item.id === samEventActionMatch[1]);
    if (!event) return notFound(res);
    if (event.status === "linked" || event.status === "ignored") return sendJson(res, 400, { error: "Evento já tratado" });
    if (samEventActionMatch[2] === "ignore") {
      const body = await readBody(req);
      event.status = "ignored";
      event.resolution = "ignored";
      event.resolvedAt = new Date().toISOString();
      event.resolvedBy = user.username;
      event.ignoreReason = String(body.reason || "").trim();
      integrationEvent(db, "SAM", "IGNORED", { eventId: event.eventId, samEventId: event.id, reason: event.ignoreReason });
      audit(db, user, "IGNORE_SAM_EVENT", { samEventId: event.id, eventId: event.eventId });
      await saveDb(db);
      return sendJson(res, 200, { samEvent: event });
    }
    const body = await readBody(req);
    const lead = body.search ? findLeadForSamManualLink(db, body.search) : (db.leads || []).find((item) => item.id === (body.leadId || event.leadId));
    if (!lead) return sendJson(res, 404, { error: "Lead não encontrado" });
    const result = await applySamEventToLead(db, user, event, lead);
    audit(db, user, "LINK_SAM_EVENT", { samEventId: event.id, eventId: event.eventId, leadId: lead.id, from: result.previousStatus, to: result.nextStatus });
    await saveDb(db);
    return sendJson(res, 200, { samEvent: event, lead: publicLead(lead, user) });
  }

  if (method === "GET" && url.pathname === "/api/leads") {
    const requestedScope = String(url.searchParams.get("scope") || "all");
    const scope = ["pipeline", "bases", "all"].includes(requestedScope) ? requestedScope : "all";
    const structuredLeads = await structuredLeadsForState(db, user, scope);
    return sendJson(res, 200, {
      leads: structuredLeads.leads,
      scope,
      dataSources: { leads: structuredLeads.source }
    });
  }

  if (method === "POST" && url.pathname === "/api/access-log") {
    const body = await readBody(req);
    access(db, user, "VIEW", {
      path: String(body.path || "").slice(0, 160),
      view: String(body.view || "").slice(0, 80)
    }, req);
    const pathValue = String(body.path || "");
    const leadId = String(body.leadId || (pathValue.match(/^\/leads\/([^/?#]+)/)?.[1] ? decodeURIComponent(pathValue.match(/^\/leads\/([^/?#]+)/)[1]) : "")).trim();
    let loggedLeadFup = false;
    if (leadId) {
      const lead = db.leads.find((item) => item.id === leadId);
      if (lead) {
        fupLeadEvent(db, user, lead, "VIEW_LEAD_DETAIL", { path: pathValue });
        loggedLeadFup = true;
      }
    }
    if (loggedLeadFup) await saveDb(db);
    else await saveAccessLog(db);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "DELETE" && url.pathname === "/api/logs/fup-lead") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const cleared = Array.isArray(db.fupLeadLog) ? db.fupLeadLog.length : 0;
    db.fupLeadLog = [];
    try {
      const sql = await structuredSqlForMirror();
      if (sql) await clearStructuredTable(sql, "crm_fup_lead_logs");
    } catch (error) {
      mirrorStructuredError("clear-fup", error);
    }
    audit(db, user, "CLEAR_FUP_LEAD_LOG", { cleared });
    await saveDb(db);
    return sendJson(res, 200, { ok: true, cleared });
  }

  if (method === "PUT" && url.pathname === "/api/lev-finance/settings") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const paymentSchedule = Array.isArray(body.paymentSchedule)
      ? body.paymentSchedule.map((item) => ({
        start: String(item.start || "").trim(),
        end: String(item.end || "").trim(),
        paymentDate: String(item.paymentDate || "").trim()
      })).filter((item) => item.start && item.end && item.paymentDate)
        .sort((a, b) => new Date(`${a.start}T00:00:00`).getTime() - new Date(`${b.start}T00:00:00`).getTime())
      : db.levFinance.settings.paymentSchedule;
    db.levFinance.settings = {
      commissionPercent: Math.max(0, Number(body.commissionPercent || 0)),
      provisionTo: String(body.provisionTo || "").trim(),
      provisionCc: String(body.provisionCc || "").trim(),
      emailTemplate: normalizeLevFinanceEmailTemplate(body.emailTemplate || db.levFinance.settings.emailTemplate),
      paymentSchedule
    };
    audit(db, user, "UPDATE_LEV_FINANCE_SETTINGS", { commissionPercent: db.levFinance.settings.commissionPercent });
    await saveDb(db);
    return sendJson(res, 200, { levFinance: publicLevFinance(db) });
  }

  if (method === "DELETE" && url.pathname === "/api/lev-finance/data") {
    if (!canResetLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const cleared = {
      sales: db.levFinance.sales.length,
      receipts: db.levFinance.receipts.length,
      paidUnits: db.levFinance.paidUnits.length,
      settlements: db.levFinance.settlements.length
    };
    db.levFinance.sales = [];
    db.levFinance.receipts = [];
    db.levFinance.paidUnits = [];
    db.levFinance.settlements = [];
    db.levFinance.defaultSettlementsCleared = true;
    audit(db, user, "RESET_LEV_FINANCE_DATA", cleared);
    await saveDb(db);
    return sendJson(res, 200, { ok: true, cleared, levFinance: publicLevFinance(db) });
  }

  if (method === "POST" && url.pathname === "/api/lev-finance/extract") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const imageDataUrl = String(body.imageDataUrl || "");
    if (!imageDataUrl.startsWith("data:image/")) return sendJson(res, 400, { error: "Envie uma imagem válida" });
    let rawSales;
    try {
      rawSales = await extractLevSalesFromImage(imageDataUrl);
    } catch (error) {
      integrationEvent(db, "LEV_FINANCE", "IMAGE_EXTRACTION_FAILED", { error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
    const extraction = buildLevExtractionPreview(db, rawSales);
    audit(db, user, "PREVIEW_LEV_SALES_IMAGE", extraction.summary);
    await saveDb(db);
    return sendJson(res, 200, extraction);
  }

  if (method === "POST" && url.pathname === "/api/lev-finance/import-extracted") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const rawSales = Array.isArray(body.sales) ? body.sales : [];
    if (!rawSales.length) return sendJson(res, 400, { error: "Nenhuma venda válida para importar" });
    const settled = levFinanceSettledUnits(db);
    let created = 0;
    let duplicates = 0;
    let paidSkipped = 0;
    let invalidSkipped = 0;
    for (const raw of rawSales) {
      const sale = normalizeLevSale(raw, db.levFinance.settings);
      if (levSaleValidation(db, sale).length) {
        invalidSkipped += 1;
        continue;
      }
      if (settled.has(sale.unit)) {
        paidSkipped += 1;
        continue;
      }
      if (db.levFinance.sales.some((item) => item.unit === sale.unit)) {
        duplicates += 1;
        continue;
      }
      db.levFinance.sales.push(sale);
      upsertLevSettlement(db, sale, "Extraída, aguardando confirmação", "Imagem submetida no Financeiro Lev");
      created += 1;
    }
    audit(db, user, "IMPORT_LEV_SALES_IMAGE", { extracted: rawSales.length, created, duplicates, paidSkipped, invalidSkipped });
    await saveDb(db);
    return sendJson(res, 200, { levFinance: publicLevFinance(db), summary: { extracted: rawSales.length, created, duplicates, paidSkipped, invalidSkipped } });
  }

  if (method === "POST" && url.pathname === "/api/lev-finance/receipts") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const units = String(body.units || "")
      .split(/[\n,;]+/)
      .map((unit) => unit.trim())
      .filter(Boolean);
    if (!units.length) return sendJson(res, 400, { error: "Informe ao menos uma unidade paga" });
    const amount = parseMoney(body.amount);
    const receivedAt = String(body.receivedAt || saoPauloDateOnly()).trim();
    for (const unit of units) {
      if (!db.levFinance.paidUnits.includes(unit)) db.levFinance.paidUnits.push(unit);
      const sale = db.levFinance.sales.find((item) => item.unit === unit) || { unit, commissionValue: amount };
      upsertLevSettlement(db, sale, "Paga", String(body.note || "Recebimento registrado").trim() || "Recebimento registrado");
      db.levFinance.receipts.unshift({
        id: `lev-receipt-${crypto.randomUUID()}`,
        unit,
        amount,
        receivedAt,
        note: String(body.note || "").trim(),
        createdAt: new Date().toISOString(),
        createdBy: user.username
      });
    }
    audit(db, user, "REGISTER_LEV_RECEIPTS", { units: units.length, amount });
    await saveDb(db);
    return sendJson(res, 201, { levFinance: publicLevFinance(db) });
  }

  const levRecordMatch = url.pathname.match(/^\/api\/lev-finance\/records\/([^/]+)$/);
  if (levRecordMatch && method === "PATCH") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const { sale, settlement, unit } = findLevFinanceRecord(db, levRecordMatch[1]);
    if (!sale && !settlement) return notFound(res);
    let targetSale = sale;
    const action = String(body.action || "edit");

    if (action === "edit") {
      applyLevRecordFields(db, sale, settlement, body.fields || {});
    } else if (action === "confirm") {
      targetSale = targetSale || saleFromSettlement(db, settlement);
      targetSale.eligible = true;
      targetSale.status = "Confirmada";
      targetSale.confirmedAt = new Date().toISOString();
      targetSale.confirmedBy = user.username;
      targetSale.commissionPercent = Number(db.levFinance.settings.commissionPercent || targetSale.commissionPercent || 0);
      targetSale.commissionValue = Number(targetSale.contractValue || 0) * (targetSale.commissionPercent / 100);
      upsertLevSettlement(db, targetSale, "Confirmada", "Venda confirmada para envio em lote à Mauad");
      targetSale.updatedAt = new Date().toISOString();
      audit(db, user, "CONFIRM_LEV_SALE_ELIGIBILITY", { saleId: targetSale.id, unit: targetSale.unit, batchEmailPending: true });
      await saveDb(db);
      return sendJson(res, 200, { levFinance: publicLevFinance(db), email: { sent: false, reason: "Envio em lote pendente" } });
    } else if (action === "invoice_issued") {
      targetSale = targetSale || saleFromSettlement(db, settlement);
      targetSale.eligible = true;
      targetSale.status = "NF Emitida";
      targetSale.invoiceNumber = String(body.invoiceNumber || "").trim();
      targetSale.invoiceIssuedAt = String(body.invoiceIssuedAt || saoPauloDateOnly()).trim();
      targetSale.updatedAt = new Date().toISOString();
      upsertLevSettlement(db, targetSale, "NF Emitida", "NF registrada no Financeiro Lev");
    } else if (action === "paid") {
      targetSale = targetSale || saleFromSettlement(db, settlement);
      targetSale.status = "Paga";
      targetSale.paidAt = String(body.paidAt || saoPauloDateOnly()).trim();
      targetSale.updatedAt = new Date().toISOString();
      if (!db.levFinance.paidUnits.includes(targetSale.unit)) db.levFinance.paidUnits.push(targetSale.unit);
      upsertLevSettlement(db, targetSale, "Paga", "Pagamento registrado no Financeiro Lev");
      if (!db.levFinance.receipts.some((receipt) => normalizeLevUnit(receipt.unit) === normalizeLevUnit(targetSale.unit) && receipt.receivedAt === targetSale.paidAt)) {
        db.levFinance.receipts.unshift({
          id: `lev-receipt-${crypto.randomUUID()}`,
          unit: targetSale.unit,
          amount: Number(targetSale.commissionValue || 0),
          receivedAt: targetSale.paidAt,
          note: targetSale.invoiceNumber ? `NF ${targetSale.invoiceNumber}` : "NF paga",
          createdAt: new Date().toISOString(),
          createdBy: user.username
        });
      }
    } else {
      return sendJson(res, 400, { error: "Ação inválida" });
    }

    audit(db, user, "UPDATE_LEV_FINANCE_RECORD", { action, unit: normalizeLevUnit(unit || targetSale?.unit || settlement?.unit) });
    await saveDb(db);
    return sendJson(res, 200, { levFinance: publicLevFinance(db) });
  }

  if (levRecordMatch && method === "DELETE") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const { sale, settlement, unit } = findLevFinanceRecord(db, levRecordMatch[1]);
    if (!sale && !settlement) return notFound(res);
    deleteLevFinanceRecord(db, sale, settlement, unit);
    audit(db, user, "DELETE_LEV_FINANCE_RECORD", { unit: normalizeLevUnit(unit || sale?.unit || settlement?.unit) });
    await saveDb(db);
    return sendJson(res, 200, { levFinance: publicLevFinance(db) });
  }

  const levConfirmMatch = url.pathname.match(/^\/api\/lev-finance\/sales\/([^/]+)\/confirm$/);
  if (levConfirmMatch && method === "POST") {
    if (!canAccessLevFinance(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const sale = db.levFinance.sales.find((item) => item.id === levConfirmMatch[1]);
    if (!sale) return notFound(res);
    sale.eligible = true;
    sale.status = "Confirmada";
    sale.confirmedAt = new Date().toISOString();
    sale.confirmedBy = user.username;
    sale.commissionPercent = Number(db.levFinance.settings.commissionPercent || sale.commissionPercent || 0);
    sale.commissionValue = Number(sale.contractValue || 0) * (sale.commissionPercent / 100);
    upsertLevSettlement(db, sale, "Confirmada", "Venda confirmada para envio em lote à Mauad");
    sale.updatedAt = new Date().toISOString();
    audit(db, user, "CONFIRM_LEV_SALE_ELIGIBILITY", { saleId: sale.id, unit: sale.unit, batchEmailPending: true });
    await saveDb(db);
    return sendJson(res, 200, { levFinance: publicLevFinance(db), email: { sent: false, reason: "Envio em lote pendente" } });
  }

  if (method === "POST" && url.pathname === "/api/leads/check-duplicate") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const normalized = normalizeManualLeadPayload(db, body);
    if (normalized.error) return sendJson(res, 400, { error: normalized.error });
    const duplicate = findManualLeadDuplicate(db, normalized.lead);
    return sendJson(res, 200, {
      duplicate: duplicate ? publicLead(duplicate, user) : null,
      baseName: duplicate ? baseNameForLead(duplicate) : ""
    });
  }

  if (method === "POST" && url.pathname === "/api/leads/resolve-manual-duplicate") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    if (!db.pipelineStatuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de adicionar leads" });
    const body = await readBody(req);
    const duplicate = db.leads.find((item) => item.id === String(body.duplicateId || ""));
    if (!duplicate) return notFound(res);
    if (duplicate.inPipeline) return sendJson(res, 400, { error: "Este lead já está no pipeline" });
    const mode = String(body.mode || "");
    if (!["overwrite", "rescue"].includes(mode)) return sendJson(res, 400, { error: "Escolha inválida" });
    const normalized = normalizeManualLeadPayload(db, body.lead || {});
    if (normalized.error) return sendJson(res, 400, { error: normalized.error });
    const payload = normalized.lead;
    const requestedStatus = String(body.lead?.status || "").trim();
    const status = db.pipelineStatuses.includes(requestedStatus) ? requestedStatus : db.pipelineStatuses[0];
    const assignedUser = user.role === "Corretor"
      ? user
      : body.lead?.assignedTo
        ? db.users.find((item) => item.id === body.lead.assignedTo && isAssignableBroker(item))
        : null;
    if (body.lead?.assignedTo && user.role !== "Corretor" && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
    if (mode === "overwrite") {
      duplicate.name = payload.name;
      duplicate.phone = payload.phone;
      duplicate.email = payload.email;
      duplicate.desiredProject = payload.desiredProject;
      duplicate.desiredUnit = payload.desiredUnit;
      duplicate.unitValue = payload.unitValue;
      duplicate.notes = payload.notes;
      duplicate.impactedBySocial = payload.impactedBySocial;
    }
    rememberLeadBaseOrigin(duplicate);
    duplicate.manualLeadSource = payload.source;
    duplicate.inPipeline = true;
    duplicate.status = status;
    duplicate.assignedTo = assignedUser?.id || null;
    duplicate.assignedName = assignedUser?.name || "";
    duplicate.order = Date.now();
    duplicate.rescuedAt = new Date().toISOString();
    duplicate.updatedAt = duplicate.rescuedAt;
    duplicate.manualDuplicateResolution = mode;
    await mirrorStructuredLead(duplicate);
    audit(db, user, "RESOLVE_MANUAL_DUPLICATE_LEAD", { leadId: duplicate.id, mode, source: duplicate.source });
    fupLeadEvent(db, user, duplicate, "RESCUE_BASE_LEAD", { source: duplicate.source, mode, assignedTo: duplicate.assignedName || "" });
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(duplicate, user) });
  }

  if (method === "POST" && url.pathname === "/api/leads") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    if (!db.pipelineStatuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de adicionar leads" });
    const body = await readBody(req);
    const normalized = normalizeManualLeadPayload(db, body);
    if (normalized.error) return sendJson(res, 400, { error: normalized.error });
    const payload = normalized.lead;
    const duplicate = findManualLeadDuplicate(db, payload);
    if (duplicate) {
      return sendJson(res, 409, {
        error: `Lead já existente na base ${baseNameForLead(duplicate)}`,
        duplicate: publicLead(duplicate, user),
        baseName: baseNameForLead(duplicate)
      });
    }
    const requestedStatus = String(body.status || "").trim();
    const status = db.pipelineStatuses.includes(requestedStatus) ? requestedStatus : db.pipelineStatuses[0];
    const assignedUser = user.role === "Corretor"
      ? user
      : body.assignedTo
        ? db.users.find((item) => item.id === body.assignedTo && isAssignableBroker(item))
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
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      assistant: "",
      source: payload.source,
      status,
      inPipeline: true,
      favorite: false,
      favoritesByUser: {},
      assignedTo: assignedUser?.id || null,
      assignedName: assignedUser?.name || "",
      desiredProject: payload.desiredProject,
      desiredUnit: payload.desiredUnit,
      unitValue: payload.unitValue,
      notes: payload.notes,
      impactedBySocial: payload.impactedBySocial,
      tags,
      comments: [],
      order: Date.now(),
      createdAt: now,
      updatedAt: now
    };
    db.leads.push(lead);
    await mirrorStructuredLead(lead);
    audit(db, user, "CREATE_LEAD", { leadId: lead.id, source: lead.source });
    fupLeadEvent(db, user, lead, "CREATE_LEAD", { source: lead.source, assignedTo: lead.assignedName || "" });
    await saveDb(db);
    return sendJson(res, 201, { lead: publicLead(lead, user) });
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && method === "GET") {
    const lead = visibleLeads(db, user).find((item) => item.id === leadMatch[1]);
    if (!lead) return notFound(res);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  if (leadMatch && method === "PATCH") {
    const lead = db.leads.find((item) => item.id === leadMatch[1]);
    if (!lead) return notFound(res);
    if (user.role === "Corretor" && lead.assignedTo !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const previousStatus = lead.status;
    const previousAssignedTo = lead.assignedTo || null;
    const previousAssignedName = lead.assignedName || "";
    const previousOrder = Number(lead.order || 0);
    const previousFavorite = Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite);
    const detailFields = ["name", "phone", "email", "assistant", "desiredProject", "desiredUnit", "unitValue", "notes", "tags"];
    const allowed = canManageLeads(user) && lead.inPipeline
      ? ["status", "favorite", "assignedTo", "order", ...detailFields]
      : canEditLead(user, lead) && lead.inPipeline
        ? ["status", "favorite", "order", ...detailFields]
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
        const assignedUser = body.assignedTo ? db.users.find((item) => item.id === body.assignedTo && isAssignableBroker(item)) : null;
        if (body.assignedTo && !assignedUser) return sendJson(res, 400, { error: "Corretor ativo inválido" });
        lead.assignedTo = assignedUser?.id || null;
        lead.assignedName = assignedUser?.name || "";
      } else {
        lead[key] = body[key];
      }
    }
    if (body.status && body.status !== previousStatus && !Object.prototype.hasOwnProperty.call(body, "order")) {
      lead.order = Date.now();
    }
    lead.updatedAt = new Date().toISOString();
    audit(db, user, "UPDATE_LEAD", { leadId: lead.id, changes: body });
    if (Object.prototype.hasOwnProperty.call(body, "assignedTo") && (lead.assignedTo || null) !== previousAssignedTo) {
      fupLeadEvent(db, user, lead, lead.assignedTo ? "ASSIGN_BROKER" : "UNASSIGN_BROKER", {
        from: previousAssignedName,
        to: lead.assignedName || ""
      });
      if (lead.assignedTo) {
        const assignedUser = db.users.find((item) => item.id === lead.assignedTo && isAssignableBroker(item));
        if (assignedUser) await notifyLeadAssignment(db, lead, assignedUser, Boolean(previousAssignedTo));
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "status") && lead.status !== previousStatus) {
      fupLeadEvent(db, user, lead, "CHANGE_STATUS", { from: previousStatus, to: lead.status });
    }
    if (Object.prototype.hasOwnProperty.call(body, "order") && Number(lead.order || 0) !== previousOrder) {
      fupLeadEvent(db, user, lead, "CHANGE_ORDER_MANUAL", { from: previousOrder, to: Number(lead.order || 0), status: lead.status });
    }
    if (Object.prototype.hasOwnProperty.call(body, "favorite")) {
      const nextFavorite = Boolean(lead.favoritesByUser?.[user.id] ?? lead.favorite);
      if (nextFavorite !== previousFavorite) {
        fupLeadEvent(db, user, lead, nextFavorite ? "FAVORITE_LEAD" : "UNFAVORITE_LEAD", {});
      }
    }
    await mirrorStructuredLead(lead);
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  if (leadMatch && method === "DELETE") {
    if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = db.leads.findIndex((item) => item.id === leadMatch[1]);
    if (index < 0) return notFound(res);
    const [deleted] = db.leads.splice(index, 1);
    audit(db, user, "DELETE_LEAD", { leadId: deleted.id, source: deleted.source });
    fupLeadEvent(db, user, deleted, "DELETE_LEAD", { source: deleted.source });
    await deleteStructuredLead(deleted.id);
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
      fromUser: Boolean(body.fromUser),
      createdAt: new Date().toISOString(),
      authorId: user.id,
      authorName: user.name
    };
    if (!Array.isArray(lead.comments)) lead.comments = [];
    lead.comments.unshift(comment);
    lead.updatedAt = comment.createdAt;
    audit(db, user, "COMMENT_LEAD", { leadId: lead.id });
    fupLeadEvent(db, user, lead, "COMMENT_LEAD", { commentId: comment.id, fromUser: comment.fromUser });
    await mirrorStructuredLead(lead);
    await saveDb(db);
    return sendJson(res, 201, { lead: publicLead(lead, user), comment });
  }

  const commentDeleteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/comments\/([^/]+)$/);
  if (commentDeleteMatch && method === "DELETE") {
    const lead = db.leads.find((item) => item.id === commentDeleteMatch[1]);
    if (!lead) return notFound(res);
    if (!canManageLeads(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const comments = Array.isArray(lead.comments) ? lead.comments : [];
    const index = comments.findIndex((comment) => comment.id === commentDeleteMatch[2]);
    if (index === -1) return notFound(res);
    const comment = comments[index];
    if (user.role === "Admin TI") {
      comments.splice(index, 1);
      audit(db, user, "DELETE_COMMENT_PERMANENT", { leadId: lead.id, commentId: comment.id });
    } else if (["Head Comercial", "Supervisor Comercial"].includes(user.role)) {
      comment.deletedAt = new Date().toISOString();
      comment.deletedBy = user.id;
      comment.deletedByName = user.name;
      comment.deletedText = comment.deletedText || comment.text;
      comment.text = "";
      audit(db, user, "DELETE_COMMENT_SOFT", { leadId: lead.id, commentId: comment.id });
    } else {
      return sendJson(res, 403, { error: "Sem permissão" });
    }
    lead.comments = comments;
    lead.updatedAt = new Date().toISOString();
    await mirrorStructuredLead(lead);
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  const rescueMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rescue$/);
  if (rescueMatch && method === "POST") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    const lead = db.leads.find((item) => item.id === rescueMatch[1]);
    if (!lead) return notFound(res);
    if (!canActBaseLead(db, user, lead)) return sendJson(res, 403, { error: "Sem permissão para resgatar este lead" });
    if (lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está no pipeline" });
    if (!db.pipelineStatuses.length) return sendJson(res, 400, { error: "Cadastre o primeiro status do pipeline antes de resgatar leads" });
    rememberLeadBaseOrigin(lead);
    lead.inPipeline = true;
    lead.status = db.pipelineStatuses[0];
    const body = await readBody(req);
    if (user.role === "Corretor" || (canOperateAsBroker(user) && body.assignToSelf)) {
      lead.assignedTo = user.id;
      lead.assignedName = user.name;
    }
    lead.order = Date.now();
    lead.rescuedAt = new Date().toISOString();
    lead.updatedAt = lead.rescuedAt;
    audit(db, user, "RESCUE_BASE_LEAD", { leadId: lead.id, source: lead.source });
    fupLeadEvent(db, user, lead, "RESCUE_BASE_LEAD", { source: lead.source, assignedTo: lead.assignedName || "" });
    await mirrorStructuredLead(lead);
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  const rollbackMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rollback$/);
  if (rollbackMatch && method === "POST") {
    const lead = db.leads.find((item) => item.id === rollbackMatch[1]);
    if (!lead) return notFound(res);
    if (!canManageLeads(user) && !(user.role === "Corretor" && lead.assignedTo === user.id)) return sendJson(res, 403, { error: "Sem permissão" });
    if (!lead.inPipeline) return sendJson(res, 400, { error: "Este lead já está apenas na base" });
    const pipelineSource = lead.source || "";
    const previousSource = lead.baseSourceBeforePipeline || lead.previousPipelineSource || lead.source || "Pipeline GDrive";
    const previousStatus = lead.baseStatusBeforePipeline || lead.sourceStatus || lead.odysseiaStatus || lead.status || "Base";
    lead.inPipeline = false;
    lead.source = previousSource;
    lead.sourceStatus = previousStatus;
    lead.previousPipelineSource = pipelineSource;
    lead.status = previousStatus;
    lead.assignedTo = null;
    lead.assignedName = "";
    lead.rolledBackAt = new Date().toISOString();
    lead.updatedAt = lead.rolledBackAt;
    audit(db, user, "ROLLBACK_BASE_LEAD", { leadId: lead.id, source: lead.source, previousSource });
    await mirrorStructuredLead(lead);
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
      operatesAsBroker: ["Head Comercial", "Supervisor Comercial"].includes(body.role) && Boolean(body.operatesAsBroker),
      notifications: normalizeNotificationPreferences(body.notifications),
      passwordHash: null,
      createdAt: now,
      updatedAt: now
    };
    const token = createPasswordSetup(newUser);
    db.users.push(newUser);
    await mirrorStructuredUser(newUser);
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
    if (Object.prototype.hasOwnProperty.call(body, "username")) {
      if (user.role !== "Admin TI") return sendJson(res, 403, { error: "Apenas Admin TI pode alterar o e-mail de acesso" });
      const nextUsername = String(body.username || "").trim().toLowerCase();
      const isBuiltinAdmin = target.role === "Admin TI" && String(target.username || "").toLowerCase() === "admin";
      if (!isBuiltinAdmin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextUsername)) {
        return sendJson(res, 400, { error: "E-mail inválido" });
      }
      const emailInUse = db.users.some((item) => item.id !== target.id && String(item.username || "").toLowerCase() === nextUsername);
      if (emailInUse) return sendJson(res, 400, { error: "Este e-mail já está em uso por outro usuário" });
      if (!isBuiltinAdmin || nextUsername !== "admin") target.username = nextUsername;
    }
    const currentAssignableBroker = isAssignableBroker(target);
    const willDeactivateBroker = currentAssignableBroker && target.active && body.active === false;
    const assignedLeads = willDeactivateBroker ? db.leads.filter((lead) => lead.inPipeline && lead.assignedTo === target.id) : [];
    if (assignedLeads.length) {
      const replacement = body.reassignTo
        ? db.users.find((item) => item.id === body.reassignTo && isAssignableBroker(item) && item.id !== target.id)
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
    if (Object.prototype.hasOwnProperty.call(body, "operatesAsBroker")) {
      target.operatesAsBroker = ["Head Comercial", "Supervisor Comercial"].includes(target.role) && Boolean(body.operatesAsBroker);
    }
    if (Object.prototype.hasOwnProperty.call(body, "notifications")) {
      target.notifications = normalizeNotificationPreferences(body.notifications);
    }
    target.updatedAt = new Date().toISOString();
    await mirrorStructuredUser(target);
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
    await mirrorStructuredUser(target);
    const invitation = await sendPasswordSetupEmail(req, target, token);
    audit(db, user, "SEND_PASSWORD_INVITE", { userId: target.id, invitationSent: invitation.sent });
    await saveDb(db);
    return sendJson(res, 200, { user: publicUser(target), invitation });
  }

  const notificationTestMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/notification-test$/);
  if (notificationTestMatch && method === "POST") {
    if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const target = db.users.find((item) => item.id === notificationTestMatch[1]);
    if (!target) return notFound(res);
    if (!manageableRoles(user).includes(target.role) && target.id !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
    if (target.role !== "Admin TI") return sendJson(res, 403, { error: "Teste disponível apenas para usuários Admin TI" });
    if (!target.active) return sendJson(res, 400, { error: "Ative o usuário antes de testar notificações" });
    const results = await sendLeadNotificationTest(db, user, target);
    await saveDb(db);
    return sendJson(res, 200, { results });
  }

  const assignmentNotificationTestMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/assignment-notification-test$/);
  if (assignmentNotificationTestMatch && method === "POST") {
    if (!canManageUsers(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const target = db.users.find((item) => item.id === assignmentNotificationTestMatch[1]);
    if (!target) return notFound(res);
    if (!manageableRoles(user).includes(target.role) && target.id !== user.id) return sendJson(res, 403, { error: "Sem permissão" });
    if (target.role !== "Admin TI") return sendJson(res, 403, { error: "Teste disponível apenas para usuários Admin TI" });
    if (!target.active) return sendJson(res, 400, { error: "Ative o usuário antes de testar notificações" });
    const results = await sendLeadAssignmentNotificationTest(db, user, target);
    await saveDb(db);
    return sendJson(res, 200, { results });
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
    await deleteStructuredUser(deleted.id);
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

  if (url.pathname === "/api/integrations/meta/import-lead" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const leadgenId = String(body.leadgenId || "").trim();
    try {
      const imported = await importMetaLeadById(db, user, leadgenId, {});
      await saveDb(db);
      return sendJson(res, 200, { ok: true, status: imported.status, lead: publicLead(imported.lead, user) });
    } catch (error) {
      integrationEvent(db, "META", "MANUAL_IMPORT_ERROR", { leadgenId, error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/integrations/meta/sync-recent" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    try {
      const result = await syncRecentMetaLeads(db, user, { days: Number(body.days || 7), formId: body.formId });
      await saveDb(db);
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      integrationEvent(db, "META", "SYNC_MANUAL_ERROR", { error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/integrations/meta/subscribe-page" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const pageId = String(body.pageId || "").trim();
    try {
      const result = await subscribeMetaLeadgenPage(pageId);
      integrationEvent(db, "META", "PAGE_SUBSCRIBED", { pageId, fields: "leadgen" });
      audit(db, user, "SUBSCRIBE_META_PAGE", { pageId });
      await saveDb(db);
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      integrationEvent(db, "META", "PAGE_SUBSCRIBE_ERROR", { pageId, error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/integrations/meta/diagnostics" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    try {
      const diagnostics = await diagnoseMeta(db);
      audit(db, user, "DIAGNOSE_META", { forms: diagnostics.forms.length });
      await saveDb(db);
      return sendJson(res, 200, { ok: true, diagnostics });
    } catch (error) {
      integrationEvent(db, "META", "DIAGNOSTIC_ERROR", { error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/integrations/chatwoot/diagnostics" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    try {
      const diagnostics = await diagnoseChatwoot();
      integrationEvent(db, "CHATWOOT", "DIAGNOSTIC_OK", {
        accountId: diagnostics.accountId,
        inboxes: diagnostics.inboxes.length,
        agents: diagnostics.agents.length,
        teams: diagnostics.teams.length
      });
      audit(db, user, "DIAGNOSE_CHATWOOT", { accountId: diagnostics.accountId, inboxes: diagnostics.inboxes.length });
      await saveDb(db);
      return sendJson(res, 200, { ok: true, diagnostics });
    } catch (error) {
      integrationEvent(db, "CHATWOOT", "DIAGNOSTIC_ERROR", { error: error.message });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/knowledge" && method === "POST") {
    if (!canCreateKnowledge(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const articleData = normalizeKnowledgePayload(body);
    if (!articleData.title) return sendJson(res, 400, { error: "Título obrigatório" });
    if (!articleData.content) return sendJson(res, 400, { error: "Conteúdo obrigatório" });
    const now = new Date().toISOString();
    const article = {
      id: `kb-${crypto.randomUUID()}`,
      ...articleData,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.name || user.username
    };
    db.knowledgeArticles.unshift(article);
    audit(db, user, "CREATE_KNOWLEDGE_ARTICLE", { articleId: article.id, title: article.title });
    await saveDb(db);
    return sendJson(res, 201, { knowledgeArticles: visibleKnowledgeArticles(db, user) });
  }

  if (url.pathname === "/api/knowledge/ask" && method === "POST") {
    const body = await readBody(req);
    const question = String(body.question || "").trim();
    if (!question) return sendJson(res, 400, { error: "Digite uma pergunta." });
    const now = new Date().toISOString();
    let session = (db.knowledgeChatSessions || []).find((item) => item.id === String(body.sessionId || "") && item.userId === user.id);
    if (!session) {
      session = {
        id: `kc-${crypto.randomUUID()}`,
        userId: user.id,
        title: question ? question.slice(0, 64) : "Nova conversa",
        messages: [],
        generatedTutorialId: "",
        createdAt: now,
        updatedAt: now
      };
      db.knowledgeChatSessions.unshift(session);
    }
    try {
      const result = await answerKnowledgeQuestion(db, user, question);
      session.messages.push({ role: "user", text: question, sources: [], at: now });
      session.messages.push({ role: "assistant", text: result.answer, sources: result.sources || [], at: new Date().toISOString() });
      session.messages = session.messages.slice(-30);
      session.updatedAt = new Date().toISOString();
      if (!session.title || session.title === "Nova conversa") session.title = question.slice(0, 64) || "Nova conversa";
      const tutorialDraft = await generateTutorialDraftFromSession(db, user, session);
      audit(db, user, "ASK_KNOWLEDGE_AI", { question: question.slice(0, 180) });
      await saveDb(db);
      return sendJson(res, 200, {
        ...result,
        session: publicKnowledgeChatSession(session),
        knowledgeChatSessions: userKnowledgeChatSessions(db, user),
        tutorialDraft: tutorialDraft ? publicKnowledgeArticle(tutorialDraft) : null,
        knowledgeArticles: tutorialDraft ? visibleKnowledgeArticles(db, user) : undefined
      });
    } catch (error) {
      audit(db, user, "ASK_KNOWLEDGE_AI_ERROR", { error: error.message, question: question.slice(0, 180) });
      await saveDb(db);
      return sendJson(res, 400, { error: error.message });
    }
  }

  const knowledgeMatch = url.pathname.match(/^\/api\/knowledge\/([^/]+)$/);
  if (knowledgeMatch && method === "PATCH") {
    if (!canManageKnowledge(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const article = db.knowledgeArticles.find((item) => item.id === knowledgeMatch[1]);
    if (!article) return notFound(res);
    const body = await readBody(req);
    const articleData = normalizeKnowledgePayload(body, article);
    if (!articleData.title) return sendJson(res, 400, { error: "Título obrigatório" });
    if (!articleData.content) return sendJson(res, 400, { error: "Conteúdo obrigatório" });
    Object.assign(article, articleData, {
      updatedAt: new Date().toISOString(),
      updatedBy: user.name || user.username
    });
    audit(db, user, "UPDATE_KNOWLEDGE_ARTICLE", { articleId: article.id, title: article.title });
    await saveDb(db);
    return sendJson(res, 200, { knowledgeArticles: visibleKnowledgeArticles(db, user) });
  }

  if (knowledgeMatch && method === "DELETE") {
    if (!canManageKnowledge(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = db.knowledgeArticles.findIndex((item) => item.id === knowledgeMatch[1]);
    if (index < 0) return notFound(res);
    const [article] = db.knowledgeArticles.splice(index, 1);
    audit(db, user, "DELETE_KNOWLEDGE_ARTICLE", { articleId: article.id, title: article.title });
    await saveDb(db);
    return sendJson(res, 200, { knowledgeArticles: visibleKnowledgeArticles(db, user) });
  }

  if (url.pathname === "/api/projects" && method === "POST") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if ((db.projects || []).includes(name)) return sendJson(res, 400, { error: "Empreendimento já existe" });
    db.projects = [...(db.projects || DEFAULT_PROJECTS), name];
    await mirrorStructuredProjects(db);
    audit(db, user, "CREATE_PROJECT", { name });
    await saveDb(db);
    return sendJson(res, 201, { projects: db.projects });
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && method === "PATCH") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = Number(projectMatch[1]);
    const oldName = db.projects?.[index];
    if (!oldName) return notFound(res);
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if (db.projects.some((project, projectIndex) => project === name && projectIndex !== index)) {
      return sendJson(res, 400, { error: "Empreendimento já existe" });
    }
    db.projects[index] = name;
    for (const lead of db.leads) {
      if (lead.desiredProject === oldName) lead.desiredProject = name;
    }
    for (const form of db.integrations?.metaForms?.forms || []) {
      if (form.project === oldName) form.project = name;
    }
    await mirrorStructuredProjects(db);
    audit(db, user, "UPDATE_PROJECT", { oldName, name });
    await saveDb(db);
    return sendJson(res, 200, { projects: db.projects });
  }

  if (projectMatch && method === "DELETE") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const index = Number(projectMatch[1]);
    const [deleted] = db.projects?.splice(index, 1) || [];
    if (!deleted) return notFound(res);
    for (const form of db.integrations?.metaForms?.forms || []) {
      if (form.project === deleted) form.project = "";
    }
    await mirrorStructuredProjects(db);
    audit(db, user, "DELETE_PROJECT", { name: deleted });
    await saveDb(db);
    return sendJson(res, 200, { projects: db.projects });
  }

  if (url.pathname === "/api/statuses" && method === "POST") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Nome obrigatório" });
    if (db.pipelineStatuses.includes(name)) return sendJson(res, 400, { error: "Status já existe" });
    db.pipelineStatuses.push(name);
    await mirrorStructuredStatuses(db);
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
    await mirrorStructuredStatuses(db);
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
    await mirrorStructuredStatuses(db);
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
    await mirrorStructuredStatuses(db);
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

  if (url.pathname === "/api/admin/export-db" && method === "GET") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const exported = migrateDb(structuredClone(db));
    audit(db, user, "EXPORT_DATABASE", { leads: exported.leads.length, users: exported.users.length });
    await saveDb(db);
    return sendJson(res, 200, {
      exportedAt: new Date().toISOString(),
      source: DATABASE_URL ? "postgres" : "file",
      db: exported
    }, {
      "Content-Disposition": `attachment; filename="pipeline-mauad-backup-${saoPauloDateOnly()}.json"`
    });
  }

  if (url.pathname === "/api/structured-db/diagnostics" && method === "GET") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    try {
      const diagnostics = await structuredDbDiagnostics(db);
      return sendJson(res, 200, { diagnostics });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/structured-db/sync" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    try {
      const body = await readBody(req);
      const dataset = String(body.dataset || "").trim();
      const result = dataset
        ? await syncStructuredDataset(db, user, dataset, { reset: body.reset === undefined ? dataset !== "leads" : Boolean(body.reset) })
        : await syncStructuredDb(db, user);
      await saveDb(db);
      const diagnostics = await structuredDbDiagnostics(db);
      return sendJson(res, 200, { ...result, diagnostics });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/structured-db/reset" && method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    try {
      const body = await readBody(req);
      const result = await resetStructuredDataset(db, user, body.dataset);
      await saveDb(db);
      const diagnostics = await structuredDbDiagnostics(db);
      return sendJson(res, 200, { ...result, diagnostics });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/base-access" && method === "PUT") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const sourceSet = new Set(allBaseSources(db));
    const next = { roles: {}, users: {} };
    const roleRules = body.roles && typeof body.roles === "object" && !Array.isArray(body.roles) ? body.roles : {};
    for (const role of ROLES) {
      const rule = roleRules[role] || {};
      next.roles[role] = {
        enabled: Boolean(rule.enabled),
        sources: Array.isArray(rule.sources)
          ? [...new Set(rule.sources.map((source) => String(source || "").trim()).filter((source) => sourceSet.has(source)))]
          : []
      };
    }
    const userRules = body.users && typeof body.users === "object" && !Array.isArray(body.users) ? body.users : {};
    const validUserIds = new Set(db.users.map((item) => item.id));
    for (const [userId, rule] of Object.entries(userRules)) {
      if (!validUserIds.has(userId) || !rule || typeof rule !== "object" || Array.isArray(rule)) continue;
      next.users[userId] = {
        override: Boolean(rule.override),
        enabled: Boolean(rule.enabled),
        sources: Array.isArray(rule.sources)
          ? [...new Set(rule.sources.map((source) => String(source || "").trim()).filter((source) => sourceSet.has(source)))]
          : []
      };
    }
    next.roles["Admin TI"] = { enabled: true, sources: [] };
    db.baseAccess = next;
    audit(db, user, "UPDATE_BASE_ACCESS", { roles: Object.keys(next.roles).length, users: Object.keys(next.users).length });
    await saveDb(db);
    return sendJson(res, 200, {
      baseAccess: db.baseAccess,
      baseAccessSources: allBaseSources(db),
      accessibleBaseSources: accessibleBaseSources(db, user),
      leads: visibleLeads(db, user).map((lead) => publicLead(lead, user))
    });
  }

  if (url.pathname === "/api/permissions" && method === "PUT") {
    if (!canManagePipelineSettings(user)) return sendJson(res, 403, { error: "Sem permissão" });
    const body = await readBody(req);
    const resources = permissionResources(db);
    const resourceIds = new Set(resources.map((resource) => resource.id));
    const next = ensurePermissions(db);

    if (body.roles && typeof body.roles === "object" && !Array.isArray(body.roles)) {
      for (const role of ROLES) {
        const roleRules = body.roles[role];
        if (!roleRules || typeof roleRules !== "object" || Array.isArray(roleRules)) continue;
        next.roles[role] = next.roles[role] || {};
        for (const [resourceId, cell] of Object.entries(roleRules)) {
          if (!resourceIds.has(resourceId)) continue;
          next.roles[role][resourceId] = role === "Admin TI" ? permissionCell(true, true) : normalizePermissionCell(cell);
        }
      }
    }

    const applyToUsers = Boolean(body.applyToUsers);
    if (applyToUsers && body.roles) {
      for (const target of db.users || []) {
        next.users[target.id] = next.users[target.id] || {};
        for (const resource of resources) {
          next.users[target.id][resource.id] = { ...(next.roles[target.role]?.[resource.id] || permissionCell(false, false)) };
        }
      }
    }

    if (body.users && typeof body.users === "object" && !Array.isArray(body.users)) {
      const validUserIds = new Set((db.users || []).map((item) => item.id));
      for (const [userId, userRules] of Object.entries(body.users)) {
        if (!validUserIds.has(userId) || !userRules || typeof userRules !== "object" || Array.isArray(userRules)) continue;
        next.users[userId] = next.users[userId] || {};
        for (const [resourceId, cell] of Object.entries(userRules)) {
          if (!resourceIds.has(resourceId)) continue;
          const targetUser = db.users.find((item) => item.id === userId);
          next.users[userId][resourceId] = targetUser?.role === "Admin TI" ? permissionCell(true, true) : normalizePermissionCell(cell);
        }
      }
    }

    ensurePermissions(db);
    audit(db, user, "UPDATE_PERMISSIONS", {
      scope: body.users ? "users" : "roles",
      applyToUsers
    });
    await saveDb(db);
    return sendJson(res, 200, {
      permissions: db.permissions,
      currentPermissions: db.permissions.users?.[user.id] || {},
      permissionResources: resources,
      accessibleBaseSources: accessibleBaseSources(db, user),
      actionableBaseSources: allBaseSources(db).filter((source) => permissionForUser(db, user, basePermissionId(source)).action),
      leads: visibleLeads(db, user).map((lead) => publicLeadSummary(lead, user))
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
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (await fastStructuredMetaRoutes(req, res, url)) return;
    if (await fastStructuredAuthRoutes(req, res, url)) return;
    if (await fastStructuredUserPermissionRoutes(req, res, url)) return;
    if (await fastStructuredSettingsRoutes(req, res, url)) return;
    if (await fastStructuredEventCaptureRoutes(req, res, url)) return;
    if (await fastStructuredSmlFinanceRoutes(req, res, url)) return;
    if (await fastStructuredLevFinanceRoutes(req, res, url)) return;
    if (await fastStructuredSalesReportRoutes(req, res, url)) return;
    if (await fastStructuredBackupRoutes(req, res, url)) return;
    if (await fastStructuredOperationalRoutes(req, res, url)) return;
    if (await fastStructuredMarketingRoutes(req, res, url)) return;
    if (await fastStructuredPresenceResponse(req, res, url)) return;
    if (await fastStructuredStateResponse(req, res, url)) return;
    if (await fastStructuredLeadsResponse(req, res, url)) return;
    if (await fastStructuredManualLeadRoutes(req, res, url)) return;
    if (await fastStructuredSamWebhook(req, res, url)) return;
    if (await fastStructuredSamEventAction(req, res, url)) return;
    if (await fastStructuredLeadAction(req, res, url)) return;
    if (DATABASE_URL || !ENABLE_LEGACY_JSON_FALLBACK) return notFound(res);
    try {
      const db = await loadDb();
      return routeApi(req, res, db);
    } catch (error) {
      if (url.pathname === "/api/webhooks/sam") {
        console.error("SAM_WEBHOOK_LOAD_ERROR", error);
        return sendJson(res, 500, { error: "Erro interno ao carregar dados para o webhook SAM", detail: error.message });
      }
      throw error;
    }
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
