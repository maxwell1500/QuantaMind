#![deny(clippy::unwrap_used)]
use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_request::{map_status, validate_repo};
use crate::inference::http::http::probe_client;
use serde::{Deserialize, Serialize};

/// Which backend a HuggingFace repo must be usable by. Selects the HF library
/// tag the search filters on: GGUF repos (Ollama / llama.cpp) vs MLX-native
/// safetensors repos (`mlx_lm.server`, mostly under `mlx-community`).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RepoKind {
    Gguf,
    Mlx,
}

impl RepoKind {
    fn tag(self) -> &'static str {
        match self {
            RepoKind::Gguf => "gguf",
            RepoKind::Mlx => "mlx",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfSearchHit {
    pub id: String,
    pub downloads: u64,
    pub likes: u64,
    pub tags: Vec<String>,
    pub last_modified: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfRepoFile {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Deserialize)]
struct RawHit {
    id: String,
    #[serde(default)] downloads: u64,
    #[serde(default)] likes: u64,
    #[serde(default)] tags: Vec<String>,
    #[serde(default, rename = "lastModified")] last_modified: Option<String>,
}

#[derive(Deserialize)]
struct RawTreeEntry {
    #[serde(rename = "type")] kind: String,
    path: String,
    #[serde(default)] size: u64,
}

pub async fn search_models(
    endpoint: &str,
    query: &str,
    limit: u32,
    kind: RepoKind,
) -> AppResult<Vec<HfSearchHit>> {
    if query.trim().is_empty() {
        return Err(AppError::Validation("search query is empty".into()));
    }
    let limit = limit.clamp(1, 100);
    let resp = probe_client()?
        .get(format!("{endpoint}/api/models"))
        .query(&[
            ("search", query.to_string()),
            // No server-side tag filter — HF's `filter=<tag>` index lags
            // real-world tag state and silently misses legitimate mirrors.
            // The post-filter below (`tags.contains(kind.tag())`) is the
            // single source of truth for the "must match this backend"
            // invariant.
            ("sort", "downloads".to_string()),
            ("direction", "-1".to_string()),
            ("limit", limit.to_string()),
        ])
        .send().await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_status(resp.status(), "hf search") { return Err(err); }
    let raw: Vec<RawHit> = resp.json().await
        .map_err(|e| AppError::Inference(format!("bad HF search body: {e}")))?;
    // Defense-in-depth: HF occasionally returns repos missing the tag
    // despite the filter (stale index). Drop any hit that doesn't carry
    // the backend's tag so the user only ever sees usable repos.
    let want = kind.tag();
    Ok(raw.into_iter()
        .filter(|h| h.tags.iter().any(|t| t.eq_ignore_ascii_case(want)))
        .map(|h| HfSearchHit {
            id: h.id, downloads: h.downloads, likes: h.likes,
            tags: h.tags, last_modified: h.last_modified,
        })
        .collect())
}

/// Lists `.gguf` files in the repo at `main`, with file sizes from the
/// HF tree endpoint. Non-file and non-`.gguf` entries are filtered out.
pub async fn repo_gguf_files(endpoint: &str, repo: &str) -> AppResult<Vec<HfRepoFile>> {
    validate_repo(repo)?;
    let resp = probe_client()?
        .get(format!("{endpoint}/api/models/{repo}/tree/main"))
        .query(&[("recursive", "true")])
        .send().await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_status(resp.status(), repo) { return Err(err); }
    let raw: Vec<RawTreeEntry> = resp.json().await
        .map_err(|e| AppError::Inference(format!("{repo}: bad HF tree body: {e}")))?;
    Ok(raw.into_iter()
        .filter(|e| e.kind == "file" && e.path.to_lowercase().ends_with(".gguf"))
        .map(|e| HfRepoFile { path: e.path, size_bytes: e.size })
        .collect())
}
