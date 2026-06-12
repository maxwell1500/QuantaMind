use crate::errors::{AppError, AppResult};
use crate::persistence::model_settings::{
    load as load_map, save as save_map, ModelSettings, ModelSettingsMap,
};
use crate::sync::MutexExt;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub const SETTINGS_FILE: &str = "model_settings.yaml";
pub const DEFAULT_TEMPERATURE: f32 = 0.7;

#[derive(Default)]
pub struct ModelSettingsState {
    inner: Mutex<ModelSettingsMap>,
    loaded: Mutex<bool>,
}

fn settings_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join(SETTINGS_FILE))
}

impl ModelSettingsState {
    pub fn ensure_loaded(&self, app: &tauri::AppHandle) -> AppResult<()> {
        let mut loaded = self.loaded.lock_recover();
        if *loaded {
            return Ok(());
        }
        let map = load_map(&settings_path(app)?)?;
        *self.inner.lock_recover() = map;
        *loaded = true;
        Ok(())
    }

    pub fn temperature_for(&self, model: &str) -> f32 {
        self.inner
            .lock_recover()
            .get(model)
            .map(|s| s.temperature)
            .unwrap_or(DEFAULT_TEMPERATURE)
    }
}

pub fn validate_temperature(t: f32) -> AppResult<()> {
    if !t.is_finite() || !(0.0..=2.0).contains(&t) {
        return Err(AppError::Validation(format!(
            "temperature must be between 0.0 and 2.0, got {t}"
        )));
    }
    Ok(())
}

#[tauri::command]
pub fn get_model_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, ModelSettingsState>,
) -> Result<ModelSettingsMap, AppError> {
    state.ensure_loaded(&app)?;
    Ok(state.inner.lock_recover().clone())
}

#[tauri::command]
pub fn set_model_temperature(
    app: tauri::AppHandle,
    state: tauri::State<'_, ModelSettingsState>,
    model: String,
    temperature: f32,
) -> Result<(), AppError> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("model is empty".into()));
    }
    validate_temperature(temperature)?;
    state.ensure_loaded(&app)?;
    let snapshot = {
        let mut g = state.inner.lock_recover();
        g.insert(trimmed.to_string(), ModelSettings { temperature });
        g.clone()
    };
    save_map(&settings_path(&app)?, &snapshot)
}

#[cfg(test)]
#[path = "model_settings_tests.rs"]
mod tests;
