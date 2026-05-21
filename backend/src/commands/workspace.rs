use crate::errors::{AppError, AppResult};
use crate::persistence::prompts::{
    load_prompt as p_load, save_prompt as p_save, StoredPrompt,
};
use std::path::PathBuf;

pub fn save_prompt_to_file(path: &str, model: &str, prompt: &str) -> AppResult<()> {
    let value = StoredPrompt {
        model: model.to_string(),
        prompt: prompt.to_string(),
    };
    p_save(&PathBuf::from(path), &value)
}

pub fn load_prompt_from_file(path: &str) -> AppResult<StoredPrompt> {
    p_load(&PathBuf::from(path))
}

#[tauri::command]
pub fn save_prompt(path: String, model: String, prompt: String) -> Result<(), AppError> {
    save_prompt_to_file(&path, &model, &prompt)
}

#[tauri::command]
pub fn load_prompt(path: String) -> Result<StoredPrompt, AppError> {
    load_prompt_from_file(&path)
}
