import type { Rol } from "./index";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      name?: string | null;
      image?: string | null;
      rol: Rol;
      activo: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol?: Rol;
    activo?: boolean;
    email?: string;
  }
}
