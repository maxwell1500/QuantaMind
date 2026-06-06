// Phase 8 publish canonical record (pure leaf — Tauri-free). Builds the exact,
// deterministic wire structure the closed backend validates: metrics-only rows,
// sorted-key canonical JSON, a SHA-256 integrity hash, and local pre-validation.
// The `cohort_key` derivation lives one layer up (commands/publish) because it
// needs `HardwareSnapshot`; this module stays a dependency leaf.
pub mod canonical;
pub mod row;
