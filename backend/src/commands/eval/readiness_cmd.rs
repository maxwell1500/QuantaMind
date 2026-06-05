use crate::commands::models::model_inspect::fetch_dims;
use crate::commands::storage::storage::fetch_installed_with_stats;
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::eval::readiness::inputs::verdict_for;
use crate::inference::eval::readiness::profile::ReadinessProfile;
use crate::inference::eval::readiness::types::ModelVerdict;
use crate::inference::eval::readiness::vram_fit::{try_profile, Dims};
use crate::persistence::readiness::{profiles, reports};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Look up an installed model's on-disk weight size, tolerant of the `:latest`
/// tag mismatch between an eval target and the `/api/tags` listing.
fn weights_of(map: &HashMap<String, u64>, model: &str) -> Option<u64> {
    let base = model.strip_suffix(":latest").unwrap_or(model);
    map.get(model)
        .or_else(|| map.get(base))
        .or_else(|| map.get(&format!("{base}:latest")))
        .copied()
}

/// Editable readiness profiles live as flat JSON here (built-ins seeded on first list).
fn profiles_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("readiness"))
}

/// The last persisted batch report per collection (written by `run_batch_eval`).
fn reports_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("batch_reports"))
}

#[tauri::command]
pub fn list_readiness_profiles(app: AppHandle) -> Result<Vec<ReadinessProfile>, AppError> {
    profiles::list(&profiles_dir(&app)?)
}

#[tauri::command]
pub fn save_readiness_profile(app: AppHandle, profile: ReadinessProfile) -> Result<(), AppError> {
    profiles::save(&profiles_dir(&app)?, &profile)
}

#[tauri::command]
pub fn delete_readiness_profile(app: AppHandle, id: String) -> Result<(), AppError> {
    profiles::delete(&profiles_dir(&app)?, &id)
}

/// Assess the collection's last persisted batch report against a profile. Scoring
/// is `readiness::assess` — the one source of truth shared with the future CLI;
/// this command adds no scoring logic of its own. When `cap_bytes` is set it also
/// measures VRAM fit for each **Ollama** column (exact weights + real KV cache at
/// the run's `num_ctx` vs the cap); single-model backends and an absent cap leave
/// fit unmeasured (`memory = None`) — never a guessed fit. An empty vec means no
/// run has been persisted yet (the page shows an empty state).
#[tauri::command]
pub async fn assess_readiness(
    app: AppHandle,
    collection_id: String,
    profile_id: String,
    cap_bytes: Option<u64>,
) -> Result<Vec<ModelVerdict>, AppError> {
    let profile = profiles::load(&profiles_dir(&app)?, &profile_id)?;
    let report = match reports::load(&reports_dir(&app)?, &collection_id)? {
        Some(r) => r,
        None => return Ok(Vec::new()),
    };

    // Weights by model name (Ollama `/api/tags`). Best-effort: if Ollama is down,
    // the map is empty and fit stays unmeasured rather than failing the assess.
    let weights: HashMap<String, u64> = if cap_bytes.is_some() {
        fetch_installed_with_stats(endpoint::OLLAMA)
            .await
            .map(|v| v.into_iter().map(|m| (m.name, m.size_bytes)).collect())
            .unwrap_or_default()
    } else {
        HashMap::new()
    };

    let mut out = Vec::with_capacity(report.columns.len());
    for col in &report.columns {
        let memory = if cap_bytes.is_some() && col.backend == BackendKind::Ollama {
            let w = weights_of(&weights, &col.model);
            let dims = match w {
                Some(_) => fetch_dims(&col.model).await.map(|d| Dims {
                    layers: d.layers,
                    head_count: d.head_count,
                    head_count_kv: d.head_count_kv,
                    embedding_length: d.embedding_length,
                    context_length: d.context_length as u32,
                }),
                None => None,
            };
            try_profile(w, dims, report.num_ctx, cap_bytes)
        } else {
            None
        };
        let fits_in_vram = memory.as_ref().map(|m| m.fits);
        let vram_pressure = memory.as_ref().map(|m| m.pressure).unwrap_or(false);
        let verdict = verdict_for(col, fits_in_vram, vram_pressure, &profile);
        out.push(ModelVerdict { model: col.model.clone(), backend: col.backend, verdict, memory });
    }
    Ok(out)
}
