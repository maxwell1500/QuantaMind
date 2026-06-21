import { create } from "zustand";
import {
  DEFAULT_TEMPERATURE,
  getModelSettings,
  setModelTemperature,
  setModelThinking,
  type ModelSettingsMap,
} from "../../../shared/ipc/models/model_settings";

export interface ModelSettingsStoreState {
  byModel: ModelSettingsMap;
  loaded: boolean;
  load: () => Promise<void>;
  setTemperature: (model: string, temperature: number) => Promise<void>;
  temperatureFor: (model: string) => number;
  setThinking: (model: string, isThinking: boolean) => Promise<void>;
  isThinkingFor: (model: string) => boolean;
}

/// Per-model settings (temperature + the thinking flag). Loaded once at app
/// startup from the backend, which persists to a YAML file in the app
/// config dir. Writes are optimistic: the local map updates after the
/// backend save resolves, so a failed write surfaces via the rejected
/// promise rather than leaving stale UI state. Each setter merges onto the
/// existing entry so writing one field never clobbers the other.
export const useModelSettingsStore = create<ModelSettingsStoreState>(
  (set, get) => ({
    byModel: {},
    loaded: false,
    load: async () => {
      if (get().loaded) return;
      const byModel = await getModelSettings();
      set({ byModel, loaded: true });
    },
    setTemperature: async (model, temperature) => {
      await setModelTemperature(model, temperature);
      set((s) => ({
        byModel: {
          ...s.byModel,
          [model]: {
            is_thinking: s.byModel[model]?.is_thinking ?? false,
            temperature,
          },
        },
      }));
    },
    temperatureFor: (model) =>
      get().byModel[model]?.temperature ?? DEFAULT_TEMPERATURE,
    setThinking: async (model, isThinking) => {
      await setModelThinking(model, isThinking);
      set((s) => ({
        byModel: {
          ...s.byModel,
          [model]: {
            temperature: s.byModel[model]?.temperature ?? DEFAULT_TEMPERATURE,
            is_thinking: isThinking,
          },
        },
      }));
    },
    isThinkingFor: (model) => get().byModel[model]?.is_thinking ?? false,
  }),
);
