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
        .manage(commands::prompt::prompt::RunState::default())
        .manage(commands::models::models_pull::PullState::default())
        .manage(commands::hf::hf_install::HfInstallState::default())
        .manage(commands::compare::compare::CompareRunState::default())
        .manage(commands::settings::model_settings::ModelSettingsState::default())
        .manage(commands::ollama::ollama_start::OllamaStartState::default())
        .manage(commands::llama::llama_server_types::LlamaServerState::default())
        .manage(commands::workspace::workspaces::WorkspaceState::default())
        .manage(commands::settings::user_settings::UserSettingsState::default())
        .invoke_handler(tauri::generate_handler![
            commands::system::feasibility::check_install_feasibility,
            commands::gguf::gguf_cmd::inspect_gguf,
            commands::system::hardware::get_hardware_snapshot,
            commands::compare::compare::run_compare,
            commands::compare::compare::stop_compare,
            commands::compare::compare_export::save_compare_report,
            commands::gguf::gguf_cmd::install_local_gguf,
            commands::hf::hf_browse::hf_search,
            commands::hf::hf_browse::hf_repo_files,
            commands::hf::hf_install::install_hf_gguf,
            commands::hf::hf_install::cancel_hf_install,
            commands::system::health::check_ollama_health,
            commands::settings::model_settings::get_model_settings,
            commands::settings::model_settings::set_model_temperature,
            commands::models::models::list_models,
            commands::models::models_pull::pull_model,
            commands::models::models_pull::cancel_pull,
            commands::ollama::ollama_start::start_ollama,
            commands::ollama::ollama_start::stop_ollama,
            commands::llama::llama_start::start_llama_server,
            commands::llama::llama_start::stop_llama_server,
            commands::settings::settings::get_storage_path,
            commands::settings::settings::validate_storage_path,
            commands::storage::storage::get_installed_models_with_stats,
            commands::storage::storage::remove_model,
            commands::storage::storage::get_disk_usage,
            commands::prompt::prompt::run_prompt,
            commands::prompt::prompt::stop_prompt,
            commands::workspace::workspaces::open_workspace,
            commands::workspace::workspaces::close_workspace,
            commands::workspace::workspaces::current_workspace,
            commands::workspace::workspaces::list_workspace_tree,
            commands::workspace::workspaces::recent_workspaces,
            commands::workspace::workspace_prompts::load_prompt,
            commands::workspace::workspace_prompts::save_prompt,
            commands::workspace::workspace_prompts::create_prompt,
            commands::workspace::workspace_prompts::rename_path,
            commands::workspace::workspace_prompts::delete_path,
            commands::workspace::history::history_append,
            commands::workspace::history::history_list,
            commands::workspace::history::history_get,
            commands::workspace::history::history_clear,
            commands::workspace::history::history_remove_by_path,
            commands::settings::user_settings::get_user_settings,
            commands::settings::user_settings::set_user_settings,
            commands::system::onboarding::scaffold_onboarding_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
