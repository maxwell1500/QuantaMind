// STT eval (P4): a dumb, decoupled scorer over **stored** transcripts. It reads a
// `Transcript` artifact + an `eval_spec`, joins by id, and does math — it never
// owns transcription (no sidecar, retries, or timeouts), so a sweep is reproducible
// and re-scorable in milliseconds. Pure/domain: no AppHandle, no `crate::commands`.
pub mod spec;
pub mod wer;
