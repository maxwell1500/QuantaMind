use crate::commands::prompt::prompt_options::{to_generate_options, validate_params};
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::persistence::prompts::schema::InferenceParams;
use crate::inference::eval::toolcall::eval::{run_eval_traced, trace_one, ToolCallReport, TraceResult};
use crate::inference::eval::toolcall::tasks::{
    builtin_collection, tasks, validate_tasks, ToolTask, BUILTIN_COLLECTIONS,
};
use crate::inference::mlx::server::mlx_endpoint::mlx_endpoint;
use crate::persistence::eval_trace_store;
use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

pub(crate) fn endpoint_for(backend: BackendKind) -> String {
    match backend {
        BackendKind::Mlx => mlx_endpoint(),
        _ => endpoint::default_for(backend).to_string(),
    }
}

/// Managed dir for per-collection per-task trace caches (mirrors the `history/`
/// dir). Shared with the matrix command so both runners cache to one place.
pub(crate) fn traces_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join("traces"))
}

/// The bundled curated suite, handed to the frontend so the runner is always
/// given a `Vec<ToolTask>` (built-in or custom) and never touches files.
#[tauri::command]
pub fn get_builtin_tasks() -> Vec<ToolTask> {
    tasks()
}

#[derive(Serialize)]
pub struct BuiltinCollectionInfo {
    pub id: String,
    pub label: String,
}

/// The read-only built-in presets (id + display label) for the dataset picker.
#[tauri::command]
pub fn list_builtin_collections() -> Vec<BuiltinCollectionInfo> {
    BUILTIN_COLLECTIONS
        .iter()
        .map(|(id, label)| BuiltinCollectionInfo { id: id.to_string(), label: label.to_string() })
        .collect()
}

/// Tasks for a built-in preset id (e.g. "curated" / "finance").
#[tauri::command]
pub fn get_builtin_collection(id: String) -> Result<Vec<ToolTask>, AppError> {
    builtin_collection(&id).ok_or_else(|| AppError::NotFound(format!("built-in collection '{id}'")))
}

/// Run a tool-call reliability eval over the given `tasks` (built-in or custom)
/// against a model on a backend and return the report. Tasks are validated here
/// too — a command can be invoked directly, so the trust boundary is enforced
/// regardless of source. The endpoint (MLX's dynamic port) is resolved here so
/// the frontend stays port-agnostic. Each task's full trace is cached under
/// `collection_id` (best-effort: a cache-write hiccup never fails the eval — the
/// visualizer falls back to a live run) so "View Trace" needs no re-run.
#[tauri::command]
pub async fn run_toolcall_eval(
    app: tauri::AppHandle,
    model: String,
    backend: Option<BackendKind>,
    collection_id: String,
    tasks: Vec<ToolTask>,
    params: Option<InferenceParams>,
) -> Result<ToolCallReport, AppError> {
    validate_tasks(&tasks)?;
    let backend = backend.unwrap_or_default();
    let options = match &params {
        Some(p) => { validate_params(p)?; Some(to_generate_options(p)) }
        None => None,
    };
    let (report, traces) = run_eval_traced(backend, &endpoint_for(backend), &model, &tasks, options).await?;
    // Empty id = a probe that doesn't need a drill-down (context-cliff, quant
    // sweep) — skip caching. Otherwise cache best-effort (a write hiccup never
    // fails the eval; the visualizer falls back to a live run).
    if !collection_id.is_empty() {
        if let Ok(dir) = traces_dir(&app) {
            let _ = eval_trace_store::upsert(&dir, &collection_id, &model, backend, &traces);
        }
    }
    Ok(report)
}

/// The cached trace for one `(collection, model, task)` from the last run, or
/// `None` if never run/saved — so the pipeline visualizer shows saved data
/// without re-running inference.
#[tauri::command]
pub fn load_toolcall_trace(
    app: tauri::AppHandle,
    collection_id: String,
    model: String,
    task_id: String,
) -> Result<Option<TraceResult>, AppError> {
    eval_trace_store::load_one(&traces_dir(&app)?, &collection_id, &model, &task_id)
}

/// Trace ONE task end-to-end for the pipeline visualizer: the exact system
/// message sent, the model's raw output, and the verdict — so the eval isn't a
/// black box. Same trust boundary (validates the task) and endpoint resolution.
#[tauri::command]
pub async fn trace_toolcall_task(
    model: String,
    backend: Option<BackendKind>,
    task: ToolTask,
) -> Result<TraceResult, AppError> {
    validate_tasks(std::slice::from_ref(&task))?;
    let backend = backend.unwrap_or_default();
    trace_one(backend, &endpoint_for(backend), &model, &task, None).await
}
