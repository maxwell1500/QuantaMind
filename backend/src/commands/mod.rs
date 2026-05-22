// Tauri command handlers. Populated per phase:
// - phase 1.5: models::list_models
// - phase 1.7: prompt::run_prompt
// - phase 1.10: prompt::stop_prompt
// - phase 1.14: workspace::{save_prompt, load_prompt}
// - phase 1.16: health::check_ollama_health
// - phase-1.5/1.5.1: prompt_handler::make_token_handler
// - phase-1.5/1.5.5: prompt_payloads (split out of prompt.rs)

pub mod health;
pub mod models;
pub mod prompt;
pub mod prompt_handler;
pub mod prompt_payloads;
pub mod workspace;
