import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../../shared/ipc/compare/compare", () => ({
  runCompare: vi.fn().mockResolvedValue(undefined),
  stopCompare: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../state/compareEventBus", () => ({ startCompareEventBus: vi.fn().mockResolvedValue(undefined) }));

import { runCompare } from "../../../shared/ipc/compare/compare";
import { useCompareRun } from "../hooks/useCompareRun";
import { useCompareStore } from "../state/compareStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useParamsStore } from "../../../shared/state/paramsStore";

beforeEach(() => {
  vi.clearAllMocks();
  useCompareStore.getState().reset();
  useCompareStore.setState({ prompt: "hi" });
  useSelectedModelStore.setState({ selectedModels: [
    { name: "llama", backend: "ollama", size_bytes: 1 },
    { name: "mistral", backend: "ollama", size_bytes: 1 },
  ] });
  useParamsStore.setState({ globalParams: { temperature: 0.5 }, perModelParams: {}, sharedParams: true, keepLoaded: false });
});

describe("useCompareRun", () => {
  it("sends the global model names, their backends, params and keep_alive", async () => {
    const { result } = renderHook(() => useCompareRun());
    await act(async () => { await result.current.start(); });
    expect(runCompare).toHaveBeenCalledWith(expect.objectContaining({
      models: ["llama", "mistral"],
      backends: ["ollama", "ollama"],
      params: { temperature: 0.5 },
    }));
    // shared mode + keep-loaded off → neither perModelParams nor keepAlive sent
    expect(vi.mocked(runCompare).mock.calls[0][0].perModelParams).toBeUndefined();
    expect(vi.mocked(runCompare).mock.calls[0][0].keepAlive).toBeUndefined();
  });

  it("forwards perModelParams when 'same for all' is off", async () => {
    useParamsStore.setState({ sharedParams: false, perModelParams: { llama: { temperature: 0.1 }, mistral: { temperature: 0.9 } } });
    const { result } = renderHook(() => useCompareRun());
    await act(async () => { await result.current.start(); });
    expect(runCompare).toHaveBeenCalledWith(expect.objectContaining({
      perModelParams: { llama: { temperature: 0.1 }, mistral: { temperature: 0.9 } },
    }));
  });

  it("blocks with an error when no models are selected", async () => {
    useSelectedModelStore.setState({ selectedModels: [] });
    const { result } = renderHook(() => useCompareRun());
    await act(async () => { await result.current.start(); });
    expect(runCompare).not.toHaveBeenCalled();
    expect(result.current.startError).toMatch(/pick at least one model/i);
  });
});
