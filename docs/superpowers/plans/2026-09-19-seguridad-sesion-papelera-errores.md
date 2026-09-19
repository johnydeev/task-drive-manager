# Seguridad: revocación de acceso, papelera restringida, errores opacos y 401 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar cuatro agujeros de seguridad/robustez del spec [`../specs/2026-09-19-seguridad-sesion-papelera-errores-design.md`](../specs/2026-09-19-seguridad-sesion-papelera-errores-design.md): revocación de usuarios inactivos en ≤ 15 min, `DELETE /api/upload` restringido a archivos huérfanos bajo la raíz, `500` opacos con `ref`, y `401` → `/login` desde un solo punto del cliente.

**Architecture:** Cuatro piezas independientes. (1) Un módulo puro `lib/auth-revalidacion.ts` que el callback `jwt` de NextAuth usa para releer `Usuarios` cada 15 min y devolver `null` si el usuario ya no puede entrar. (2) `estaBajoRaiz` en `lib/google-drive.ts` + módulo puro `lib/archivo-referencias.ts`, que la ruta `DELETE /api/upload` consulta antes de papelear. (3) `handleApiError` deja de exponer `err.message` y agrega `ref`. (4) `apiFetch` en `lib/api-client.ts` reemplaza a todo `fetch` crudo del cliente y redirige en `401`.

**Tech Stack:** Next 16 (App Router), NextAuth v5 (JWT), googleapis (Drive v3 / Sheets v4), Vitest + Testing Library, TypeScript estricto, nanoid.

**Reglas del repo que aplican:** nunca `git commit` (lo hace Jony con GitLens: cada task termina en «checkpoint», no en commit). Tests colocados junto al archivo salvo los de rutas (`tests/api/`). Verificación final: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/auth-revalidacion.ts` | crear | Regla pura de revalidación del token (ventana 15 min, fail-open) |
| `lib/auth-revalidacion.test.ts` | crear | 8 casos de la regla |
| `lib/auth.ts` | modificar (callback `jwt`) | Delegar en `revalidarToken` |
| `types/next-auth.d.ts` | modificar | `JWT.validadoEn?: number` |
| `components/providers/SessionProvider.tsx` | modificar (comentario) | Corregir «en producción es null» |
| `lib/google-drive.ts` | modificar | `estaBajoRaiz(fileId)` |
| `lib/google-drive.test.ts` | modificar | Casos de `estaBajoRaiz` (mock gana `files.get`) |
| `lib/archivo-referencias.ts` | crear | `estaReferenciado` (puro) + `cargarReferencias` (IO) |
| `lib/archivo-referencias.test.ts` | crear | Casos de `estaReferenciado` |
| `app/api/upload/route.ts` | modificar (`DELETE`) | Chequeos 400/404/403/409 antes de papelear |
| `tests/api/upload-delete.test.ts` | crear | 7 casos del `DELETE` |
| `tests/api/upload-visita.test.ts`, `upload-pdf.test.ts`, `upload-body-incompleto.test.ts` | modificar (factory del mock) | Sumar `extractFileId`, `estaBajoRaiz` |
| `lib/api-utils.ts` | modificar | `500` opaco + `ref` |
| `lib/api-utils.test.ts` | crear | 3 casos |
| `lib/api-client.ts` | modificar | `apiFetch` + `ref` en el mensaje |
| `lib/api-client.test.ts` | crear | 4 casos |
| `app/(app)/tareas/page.tsx`, `components/visitas/FotosVisita.tsx`, `components/visitas/hooks/useVisitaForm.ts`, `components/usuarios/UsuariosManager.tsx` | modificar | `fetch` → `apiFetch` |
| `components/visitas/VisitaForm.test.tsx` | modificar (factory del mock) | Sumar `apiFetch` |

---

### Task 1: `revalidarToken` (módulo puro)

**Files:**
- Create: `lib/auth-revalidacion.ts`
- Test: `lib/auth-revalidacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/auth-revalidacion.test.ts
import { describe, it, expect, vi } from "vitest";
import { revalidarToken, VENTANA_REVALIDACION_MS } from "./auth-revalidacion";
import type { Usuario } from "@/types";

const NOW = 1_700_000_000_000;

const usuario = (extra: Partial<Usuario> = {}): Usuario => ({
  email: "a@x.com",
  nombre: "A",
  rol: "supervisor",
  activo: true,
  creadoEn: "2026-01-01T00:00:00.000-03:00",
  ...extra,
});

