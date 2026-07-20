import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_KEY = process.env.GOOGLE_PRIVATE_KEY ?? "";
if (SA_KEY.includes("\\n")) SA_KEY = SA_KEY.replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("Faltan env vars");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({
  spreadsheetId: SHEET_ID,
  fields: "sheets(properties(title))",
});
const tabs = meta.data.sheets.map((s) => s.properties.title);
console.log("PESTANAS:", JSON.stringify(tabs));

const targets = ["Tareas", "TareaArchivos", "Dptos", "Usuarios", "Directivas", "Asignaciones", "Configuracion"];
for (const t of targets) {
  if (!tabs.includes(t)) {
    console.log("\n### " + t + ": NO EXISTE");
    continue;
  }
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: t + "!A1:AE3",
    });
    const rows = res.data.values ?? [];
    console.log("\n### " + t);
    console.log("  header:", JSON.stringify(rows[0] ?? []));
    if (rows[1]) console.log("  fila2 :", JSON.stringify(rows[1]));
    if (rows[2]) console.log("  fila3 :", JSON.stringify(rows[2]));
  } catch (e) {
    console.log("\n### " + t + ": ERROR " + e.message);
  }
}
