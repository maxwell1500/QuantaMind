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
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::prompt::RunState::default())
        .manage(commands::models_pull::PullState::default())
        .invoke_handler(tauri::generate_handler![
            commands::feasibility::check_install_feasibility,
            commands::gguf_cmd::inspect_gguf,
            commands::gguf_cmd::install_local_gguf,
            commands::hf_install::install_hf_gguf,
            commands::health::check_ollama_health,
            commands::models::list_models,
            commands::models_pull::pull_model,
            commands::models_pull::cancel_pull,
            commands::settings::get_storage_path,
            commands::settings::validate_storage_path,
            commands::storage::get_installed_models_with_stats,
            commands::storage::remove_model,
            commands::storage::get_disk_usage,
            commands::prompt::run_prompt,
            commands::prompt::stop_prompt,
            commands::workspace::save_prompt,
            commands::workspace::load_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
