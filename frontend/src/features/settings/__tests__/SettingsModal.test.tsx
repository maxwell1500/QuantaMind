import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../../shared/ipc/userSettings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({ first_run_complete: false, theme: "system" }),
  setUserSettings: vi.fn().mockResolvedValue(undefined),
}));

import { SettingsModal } from "../SettingsModal";
import { useUiStore } from "../../../shared/state/uiStore";
import { useThemeStore } from "../../../shared/state/themeStore";

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ settingsOpen: false });
  useThemeStore.setState({ mode: "system" });
});

describe("SettingsModal", () => {
  it("is hidden when closed", () => {
    render(<SettingsModal />);
    expect(screen.queryByTestId("settings-modal")).toBeNull();
  });

  it("shows the three theme modes with the current one pressed", () => {
    useUiStore.setState({ settingsOpen: true });
    render(<SettingsModal />);
    expect(screen.getByTestId("theme-system").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("theme-dark").getAttribute("aria-pressed")).toBe("false");
  });

  it("selecting a mode updates the store", () => {
    useUiStore.setState({ settingsOpen: true });
    render(<SettingsModal />);
    fireEvent.click(screen.getByTestId("theme-dark"));
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("closes on Escape", () => {
    useUiStore.setState({ settingsOpen: true });
    render(<SettingsModal />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useUiStore.getState().settingsOpen).toBe(false);
  });
});
