// Persistence for STT artifacts (the I/O leaf). The canonical Transcript JSON is
// the source of truth; text/SRT/VTT are derived exports (later), never this.
// The eval leaves (P4) store eval specs, streamed report rows, and readiness
// profiles — the dumb scorer reads stored transcripts and streams rows back here.
pub mod eval_readiness;
pub mod eval_reports;
pub mod eval_specs;
pub mod transcripts;
