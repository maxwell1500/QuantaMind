use crate::errors::AppError;
use crate::inference::hf::hf_card::fetch_model_card;

const HF: &str = "https://huggingface.co";

/// The model card (README.md body, frontmatter stripped) for an HF repo, or
/// `None` when the repo has no card.
#[tauri::command]
pub async fn hf_model_card(repo: String) -> Result<Option<String>, AppError> {
    fetch_model_card(HF, &repo).await
}
