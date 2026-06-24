import { describe, it, expect, beforeEach } from "vitest";
import { useParamsStore } from "../paramsStore";

beforeEach(() => {
  useParamsStore.setState({ globalParams: {}, perModelParams: {}, sharedParams: true, keepLoaded: false });
});

describe("paramsStore (global inference params)", () => {
  it("starts empty", () => {
    expect(useParamsStore.getState().globalParams).toEqual({});
  });

  it("setParam sets a value", () => {
    useParamsStore.getState().setParam("temperature", 0.2);
    expect(useParamsStore.getState().globalParams).toEqual({ temperature: 0.2 });
  });

  it("setParam(undefined) omits the key entirely (so the backend default applies)", () => {
    useParamsStore.getState().setParam("temperature", 0.2);
    useParamsStore.getState().setParam("temperature", undefined);
    expect("temperature" in useParamsStore.getState().globalParams).toBe(false);
  });

  it("resetParam removes a single key, leaving others", () => {
    useParamsStore.getState().setParam("temperature", 0.2);
    useParamsStore.getState().setParam("seed", 42);
    useParamsStore.getState().resetParam("temperature");
    expect(useParamsStore.getState().globalParams).toEqual({ seed: 42 });
  });

  it("reset clears everything", () => {
    useParamsStore.getState().setParam("temperature", 0.2);
    useParamsStore.getState().setModelParam("m", "seed", 7);
    useParamsStore.getState().setSharedParams(false);
    useParamsStore.getState().reset();
    expect(useParamsStore.getState().globalParams).toEqual({});
    expect(useParamsStore.getState().perModelParams).toEqual({});
    expect(useParamsStore.getState().sharedParams).toBe(true);
  });

  it("setModelParam writes per-model overrides, scoped by model", () => {
    useParamsStore.getState().setModelParam("llama", "temperature", 0.1);
    useParamsStore.getState().setModelParam("mistral", "temperature", 0.9);
    expect(useParamsStore.getState().perModelParams).toEqual({
      llama: { temperature: 0.1 }, mistral: { temperature: 0.9 },
    });
    // undefined removes just that key for that model
    useParamsStore.getState().setModelParam("llama", "temperature", undefined);
    expect(useParamsStore.getState().perModelParams.llama).toEqual({});
    expect(useParamsStore.getState().perModelParams.mistral).toEqual({ temperature: 0.9 });
  });
});
