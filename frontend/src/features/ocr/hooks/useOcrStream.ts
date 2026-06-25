import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useOcrStore } from "../state/ocrStore";
import { EVENT_OCR_TOKEN, EVENT_OCR_CANNOT_PROCESS, type OcrTokenPayload, type OcrRequestPayload } from "../../../shared/ipc/ocr/ocr";

/// Wires the live OCR stream into the store: `ocr-token` chunks append to the matching page's text,
/// `ocr-cannot-process` flags the page (gated model). `ocr-done` needs no listener — the
/// `run_ocr_live` invoke resolves on completion, which `runSelected` awaits.
export function useOcrStream() {
  const appendToken = useOcrStore((s) => s.appendToken);
  const markCannotProcess = useOcrStore((s) => s.markCannotProcess);
  useEffect(() => {
    let live = true;
    const unlisten: Array<() => void> = [];
    const add = (u: () => void) => (live ? unlisten.push(u) : u());
    void listen<OcrTokenPayload>(EVENT_OCR_TOKEN, (e) => appendToken(e.payload.request_id, e.payload.text)).then(add);
    void listen<OcrRequestPayload>(EVENT_OCR_CANNOT_PROCESS, (e) => markCannotProcess(e.payload.request_id)).then(add);
    return () => {
      live = false;
      unlisten.forEach((u) => u());
    };
  }, [appendToken, markCannotProcess]);
}
