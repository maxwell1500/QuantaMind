use crate::commands::emit::log_emit;
use crate::commands::eval::toolcall_cmd::endpoint_for;
use crate::commands::models::model_inspect::fetch_dims;
use crate::commands::prompt::prompt_options::{to_generate_options, validate_params};
use crate::commands::storage::storage::fetch_installed_with_stats;
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::eval::agentic::model_turn::BackendTurn;
use crate::inference::eval::cliff::{build_ladder, run_cliff_with, single_turn_tasks, CliffPoint, CliffReport, CliffSource, DEFAULT_DEPTHS};
use crate::inference::eval::readiness::inputs::{agentic_metrics, pass_k_of, verdict_for};
use crate::inference::eval::readiness::recommend;
use crate::inference::eval::readiness::profile::ReadinessProfile;
use crate::inference::eval::readiness::types::{CliffStatus, ModelVerdict};
use crate::inference::eval::readiness::vram_fit::{try_profile, Dims};
use crate::inference::eval::toolcall::tasks::{validate_tasks, ToolTask};
use crate::inference::generate::generate_options::GenerateOptions;
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::readiness::{cliff, profiles, reports};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

/// Live per-rung progress for the context-cliff probe (the panel's progress bar).
pub const EVENT_CLIFF_PROGRESS: &str = "cliff-progress";

#[derive(Serialize, Clone)]
struct CliffProgress {
    model: String,
    done: usize,
    total: usize,
    /// The rung that just finished — carries its verified depth + composite so the
    /// chart grows live, not only at the final report.
    point: CliffPoint,
}

/// Context window headroom over the deepest rung: the system prompt (tool schemas),
/// the injected needle, and the output budget all sit on top of the padding, so the
/// window must exceed the requested token depth or the backend truncates the padding.
const CLIFF_CTX_HEADROOM: u32 = 2048;

/// Look up an installed model's metadata, tolerant of the `:latest` tag mismatch
/// between an eval target and the `/api/tags` listing. Used for both the real
/// weight size and the real quantization.
fn registry_get<'a, V>(map: &'a HashMap<String, V>, model: &str) -> Option<&'a V> {
    let base = model.strip_suffix(":latest").unwrap_or(model);
    map.get(model).or_else(|| map.get(base)).or_else(|| map.get(&format!("{base}:latest")))
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

/// Measured context-cliff depths per (collection, model) — written by the probe.
pub(crate) fn cliff_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("cliff"))
}

/// The probe writes one model's cliff outcome for a collection (atomic). `broken` ⇒
/// fails at the baseline; else `depth` `Some` ⇒ collapsed at that depth, `None` ⇒ no
/// cliff (held through `tested`). (NotProbed is never written — it's the absence of a
/// record.)
#[tauri::command]
pub fn save_cliff_result(
    app: AppHandle,
    collection_id: String,
    model: String,
    depth: Option<u32>,
    tested: u32,
    broken: bool,
) -> Result<(), AppError> {
    let status = if broken {
        CliffStatus::Broken { tested }
    } else {
        match depth {
            Some(d) => CliffStatus::Collapsed { depth: d },
            None => CliffStatus::NoCliff { tested },
        }
    };
    cliff::save(&cliff_dir(&app)?, &collection_id, &model, status)
}

/// The full per-model cliff status for a collection — the Matrix hydrates every state
/// (collapse depth, no-cliff, broken) from this so they survive a reload, not just
/// collapse depths.
#[tauri::command]
pub fn get_cliff_results(app: AppHandle, collection_id: String) -> Result<HashMap<String, CliffStatus>, AppError> {
    cliff::load(&cliff_dir(&app)?, &collection_id)
}

