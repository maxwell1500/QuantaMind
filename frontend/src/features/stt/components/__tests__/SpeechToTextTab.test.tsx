import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { SpeechToTextTab } from "../SpeechToTextTab";
import { useSttSelectionStore } from "../../state/sttSelectionStore";
import type { WhisperEnv } from "../../../../shared/ipc/stt/stt";

function withEnv(env: WhisperEnv) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "check_whisper_env":
        return env;
      case "list_stt_catalog":
      case "list_installed_stt_models":
        return [];
      default:
        return undefined; // get_hardware_snapshot etc. — hook tolerates failure
    }
  });
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useSttSelectionStore.setState({ selectedSttModelId: null });
});

describe("SpeechToTextTab", () => {
  it("shows the install setup card when the engine isn't found", async () => {
    withEnv({ found: false, dir: null, runnable: false, error: null });
    render(<SpeechToTextTab />);
    const card = await screen.findByTestId("stt-setup");
    expect(card).toHaveTextContent("Set up speech-to-text");
  });

  it("shows the reinstall card when the engine is found but not runnable", async () => {
    withEnv({ found: true, dir: "/usr/local/bin", runnable: false, error: "shared library load error" });
    render(<SpeechToTextTab />);
    const card = await screen.findByTestId("stt-setup");
    expect(card).toHaveTextContent("can't run");
  });

  it("shows the catalog when the engine is ready", async () => {
    withEnv({ found: true, dir: "/opt/homebrew/bin", runnable: true, error: null });
    render(<SpeechToTextTab />);
    expect(await screen.findByTestId("stt-ready")).toBeInTheDocument();
    expect(screen.getByTestId("stt-catalog")).toBeInTheDocument();
  });
});
