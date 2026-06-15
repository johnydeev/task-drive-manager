import { google } from "googleapis";

// Service account con scopes para Sheets y Drive.
// La private key viene con "\n" literales en la env var; reemplazar por saltos reales.
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

let cachedAuth: ReturnType<typeof buildAuth> | null = null;

function buildAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en el entorno"
    );
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: SCOPES,
  });
}

export function getGoogleAuth() {
  if (!cachedAuth) cachedAuth = buildAuth();
  return cachedAuth;
}

export function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("Falta GOOGLE_SHEET_ID en el entorno");
  return id;
}

export function getDriveRootFolderId() {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error("Falta GOOGLE_DRIVE_ROOT_FOLDER_ID en el entorno");
  return id;
}
