use crate::errors::AppError;
use crate::inference::hf::hf_card::{fetch_model_card, ModelCard};

const HF: &str = "https://huggingface.co";

/// The structured model card (license, base model, task, tags, description) for
/// an HF repo, or `None` when the repo has no card.
#[tauri::command]
pub async fn hf_model_card(repo: String) -> Result<Option<ModelCard>, AppError> {
    fetch_model_card(HF, &repo).await
}
