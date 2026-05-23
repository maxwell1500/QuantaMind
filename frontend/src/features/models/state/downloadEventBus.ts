import { listen } from "@tauri-apps/api/event";
import {
  EVENT_HF_PROGRESS,
  HfPhaseSchema,
} from "../../../shared/ipc/hf_install";
import {
  EVENT_PULL_PROGRESS,
  PullProgressEventSchema,
} from "../../../shared/ipc/pull_events";
import { useModelStore } from "./modelStore";

let starting: Promise<void> | null = null;

function onHf(payload: unknown) {
  const p = HfPhaseSchema.safeParse(payload);
  if (!p.success) {
    console.error("invalid hf-progress payload", p.error.issues);
    return;
  }
  const { activeHfName, upsertDownload } = useModelStore.getState();
  if (!activeHfName) return;
  if (p.data.phase === "downloading") {
    const total = p.data.bytes_total;
    const done = p.data.bytes_completed;
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    upsertDownload({
      id: activeHfName, source: "huggingface", name: activeHfName,
      status: "downloading", percent, bytesCompleted: done, bytesTotal: total,
    });
    return;
  }
  upsertDownload({
    id: activeHfName, source: "huggingface", name: activeHfName,
    status: "installing", percent: 100,
  });
}

function onPull(payload: unknown) {
  const p = PullProgressEventSchema.safeParse(payload);
  if (!p.success) {
    console.error("invalid pull-progress payload", p.error.issues);
    return;
  }
  const { pullNames, upsertDownload } = useModelStore.getState();
  const name = pullNames[p.data.pull_id];
  if (!name) return;
  const prog = p.data.progress;
  const isSuccess = prog.phase === "success";
  const percent = prog.phase === "downloading" && prog.total > 0
    ? Math.min(100, Math.round((prog.completed / prog.total) * 100))
    : isSuccess ? 100 : 0;
  const bytesCompleted = prog.phase === "downloading" ? prog.completed : undefined;
  const bytesTotal = prog.phase === "downloading" ? prog.total : undefined;
  upsertDownload({
    id: name, source: "ollama", name,
    status: isSuccess ? "success" : "downloading",
    percent, bytesCompleted, bytesTotal,
    pullId: p.data.pull_id,
  });
}

export function startDownloadEventBus(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    await listen<unknown>(EVENT_HF_PROGRESS, (e) => onHf(e.payload));
    await listen<unknown>(EVENT_PULL_PROGRESS, (e) => onPull(e.payload));
  })();
  return starting;
}

export function __resetDownloadEventBusForTests() {
  starting = null;
}
