import { listen } from "@tauri-apps/api/event";
import {
  CompareCancelledPayloadSchema,
  CompareDonePayloadSchema,
  CompareErrorPayloadSchema,
  CompareLoadingPayloadSchema,
  CompareTokenPayloadSchema,
  EVENT_COMPARE_CANCELLED,
  EVENT_COMPARE_DONE,
  EVENT_COMPARE_ERROR,
  EVENT_COMPARE_LOADING,
  EVENT_COMPARE_RUN_DONE,
  EVENT_COMPARE_TOKEN,
} from "../../../shared/ipc/compare_events";
import { useCompareStore } from "./compareStore";

let starting: Promise<void> | null = null;

export function startCompareEventBus(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    await listen<unknown>(EVENT_COMPARE_LOADING, (e) => {
      const p = CompareLoadingPayloadSchema.safeParse(e.payload);
      if (p.success) useCompareStore.getState().setRowLoading(p.data.model, p.data.model_id);
    });
    await listen<unknown>(EVENT_COMPARE_TOKEN, (e) => {
      const p = CompareTokenPayloadSchema.safeParse(e.payload);
      if (p.success) useCompareStore.getState().appendToken(p.data.model, p.data.model_id, p.data.text);
    });
    await listen<unknown>(EVENT_COMPARE_DONE, (e) => {
      const p = CompareDonePayloadSchema.safeParse(e.payload);
      if (p.success) useCompareStore.getState().setRowDone(p.data);
    });
    await listen<unknown>(EVENT_COMPARE_CANCELLED, (e) => {
      const p = CompareCancelledPayloadSchema.safeParse(e.payload);
      if (p.success) useCompareStore.getState().setRowCancelled(p.data);
    });
    await listen<unknown>(EVENT_COMPARE_ERROR, (e) => {
      const p = CompareErrorPayloadSchema.safeParse(e.payload);
      if (p.success) useCompareStore.getState().setRowError(p.data);
    });
    await listen<unknown>(EVENT_COMPARE_RUN_DONE, () => {
      useCompareStore.getState().finishRun();
    });
  })();
  starting.catch((e) => {
    console.error("compareEventBus startup failed:", e);
    starting = null;
  });
  return starting;
}

export function __resetCompareEventBusForTests() {
  starting = null;
}
