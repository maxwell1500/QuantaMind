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
  it("isThinkingFor auto-detects from the name when the model is unset", () => {
    // A reasoning-family name is pre-detected; a terse model is not.
    expect(useModelSettingsStore.getState().isThinkingFor("qwen3.5:9b")).toBe(true);
    expect(useModelSettingsStore.getState().isThinkingFor("llama3.2:3b")).toBe(false);
  });

  it("an explicit setting overrides the name heuristic", async () => {
    // Turn OFF a model the heuristic would auto-detect as thinking.
    await useModelSettingsStore.getState().setThinking("qwen3.5:9b", false);
    expect(useModelSettingsStore.getState().isThinkingFor("qwen3.5:9b")).toBe(false);
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
