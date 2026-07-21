# Pipeline de Leads

Sistema local para pipeline comercial com login, perfis, Kanban, Planilha, Base Odysseia e Dashboard.

## Rodar localmente

```bash
node server.js
```

Login inicial:

- Usuario: `admin`
- Senha: `Admin@12345`

Em producao, defina `INITIAL_ADMIN_PASSWORD` antes do primeiro start.

## Dados sensiveis

Os arquivos `data/db.json` e `data/seed.json` ficam fora do Git e fora do deploy na Vercel. Eles podem conter nomes e telefones reais dos leads.

Na Vercel, o app usa Neon Postgres quando `POSTGRES_URL` ou `DATABASE_URL` existe. O estado do CRM fica persistido em uma tabela `app_state` no banco.

## Importar a base local para a Vercel

Depois do deploy com Neon conectado:

```bash
APP_URL=https://sua-url-da-vercel.vercel.app ADMIN_PASSWORD='sua-senha-admin' npm run import:db
```

Esse comando faz login como admin e envia o `data/db.json` local para o banco Neon pela API autenticada do app.

## Receber leads do Meta

Configure as variaveis no projeto da Vercel:

- `META_VERIFY_TOKEN`: texto secreto criado por voce para validar o webhook.
- `META_APP_SECRET`: App Secret do app Meta.
- `META_PAGE_ACCESS_TOKEN`: token da pagina com permissao para leitura dos leads.
- `META_GRAPH_VERSION`: opcional, padrao `v25.0`.
- `CRON_SECRET`: segredo para permitir sincronizacao automatica protegida.

No Meta Developers, use a URL de callback:

```text
https://pipeline-mauad.vercel.app/api/webhooks/meta
```

Assine o evento `leadgen` da pagina. Os leads recebidos entram no pipeline com origem `META`, no primeiro status cadastrado.

### Fallback de sincronizacao Meta

Se o webhook do Meta ficar pendente, cadastre os IDs dos formularios em `Configuracoes > Integracoes > Formularios monitorados` e use `Sincronizar Meta`. O sistema consulta a Graph API, busca os leads recentes dos forms cadastrados e evita duplicidade pelo `leadgen_id`.

Para automatizar por uma agenda externa, chame:

```text
GET https://pipeline-mauad.vercel.app/api/cron/meta-sync?days=2
Authorization: Bearer SEU_CRON_SECRET
```

Na Vercel Hobby, cron nativo roda no maximo uma vez por dia. Para sincronizacao frequente, use Vercel Pro ou um agendador externo chamando essa URL protegida.
