import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { Session } from "next-auth";
import { getUsuarioByEmail } from "./google-sheets";
import { demoSession, isDemoMode } from "./demo-mode";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Necesario detrás de un proxy/tunnel (Cloudflare): hace que NextAuth confíe
  // en los headers x-forwarded-host / x-forwarded-proto en vez de intentar
  // canonizar la URL, lo que causaba loops de redirect (ERR_TOO_MANY_REDIRECTS).
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  },
  callbacks: {
    // Bloqueamos el login si el email no está en la hoja Usuarios o está inactivo.
    async signIn({ user }) {
      const email = user?.email?.toLowerCase();
      if (!email) return false;
      try {
        const usuario = await getUsuarioByEmail(email);
        if (!usuario) return false;
        if (!usuario.activo) return false;
        return true;
      } catch (err) {
        console.error("[auth] error al validar usuario:", err);
        return false;
      }
    },
    // Cargamos rol y estado activo en el JWT al crear/refrescar la sesión.
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (!email) return token;

      // En login inicial o cuando lo pedimos explícitamente, refrescamos rol desde la Sheet.
      if (user || trigger === "update" || !token.rol) {
        try {
          const usuario = await getUsuarioByEmail(email);
          if (usuario) {
            token.rol = usuario.rol;
            token.activo = usuario.activo;
            token.email = email;
          }
        } catch (err) {
          console.error("[auth] error al refrescar rol:", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
        session.user.rol = token.rol ?? "supervisor";
        session.user.activo = token.activo ?? false;
      }
      return session;
    },
  },
});

// Devuelve la sesión activa, considerando el bypass de DEMO_MODE.
// Usar en layouts/proxy/server components que necesitan saber si hay sesión.
export async function getActiveSession(): Promise<Session | null> {
  if (isDemoMode()) return demoSession();
  return auth();
}

// Helper para usar en API routes: lanza 401 si no hay sesión activa.
export async function requireSession() {
  const session = await getActiveSession();
  if (!session?.user?.email) {
    throw new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.rol !== "admin") {
    throw new Response(JSON.stringify({ error: "Acceso denegado: requiere rol admin" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return session;
}
