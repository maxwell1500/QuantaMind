use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::eval::toolcall::eval::{run_eval, ToolCallReport};
use crate::inference::eval::toolcall::tasks::{tasks, validate_tasks, ToolTask};
use crate::inference::mlx::server::mlx_endpoint::mlx_endpoint;

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
