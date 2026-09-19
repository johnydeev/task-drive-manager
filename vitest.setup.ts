import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// El cache de lecturas de Sheets (lib/sheets/core.ts) queda apagado en tests: los tests de la
// capa de datos mockean googleapis y leen el mismo rango varias veces con datos distintos.
// core.test.ts lo enciende explícitamente con vi.stubEnv.
process.env.SHEETS_CACHE_TTL_MS = "0";

// Mock next/navigation porque jsdom no implementa router de Next.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));
