#![deny(clippy::unwrap_used)]
use crate::errors::AppError;
use crate::inference::hf::hf_browse::{repo_gguf_files, search_models, HfRepoFile, HfSearchHit};

const HF_ENDPOINT: &str = "https://huggingface.co";
const DEFAULT_LIMIT: u32 = 30;

#[tauri::command]
pub async fn hf_search(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<HfSearchHit>, AppError> {
    search_models(HF_ENDPOINT, &query, limit.unwrap_or(DEFAULT_LIMIT)).await
}

#[tauri::command]
pub async fn hf_repo_files(repo: String) -> Result<Vec<HfRepoFile>, AppError> {
    repo_gguf_files(HF_ENDPOINT, &repo).await
}
