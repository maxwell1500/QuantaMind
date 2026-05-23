import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen, type EventCallback } from "@tauri-apps/api/event";
import {
  startDownloadEventBus,
  __resetDownloadEventBusForTests,
} from "../downloadEventBus";
import { useModelStore } from "../modelStore";

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  __resetDownloadEventBusForTests();
  useModelStore.setState({
    downloads: {}, pullNames: {}, activeHfName: null,
    activeTab: "ollama", installInFlight: null, pendingLocalPath: null,
  });
});

describe("downloadEventBus", () => {
  it("HF progress writes to activeHfName entry regardless of which component is mounted", async () => {
    await startDownloadEventBus();
    useModelStore.getState().setActiveHfName("llama-3.2");
    fire("hf-progress", { phase: "downloading", bytes_completed: 500, bytes_total: 1000, speed_bps: 100 });
    expect(useModelStore.getState().downloads["llama-3.2"]).toMatchObject({
      source: "huggingface", status: "downloading", percent: 50,
      bytesCompleted: 500, bytesTotal: 1000,
    });
  });

  it("Pull progress finds the model name via pullNames map (survives component unmounts)", async () => {
    await startDownloadEventBus();
    useModelStore.getState().recordPullName("pid-1", "phi3.5:latest");
    fire("pull-progress", {
      pull_id: "pid-1",
      progress: { phase: "downloading", digest: "sha", total: 1000, completed: 750, speed_bps: 100 },
    });
    expect(useModelStore.getState().downloads["phi3.5:latest"]).toMatchObject({
      source: "ollama", status: "downloading", percent: 75, pullId: "pid-1",
    });
  });

  it("Pull-progress with no matching pullId is silently ignored", async () => {
    await startDownloadEventBus();
    fire("pull-progress", {
      pull_id: "unknown", progress: { phase: "success" },
    });
    expect(useModelStore.getState().downloads).toEqual({});
  });

  it("Pull-progress success phase flips status to success at 100%", async () => {
    await startDownloadEventBus();
    useModelStore.getState().recordPullName("pid-9", "qwen2.5:7b");
    fire("pull-progress", { pull_id: "pid-9", progress: { phase: "success" } });
    expect(useModelStore.getState().downloads["qwen2.5:7b"]).toMatchObject({
      status: "success", percent: 100,
    });
  });
});
