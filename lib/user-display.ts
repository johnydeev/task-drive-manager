import type { Usuario } from "@/types";

// Resuelve el email de un usuario a su nombre para mostrar en UI. Fallback: el email.
export function displayName(email: string, usuarios: Usuario[] | undefined): string {
  const target = email.trim().toLowerCase();
  const u = usuarios?.find((x) => x.email.toLowerCase() === target);
  return u?.nombre?.trim() || email;
}
