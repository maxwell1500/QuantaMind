//! Vision OCR eval (Slice 5) — a SEPARATE, decoupled eval family. The model extracts text from a
//! bundled image itself (not RAG), scored vs authored ground truth (CER/WER + a hallucination
//! verdict). Modality-gated (text-only / non-Ollama → CannotProcess, never a fabricated 0) and
//! OFF the leaderboard by construction: it produces a `VisionReport`, NEVER a `ModelVerdict`, so
//! the publish path (which only accepts `ModelVerdict`) can't pick it up. Mirrors the decoupled
//! structure of `inference/stt/eval/`.
pub mod ocr_score;
pub mod report;
pub mod run;
pub mod scenarios;
pub mod spec;