/// Run the context-cliff probe in the backend engine: pad the tasks to a ladder of
/// VERIFIED token depths (`0..=max_tokens`), sweep the needle across mid-document
/// positions, and report where tool-call accuracy collapses. Greedy (temp 0) so the
/// diagnostic reproduces; `num_ctx` is forced large enough that the deepest rung
/// isn't truncated. The classified outcome is persisted (verbatim model key) so the
/// Matrix/verdict can read it later; the full report (per-rung points) is returned
/// for the live chart. Tasks are validated here — the trust boundary holds even
/// when the command is invoked directly.
#[tauri::command]
pub async fn run_context_cliff(
    app: AppHandle,
    model: String,
    backend: Option<BackendKind>,
    collection_id: String,
    tasks: Vec<ToolTask>,
    source: CliffSource,
    max_tokens: u32,
    steps: u32,
    params: Option<InferenceParams>,
) -> Result<CliffReport, AppError> {
    validate_tasks(&tasks)?;
    // The cliff is single-turn: drop agentic tasks (their `expected` is a placeholder the
    // single-turn scorer would mis-read as a forced abstention) and refuse an all-agentic
    // collection outright, rather than fabricating a `Broken` 0% baseline.
    let tasks = single_turn_tasks(&tasks)?;
    let backend = backend.unwrap_or_default();

    // Start from the global header params, then force greedy (temp 0) and a context
    // window that fits the deepest rung plus the system/needle/output overhead.
    let mut options = match &params {
        Some(p) => {
            validate_params(p)?;
            to_generate_options(p)
        }
        None => GenerateOptions::default(),
    };
    options.temperature = Some(0.0);
    let needed_ctx = max_tokens.saturating_add(CLIFF_CTX_HEADROOM);
    if options.num_ctx.map_or(true, |c| c < needed_ctx) {
        options.num_ctx = Some(needed_ctx);
    }

    let turn = BackendTurn {
        backend,
        endpoint: endpoint_for(backend),
        model: model.clone(),
        cancel: CancellationToken::new(),
        options: Some(options),
        keep_alive: None,
    };

    let ladder = build_ladder(max_tokens, steps);
    let report = run_cliff_with(&turn, &model, &tasks, &source, &ladder, &DEFAULT_DEPTHS, &mut |done, total, point| {
        log_emit(&app, EVENT_CLIFF_PROGRESS, CliffProgress { model: model.clone(), done, total, point: point.clone() });
    })
    .await?;

    // Persist the classified outcome (NotProbed is the absence of a record).
    if !collection_id.is_empty() && report.status != CliffStatus::NotProbed {
        let _ = cliff::save(&cliff_dir(&app)?, &collection_id, &model, report.status.clone());
    }
    Ok(report)
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

    // Real model metadata by name (Ollama `/api/tags` + `/api/show`): the weight
    // size (for VRAM fit) and the real quantization (for the table — never guessed).
    // Best-effort: if Ollama is down the maps are empty and those fields stay N/A
    // rather than failing the assess.
    let installed = fetch_installed_with_stats(endpoint::OLLAMA).await.unwrap_or_default();
    let weights: HashMap<String, u64> = installed.iter().map(|m| (m.name.clone(), m.size_bytes)).collect();
    let quants: HashMap<String, String> =
        installed.iter().filter(|m| !m.quantization.is_empty()).map(|m| (m.name.clone(), m.quantization.clone())).collect();

    // Measured context-cliff depths for this collection (verbatim model keys). The
    // verdict only blocks on these when a profile opts in via `min_context_tokens`.
    let cliffs = cliff::load(&cliff_dir(&app)?, &collection_id).unwrap_or_default();

    let mut out = Vec::with_capacity(report.columns.len());
    for col in &report.columns {
        let memory = if cap_bytes.is_some() && col.backend == BackendKind::Ollama {
            let w = registry_get(&weights, &col.model).copied();
            let dims = match w {
                Some(_) => fetch_dims(&col.model).await.map(|d| Dims {
                    layers: d.layers,
                    head_count: d.head_count,
                    head_count_kv: d.head_count_kv,
                    embedding_length: d.embedding_length,
                    context_length: d.context_length as u32,
                    kv_estimated: d.kv_estimated,
                }),
                None => None,
            };
            try_profile(w, dims, report.num_ctx, cap_bytes)
        } else {
            None
        };
        let fits_in_vram = memory.as_ref().map(|m| m.fits);
        let vram_pressure = memory.as_ref().map(|m| m.pressure).unwrap_or(false);
        let cliff = registry_get(&cliffs, &col.model).copied().unwrap_or_default();
        let verdict = verdict_for(col, fits_in_vram, vram_pressure, cliff, &profile);
        let (avg_steps, effort) = agentic_metrics(col);
        out.push(ModelVerdict {
            model: col.model.clone(),
            backend: col.backend,
            verdict,
            memory,
            avg_steps,
            effort,
            pass_k: pass_k_of(col),
            quantization: registry_get(&quants, &col.model).cloned(),
            cliff,
        });
    }
    // Phase 7.3: rank best-first (Ready > Conditional > NotReady, ties by effort
    // then steps) so the page's recommendation banner + leaderboard are correct.
    recommend::rank(&mut out);
    Ok(out)
}
