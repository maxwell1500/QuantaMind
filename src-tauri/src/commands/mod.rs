// Tauri command handlers. Populated per phase:
// - phase 1.5: models::list_models
// - phase 1.7: prompt::run_prompt
// - phase 1.10: prompt::stop_prompt
// - phase 1.14: workspace::{save_prompt, load_prompt}

pub mod models;
