import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../ipc/userSettings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({ first_run_complete: false, theme: "dark" }),
  setUserSettings: vi.fn().mockResolvedValue(undefined),
}));

import { resolveTheme, applyTheme, useThemeStore } from "../themeStore";
import { getUserSettings, setUserSettings } from "../../ipc/userSettings";

function stubMatchMedia(dark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  useThemeStore.setState({ mode: "system" });
  document.documentElement.removeAttribute("data-theme");
});

describe("resolveTheme", () => {
  it("returns explicit modes unchanged", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
  it("follows the OS preference in system mode", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets the resolved theme on <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    stubMatchMedia(false);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("useThemeStore", () => {
  it("load reads the persisted mode and applies it", async () => {
    await useThemeStore.getState().load();
    expect(useThemeStore.getState().mode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(getUserSettings).toHaveBeenCalled();
  });

  it("setMode applies immediately and persists", async () => {
    await useThemeStore.getState().setMode("light");
    expect(useThemeStore.getState().mode).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(setUserSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: "light" }));
  });
});
