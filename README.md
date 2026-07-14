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

Na Vercel, o app sobe sem a base Odysseia local. Para producao real, conecte um banco persistente e importe os leads por um fluxo seguro.