describe("revalidarToken", () => {
  it("sin email devuelve el token tal cual y no consulta", async () => {
    const buscar = vi.fn();
    const token = { rol: "admin" as const };
    expect(await revalidarToken(token, NOW, buscar)).toBe(token);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("dentro de la ventana devuelve el token tal cual y no consulta", async () => {
    const buscar = vi.fn();
    const token = { email: "a@x.com", rol: "admin" as const, validadoEn: NOW - VENTANA_REVALIDACION_MS + 1 };
    expect(await revalidarToken(token, NOW, buscar)).toBe(token);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("sin validadoEn consulta (tokens previos al deploy y login inicial)", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario());
    await revalidarToken({ email: "a@x.com" }, NOW, buscar);
    expect(buscar).toHaveBeenCalledWith("a@x.com");
  });

  it("fuera de la ventana y activo: actualiza rol, activo y validadoEn", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario({ rol: "admin" }));
    const token = { email: "a@x.com", rol: "supervisor" as const, validadoEn: NOW - VENTANA_REVALIDACION_MS };
    expect(await revalidarToken(token, NOW, buscar)).toEqual({
      email: "a@x.com",
      rol: "admin",
      activo: true,
      validadoEn: NOW,
    });
  });

  it("normaliza el email a minúsculas al consultar y al devolver", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario());
    const out = await revalidarToken({ email: "A@X.com" }, NOW, buscar);
    expect(buscar).toHaveBeenCalledWith("a@x.com");
    expect(out?.email).toBe("a@x.com");
  });

  it("usuario inactivo → null", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario({ activo: false }));
    expect(await revalidarToken({ email: "a@x.com" }, NOW, buscar)).toBeNull();
  });

  it("usuario inexistente → null", async () => {
    const buscar = vi.fn().mockResolvedValue(null);
    expect(await revalidarToken({ email: "a@x.com" }, NOW, buscar)).toBeNull();
  });

  it("si la búsqueda falla, devuelve el token sin tocar validadoEn (fail-open)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const buscar = vi.fn().mockRejectedValue(new Error("sheets caído"));
    const token = { email: "a@x.com", rol: "admin" as const, validadoEn: NOW - VENTANA_REVALIDACION_MS };
    expect(await revalidarToken(token, NOW, buscar)).toBe(token);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/auth-revalidacion.test.ts`
Expected: FAIL — `Cannot find module './auth-revalidacion'`.

- [ ] **Step 3: Implementar**

```ts
// lib/auth-revalidacion.ts
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/auth-revalidacion.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Checkpoint** — árbol verde para este archivo; sin commit (GitLens).

---

### Task 2: Integrar la revalidación en el callback `jwt`

**Files:**
- Modify: `lib/auth.ts` (callback `jwt`, líneas 40–57)
- Modify: `types/next-auth.d.ts`
- Modify: `components/providers/SessionProvider.tsx` (solo comentario)

- [ ] **Step 1: Tipar `validadoEn` en el JWT**

En `types/next-auth.d.ts`, reemplazar el bloque `declare module "next-auth/jwt"` por:

```ts
declare module "next-auth/jwt" {
  interface JWT {
    rol?: Rol;
    activo?: boolean;
    email?: string;
    validadoEn?: number; // epoch ms de la última relectura de Usuarios (ver lib/auth-revalidacion)
  }
}
```

- [ ] **Step 2: Reemplazar el callback `jwt`**

En `lib/auth.ts`, agregar el import:

```ts
import { revalidarToken } from "./auth-revalidacion";
```

y reemplazar el callback `jwt` completo (desde `// Cargamos rol y estado activo…` hasta su `return token;`) por:

```ts
    // Rol y estado activo viven en el JWT. Se releen de la hoja Usuarios en el login y
    // después cada VENTANA_REVALIDACION_MS: si el usuario fue desactivado o borrado, el
    // callback devuelve null y Auth.js limpia la cookie (proxy → /login, API → 401).
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (!email) return token;
      // Login inicial: sin validadoEn, así la regla fuerza la lectura y carga el rol.
      const base = user ? { ...token, email, validadoEn: undefined } : token;
      return revalidarToken(base, Date.now(), getUsuarioByEmail);
    },
```

`getUsuarioByEmail` ya está importado en ese archivo.

- [ ] **Step 3: Corregir el comentario del `SessionProvider`**

En `components/providers/SessionProvider.tsx`, reemplazar:

```ts
  // Sesión inicial inyectada desde el server. En DEMO_MODE, viene poblada
  // con la sesión fake; en producción es null y NextAuth la hidrata vía /api/auth/session.
```

por:

```ts
  // Sesión inicial inyectada desde el server por app/layout.tsx (getActiveSession), tanto en
  // producción como en DEMO_MODE. Por eso useSession() nunca pasa por "loading" en el
  // primer render y no hay flicker de controles por rol.
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. Si TypeScript se queja de que `revalidarToken` devuelve `JWT | null` y el callback espera `JWT | null`, está bien; si se queja del spread de `token` (tipo `JWT`), castear el resultado no es necesario: `JWT` cumple `TokenRevalidable`.

- [ ] **Step 5: Correr los tests que tocan auth**

Run: `npx vitest run lib tests/api`
Expected: PASS (ningún test importa el callback `jwt` directamente; esto confirma que el import nuevo no rompe los mocks de `@/lib/auth`).

- [ ] **Step 6: Checkpoint.**

---

### Task 3: `estaBajoRaiz` en `lib/google-drive.ts`

**Files:**
- Modify: `lib/google-drive.ts` (agregar al final, después de `trashFileByUrl`)
- Modify: `lib/google-drive.test.ts` (mock de `googleapis` gana `files.get`)

- [ ] **Step 1: Ampliar el mock y escribir los tests que fallan**

En `lib/google-drive.test.ts`, reemplazar el bloque de `vi.hoisted` + `vi.mock("googleapis", …)` por:

```ts
const { filesList, filesUpdate, filesGet } = vi.hoisted(() => ({
  filesList: vi.fn(),
  filesUpdate: vi.fn(),
  filesGet: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    drive: () => ({
      files: { list: filesList, update: filesUpdate, get: filesGet, create: vi.fn(), delete: vi.fn() },
      permissions: { create: vi.fn() },
    }),
  },
}));
```

cambiar el import a:

```ts
import { trashFilesInFolder, trashFileByUrl, estaBajoRaiz } from "./google-drive";
```

agregar `filesGet.mockReset();` dentro del `beforeEach`, y sumar al final del archivo:

```ts
describe("estaBajoRaiz", () => {
  // Cada respuesta de files.get, en orden de llamada (hijo → padre → …).
  const cadena = (...parents: (string[] | undefined)[]) => {
    for (const p of parents) filesGet.mockResolvedValueOnce({ data: { id: "x", parents: p } });
  };

  it("hijo directo de la raíz → true", async () => {
    cadena(["root"]);
    expect(await estaBajoRaiz("f1")).toBe(true);
    expect(filesGet).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1", fields: "id,parents", supportsAllDrives: true })
    );
  });

  it("nieto (raíz / Tareas / Edificio / archivo) → true", async () => {
    cadena(["edificio"], ["tareas"], ["root"]);
    expect(await estaBajoRaiz("f1")).toBe(true);
    expect(filesGet).toHaveBeenCalledTimes(3);
  });

  it("sin parents en la cadena → false", async () => {
    cadena(["otra"], undefined);
    expect(await estaBajoRaiz("f1")).toBe(false);
  });

  it("más de 8 niveles sin llegar a la raíz → false", async () => {
    for (let i = 0; i < 20; i++) filesGet.mockResolvedValueOnce({ data: { id: "x", parents: [`p${i}`] } });
    expect(await estaBajoRaiz("f1")).toBe(false);
    expect(filesGet).toHaveBeenCalledTimes(8);
  });

  it("propaga el error de Drive (ej. 404)", async () => {
    filesGet.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "404" }));
    await expect(estaBajoRaiz("f1")).rejects.toThrow("not found");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/google-drive.test.ts`
Expected: FAIL — `estaBajoRaiz` no es una función exportada.

- [ ] **Step 3: Implementar**

Agregar al final de `lib/google-drive.ts`:

```ts
// Profundidad máxima al subir por parents. La jerarquía real tiene 5 niveles como mucho
// (raíz / Tareas / Edificio / Objetivo / archivo; Visitas suma la carpeta agrupada).
const MAX_NIVELES_RAIZ = 8;

