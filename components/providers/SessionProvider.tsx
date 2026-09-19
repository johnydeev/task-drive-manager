"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Sesión inicial inyectada desde el server por app/layout.tsx (getActiveSession), tanto en
  // producción como en DEMO_MODE. Por eso useSession() nunca pasa por "loading" en el
  // primer render y no hay flicker de controles por rol.
  session?: Session | null;
}

export function SessionProvider({ children, session }: Props) {
  return (
    <NextAuthSessionProvider session={session ?? undefined}>
      {children}
    </NextAuthSessionProvider>
  );
}
