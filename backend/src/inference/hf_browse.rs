#![deny(clippy::unwrap_used)]
use crate::errors::{AppError, AppResult};
use crate::inference::http::probe_client;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfSearchHit {
    pub id: String,
    pub downloads: u64,
    pub likes: u64,
    pub tags: Vec<String>,
    pub last_modified: Option<String>,
}

#[derive(Deserialize)]
struct RawHit {
    id: String,
    #[serde(default)] downloads: u64,
    #[serde(default)] likes: u64,
    #[serde(default)] tags: Vec<String>,
    #[serde(default, rename = "lastModified")] last_modified: Option<String>,
}

pub(crate) fn map_hf_status(s: StatusCode, ctx: &str) -> Option<AppError> {
    match s.as_u16() {
        200..=299 => None,
        401 | 403 => Some(AppError::AuthRequired(format!("{ctx}: HF auth required"))),
        429 => Some(AppError::Inference(format!("{ctx}: HF rate limited (HTTP 429)"))),
        _ => Some(AppError::Inference(format!("{ctx}: HF HTTP {s}"))),
    }
}

pub async fn search_models(
    endpoint: &str,
    query: &str,
    limit: u32,
) -> AppResult<Vec<HfSearchHit>> {
    if query.trim().is_empty() {
        return Err(AppError::Validation("search query is empty".into()));
    }
    let limit = limit.clamp(1, 100);
    let client = probe_client()?;
    let resp = client
        .get(format!("{endpoint}/api/models"))
        .query(&[
            ("search", query.to_string()),
            ("library", "gguf".to_string()),
            ("sort", "downloads".to_string()),
            ("direction", "-1".to_string()),
            ("limit", limit.to_string()),
        ])
        .send()
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_hf_status(resp.status(), "hf search") {
        return Err(err);
    }
    let raw: Vec<RawHit> = resp
        .json()
        .await
        .map_err(|e| AppError::Inference(format!("bad HF search body: {e}")))?;
    Ok(raw
        .into_iter()
        .map(|h| HfSearchHit {
            id: h.id,
            downloads: h.downloads,
            likes: h.likes,
            tags: h.tags,
            last_modified: h.last_modified,
        })
        .collect())
}