// true si el archivo desciende de GOOGLE_DRIVE_ROOT_FOLDER_ID (por cadena de parents).
// Lanza si Drive falla (incluido 404 por archivo inexistente): el llamador decide.
// Un archivo con varios padres (raro en unidades compartidas) se sigue por el primero.
export async function estaBajoRaiz(fileId: string): Promise<boolean> {
  if (isDemoMode()) return true;
  const root = getDriveRootFolderId();
  let actual = fileId;
  for (let nivel = 0; nivel < MAX_NIVELES_RAIZ; nivel++) {
    const res = await getDrive().files.get({
      fileId: actual,
      fields: "id,parents",
      supportsAllDrives: true,
    });
    const padre = res.data.parents?.[0];
    if (!padre) return false;
    if (padre === root) return true;
    actual = padre;
  }
  return false;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run lib/google-drive.test.ts`
Expected: PASS (los 5 nuevos + los existentes).

- [ ] **Step 5: Checkpoint.**

---

### Task 4: `estaReferenciado` + `cargarReferencias`

**Files:**
- Create: `lib/archivo-referencias.ts`
- Test: `lib/archivo-referencias.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/archivo-referencias.test.ts
import { describe, it, expect } from "vitest";
import { estaReferenciado, type ReferenciasArchivos } from "./archivo-referencias";
import type { Tarea, Usuario, Visita } from "@/types";

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

const tarea = (extra: Partial<Tarea> = {}): Tarea =>
  ({
    rowId: "t1",
    objetivo: "x",
    fechaInicio: "2026-01-01",
    fechaEstimada: "",
    edificio: "E",
    parteComun: false,
    dpto: "1A",
    informe: "",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "s@x.com",
    ...extra,
  }) as Tarea;

const visita = (pdfUrl: string): Visita => ({
  id: "v1",
  edificio: "E",
  fecha: "2026-01-01",
  pdfUrl,
  supervisor: "s@x.com",
  creadoEn: "2026-01-01T00:00:00.000-03:00",
});

const usuario = (firmaUrl?: string): Usuario => ({
  email: "u@x.com",
  nombre: "U",
  rol: "supervisor",
  activo: true,
  creadoEn: "2026-01-01T00:00:00.000-03:00",
  firmaUrl,
});

const vacio: ReferenciasArchivos = { tareas: [], visitas: [], usuarios: [] };

describe("estaReferenciado", () => {
  it("refs vacías → false", () => {
    expect(estaReferenciado("abc", vacio)).toBe(false);
  });

  it.each([
    ["imagen", tarea({ imagenes: [drive("abc")] })],
    ["video", tarea({ videos: [drive("abc")] })],
    ["documento", tarea({ documentos: [drive("abc")] })],
    ["reporteUrl", tarea({ reporteUrl: drive("abc") })],
  ])("referenciado como %s de una tarea → true", (_campo, t) => {
    expect(estaReferenciado("abc", { ...vacio, tareas: [t] })).toBe(true);
  });

  it("referenciado como pdfUrl de una visita → true", () => {
    expect(estaReferenciado("abc", { ...vacio, visitas: [visita(drive("abc"))] })).toBe(true);
  });

  it("referenciado como firmaUrl de un usuario → true", () => {
    expect(estaReferenciado("abc", { ...vacio, usuarios: [usuario(drive("abc"))] })).toBe(true);
  });

  it("id distinto → false", () => {
    const refs: ReferenciasArchivos = {
      tareas: [tarea({ imagenes: [drive("otro")], reporteUrl: drive("otro2") })],
      visitas: [visita(drive("otro3"))],
      usuarios: [usuario(drive("otro4"))],
    };
    expect(estaReferenciado("abc", refs)).toBe(false);
  });

  it("matchea por id aunque la URL tenga ?usp=sharing", () => {
    const refs = { ...vacio, usuarios: [usuario(`${drive("abc")}?usp=sharing`)] };
    expect(estaReferenciado("abc", refs)).toBe(true);
  });

  it("ignora URLs sin id de Drive y firmas ausentes", () => {
    const refs: ReferenciasArchivos = {
      tareas: [tarea({ imagenes: ["https://otro.host/abc"] })],
      visitas: [visita("")],
      usuarios: [usuario(undefined)],
    };
    expect(estaReferenciado("abc", refs)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/archivo-referencias.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// lib/archivo-referencias.ts
import type { Tarea, Usuario, Visita } from "@/types";
import { extractFileId } from "./google-drive";
import { getTareas, getUsuarios, getVisitas } from "./google-sheets";

// Todo lugar de la Sheet que apunta a un archivo de Drive. Un archivo referenciado acá
// NO es staging y no se puede mandar a papelera desde DELETE /api/upload.
export interface ReferenciasArchivos {
  tareas: Tarea[]; // imagenes, videos, documentos (ya mergeados desde TareaArchivos) + reporteUrl
  visitas: Visita[]; // pdfUrl
  usuarios: Usuario[]; // firmaUrl
}

// Compara por fileId extraído de cada URL, no por string: un "?usp=sharing" pegado a mano
// en firma_url sigue matcheando. URLs sin id de Drive se ignoran.
export function estaReferenciado(fileId: string, refs: ReferenciasArchivos): boolean {
  const urls: (string | undefined)[] = [];
  for (const t of refs.tareas) {
    urls.push(...t.imagenes, ...t.videos, ...t.documentos, t.reporteUrl);
  }
  for (const v of refs.visitas) urls.push(v.pdfUrl);
  for (const u of refs.usuarios) urls.push(u.firmaUrl);
  return urls.some((url) => !!url && extractFileId(url) === fileId);
}

// getTareas() ya trae la media por tarea (lee TareaArchivos adentro) y reporteUrl: no se
// llama a getAllArchivos() aparte, sería leer la misma hoja dos veces.
export async function cargarReferencias(): Promise<ReferenciasArchivos> {
  const [tareas, visitas, usuarios] = await Promise.all([getTareas(), getVisitas(), getUsuarios()]);
  return { tareas, visitas, usuarios };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run lib/archivo-referencias.test.ts`
Expected: PASS, 10 tests. Nota: el test importa el módulo real, que importa `googleapis` vía `google-drive`/`google-sheets`; no se instancia ningún cliente hasta llamar `cargarReferencias`, así que no hace falta mockear.

- [ ] **Step 5: Checkpoint.**

---

### Task 5: `DELETE /api/upload` con chequeos

**Files:**
- Modify: `app/api/upload/route.ts` (imports + handler `DELETE`)
- Create: `tests/api/upload-delete.test.ts`
- Modify: `tests/api/upload-visita.test.ts`, `tests/api/upload-pdf.test.ts`, `tests/api/upload-body-incompleto.test.ts` (factory del mock de `@/lib/google-drive`)

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/api/upload-delete.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DELETE } from "@/app/api/upload/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } }),
}));

const { isDemoMode } = vi.hoisted(() => ({ isDemoMode: vi.fn(() => false) }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode }));

const { trashFileByUrl, estaBajoRaiz } = vi.hoisted(() => ({
  trashFileByUrl: vi.fn(),
  estaBajoRaiz: vi.fn(),
}));
vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn(),
  trashFileByUrl,
  estaBajoRaiz,
  // Implementación real mínima: la ruta la usa para validar la url.
  extractFileId: (url: string) => url.match(/\/file\/d\/([^/]+)/)?.[1] ?? null,
}));

const { cargarReferencias, estaReferenciado } = vi.hoisted(() => ({
  cargarReferencias: vi.fn(),
  estaReferenciado: vi.fn(),
}));
vi.mock("@/lib/archivo-referencias", () => ({ cargarReferencias, estaReferenciado }));

vi.mock("@/lib/drive-visitas", () => ({ uploadVisitaFoto: vi.fn(), uploadFirma: vi.fn() }));
vi.mock("@/lib/google-sheets", () => ({ getConfiguracion: vi.fn() }));

const URL_OK = "https://drive.google.com/file/d/abc123/view";
const req = (url?: string) =>
  new NextRequest(`http://localhost/api/upload${url ? `?url=${encodeURIComponent(url)}` : ""}`, {
    method: "DELETE",
  });

beforeEach(() => {
  isDemoMode.mockReturnValue(false);
  trashFileByUrl.mockReset().mockResolvedValue(undefined);
  estaBajoRaiz.mockReset().mockResolvedValue(true);
  cargarReferencias.mockReset().mockResolvedValue({ tareas: [], visitas: [], usuarios: [] });
  estaReferenciado.mockReset().mockReturnValue(false);
});

describe("DELETE /api/upload", () => {
  it("sin url → 400", async () => {
    const res = await DELETE(req());
    expect(res.status).toBe(400);
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("url que no es un archivo de Drive → 400", async () => {
    const res = await DELETE(req("https://otro.host/x.png"));
    expect(res.status).toBe(400);
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("Drive responde 404 → 404, sin papelera", async () => {
    estaBajoRaiz.mockRejectedValue(Object.assign(new Error("nf"), { code: "404" }));
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(404);
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("archivo fuera de la raíz → 403, sin papelera ni lectura de referencias", async () => {
    estaBajoRaiz.mockResolvedValue(false);
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(403);
    expect(cargarReferencias).not.toHaveBeenCalled();
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("archivo referenciado por una fila → 409, sin papelera", async () => {
    estaReferenciado.mockReturnValue(true);
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(409);
    expect(estaReferenciado).toHaveBeenCalledWith("abc123", expect.anything());
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("archivo huérfano bajo la raíz → 200 y manda a papelera", async () => {
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(200);
    expect(estaBajoRaiz).toHaveBeenCalledWith("abc123");
    expect(trashFileByUrl).toHaveBeenCalledWith(URL_OK);
  });

  it("en demo → 200 sin chequear Drive ni la Sheet", async () => {
    isDemoMode.mockReturnValue(true);
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(200);
    expect(estaBajoRaiz).not.toHaveBeenCalled();
    expect(cargarReferencias).not.toHaveBeenCalled();
    expect(trashFileByUrl).toHaveBeenCalledWith(URL_OK);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/api/upload-delete.test.ts`
Expected: FAIL — los casos 400 (url no-Drive), 403, 409 y demo fallan (hoy la ruta papelea sin chequear).

- [ ] **Step 3: Implementar la ruta**

En `app/api/upload/route.ts`, reemplazar el import de google-drive y sumar dos imports:

```ts
import { uploadTareaFile, trashFileByUrl, extractFileId, estaBajoRaiz } from "@/lib/google-drive";
import { cargarReferencias, estaReferenciado } from "@/lib/archivo-referencias";
import { isDemoMode } from "@/lib/demo-mode";
```

y reemplazar el handler `DELETE` completo por:

```ts
// gaxios (cliente HTTP de googleapis) expone el status como `code` (string) y como
// `response.status` (number); se aceptan ambos.
function esNotFoundDeDrive(err: unknown): boolean {
  const e = err as { code?: unknown; response?: { status?: unknown } } | null;
  return Number(e?.code) === 404 || e?.response?.status === 404;
}

// Manda a papelera un archivo de STAGING: subido a Drive pero que ninguna fila referencia
// todavía (preview de tarea descartado, foto de visita quitada antes de emitir). Lo usan
// FileUploader, FotosVisita y useVisitaForm, siempre fire-and-forget.
//
// Chequeos, en orden de costo: (1) que cuelgue de la raíz de la app — la service account
// llega a toda la unidad compartida; (2) que ninguna fila lo referencie — un archivo ya
// guardado solo se va con el DELETE de su tarea/visita (admin).
export async function DELETE(req: NextRequest) {
  try {
    await requireSession();
    const url = req.nextUrl.searchParams.get("url");
    if (!url) return jsonError(400, "Falta url");
    const fileId = extractFileId(url);
    if (!fileId) return jsonError(400, "La url no es un archivo de Drive");

    if (!isDemoMode()) {
      let bajoRaiz: boolean;
      try {
        bajoRaiz = await estaBajoRaiz(fileId);
      } catch (err) {
        if (esNotFoundDeDrive(err)) return jsonError(404, "El archivo no existe");
        throw err;
      }
      if (!bajoRaiz) return jsonError(403, "El archivo no pertenece a la app");
      if (estaReferenciado(fileId, await cargarReferencias())) {
        return jsonError(409, "El archivo está en uso por una tarea, visita o firma");
      }
    }

    await trashFileByUrl(url);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 4: Sumar los exports nuevos a las factories de los tests existentes**

En `tests/api/upload-visita.test.ts`, `tests/api/upload-pdf.test.ts` y `tests/api/upload-body-incompleto.test.ts`, buscar el bloque:

```ts
vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn(),
  trashFileByUrl: vi.fn(),
}));
```

(puede variar mínimamente entre archivos — respetar lo que haya y solo agregar las dos líneas) y dejarlo como:

```ts
vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn(),
  trashFileByUrl: vi.fn(),
  extractFileId: vi.fn(),
  estaBajoRaiz: vi.fn(),
}));
```

Si alguno de los tres no mockea `@/lib/google-drive` con factory cerrada, no tocarlo.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/api/upload-delete.test.ts tests/api/upload-visita.test.ts tests/api/upload-pdf.test.ts tests/api/upload-body-incompleto.test.ts`
Expected: PASS, todos.

- [ ] **Step 6: Checkpoint.**

---

### Task 6: `handleApiError` opaco con `ref`

**Files:**
- Modify: `lib/api-utils.ts`
- Create: `lib/api-utils.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/api-utils.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import { handleApiError, jsonError } from "./api-utils";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("handleApiError", () => {
  it("un Error común responde 500 opaco con ref, sin filtrar el mensaje", async () => {
    const res = handleApiError(new Error("Unable to parse range: Tareas!A:AD"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
    expect(body.ref).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(JSON.stringify(body)).not.toContain("Tareas!A:AD");
    // El mismo ref queda en el log del server, con el error completo.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`ref=${body.ref}`),
      expect.any(Error)
    );
  });

  it("un valor que no es Error también responde 500 opaco con ref", async () => {
    const res = handleApiError("boom");
    expect(res.status).toBe(500);
    expect((await res.json()).ref).toHaveLength(8);
  });

  it("un Response pasa tal cual", () => {
    const r = jsonError(401, "No autenticado");
    expect(handleApiError(r)).toBe(r);
  });

  it("ZodError responde 400 con detalles", async () => {
    const res = handleApiError(new ZodError([]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Datos inválidos");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/api-utils.test.ts`
Expected: FAIL — el primer caso recibe `error === "Unable to parse range…"` y sin `ref`.

- [ ] **Step 3: Implementar**

Reemplazar `lib/api-utils.ts` completo por:

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

// Convierte cualquier error en una respuesta JSON consistente.
// - Si la "excepción" ya es un Response (lo lanzamos así en requireSession), lo retorna tal cual.
// - ZodError → 400 con el detalle de validación.
// - Cualquier otra cosa → 500 OPACO: el mensaje real puede traer rangos, nombres de hoja o
//   ids (errores de googleapis) y no debe llegar al browser. Se loguea completo con un `ref`
//   corto que viaja en la respuesta: el usuario manda captura, se busca `ref=xxxx` en el log.
export function handleApiError(err: unknown): Response {
  if (err instanceof Response) return err;
  if (err instanceof ZodError) {
    return jsonError(400, "Datos inválidos", err.flatten());
  }
  const ref = nanoid(8);
  console.error(`[api] error ref=${ref}:`, err);
  return NextResponse.json({ error: "Error interno", ref }, { status: 500 });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run lib/api-utils.test.ts lib/http tests/api`
Expected: PASS. Los tests existentes de 500 (`lib/http/withAuth.test.ts`, `tests/api/visitas.test.ts`) solo miran el status.

- [ ] **Step 5: Checkpoint.**

---

### Task 7: `apiFetch` + `ref` en el mensaje + migrar `fetch` crudos

**Files:**
- Modify: `lib/api-client.ts`
- Create: `lib/api-client.test.ts`
- Modify: `app/(app)/tareas/page.tsx` (líneas 37–47), `components/visitas/FotosVisita.tsx` (líneas 36 y 93), `components/visitas/hooks/useVisitaForm.ts` (línea 68), `components/usuarios/UsuariosManager.tsx` (línea 49)
- Modify: `components/visitas/VisitaForm.test.tsx` (factory del mock de `@/lib/api-client`)

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/api-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, apiFetch } from "./api-client";

const fetchMock = vi.fn();
const assign = vi.fn();
const location = { assign, pathname: "/tareas", search: "?edificio=X" };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  assign.mockReset();
  location.pathname = "/tareas";
  location.search = "?edificio=X";
  Object.defineProperty(window, "location", { value: location, writable: true, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

const respuesta = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe("apiFetch", () => {
  it("con 401 redirige a /login?from=<ruta actual> y devuelve la respuesta", async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: "No autenticado" }));
    const res = await apiFetch("/api/tareas");
    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith("/login?from=%2Ftareas%3Fedificio%3DX");
  });

  it("con 401 estando en /login no redirige (evita loops)", async () => {
    location.pathname = "/login";
    location.search = "";
    fetchMock.mockResolvedValue(respuesta(401));
    await apiFetch("/api/tareas");
    expect(assign).not.toHaveBeenCalled();
  });

  it("con 200 no redirige", async () => {
    fetchMock.mockResolvedValue(respuesta(200, []));
    await apiFetch("/api/tareas");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("request (vía api.*)", () => {
  it("un 500 con ref arma el mensaje 'Error interno (ref …)'", async () => {
    fetchMock.mockResolvedValue(respuesta(500, { error: "Error interno", ref: "k3x9abcd" }));
    await expect(api.tareas.list()).rejects.toThrow("Error interno (ref k3x9abcd)");
  });

  it("un 4xx sin ref conserva el mensaje del server", async () => {
    fetchMock.mockResolvedValue(respuesta(403, { error: "Solo el admin puede asignar" }));
    await expect(api.tareas.list()).rejects.toThrow("Solo el admin puede asignar");
  });

  it("un 401 lanza además de redirigir", async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: "No autenticado" }));
    await expect(api.tareas.list()).rejects.toThrow("No autenticado");
    expect(assign).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/api-client.test.ts`
Expected: FAIL — `apiFetch` no existe.

- [ ] **Step 3: Implementar en `lib/api-client.ts`**

Reemplazar la función `request` y el `fetch` interno de `upload` así. Arriba del archivo, después de los imports de tipos, agregar:

```ts
// fetch + manejo central de sesión vencida. Todo request a /api/* desde el browser pasa
// por acá (request(), upload y los pocos fetch directos de componentes). Con 401 dispara la
// navegación a /login y DEVUELVE la respuesta igual: el llamador sigue su camino normal
// (`!res.ok` → lanza) y ninguna promesa queda colgada mientras el navegador navega.
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) redirigirALogin();
  return res;
}

function redirigirALogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  const from = window.location.pathname + window.location.search;
  window.location.assign(`/login?from=${encodeURIComponent(from)}`);
}

// Mensaje de error a partir del body {error, ref?} de la API. El ref (solo en 500) viaja en
// el texto para que el usuario pueda mandarlo en una captura y buscarlo en el log.
async function mensajeDeError(res: Response): Promise<string> {
  let message = `Error ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    if (body?.ref) message = `${message} (ref ${body.ref})`;
  } catch {
    /* ignore */
  }
  return message;
}
```

Reemplazar `request` por:

```ts
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await mensajeDeError(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

Y en `upload`, reemplazar:

```ts
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        let message = `Error ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }
      return res.json();
```

por:

```ts
      const res = await apiFetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(await mensajeDeError(res));
      return res.json();
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run lib/api-client.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Migrar los cuatro `fetch` crudos**

`app/(app)/tareas/page.tsx` — agregar `apiFetch` al import existente de `@/lib/api-client`:

```ts
import { api, apiFetch } from "@/lib/api-client";
```

y en `fetchTareas` / `fetchEdificios` cambiar `fetch(` por `apiFetch(`:

```ts
async function fetchTareas(params: URLSearchParams): Promise<Tarea[]> {
  const res = await apiFetch(`/api/tareas?${params.toString()}`);
  if (!res.ok) throw new Error("Error al cargar tareas");
  return res.json();
}

async function fetchEdificios(): Promise<Edificio[]> {
  const res = await apiFetch("/api/edificios");
  if (!res.ok) throw new Error("Error al cargar edificios");
  return res.json();
}
```

`components/visitas/FotosVisita.tsx` — agregar `import { apiFetch } from "@/lib/api-client";` y cambiar las dos llamadas:

```ts
        const res = await apiFetch("/api/upload", { method: "POST", body: form });
```

```ts
                  void apiFetch(`/api/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" });
```

`components/visitas/hooks/useVisitaForm.ts` — agregar `apiFetch` al import de `@/lib/api-client` (ya importa `api`) y cambiar:

```ts
        void apiFetch(`/api/upload?url=${encodeURIComponent(url)}`, {
          method: "DELETE",
          keepalive: true,
        });
```

`components/usuarios/UsuariosManager.tsx` — agregar `apiFetch` al import de `@/lib/api-client` (ya importa `api`) y cambiar:

```ts
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
```

- [ ] **Step 6: Sumar `apiFetch` a la factory de `VisitaForm.test.tsx`**

`useVisitaForm.ts` ahora importa `apiFetch`, y ese test mockea `@/lib/api-client` con factory cerrada. Reemplazar:

```ts
vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    visitas: { create: vi.fn() },
  },
}));
```

por:

```ts
vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    visitas: { create: vi.fn() },
  },
  // Passthrough al fetch global (que el test stubea o no usa).
  apiFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
```

- [ ] **Step 7: Correr los tests de los componentes tocados**

Run: `npx vitest run components/visitas components/usuarios tests/components lib/api-client.test.ts`
Expected: PASS. `FotosVisita.test.tsx` stubea `global.fetch` con `{ ok, json }` sin `status` → `apiFetch` ve `status === undefined`, no redirige.

- [ ] **Step 8: Checkpoint.**

---

### Task 8: Verificación final

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS; total ≈ 562 + 38 nuevos (8 + 5 + 10 + 7 + 4 + 6) − 0 borrados.

- [ ] **Step 2: Tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errores. Si aparece `@typescript-eslint/no-unused-vars` por `estaBajoRaiz`/`extractFileId` en alguna factory de test, es un `vi.fn()` en un objeto literal: no aplica. Si aparece por `errorSpy` tipado con `ReturnType<typeof vi.spyOn>`, cambiar a `let errorSpy: ReturnType<typeof vi.spyOn>` → `vi.SpyInstance` según la versión de vitest instalada.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: compila (webpack). `lib/archivo-referencias.ts` importa `google-sheets` → solo lo usa la ruta `DELETE` (server); ningún componente de cliente lo importa (regla del repo: helpers de cliente no cuelgan de `lib/sheets/*`).

- [ ] **Step 5: Reporte** — árbol verde, listo para commitear. Los criterios de aceptación 1–7 del spec quedan cubiertos por tests; el 8 por estos cuatro comandos.
