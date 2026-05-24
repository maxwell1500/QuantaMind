import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { useModelInstall } from "../useModelInstall";
import { useModelStore } from "../../state/modelStore";
import { __resetDownloadEventBusForTests } from "../../state/downloadEventBus";

beforeEach(() => {
  __resetDownloadEventBusForTests();
  useModelStore.setState({ downloads: {}, pullNames: {}, activeHfName: null });
});

describe("useModelInstall — entry lookup follows modelName prop", () => {
  it("typing a new name shows that name's state, not the first-render name", () => {
    // Prior bug: `useRef(modelName)` only honoured the first render, so
    // changing `modelName` left the entry pinned to the original name.
    useModelStore.getState().upsertDownload({
      id: "alpha", source: "ollama", name: "alpha", status: "success", percent: 100,
    });
    useModelStore.getState().upsertDownload({
      id: "beta", source: "ollama", name: "beta", status: "downloading", percent: 30,
    });
    const { result, rerender } = renderHook(
      ({ name }) => useModelInstall(name),
      { initialProps: { name: "alpha" } },
    );
    expect(result.current.state.status).toBe("success");
    rerender({ name: "beta" });
    expect(result.current.state.status).toBe("pulling");
  });

  it("undefined modelName falls back to local idle state", () => {
    useModelStore.getState().upsertDownload({
      id: "x", source: "ollama", name: "x", status: "downloading", percent: 10,
    });
    const { result } = renderHook(() => useModelInstall(undefined));
    expect(result.current.state.status).toBe("idle");
  });
});
