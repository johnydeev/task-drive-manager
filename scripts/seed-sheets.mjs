// scripts/seed-sheets.mjs
// CLI que llena las hojas Usuarios y Configuración con valores iniciales.
// Uso: npm run seed
//
// Requiere las mismas env vars que la app:
//   - GOOGLE_SHEET_ID
//   - GOOGLE_SERVICE_ACCOUNT_EMAIL
//   - GOOGLE_PRIVATE_KEY

import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ Faltan variables de entorno en .env.local");
  console.error("   Requeridas: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const USUARIOS_SEED = [
  ["email", "nombre", "rol", "activo", "creado_en"],
  ["contacto@morinigoadm.com", "Administración Morinigo", "admin", "TRUE", new Date().toISOString()],
  ["castrojonathand@gmail.com", "Jonathan Castro", "admin", "TRUE", new Date().toISOString()],
];

const CONFIG_SEED = [
  ["clave", "valor", "descripcion"],
  ["max_imagenes", "10", "Máximo de imágenes por tarea"],
  ["max_videos", "3", "Máximo de videos por tarea"],
  ["max_documentos", "5", "Máximo de PDFs adjuntos"],
  ["max_size_imagen_mb", "10", "Peso máx por imagen (MB)"],
  ["max_size_video_mb", "100", "Peso máx por video (MB)"],
  ["max_size_pdf_mb", "20", "Peso máx por PDF (MB)"],
];

async function seedTab(tabName, values) {
  console.log(`🌱 Seeding tab "${tabName}"...`);
  // Idempotente: si la hoja ya tiene datos (más de la fila de header), abortar.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:Z`,
  });
  if (existing.data.values && existing.data.values.length > 1) {
    console.log(`  ⚠️ Tab "${tabName}" ya tiene datos, saltando.`);
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  console.log(`  ✓ ${values.length - 1} filas cargadas en "${tabName}"`);
}

async function main() {
  console.log(`📊 Spreadsheet: ${SHEET_ID}`);
  await seedTab("Usuarios", USUARIOS_SEED);
  await seedTab("Configuracion", CONFIG_SEED); // sin tilde: así se llama la pestaña real
  console.log("\n✅ Seed completo.");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
