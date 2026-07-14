const fs = require("fs");
const path = require("path");

const appUrl = process.env.APP_URL;
const username = process.env.ADMIN_USER || "admin";
const password = process.env.ADMIN_PASSWORD || "Admin@12345";
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "db.json");

if (!appUrl) {
  console.error("Defina APP_URL com a URL do app, por exemplo: APP_URL=https://pipeline-mauad.vercel.app");
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || text || `HTTP ${response.status}`);
  return { response, data };
}

(async () => {
  const login = await request(`${appUrl.replace(/\/$/, "")}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Login não retornou cookie de sessão");

  const imported = await request(`${appUrl.replace(/\/$/, "")}/api/admin/import-db`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({ db })
  });

  console.log(`Importação concluída: ${imported.data.leads} leads, ${imported.data.users} usuários.`);
})();
