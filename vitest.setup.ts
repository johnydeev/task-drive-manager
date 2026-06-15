import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock next/navigation porque jsdom no implementa router de Next.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));
