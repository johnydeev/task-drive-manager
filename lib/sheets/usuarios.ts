import { getSheetId } from "../google-auth";
import type { Rol, Usuario } from "@/types";
import { isDemoMode } from "../demo-mode";
import { createDemoUsuario, getDemoUsuarios, setDemoUsuarioActivo } from "../demo-data";
import { getSheets, readRange, SHEETS } from "./core";
import { buildHeaderMap, colLetter } from "./headers";
import { toBool, boolToCell } from "./values";
import { rolEnum } from "../schemas";

// Headers: email · nombre · rol · activo · creado_en · actualizado_en
const RANGE = `${SHEETS.usuarios}!A:F`;

export function rowsToUsuarios(rows: string[][]): Usuario[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "email"))
    .map((r) => {
      const rolRaw = h.get(r, "rol").trim().toLowerCase();
      const activoRaw = h.get(r, "activo");
      return {
        email: h.get(r, "email").trim().toLowerCase(),
        nombre: h.get(r, "nombre"),
        rol: (rolRaw === "admin" ? "admin" : "supervisor") as Rol,
        // Vacío -> activo (mantiene el comportamiento previo `!== "false"`).
        activo: activoRaw === "" ? true : toBool(activoRaw),
        creadoEn: h.get(r, "creado_en"),
        actualizadoEn: h.get(r, "actualizado_en") || undefined,
      };
    });
}

export async function getUsuarios(): Promise<Usuario[]> {
  if (isDemoMode()) return getDemoUsuarios();
  const rows = await readRange(RANGE);
  return rowsToUsuarios(rows);
}

export async function getUsuarioByEmail(email: string): Promise<Usuario | null> {
  const target = email.trim().toLowerCase();
  const usuarios = await getUsuarios();
  return usuarios.find((u) => u.email === target) ?? null;
}

export async function appendUsuario(u: Omit<Usuario, "creadoEn">): Promise<Usuario> {
  if (isDemoMode()) return createDemoUsuario(u);
  rolEnum.parse(u.rol); // defensa en profundidad: nunca escribir un rol inválido
  const now = new Date().toISOString();
  const usuario: Usuario = { ...u, creadoEn: now, actualizadoEn: now };
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: RANGE,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          usuario.email,
          usuario.nombre,
          usuario.rol,
          boolToCell(usuario.activo),
          usuario.creadoEn,
          usuario.actualizadoEn ?? "",
        ],
      ],
    },
  });
  return usuario;
}

export async function setUsuarioActivo(email: string, activo: boolean): Promise<void> {
  if (isDemoMode()) {
    if (!setDemoUsuarioActivo(email, activo)) throw new Error(`Usuario ${email} no encontrado`);
    return;
  }
  const rows = await readRange(RANGE);
  const h = buildHeaderMap(rows[0] ?? []);
  const target = email.trim().toLowerCase();
  const idx = rows.slice(1).findIndex((r) => h.get(r, "email").trim().toLowerCase() === target);
  if (idx === -1) throw new Error(`Usuario ${email} no encontrado`);
  const rowNumber = idx + 2; // fila 1 = header

  const activoCol = colLetter(h.index("activo") + 1);
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!${activoCol}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[boolToCell(activo)]] },
  });

  // Registrar la última modificación si existe la columna.
  const updIdx = h.index("actualizado_en");
  if (updIdx !== -1) {
    await getSheets().spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${SHEETS.usuarios}!${colLetter(updIdx + 1)}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[new Date().toISOString()]] },
    });
  }
}
