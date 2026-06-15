"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Sesión inicial inyectada desde el server. En DEMO_MODE, viene poblada
  // con la sesión fake; en producción es null y NextAuth la hidrata vía /api/auth/session.
  session?: Session | null;
}

export function SessionProvider({ children, session }: Props) {
  return (
    <NextAuthSessionProvider session={session ?? undefined}>
      {children}
    </NextAuthSessionProvider>
  );
}
