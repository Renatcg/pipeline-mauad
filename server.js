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
const ROLES = ["Admin TI", "Head Comercial", "Supervisor Comercial", "Diretoria", "Corretor", "Gerente Financeiro", "Auxiliar Financeiro"];
const DEFAULT_PROJECTS = ["Reserva Guinle", "Golf Club Resort"];
const DEFAULT_TAG_DEFINITIONS = [
  { id: "tag-quente", name: "Quente", color: "#d92d20" },
  { id: "tag-morno", name: "Morno", color: "#f79009" },
  { id: "tag-frio", name: "Frio", color: "#1570ef" },
  { id: "tag-retorno", name: "Retorno", color: "#7f56d9" },
  { id: "tag-visita", name: "Visita", color: "#039855" },
  { id: "tag-documentacao", name: "Documentação", color: "#475467" }
];
const KNOWLEDGE_CATEGORIES = ["Primeiros passos", "Leads e Pipeline", "Bases", "Meta Leads", "Configurações", "Notificações", "Logs e Auditoria"];
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
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.INITIAL_ADMIN_PASSWORD || "local-dev-session-secret";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Pipeline Mauad <onboarding@resend.dev>";
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
        importSummary: { origin: "EMPTY", leadCount: 0, inactiveBrokerCount: 0 }
      };
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "Admin@12345";
  const now = new Date().toISOString();
  const db = {
    roles: seed.roles || ROLES,
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
        accessLog: [],
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
  if (!Array.isArray(db.fupLeadLog)) {
    db.fupLeadLog = [];
    changed = true;
  }
  if (!Array.isArray(db.integrationLog)) {
    db.integrationLog = [];
    changed = true;
  }
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
    whatsappNumber: String(value.whatsappNumber || "").trim()
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

async function sendEmailWithCc(to, cc, subject, html) {
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
      body: JSON.stringify({ from: EMAIL_FROM, to: recipients, cc: ccRecipients.length ? ccRecipients : undefined, subject, html })
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
  return provision.toISOString().slice(0, 10);
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
  return status.includes("paga") || status.includes("nao contabilizada");
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
    || settlementStatus.includes("nf/provisionamento")
    || settlementStatus.includes("provisionamento solicitado")
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

function applyLevRecordFields(db, sale, settlement, fields = {}) {
  const oldUnit = normalizeLevUnit(sale?.unit || settlement?.unit);
  const nextUnit = fields.unit !== undefined ? normalizeLevUnit(fields.unit) : oldUnit;
  if (fields.unit !== undefined && !isLikelyLevUnit(nextUnit)) throw new Error("Unidade inválida");
  const patch = {
    unit: nextUnit,
    client: fields.client !== undefined ? String(fields.client || "").trim() : undefined,
    signedAt: fields.signedAt !== undefined ? String(fields.signedAt || "").trim() : undefined,
    contractValue: fields.contractValue !== undefined ? parseMoney(fields.contractValue) : undefined,
    commissionValue: fields.commissionValue !== undefined ? parseMoney(fields.commissionValue) : undefined,
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
  if (sale && patch.contractValue !== undefined && fields.commissionValue === undefined) {
    sale.commissionValue = Number(sale.contractValue || 0) * (Number(sale.commissionPercent || db.levFinance.settings?.commissionPercent || 0) / 100);
  }
  if (settlement && patch.contractValue !== undefined && fields.commissionValue === undefined) {
    settlement.commissionValue = Number(settlement.contractValue || 0) * (Number(sale?.commissionPercent || db.levFinance.settings?.commissionPercent || 0) / 100);
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
      <h2>Solicitação de aprovisionamento - Comissão Lev</h2>
      <p>Prezados,</p>
      <p>Solicitamos o aprovisionamento da comissão Lev para a venda abaixo, com previsão de pagamento em <strong>${escapeHtml(provisionLabel)}</strong>.</p>
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
  return sendEmailWithCc(settings.provisionTo, settings.provisionCc, `Aprovisionamento comissão Lev - ${sale.unit}`, html);
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
  return labels[text] || text;
}

function leadMetaFormConfig(db, lead) {
  return metaFormForId(db, lead.meta?.formId) || {};
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

function canResetLevFinance(user) {
  return user.role === "Admin TI" && String(user.username || "").toLowerCase() === "admin";
}

function hasBaseHistory(lead) {
  return Boolean(lead.sourceStatus || lead.odysseiaStatus);
}

function isAvailableBaseLead(lead) {
  if (!lead.inPipeline) return true;
  return hasBaseHistory(lead) && !lead.assignedTo;
}

function visibleLeads(db, user) {
  if (user.role === "Corretor") {
    return db.leads.filter((lead) => {
      if (lead.inPipeline && lead.assignedTo) return lead.assignedTo === user.id;
      return isAvailableBaseLead(lead);
    });
  }
  return db.leads;
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

function fupLeadEvent(db, actor, lead, action, details = {}) {
  if (!lead) return;
  db.fupLeadLog.unshift({
    at: new Date().toISOString(),
    actor: actor.username,
    actorName: actor.name,
    userId: actor.id,
    leadId: lead.id,
    leadName: lead.name || "",
    action,
    details
  });
  db.fupLeadLog = db.fupLeadLog.slice(0, 500);
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
  const formProject = metaFormForId(db, metaLead.form_id)?.project || "";
  if (formProject) return formProject;
  const match = normalizeMetaMappingRules(db.integrations)
    .find((rule) => metaRuleMatches(rule, metaLead));
  return match?.project || "";
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
  const monitoredForm = metaFormForId(db, metaLead.form_id || webhookValue.form_id);
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
    desiredProject: monitoredForm?.project || mappedMetaProject(db, metaLead) || normalized.desiredProject,
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
      adUrl: metaAdUrlForForm(monitoredForm, metaLead.ad_id || webhookValue.ad_id),
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

async function importMetaLeadById(db, actor, leadgenId, webhookValue = {}) {
  const id = String(leadgenId || "").trim();
  if (!id) throw new Error("Leadgen ID obrigatório");
  const localId = `meta-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const existing = db.leads.find((lead) => lead.externalId === `META-${id}` || lead.metaLeadId === id || lead.id === localId);
  if (existing) {
    integrationEvent(db, "META", "DUPLICATE_LEAD", { leadgenId: id });
    return { status: "duplicate", lead: existing };
  }
  const metaLead = await fetchMetaLead(id);
  const created = createMetaLead(db, id, metaLead, webhookValue);
  if (created.status === "created") {
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
      projects: db.projects || DEFAULT_PROJECTS,
      pipelineStatuses: db.pipelineStatuses,
      tagDefinitions: db.tagDefinitions || [],
      users: db.users.map(publicUser),
      leads: visibleLeads(db, user).map((lead) => publicLead(lead, user)),
      integrations: canManageSettings(user) ? db.integrations : null,
      knowledgeCategories: KNOWLEDGE_CATEGORIES,
      knowledgeArticles: visibleKnowledgeArticles(db, user),
      knowledgeChatSessions: userKnowledgeChatSessions(db, user),
      canManageKnowledge: canManageKnowledge(user),
      canCreateKnowledge: canCreateKnowledge(user),
      integrationLog: canManageSettings(user) ? db.integrationLog.slice(0, 50) : [],
      auditLog: canManageSettings(user) ? db.auditLog.slice(0, 25) : [],
      accessLog: canManageSettings(user) ? db.accessLog.slice(0, 100) : [],
      fupLeadLog: canManageSettings(user) ? (db.fupLeadLog || []).slice(0, 250) : [],
      levFinance: canAccessLevFinance(user) ? publicLevFinance(db) : null
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
    const receivedAt = String(body.receivedAt || new Date().toISOString().slice(0, 10)).trim();
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
      targetSale.status = "NF/provisionamento solicitado";
      targetSale.confirmedAt = new Date().toISOString();
      targetSale.confirmedBy = user.username;
      targetSale.provisionDate = provisionDateFromPaymentSchedule(db.levFinance.settings, new Date());
      targetSale.commissionPercent = Number(db.levFinance.settings.commissionPercent || targetSale.commissionPercent || 0);
      targetSale.commissionValue = Number(targetSale.contractValue || 0) * (targetSale.commissionPercent / 100);
      upsertLevSettlement(db, targetSale, "NF/provisionamento solicitado", "Venda confirmada no Financeiro Lev");
      const email = await sendLevProvisionEmail(db, targetSale);
      if (email.sent) targetSale.provisionEmailSentAt = new Date().toISOString();
      else integrationEvent(db, "LEV_FINANCE", "PROVISION_EMAIL_FAILED", { saleId: targetSale.id, unit: targetSale.unit, reason: email.reason });
      targetSale.updatedAt = new Date().toISOString();
      audit(db, user, "CONFIRM_LEV_SALE_ELIGIBILITY", { saleId: targetSale.id, unit: targetSale.unit, provisionDate: targetSale.provisionDate, emailSent: email.sent });
      await saveDb(db);
      return sendJson(res, 200, { levFinance: publicLevFinance(db), email });
    } else if (action === "invoice_issued") {
      targetSale = targetSale || saleFromSettlement(db, settlement);
      targetSale.eligible = true;
      targetSale.status = "NF Emitida";
      targetSale.invoiceNumber = String(body.invoiceNumber || "").trim();
      targetSale.invoiceIssuedAt = String(body.invoiceIssuedAt || new Date().toISOString().slice(0, 10)).trim();
      targetSale.updatedAt = new Date().toISOString();
      upsertLevSettlement(db, targetSale, "NF Emitida", "NF registrada no Financeiro Lev");
    } else if (action === "paid") {
      targetSale = targetSale || saleFromSettlement(db, settlement);
      targetSale.status = "Paga";
      targetSale.paidAt = String(body.paidAt || new Date().toISOString().slice(0, 10)).trim();
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
    sale.confirmedAt = new Date().toISOString();
    sale.confirmedBy = user.username;
    sale.provisionDate = provisionDateFromPaymentSchedule(db.levFinance.settings, new Date());
    sale.commissionPercent = Number(db.levFinance.settings.commissionPercent || sale.commissionPercent || 0);
    sale.commissionValue = Number(sale.contractValue || 0) * (sale.commissionPercent / 100);
    upsertLevSettlement(db, sale, "NF/provisionamento solicitado", "Venda confirmada no Financeiro Lev");
    const email = await sendLevProvisionEmail(db, sale);
    if (email.sent) {
      sale.provisionEmailSentAt = new Date().toISOString();
    } else {
      integrationEvent(db, "LEV_FINANCE", "PROVISION_EMAIL_FAILED", { saleId: sale.id, unit: sale.unit, reason: email.reason });
    }
    sale.updatedAt = new Date().toISOString();
    audit(db, user, "CONFIRM_LEV_SALE_ELIGIBILITY", { saleId: sale.id, unit: sale.unit, provisionDate: sale.provisionDate, emailSent: email.sent });
    await saveDb(db);
    return sendJson(res, 200, { levFinance: publicLevFinance(db), email });
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
    audit(db, user, "CREATE_LEAD", { leadId: lead.id, source: lead.source });
    fupLeadEvent(db, user, lead, "CREATE_LEAD", { source: lead.source, assignedTo: lead.assignedName || "" });
    await saveDb(db);
    return sendJson(res, 201, { lead: publicLead(lead, user) });
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
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
    await saveDb(db);
    return sendJson(res, 200, { lead: publicLead(lead, user) });
  }

  const rescueMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/rescue$/);
  if (rescueMatch && method === "POST") {
    if (!canManageLeads(user) && user.role !== "Corretor") return sendJson(res, 403, { error: "Sem permissão" });
    const lead = db.leads.find((item) => item.id === rescueMatch[1]);
    if (!lead) return notFound(res);
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
      "Content-Disposition": `attachment; filename="pipeline-mauad-backup-${new Date().toISOString().slice(0, 10)}.json"`
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
