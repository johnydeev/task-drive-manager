// scripts/diagnose-media-legacy.mjs
//
// DIAGNÓSTICO SOLO-LECTURA (no escribe nada, nunca).
//
// Responde: ¿hay tareas cuya media quedó SOLO en las columnas JSON viejas
// (Imágenes/Videos/Documentos de `Tareas`) y NO se migró a la hoja hija
// `TareaArchivos`? Esas tareas hoy renderizan la galería vacía, porque
// `rowToTarea` ya no lee esas columnas (lib/sheets/tareas.ts) y toda la media
// se puebla desde `TareaArchivos`.
//
// Uso:
//   node scripts/diagnose-media-legacy.mjs            # reporte resumido
//   node scripts/diagnose-media-legacy.mjs --verbose  # + detalle por tarea en riesgo
//   node scripts/diagnose-media-legacy.mjs --csv      # vuelca las en-riesgo como CSV
//
// Requiere en .env.local: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
// GOOGLE_PRIVATE_KEY. Usa scope READONLY.

import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const VERBOSE = process.argv.includes("--verbose");
const CSV = process.argv.includes("--csv");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_KEY = process.env.GOOGLE_PRIVATE_KEY ?? "";
if (SA_KEY.includes("\\n")) SA_KEY = SA_KEY.replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ Faltan env vars: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY,
  // READONLY: este script no puede escribir aunque quisiera.
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- helpers (mirror de lib/sheets/headers.ts) ---
function normHeader(s) {
  return (s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s_]+/g, "");
}
// Busca el índice de una columna por su nombre canónico o alguno de sus alias.
function colIndex(header, names) {
  const norm = header.map(normHeader);
  for (const n of names) {
    const i = norm.indexOf(normHeader(n));
    if (i !== -1) return i;
  }
  return -1;
}
function colLetter(n) {
  let s = "", x = n;
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s || "A";
}
// Igual que el safeJsonArr viejo: parsea la celda como array JSON de strings.
function parseMediaCell(v) {
  if (!v || typeof v !== "string" || v.trim() === "") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    // No es JSON: puede ser una única URL suelta. La contamos como 1 archivo.
    return v.trim().startsWith("http") ? [v.trim()] : [];
  }
}
// Detecta filas de datos por id tipo timestamp ISO (mismo criterio que looksLikeRowId).
function looksLikeRowId(v) {
  return !!v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v).trim());
}

async function readValues(range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values ?? [];
}

