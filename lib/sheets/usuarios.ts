import { getSheetId } from "../google-auth";
import type { Rol, Usuario } from "@/types";
import { isDemoMode } from "../demo-mode";
import { createDemoUsuario, getDemoUsuarios, setDemoUsuarioActivo } from "../demo-data";
import { getSheets, readRange, SHEETS } from "./core";

function rowToUsuario(row: string[]): Usuario {
  // Normalizamos el rol a minúscula para tolerar "ADMIN", "Admin", "admin"
  // (la hoja la editan humanos a mano y pueden variar mayúsculas).
  const rolRaw = (row[2] ?? "").trim().toLowerCase();
  const rol: Rol = rolRaw === "admin" ? "admin" : "supervisor";
  return {
    email: (row[0] ?? "").trim().toLowerCase(),
    nombre: row[1] ?? "",
    rol,
    activo: (row[3] ?? "").toString().trim().toLowerCase() !== "false",
    creadoEn: row[4] ?? "",
  };
}

export async function getUsuarios(): Promise<Usuario[]> {
  if (isDemoMode()) return getDemoUsuarios();
  const rows = await readRange(`${SHEETS.usuarios}!A2:E`);
  return rows.filter((r) => r[0]).map(rowToUsuario);
}

export async function getUsuarioByEmail(email: string): Promise<Usuario | null> {
  const target = email.trim().toLowerCase();
  const usuarios = await getUsuarios();
  return usuarios.find((u) => u.email === target) ?? null;
}

export async function appendUsuario(u: Omit<Usuario, "creadoEn">): Promise<Usuario> {
  if (isDemoMode()) return createDemoUsuario(u);
  const usuario: Usuario = { ...u, creadoEn: new Date().toISOString() };
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!A:E`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[usuario.email, usuario.nombre, usuario.rol, usuario.activo, usuario.creadoEn]],
    },
  });
  return usuario;
}

export async function setUsuarioActivo(email: string, activo: boolean): Promise<void> {
  if (isDemoMode()) {
    if (!setDemoUsuarioActivo(email, activo)) throw new Error(`Usuario ${email} no encontrado`);
    return;
  }
  const rows = await readRange(`${SHEETS.usuarios}!A2:E`);
  const idx = rows.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === email.trim().toLowerCase());
  if (idx === -1) throw new Error(`Usuario ${email} no encontrado`);
  const rowNumber = idx + 2;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[activo]] },
  });
}
