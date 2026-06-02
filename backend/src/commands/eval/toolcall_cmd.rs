use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::eval::toolcall::eval::{run_eval, ToolCallReport};
use crate::inference::eval::toolcall::tasks::{
    builtin_collection, tasks, validate_tasks, ToolTask, BUILTIN_COLLECTIONS,
};
use crate::inference::mlx::server::mlx_endpoint::mlx_endpoint;
use serde::Serialize;

fn endpoint_for(backend: BackendKind) -> String {
    match backend {
        BackendKind::Mlx => mlx_endpoint(),
        _ => endpoint::default_for(backend).to_string(),
    }
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
/// the frontend stays port-agnostic.
#[tauri::command]
pub async fn run_toolcall_eval(
    model: String,
    backend: Option<BackendKind>,
    tasks: Vec<ToolTask>,
) -> Result<ToolCallReport, AppError> {
    validate_tasks(&tasks)?;
    let backend = backend.unwrap_or_default();
    run_eval(backend, &endpoint_for(backend), &model, &tasks).await
}
