import type { Rol, Usuario } from "@/types";

// Cada cuánto se relee la hoja Usuarios para un token vivo. Una desactivación o un cambio
// de rol tardan a lo sumo esto en aplicar.
export const VENTANA_REVALIDACION_MS = 15 * 60 * 1000;

export interface TokenRevalidable {
  email?: string;
  rol?: Rol;
  activo?: boolean;
  validadoEn?: number; // epoch ms de la última lectura de Usuarios
}

export type BuscarUsuario = (email: string) => Promise<Usuario | null>;

// Devuelve el token (posiblemente actualizado) o null si el usuario ya no puede entrar.
// Puro: no lee el reloj ni la Sheet; ambos vienen por parámetro.
export async function revalidarToken<T extends TokenRevalidable>(
  token: T,
  now: number,
  buscar: BuscarUsuario
): Promise<T | null> {
  const email = token.email?.trim().toLowerCase();
  if (!email) return token;

  if (token.validadoEn !== undefined && now - token.validadoEn < VENTANA_REVALIDACION_MS) {
    return token;
  }

  let usuario: Usuario | null;
  try {
    usuario = await buscar(email);
  } catch (err) {
    // Fail-open: con Sheets caído no se desloguea a nadie; se reintenta en el próximo
    // request porque validadoEn queda como estaba.
    console.error("[auth] revalidación falló:", err);
    return token;
  }

  if (!usuario || !usuario.activo) return null;
  return { ...token, email, rol: usuario.rol, activo: true, validadoEn: now };
}
