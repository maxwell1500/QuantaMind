pub mod commands;
pub mod errors;
pub mod inference;
pub mod metrics;
pub mod persistence;
pub mod sync;
pub mod validation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::prompt::RunState::default())
        .manage(commands::models_pull::PullState::default())
        .invoke_handler(tauri::generate_handler![
            commands::health::check_ollama_health,
            commands::models::list_models,
            commands::models_pull::pull_model,
            commands::models_pull::cancel_pull,
            commands::prompt::run_prompt,
            commands::prompt::stop_prompt,
            commands::workspace::save_prompt,
            commands::workspace::load_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
