import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { useTranscriptStore } from "../state/transcriptStore";
import { useMicRecorder } from "../hooks/useMicRecorder";
import { SttWorkspace } from "../components/SttWorkspace";

beforeEach(() => {
  invokeMock.mockReset();
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
    expect(invokeMock).not.toHaveBeenCalled(); // no-op never crosses IPC
  });

  it("start → stop drives the native commands and returns the scratch path", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_recording") return undefined;
      if (cmd === "stop_recording") return { path: "/scratch/take.wav", had_audio: true };
      if (cmd === "recording_level") return 0.2;
      throw new Error(`unexpected command: ${cmd}`);
    });
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.recording).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("start_recording");
    let res: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      res = await result.current.stop();
    });
    expect(res).toEqual({ path: "/scratch/take.wav", hadAudio: true });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the backend AppError message when the mic can't start", async () => {
    invokeMock.mockRejectedValue({ kind: "validation", message: "no microphone found" });
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBe("no microphone found");
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