async function main() {
  console.log("== DIAGNÓSTICO media legacy (SOLO LECTURA) ==\n");

  // 1) Confirmar que existen las pestañas.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets(properties(title))" });
  const tabs = meta.data.sheets.map((s) => s.properties.title);
  const hasTareas = tabs.includes("Tareas");
  const hasArchivos = tabs.includes("TareaArchivos");
  console.log(`Pestañas relevantes: Tareas=${hasTareas ? "sí" : "NO"} · TareaArchivos=${hasArchivos ? "sí" : "NO"}`);
  if (!hasTareas) { console.error("❌ No existe la pestaña Tareas."); process.exit(1); }

  // 2) Leer Tareas y localizar columnas de id y de media vieja (por header).
  const tareasRows = await readValues("Tareas!A:Z");
  const header = tareasRows[0] ?? [];
  const iId = colIndex(header, ["id", "rowId"]);
  const iImg = colIndex(header, ["imagenes", "imágenes", "imagen"]);
  const iVid = colIndex(header, ["videos", "video"]);
  const iDoc = colIndex(header, ["documentos", "documento"]);
  // Si NO están las columnas de media por header, es que ya se removieron de la hoja
  // (parte del ítem 7 de la reestructura). En ese caso NO adivinamos por posición
  // (K/L/M ahora apuntan a otras columnas): hacemos un barrido de TODAS las celdas
  // buscando la firma inequívoca de media legacy (array JSON con URLs http).
  const headersMediaAusentes = iImg === -1 && iVid === -1 && iDoc === -1;

  console.log("\nHeader de Tareas:", JSON.stringify(header));
  console.log(
    `Columnas de media por header → imagenes=${iImg === -1 ? "—" : colLetter(iImg + 1)} · ` +
    `videos=${iVid === -1 ? "—" : colLetter(iVid + 1)} · documentos=${iDoc === -1 ? "—" : colLetter(iDoc + 1)}`
  );
  if (headersMediaAusentes)
    console.log("  → columnas de media AUSENTES del header (ya removidas). Barriendo todas las celdas por arrays JSON de URLs.");
  if (iId === -1) console.log("  ⚠ no se encontró columna id/rowId; se usa la columna A por defecto.");
  const idCol = iId === -1 ? 0 : iId;

  // ¿Una celda es un array JSON con al menos una URL http? (media legacy inequívoca)
  const cellHasMediaUrls = (v) => {
    if (typeof v !== "string" || !v.trim().startsWith("[")) return 0;
    return parseMediaCell(v).filter((s) => /^https?:\/\//i.test(s)).length;
  };

  // 3) Media legacy por tarea.
  const legacy = new Map(); // rowId -> { img, vid, doc, total, rowNumber }
  let totalTareas = 0;
  for (let r = 1; r < tareasRows.length; r++) {
    const row = tareasRows[r];
    const id = (row?.[idCol] ?? "").trim();
    if (!looksLikeRowId(id)) continue;
    totalTareas++;
    let img = 0, vid = 0, doc = 0;
    if (headersMediaAusentes) {
      // Barrido total: cualquier celda que sea un array JSON de URLs cuenta como media
      // huérfana (no sabemos el tipo, la contamos como "documento" para el total).
      for (const cell of row) doc += cellHasMediaUrls(cell);
    } else {
      img = iImg === -1 ? 0 : parseMediaCell(row[iImg]).length;
      vid = iVid === -1 ? 0 : parseMediaCell(row[iVid]).length;
      doc = iDoc === -1 ? 0 : parseMediaCell(row[iDoc]).length;
    }
    const total = img + vid + doc;
    if (total > 0) legacy.set(id, { img, vid, doc, total, rowNumber: r + 1 });
  }

  // 4) Media ya migrada, por tarea (TareaArchivos).
  const migrated = new Map(); // tarea_id -> count (url no vacía)
  if (hasArchivos) {
    const archRows = await readValues("TareaArchivos!A:F");
    const ah = archRows[0] ?? [];
    const iTareaId = colIndex(ah, ["tarea_id", "tareaId"]);
    const iUrl = colIndex(ah, ["url"]);
    const tCol = iTareaId === -1 ? 1 : iTareaId; // B por convención
    const uCol = iUrl === -1 ? 3 : iUrl;         // D por convención
    for (let r = 1; r < archRows.length; r++) {
      const row = archRows[r];
      const tid = (row?.[tCol] ?? "").trim();
      const url = (row?.[uCol] ?? "").trim();
      if (!tid || !url) continue;
      migrated.set(tid, (migrated.get(tid) ?? 0) + 1);
    }
  }

  // 5) Clasificar.
  const enRiesgo = []; // legacy>0 y migrada==0  -> galería vacía en la UI
  const inconsistentes = []; // legacy>0 y migrada>0 pero != -> ambas existen (child gana, legacy stale)
  for (const [id, l] of legacy) {
    const m = migrated.get(id) ?? 0;
    if (m === 0) enRiesgo.push({ id, ...l, migrada: 0 });
    else if (m !== l.total) inconsistentes.push({ id, ...l, migrada: m });
  }
  enRiesgo.sort((a, b) => (a.id < b.id ? -1 : 1));

  // 6) Reporte.
  console.log("\n──────────── RESUMEN ────────────");
  console.log(`Tareas totales (filas con id válido):        ${totalTareas}`);
  console.log(`Tareas con media legacy (JSON en Tareas):    ${legacy.size}`);
  console.log(`Filas en TareaArchivos (tareas c/ media):    ${migrated.size}`);
  console.log(`\n🔴 EN RIESGO (legacy sin migrar → galería VACÍA en la app): ${enRiesgo.length}`);
  console.log(`🟡 Con media en ambos lados (child gana; legacy stale):      ${inconsistentes.length}`);

  if (enRiesgo.length && (VERBOSE || CSV)) {
    if (CSV) {
      console.log("\nrowId,fila,imagenes,videos,documentos,total");
      for (const t of enRiesgo) console.log(`${t.id},${t.rowNumber},${t.img},${t.vid},${t.doc},${t.total}`);
    } else {
      console.log("\nDetalle de las tareas EN RIESGO:");
      for (const t of enRiesgo)
        console.log(`  · ${t.id} (fila ${t.rowNumber}) — img:${t.img} vid:${t.vid} doc:${t.doc} (total ${t.total})`);
    }
  } else if (enRiesgo.length) {
    console.log("\n(Corré con --verbose para el detalle por tarea, o --csv para volcarlo.)");
  }

  if (inconsistentes.length && VERBOSE) {
    console.log("\nDetalle de las inconsistentes (informativo, baja prioridad):");
    for (const t of inconsistentes)
      console.log(`  · ${t.id} — legacy:${t.total} vs TareaArchivos:${t.migrada}`);
  }

  console.log("\n" + (enRiesgo.length
    ? `⚠ Hay ${enRiesgo.length} tarea(s) con media que la app NO está mostrando. Requiere backfill.`
    : "✅ Ninguna tarea con media legacy huérfana. La migración a TareaArchivos cubre todo."));
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
