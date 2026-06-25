import { invoke } from "@tauri-apps/api/core";

/// OCR-tool IPC + the live-stream event names (mirroring `commands/ocr/ocr_cmd.rs`).
export const EVENT_OCR_TOKEN = "ocr-token";
export const EVENT_OCR_DONE = "ocr-done";
export const EVENT_OCR_CANNOT_PROCESS = "ocr-cannot-process";

export interface OcrTokenPayload {
  request_id: string;
  text: string;
}
export interface OcrRequestPayload {
  request_id: string;
  model: string;
}

/// Read a user-selected image/PDF (by path) → base64. File I/O happens in Rust.
export async function readFileBase64(sourcePath: string): Promise<string> {
  return invoke<string>("read_file_base64", { sourcePath });
}

/// Export the extracted text to a file (Rust write).
export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}

/// Stream a live OCR extraction of one base64 image. Resolves when the backend finishes (after
/// emitting `ocr-done`); `ocr-token` events stream during. `requestId` tags the page.
export async function runOcrLive(model: string, imageB64: string, requestId: string): Promise<void> {
  await invoke("run_ocr_live", { model, imageB64, requestId });
}

export async function stopOcr(): Promise<void> {
  await invoke("stop_ocr");
}
