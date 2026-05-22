import type { PullProgress } from "../../../shared/ipc/pull_events";

export type InstallStatus =
  | "idle"
  | "pulling"
  | "success"
  | "error"
  | "cancelled";

export type InstallPhase =
  | "manifest"
  | "downloading"
  | "verifying"
  | "writing"
  | null;

export interface InstallProgress {
  bytesCompleted: number;
  bytesTotal: number;
  speedBps: number;
  percentComplete: number;
  etaSeconds: number;
}

export interface ModelInstallState {
  status: InstallStatus;
  phase: InstallPhase;
  progress?: InstallProgress;
  error?: string;
}

export const IDLE: ModelInstallState = { status: "idle", phase: null };
export const ETA_CAP_SECONDS = 99_999;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function deriveProgress(d: {
  total: number;
  completed: number;
  speed_bps: number;
}): InstallProgress {
  const percentComplete =
    d.total > 0 ? clamp((d.completed / d.total) * 100, 0, 100) : 0;
  const remaining = Math.max(0, d.total - d.completed);
  const etaSeconds =
    d.speed_bps > 0 ? Math.min(remaining / d.speed_bps, ETA_CAP_SECONDS) : 0;
  return {
    bytesCompleted: d.completed,
    bytesTotal: d.total,
    speedBps: d.speed_bps,
    percentComplete,
    etaSeconds,
  };
}

export function applyProgress(
  state: ModelInstallState,
  progress: PullProgress,
): ModelInstallState {
  switch (progress.phase) {
    case "pulling_manifest":
      return { ...state, status: "pulling", phase: "manifest" };
    case "downloading":
      return {
        ...state,
        status: "pulling",
        phase: "downloading",
        progress: deriveProgress(progress),
      };
    case "verifying":
      return { ...state, status: "pulling", phase: "verifying" };
    case "writing":
      return { ...state, status: "pulling", phase: "writing" };
    case "success":
      return { ...state, status: "success", phase: null };
  }
}
