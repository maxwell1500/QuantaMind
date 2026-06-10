import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { useTranscriptStore } from "../state/transcriptStore";
import { useMicRecorder } from "../hooks/useMicRecorder";
import { SttWorkspace } from "../components/SttWorkspace";

beforeEach(() => {
  useTranscriptStore.setState({ reference: null, segments: [], status: "idle", error: null });
});

describe("transcriptStore", () => {
  it("keeps an empty reference as null, never ''", () => {
    useTranscriptStore.getState().setReference("a script");
    expect(useTranscriptStore.getState().reference).toBe("a script");
    useTranscriptStore.getState().setReference("");
    expect(useTranscriptStore.getState().reference).toBeNull();
  });
});

describe("useMicRecorder", () => {
  it("stop without record is a no-op — returns null, no throw", async () => {
    const { result } = renderHook(() => useMicRecorder());
    let res: unknown = "x";
    await act(async () => {
      res = await result.current.stop();
    });
    expect(res).toBeNull();
    expect(result.current.recording).toBe(false);
  });
});

describe("SttWorkspace", () => {
  it("renders the two-pane surface for whisper.cpp", () => {
    render(<SttWorkspace engine="whisper_cpp" />);
    expect(screen.getByTestId("stt-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("stt-transcript-pane")).toBeInTheDocument();
    expect(screen.getByTestId("stt-reference-pane")).toBeInTheDocument();
  });

  it("shows the coming-later notice for mlx-audio (not the controls)", () => {
    render(<SttWorkspace engine="mlx_audio" />);
    expect(screen.getByTestId("stt-mlx-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("stt-workspace")).toBeNull();
  });
});
