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

## Deploy na VPS (EasyPanel)

O projeto roda em container Docker. Nao ha build step: `Dockerfile` instala a unica dependencia e executa `node server.js`.

### 1. Criar o servico

No EasyPanel, crie um servico **Compose** apontando para este repositorio, ou um servico **App** com Build Method = `Dockerfile`. Na aba **Domains**, aponte o dominio para a porta `4173` e ative o SSL.

### 2. Variaveis de ambiente

Copie `.env.example` e preencha na aba **Environment**. As cinco obrigatorias:

| Variavel | Valor |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | `4173` |
| `POSTGRES_URL` | connection string do Neon (a mesma da Vercel) |
| `SESSION_SECRET` | segredo longo e aleatorio |
| `APP_URL` | `https://seu-dominio` |

`HOST=0.0.0.0` e obrigatorio. O default do `server.js` e `127.0.0.1`, que faz o container subir com logs saudaveis e mesmo assim ficar inalcancavel pelo proxy.

`SESSION_SECRET` assina os cookies de sessao. Copie o valor atual da Vercel: um valor diferente desloga todos os usuarios. Sem a variavel, o app usa um segredo publico conhecido.

Nao defina `VERCEL` nem `VERCEL_PROJECT_PRODUCTION_URL`.

### 3. Ajustes do proxy

Aumente o **timeout de leitura para 120s ou mais**. As rotas `/api/lev-finance/extract` e `/api/knowledge/ask` chamam a OpenAI sem timeout no codigo e retornam 504 com o valor padrao.

### 4. Uma replica apenas

Toda requisicao le e reescreve o estado inteiro na linha unica `app_state.id='main'`. Com duas replicas as escritas se sobrescrevem e leads somem sem gerar erro.

### Rodar localmente com Docker

```bash
docker compose up --build
```

Ou sem compose:

```bash
docker build -t pipeline-mauad .
docker run --rm -p 4173:4173 -e HOST=0.0.0.0 -e SESSION_SECRET=teste pipeline-mauad
```

## Importar a base local para a Vercel

Depois do deploy com Neon conectado:

```bash
APP_URL=https://seu-dominio.com.br ADMIN_PASSWORD='sua-senha-admin' npm run import:db
```

Esse comando faz login como admin e envia o `data/db.json` local para o banco Neon pela API autenticada do app.

## Receber leads do Meta

Configure as variaveis no projeto da Vercel:

- `META_VERIFY_TOKEN`: texto secreto criado por voce para validar o webhook.
- `META_APP_SECRET`: App Secret do app Meta.
- `META_PAGE_ACCESS_TOKEN`: token da pagina com permissao para leitura dos leads.
- `META_GRAPH_VERSION`: opcional, padrao `v25.0`.
- `CRON_SECRET`: segredo para permitir sincronizacao automatica protegida.
- `BACKUP_SECRET`: opcional; se ausente, o backup diario usa `CRON_SECRET`.

No Meta Developers, use a URL de callback:

```text
https://seu-dominio.com.br/api/webhooks/meta
```

Ao migrar da Vercel para a VPS, reaponte essa URL no Meta Developers e refaca o handshake de verificacao.

Assine o evento `leadgen` da pagina. Os leads recebidos entram no pipeline com origem `META`, no primeiro status cadastrado.

### Fallback de sincronizacao Meta

Se o webhook do Meta ficar pendente, cadastre os IDs dos formularios em `Configuracoes > Integracoes > Formularios monitorados` e use `Sincronizar Meta`. O sistema consulta a Graph API, busca os leads recentes dos forms cadastrados e evita duplicidade pelo `leadgen_id`.

Para automatizar por uma agenda externa, chame:

```text
GET https://seu-dominio.com.br/api/cron/meta-sync?days=2
Authorization: Bearer SEU_CRON_SECRET
```

Nao existe job rodando dentro do processo: essa rota espera ser chamada de fora. Sem `CRON_SECRET` definido o endpoint responde **500**, nao 401. Na VPS, agende pelo cron do EasyPanel ou por um agendador externo.

Na Vercel Hobby, cron nativo roda no maximo uma vez por dia. Para sincronizacao frequente, use Vercel Pro ou um agendador externo chamando essa URL protegida.

## Backup diario

O projeto possui um cron diario na Vercel:

```text
GET https://seu-dominio.com.br/api/cron/daily-backup
Authorization: Bearer SEU_BACKUP_SECRET_OU_CRON_SECRET
```

O backup exporta o banco estruturado em JSON, valida integridade, calcula checksum SHA-256 e registra o resultado em `Configuracoes > Backup`. Pela tela, o Admin TI pode ativar envio por e-mail e/ou enviar o arquivo para uma URL autorizada a gravar no Google Drive.
