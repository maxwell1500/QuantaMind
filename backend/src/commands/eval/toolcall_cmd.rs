use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::eval::toolcall::eval::{run_eval, ToolCallReport};
use crate::inference::eval::toolcall::tasks::tasks;
use crate::inference::mlx::server::mlx_endpoint::mlx_endpoint;

fn endpoint_for(backend: BackendKind) -> String {
    match backend {
        BackendKind::Mlx => mlx_endpoint(),
        _ => endpoint::default_for(backend).to_string(),
    }
}

/// Run the bundled tool-call reliability eval against a model on a backend and
/// return the report. The endpoint (MLX's dynamic port) is resolved here so the
/// frontend stays port-agnostic.
#[tauri::command]
pub async fn run_toolcall_eval(
    model: String,
    backend: Option<BackendKind>,
) -> Result<ToolCallReport, AppError> {
    let backend = backend.unwrap_or_default();
    run_eval(backend, &endpoint_for(backend), &model, &tasks()).await
}
