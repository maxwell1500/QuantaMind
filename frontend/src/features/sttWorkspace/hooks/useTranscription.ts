import { useCallback, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  transcribeAudio,
  EVENT_STT_SEGMENTS,
  EVENT_STT_TRANSCRIBE_PROGRESS,
  SegmentsPayloadSchema,
  ProgressPayloadSchema,
} from "../../../shared/ipc/stt/transcribe";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useTranscriptStore } from "../state/transcriptStore";
import { useSttResultStore } from "../../sttInspector/state/sttResultStore";
import { useAssistantResultStore } from "../../sttInspector/state/assistantResultStore";

/// Subscribe to live segment/progress events (unregistered on unmount — no
/// stacked listeners across enter/leave of STT mode) and drive a transcription.
/// Segments fill the pane live; on completion the returned canonical Transcript
/// replaces them so the view equals what's persisted.
export function useTranscription() {
  const append = useTranscriptStore((s) => s.appendSegments);
  const setProgress = useTranscriptStore((s) => s.setProgress);

  useEffect(() => {
    const unlisten: UnlistenFn[] = [];
    let cancelled = false;
    void (async () => {
      const subs = await Promise.all([
        listen(EVENT_STT_SEGMENTS, (e) => {
          const p = SegmentsPayloadSchema.safeParse(e.payload);
          if (p.success) append(p.data.segments);
        }),
        listen(EVENT_STT_TRANSCRIBE_PROGRESS, (e) => {
          const p = ProgressPayloadSchema.safeParse(e.payload);
          if (p.success) setProgress(p.data.processed_secs, p.data.total_secs);
        }),
      ]);
      if (cancelled) {
        subs.forEach((u) => u());
        return;
      }
      unlisten.push(...subs);
    })();
    return () => {
      cancelled = true;
      unlisten.forEach((u) => u());
    };
  }, [append, setProgress]);

  const run = useCallback(async (path: string) => {
    const store = useTranscriptStore.getState();
    const id = `clip-${Date.now()}`;
    store.reset();
    store.setCurrentId(id);
    store.setStatus("transcribing");
    // Drop any prior LLM summary so its metrics never linger over a new clip.
    useAssistantResultStore.getState().clear();
    try {
      const transcript = await transcribeAudio(path, id);
      // Reconcile the live view with the persisted truth (deduped, canonical).
      useTranscriptStore.getState().loadFrom(transcript);
      // Durable copy for the Analysis/Inspector STT sections (survives tab nav).
      useSttResultStore.getState().setResult(transcript);
    } catch (e) {
      useTranscriptStore.getState().setError(formatIpcError(e));
    }
  }, []);

  return { run };
}
