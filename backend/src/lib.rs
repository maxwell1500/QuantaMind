pub mod commands;
pub mod errors;
pub mod inference;
pub mod metrics;
pub mod persistence;
pub mod sync;
pub mod time_iso;
pub mod validation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(commands::prompt::RunState::default())
        .manage(commands::models_pull::PullState::default())
        .manage(commands::hf_install::HfInstallState::default())
        .manage(commands::compare::CompareRunState::default())
        .manage(commands::model_settings::ModelSettingsState::default())
        .manage(commands::ollama_start::OllamaStartState::default())
        .manage(commands::workspaces::WorkspaceState::default())
        .manage(commands::user_settings::UserSettingsState::default())
        .invoke_handler(tauri::generate_handler![
            commands::feasibility::check_install_feasibility,
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
            commands::workspaces::open_workspace,
            commands::workspaces::close_workspace,
            commands::workspaces::current_workspace,
            commands::workspaces::list_workspace_tree,
            commands::workspaces::recent_workspaces,
            commands::workspace_prompts::load_prompt,
            commands::workspace_prompts::save_prompt,
            commands::workspace_prompts::create_prompt,
            commands::workspace_prompts::rename_path,
            commands::workspace_prompts::delete_path,
            commands::history::history_append,
            commands::history::history_list,
            commands::history::history_get,
            commands::history::history_clear,
            commands::user_settings::get_user_settings,
            commands::user_settings::set_user_settings,
            commands::onboarding::scaffold_onboarding_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
