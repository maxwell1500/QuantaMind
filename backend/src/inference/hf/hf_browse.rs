#![deny(clippy::unwrap_used)]
use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_request::{map_status, validate_repo};
use crate::inference::http::http::probe_client;
use serde::{Deserialize, Serialize};

/// Which backend a HuggingFace repo is being browsed for. GGUF (Ollama /
/// llama.cpp) is unfiltered — every search hit is shown, and the repo's
/// `.gguf` files are picked on its detail page. MLX repos are safetensors with
/// no distinguishing file extension, so they're matched by the `mlx` library
/// tag to keep that mode useful.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RepoKind {
    Gguf,
    Mlx,
}

impl RepoKind {
    /// Whether this hit should appear in search. GGUF shows everything; MLX is
    /// narrowed to `mlx`-tagged repos.
    fn matches(self, hit: &RawHit) -> bool {
        match self {
            RepoKind::Gguf => true,
            RepoKind::Mlx => hit.tags.iter().any(|t| t.eq_ignore_ascii_case("mlx")),
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
            ("sort", "downloads".to_string()),
            ("direction", "-1".to_string()),
            ("limit", limit.to_string()),
        ])
        .send().await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_status(resp.status(), "hf search") { return Err(err); }
    let raw: Vec<RawHit> = resp.json().await
        .map_err(|e| AppError::Inference(format!("bad HF search body: {e}")))?;
    // GGUF is unfiltered (every hit shown); MLX is narrowed to `mlx`-tagged
    // repos. See RepoKind::matches.
    Ok(raw.into_iter()
        .filter(|h| kind.matches(h))
        .map(|h| HfSearchHit {
            id: h.id, downloads: h.downloads, likes: h.likes,
            tags: h.tags, last_modified: h.last_modified,
        })
        .collect())
}

/// Fetch the repo's recursive file tree at `main`.
async fn fetch_tree(endpoint: &str, repo: &str) -> AppResult<Vec<RawTreeEntry>> {
    validate_repo(repo)?;
    let resp = probe_client()?
        .get(format!("{endpoint}/api/models/{repo}/tree/main"))
        .query(&[("recursive", "true")])
        .send().await
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if let Some(err) = map_status(resp.status(), repo) { return Err(err); }
    resp.json().await
        .map_err(|e| AppError::Inference(format!("{repo}: bad HF tree body: {e}")))
}

/// Lists `.gguf` files in the repo at `main`, with file sizes from the
/// HF tree endpoint. Non-file and non-`.gguf` entries are filtered out.
pub async fn repo_gguf_files(endpoint: &str, repo: &str) -> AppResult<Vec<HfRepoFile>> {
    Ok(fetch_tree(endpoint, repo).await?
        .into_iter()
        .filter(|e| e.kind == "file" && e.path.to_lowercase().ends_with(".gguf"))
        .map(|e| HfRepoFile { path: e.path, size_bytes: e.size })
        .collect())
}

/// Files that contribute nothing to loading an MLX model — repo metadata, docs,
/// and licenses. Everything else (config.json, *.safetensors, tokenizer*, etc.)
/// is kept so `mlx_lm.server` can load the snapshot.
fn is_snapshot_junk(path: &str) -> bool {
    let lower = path.to_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    name == ".gitattributes"
        || name.ends_with(".md")
        || name.starts_with("license")
}

/// Lists every downloadable file in the repo (for a full snapshot), minus
/// repo/doc junk. Used to mirror an MLX repo to local disk.
pub async fn repo_all_files(endpoint: &str, repo: &str) -> AppResult<Vec<HfRepoFile>> {
    Ok(fetch_tree(endpoint, repo).await?
        .into_iter()
        .filter(|e| e.kind == "file" && !is_snapshot_junk(&e.path))
        .map(|e| HfRepoFile { path: e.path, size_bytes: e.size })
        .collect())
}
