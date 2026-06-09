// Speech-to-text (whisper.cpp) command handlers: model acquisition + sidecar
// lifecycle, a parallel capability to the text backends (see
// docs/architecture.md#architecture). STT engine selection is its own state
// axis, never derived from the selected LLM backend.
pub mod stt_disk;
pub mod stt_runtime;
pub mod stt_server_types;
pub mod stt_stderr;
