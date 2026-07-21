import { getSheetId } from "../google-auth";
import type { Rol, Usuario } from "@/types";
import { isDemoMode } from "../demo-mode";
import { createDemoUsuario, getDemoUsuarios, setDemoUsuarioActivo } from "../demo-data";
import { getSheets, readRange, SHEETS } from "./core";
import { buildHeaderMap, colLetter } from "./headers";
import { toBool, boolToCell } from "./values";
import { rolEnum } from "../schemas";
import { nowBuenosAiresISO } from "../fecha-ar";

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
  const now = nowBuenosAiresISO();
  const usuario: Usuario = { ...u, creadoEn: now, actualizadoEn: now };
  // NO usar values.append (mete la fila al fondo en grids grandes). Fila libre por
  // la columna A + update, mismo patrón que appendTarea.
  const colA = await readRange(`${SHEETS.usuarios}!A:A`);
  const nextRow = colA.length + 1;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!A${nextRow}:F${nextRow}`,
    valueInputOption: "USER_ENTERED",
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
      requestBody: { values: [[nowBuenosAiresISO()]] },
    });
  }
}
