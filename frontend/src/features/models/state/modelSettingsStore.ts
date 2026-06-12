import { create } from "zustand";
import {
  DEFAULT_TEMPERATURE,
  getModelSettings,
  setModelTemperature,
  type ModelSettingsMap,
} from "../../../shared/ipc/models/model_settings";

export interface ModelSettingsStoreState {
  byModel: ModelSettingsMap;
  loaded: boolean;
  load: () => Promise<void>;
  setTemperature: (model: string, temperature: number) => Promise<void>;
  temperatureFor: (model: string) => number;
}

/// Per-model settings (currently just temperature). Loaded once at app
/// startup from the backend, which persists to a YAML file in the app
/// config dir. Writes are optimistic: the local map updates after the
/// backend save resolves, so a failed write surfaces via the rejected
/// promise rather than leaving stale UI state.
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
        byModel: { ...s.byModel, [model]: { temperature } },
      }));
    },
    temperatureFor: (model) =>
      get().byModel[model]?.temperature ?? DEFAULT_TEMPERATURE,
  }),
);
