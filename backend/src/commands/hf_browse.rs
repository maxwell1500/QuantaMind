#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use crate::inference::hf_browse::{search_models, HfSearchHit};

const HF_ENDPOINT: &str = "https://huggingface.co";
const DEFAULT_LIMIT: u32 = 30;

#[tauri::command]
pub async fn hf_search(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<HfSearchHit>, AppError> {
    search_models(HF_ENDPOINT, &query, limit.unwrap_or(DEFAULT_LIMIT)).await
}
