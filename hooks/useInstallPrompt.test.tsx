import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt } from "./useInstallPrompt";

function makePromptEvent() {
  const evt = new Event("beforeinstallprompt") as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
  return evt;
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => mockMatchMedia(false));

describe("useInstallPrompt", () => {
  it("canInstall arranca en false sin evento", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("tras beforeinstallprompt, canInstall pasa a true", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makePromptEvent());
    });
    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall dispara prompt() y luego canInstall vuelve a false", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const evt = makePromptEvent();
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(result.current.canInstall).toBe(true);
    await act(async () => {
      await result.current.promptInstall();
    });
    expect(evt.prompt).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  it("si ya está en standalone, canInstall es false aunque llegue el evento", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makePromptEvent());
    });
    expect(result.current.canInstall).toBe(false);
  });
});
