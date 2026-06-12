//! The resumable batch job queue: an append-only `.jsonl` log per run under
//! `app_config_dir/jobs/`. A leftover log means an interrupted run; on restart it
//! is loaded (with truncated-tail healing) and resumed from the next unit. A
//! concern sub-folder so `persistence/` stays within the folder-taxonomy budget.
pub mod queue;
