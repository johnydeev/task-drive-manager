// scripts/backfill-cuit.mjs
// Backfill de la columna `edificio_cuit` en Tareas / Dptos / Asignaciones,
// resolviendo el CUIT por nombre contra _Consorcios (canónico + alternativos).
//
// Uso:
//   node scripts/backfill-cuit.mjs           # DRY-RUN: reporta, no escribe nada
//   node scripts/backfill-cuit.mjs --apply   # escribe los CUIT resueltos
//
// - NO sobrescribe filas que ya tienen CUIT (idempotente).
// - Los edificios que no matchean se dejan en blanco y se listan al final.
//
// La lógica de match/plan replica (y está cubierta por) lib/edificio-cuit.ts +
// lib/consorcios.ts (fuente de verdad, testeadas con Vitest).

import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
// Para el backfill histórico, un CUIT es válido aunque el edificio esté inactivo.
const INCLUDE_INACTIVE = process.argv.includes("--include-inactive");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CONSORCIOS_ID = process.env.GOOGLE_CONSORCIOS_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_KEY = process.env.GOOGLE_PRIVATE_KEY ?? "";
if (SA_KEY.includes("\\n")) SA_KEY = SA_KEY.replace(/\\n/g, "\n");

if (!SHEET_ID || !CONSORCIOS_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ Faltan env vars: GOOGLE_SHEET_ID, GOOGLE_CONSORCIOS_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- helpers (mirror de lib/sheets/headers.ts y lib/sheets/edificios.ts) ---
function normEdificio(s) {
  return (s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}
function normHeader(s) {
  return (s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s_]+/g, "");
}
function colIndex(header, name) {
  const n = normHeader(name);
  return header.map(normHeader).indexOf(n);
}
function colLetter(n) {
  let s = "", x = n;
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s || "A";
}
function resolveCuit(nombre, consorcios) {
  const t = (nombre ?? "").trim();
  if (!t) return null;
  const tn = normEdificio(t);
  const m = consorcios.find(
    (c) => normEdificio(c.nombre) === tn || c.alt.some((a) => normEdificio(a) === tn)
  );
  return m?.cuit ?? null;
}

async function readConsorcios() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: CONSORCIOS_ID, range: "_Consorcios!A2:E" });
  const rows = res.data.values ?? [];
  return rows
    .filter((r) => r[0] && r[0].trim() !== "" && (INCLUDE_INACTIVE || r[4] === undefined || r[4] === "" || String(r[4]).toUpperCase() !== "FALSE"))
    .map((r) => ({
      nombre: r[0].trim(),
      cuit: (r[1] ?? "").trim() || null,
      alt: [...(r[2] ?? "").split("|"), ...(r[3] ?? "").split("|")].map((s) => s.trim()).filter(Boolean),
    }));
}

// Escribe en tandas de 500 celdas para no pasarse de payload.
async function writeCuits(tab, iCuit, aEscribir) {
  const chunkSize = 500;
  for (let i = 0; i < aEscribir.length; i += chunkSize) {
    const chunk = aEscribir.slice(i, i + chunkSize);
    const data = chunk.map((it) => ({
      range: `${tab}!${colLetter(iCuit + 1)}${it.rowNumber}`,
      values: [[it.cuit]],
    }));
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }
}

async function processSheet(tab, edificioCol, consorcios) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A1:Z` });
  const rows = res.data.values ?? [];
  const header = rows[0] ?? [];
  const iEd = colIndex(header, edificioCol);
  const iCuit = colIndex(header, "edificio_cuit");
  console.log(`\n### ${tab}  (edificio col="${edificioCol}")`);
  if (iEd === -1 || iCuit === -1) {
    console.log(`  ⚠ falta la columna "${edificioCol}" o "edificio_cuit" — se saltea`);
    return;
  }

  const items = rows
    .slice(1)
    .map((r, i) => ({ rowNumber: i + 2, edificio: (r[iEd] ?? "").trim(), cuitActual: (r[iCuit] ?? "").trim() }))
    .filter((it) => it.edificio !== "");

  const aEscribir = [], sinMatch = [];
  let yaOk = 0;
  for (const it of items) {
    if (it.cuitActual !== "") { yaOk++; continue; }
    const cuit = resolveCuit(it.edificio, consorcios);
    if (cuit) aEscribir.push({ rowNumber: it.rowNumber, edificio: it.edificio, cuit });
    else sinMatch.push(it);
  }

  console.log(`  filas: ${items.length} · ya tienen CUIT: ${yaOk} · a escribir: ${aEscribir.length} · sin match: ${sinMatch.length}`);
  if (sinMatch.length) {
    const nombres = [...new Set(sinMatch.map((s) => s.edificio))].sort();
    console.log(`  ⚠ SIN MATCH (${nombres.length} nombres distintos):`);
    for (const n of nombres) console.log(`     - ${n}`);
  }

  if (APPLY) {
    if (aEscribir.length) {
      await writeCuits(tab, iCuit, aEscribir);
      console.log(`  ✅ escritos ${aEscribir.length} CUIT`);
    } else {
      console.log("  (nada para escribir)");
    }
  }
}

async function main() {
  console.log(APPLY ? "== MODO APPLY (escribe) ==" : "== DRY-RUN (no escribe, solo reporta) ==");
  const consorcios = await readConsorcios();
  console.log(`_Consorcios cargados: ${consorcios.length}${INCLUDE_INACTIVE ? " (incl. inactivos)" : " (solo activos)"}`);

  await processSheet("Asignaciones", "edificio", consorcios);
  await processSheet("Dptos", "edificio_ref", consorcios);
  await processSheet("Tareas", "edificio", consorcios);

  if (!APPLY) console.log("\n(Corré con --apply para escribir los CUIT.)");
}

main().catch((e) => { console.error(e); process.exit(1); });
