use crate::commands::eval::toolcall_cmd::endpoint_for;
use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::model_turn::BackendTurn;
use crate::inference::eval::vision::report::VisionReport;
use crate::inference::eval::vision::run::{cannot_process, score_one};
use crate::inference::eval::vision::scenarios::{image_base64, vision_collection};
use crate::inference::ollama::ollama_show::probe_supports_vision;
use tokio_util::sync::CancellationToken;

/// Run the vision OCR eval for one model over a bundled collection. SEPARATE from the agentic batch:
/// produces a `VisionReport` (never a `ModelVerdict`), so it can't reach the leaderboard. Modality-
/// gated: a non-vision (or non-Ollama) model yields `CannotProcess` rows with NO model call — never
/// a fabricated 0. Vision is Ollama-only for now.
#[tauri::command]
pub async fn run_vision_eval(collection_id: String, model: String) -> Result<VisionReport, AppError> {
    let collection = vision_collection(&collection_id)
        .ok_or_else(|| AppError::NotFound(format!("vision collection '{collection_id}'")))?;
    let endpoint = endpoint_for(BackendKind::Ollama);
    let vision_ok = probe_supports_vision(&endpoint, &model).await;

    let mut rows = Vec::with_capacity(collection.tasks.len());
    for task in &collection.tasks {
        let image_b64 = image_base64(&task.image).unwrap_or_default();
        let row = if vision_ok {
            let turn = BackendTurn {
                backend: BackendKind::Ollama,
                endpoint: endpoint.clone(),
                model: model.clone(),
                cancel: CancellationToken::new(),
                options: None,
                keep_alive: None,
                is_thinking: false,
                max_tokens: 1024,
                stop_cache: Default::default(),
            };
            score_one(&turn, &model, task, image_b64).await?
        } else {
            cannot_process(&model, task, image_b64)
        };
        rows.push(row);
    }
    Ok(VisionReport { collection_id, model, rows })
}
