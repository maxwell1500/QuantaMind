import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the IPC layer so the store's optimistic writes don't hit Tauri.
vi.mock("../../../../shared/ipc/models/model_settings", () => ({
  DEFAULT_TEMPERATURE: 0.7,
  getModelSettings: vi.fn(async () => ({})),
  setModelTemperature: vi.fn(async () => {}),
  setModelThinking: vi.fn(async () => {}),
}));

import { useModelSettingsStore } from "../modelSettingsStore";
import {
  setModelTemperature,
  setModelThinking,
} from "../../../../shared/ipc/models/model_settings";

beforeEach(() => {
  useModelSettingsStore.setState({ byModel: {}, loaded: false });
  vi.clearAllMocks();
});

describe("modelSettingsStore thinking flag", () => {
  it("isThinkingFor defaults to false for an unknown model", () => {
    expect(useModelSettingsStore.getState().isThinkingFor("ghost")).toBe(false);
  });

  it("setThinking persists via IPC and updates the local map", async () => {
    await useModelSettingsStore.getState().setThinking("qwen", true);
    expect(setModelThinking).toHaveBeenCalledWith("qwen", true);
    expect(useModelSettingsStore.getState().isThinkingFor("qwen")).toBe(true);
  });

  it("setThinking preserves an existing temperature", async () => {
    await useModelSettingsStore.getState().setTemperature("qwen", 0.2);
    await useModelSettingsStore.getState().setThinking("qwen", true);
    expect(useModelSettingsStore.getState().temperatureFor("qwen")).toBe(0.2);
    expect(useModelSettingsStore.getState().isThinkingFor("qwen")).toBe(true);
  });

  it("setTemperature preserves an existing thinking flag", async () => {
    await useModelSettingsStore.getState().setThinking("qwen", true);
    await useModelSettingsStore.getState().setTemperature("qwen", 1.1);
    expect(setModelTemperature).toHaveBeenCalledWith("qwen", 1.1);
    expect(useModelSettingsStore.getState().isThinkingFor("qwen")).toBe(true);
    expect(useModelSettingsStore.getState().temperatureFor("qwen")).toBe(1.1);
  });
});
