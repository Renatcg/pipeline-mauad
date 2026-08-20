const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");

const sources = [
  { project: "Reserva Guinle", code: "RGL", file: process.argv[2] },
  { project: "Golf Club Resort", code: "GOLF", file: process.argv[3] }
];

if (sources.some((source) => !source.file)) {
  throw new Error("Uso: node scripts/build-marketing-expenses.js <RGL.xlsx> <GOLF.xlsx>");
}

function splitCodeLabel(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([^\s]+)\s+-\s+(.+)$/s);
  return { code: match?.[1] || "", name: match?.[2]?.trim() || text };
}

function excelDate(value) {
  if (!Number.isFinite(Number(value))) return "";
  return new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000).toISOString().slice(0, 10);
}

function stableId(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

const expenses = [];
for (const source of sources) {
  const workbook = XLSX.readFile(source.file, { cellDates: false });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
  rows.forEach((rawRow, index) => {
    const row = Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [key.trim(), value]));
    if (!row.Empresa || !row.Credor || !row["Dt. baixa"]) return;
    const company = splitCodeLabel(row.Empresa);
    const creditor = splitCodeLabel(row.Credor);
    const costCenter = splitCodeLabel(row["Centro de Custo"]);
    const financialPlan = splitCodeLabel(row["Plano Financeiro"]);
    const parts = [source.code, company.code, costCenter.code, financialPlan.code, row.Lançamento, row.Parcela, row.Documento, row["Dt. baixa"], row["Pagto líquido"]];
    expenses.push({
      id: `mkt-exp-${stableId(parts)}`,
      project: source.project,
      projectCode: source.code,
      companyCode: company.code,
      companyName: company.name,
      creditorCode: creditor.code,
      creditorName: creditor.name,
      costCenterCode: costCenter.code,
      costCenterName: costCenter.name,
      financialPlanCode: financialPlan.code,
      financialPlanName: financialPlan.name,
      document: String(row.Documento || "").trim(),
      postingNumber: String(row.Lançamento || "").trim(),
      installment: String(row.Parcela || "").trim(),
      issueDate: excelDate(row["Dt. emissão"]),
      dueDate: excelDate(row["Dt. vencimento"]),
      paymentDate: excelDate(row["Dt. baixa"]),
      originalAmount: Number(row["Valor original"] || 0),
      paidAmount: Number(row["Pagto líquido"] || 0),
      surchargeAmount: Number(row.Acréscimo || 0),
      discountAmount: Number(row.Desconto || 0),
      notes: String(row["Obs. título"] || "").trim(),
      source: "historical_spreadsheet",
      sourceFile: path.basename(source.file),
      sourceRow: index + 2,
      provisioningId: "",
      eventId: "",
      createdAt: "2026-08-20T12:00:00-03:00"
    });
  });
}

const output = path.join(__dirname, "..", "resources", "marketing-actual-expenses.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(expenses, null, 2)}\n`);
console.log(JSON.stringify({ output, expenses: expenses.length, total: expenses.reduce((sum, item) => sum + item.paidAmount, 0) }));
