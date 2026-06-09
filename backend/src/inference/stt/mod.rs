// Speech-to-text (whisper.cpp) domain logic: model-format validation, the
// curated catalog, and the offline reachability seam. Pure/domain — holds no
// AppHandle and never imports `crate::commands` (see docs/architecture.md#layering).
pub mod stt_catalog;
pub mod stt_format;
