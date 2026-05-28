import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.2.0") }));

import { SettingsModal } from "../SettingsModal";
import { useUiStore } from "../../../shared/state/uiStore";

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ settingsOpen: false });
});

describe("SettingsModal", () => {
  it("is hidden when closed", () => {
    render(<SettingsModal />);
    expect(screen.queryByTestId("settings-modal")).toBeNull();
  });

  it("shows the dialog and app version when open", async () => {
    useUiStore.setState({ settingsOpen: true });
    render(<SettingsModal />);
    expect(screen.getByTestId("settings-modal")).toBeTruthy();
    expect(await screen.findByText(/QuantaMind v0\.2\.0/)).toBeTruthy();
  });

  it("closes on Escape", () => {
    useUiStore.setState({ settingsOpen: true });
    render(<SettingsModal />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useUiStore.getState().settingsOpen).toBe(false);
  });

  it("closes on the X button", () => {
    useUiStore.setState({ settingsOpen: true });
    render(<SettingsModal />);
    fireEvent.click(screen.getByLabelText("Close settings"));
    expect(useUiStore.getState().settingsOpen).toBe(false);
  });
});
