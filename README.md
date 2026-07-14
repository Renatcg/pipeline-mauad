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
