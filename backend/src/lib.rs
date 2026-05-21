pub mod commands;
pub mod errors;
pub mod inference;
pub mod validation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::models::list_models,
            commands::prompt::run_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
