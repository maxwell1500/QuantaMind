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
        .plugin(tauri_plugin_shell::init())
        .manage(commands::prompt::RunState::default())
        .manage(commands::models_pull::PullState::default())
        .manage(commands::hf_install::HfInstallState::default())
        .manage(commands::compare::CompareRunState::default())
        .manage(commands::model_settings::ModelSettingsState::default())
        .manage(commands::ollama_start::OllamaStartState::default())
        .invoke_handler(tauri::generate_handler![
            commands::feasibility::check_install_feasibility,
            commands::feedback::submit_feedback,
            commands::gguf_cmd::inspect_gguf,
            commands::hardware::get_hardware_snapshot,
            commands::compare::run_compare,
            commands::compare::stop_compare,
            commands::compare_export::save_compare_report,
            commands::gguf_cmd::install_local_gguf,
            commands::hf_browse::hf_search,
            commands::hf_browse::hf_repo_files,
            commands::hf_install::install_hf_gguf,
            commands::hf_install::cancel_hf_install,
            commands::health::check_ollama_health,
            commands::model_settings::get_model_settings,
            commands::model_settings::set_model_temperature,
            commands::models::list_models,
            commands::models_pull::pull_model,
            commands::models_pull::cancel_pull,
            commands::ollama_start::start_ollama,
            commands::ollama_start::stop_ollama,
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
