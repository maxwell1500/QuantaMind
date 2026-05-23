import { listen } from "@tauri-apps/api/event";
import {
  EVENT_HF_PROGRESS,
  HfPhaseSchema,
} from "../../../shared/ipc/hf_install";
import {
  EVENT_LOCAL_INSTALL_PROGRESS,
  LocalInstallPhaseSchema,
} from "../../../shared/ipc/local_install";
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
  const base = { id: activeHfName, source: "huggingface" as const, name: activeHfName };
  if (p.data.phase === "downloading") {
    const total = p.data.bytes_total;
    const done = p.data.bytes_completed;
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    upsertDownload({ ...base, status: "downloading", percent, bytesCompleted: done, bytesTotal: total, phaseLabel: "Downloading" });
    return;
  }
  if (p.data.phase === "hashing" || p.data.phase === "uploading") {
    const { bytes_completed, bytes_total } = p.data;
    const percent = bytes_total > 0 ? Math.min(100, Math.round((bytes_completed / bytes_total) * 100)) : 0;
    const phaseLabel = p.data.phase === "hashing" ? "Hashing" : "Uploading to Ollama";
    upsertDownload({ ...base, status: "installing", percent, bytesCompleted: bytes_completed, bytesTotal: bytes_total, phaseLabel });
    return;
  }
  upsertDownload({ ...base, status: "installing", percent: 100, phaseLabel: "Creating model" });
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

function onLocal(payload: unknown) {
  const p = LocalInstallPhaseSchema.safeParse(payload);
  if (!p.success) {
    console.error("invalid local-install-progress payload", p.error.issues);
    return;
  }
  const { activeLocalName, upsertDownload } = useModelStore.getState();
  if (!activeLocalName) return;
  const base = { id: activeLocalName, source: "local" as const, name: activeLocalName };
  if (p.data.phase === "hashing" || p.data.phase === "uploading") {
    const { bytes_completed, bytes_total } = p.data;
    const percent = bytes_total > 0 ? Math.min(100, Math.round((bytes_completed / bytes_total) * 100)) : 0;
    const phaseLabel = p.data.phase === "hashing" ? "Hashing" : "Uploading to Ollama";
    upsertDownload({ ...base, status: "installing", percent, bytesCompleted: bytes_completed, bytesTotal: bytes_total, phaseLabel });
    return;
  }
  upsertDownload({ ...base, status: "installing", percent: 100, phaseLabel: "Creating model" });
}

export function startDownloadEventBus(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    await listen<unknown>(EVENT_HF_PROGRESS, (e) => onHf(e.payload));
    await listen<unknown>(EVENT_PULL_PROGRESS, (e) => onPull(e.payload));
    await listen<unknown>(EVENT_LOCAL_INSTALL_PROGRESS, (e) => onLocal(e.payload));
  })();
  return starting;
}

export function __resetDownloadEventBusForTests() {
  starting = null;
}
