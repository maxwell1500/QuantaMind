// Tauri command handlers. Populated per phase:
// - phase 1.5: models::list_models
// - phase 1.7: prompt::run_prompt
// - phase 1.10: prompt::stop_prompt
// - phase 1.14: workspace::{save_prompt, load_prompt}
// - phase 1.16: health::check_ollama_health
// - phase-1.5/1.5.1: prompt_handler::make_token_handler
// - phase-1.5/1.5.5: prompt_payloads (split out of prompt.rs)

pub mod compare;
pub mod compare_export;
pub mod compare_payloads;
pub mod feasibility;
pub mod gguf_cmd;
pub mod hardware;
pub mod health;
pub mod history;
pub mod hf_browse;
pub mod hf_install;
pub mod model_settings;
pub mod models;
pub mod models_pull;
pub mod ollama_runtime;
pub mod ollama_start;
pub mod prompt;
pub mod prompt_handler;
pub mod prompt_options;
pub mod prompt_payloads;
pub mod prompt_run;
pub mod settings;
pub mod storage;
pub mod storage_disk;
pub mod storage_types;
pub mod user_settings;
pub mod verify_install;
pub mod workspace_prompts;
pub mod workspaces;
