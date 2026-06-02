use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_request::{map_status, validate_repo};
use crate::inference::http::http::probe_client;

/// Strip a leading YAML frontmatter block (`---` … `---`) from a README so only
/// the human-readable card body remains. Returns the input unchanged when there
/// is no frontmatter.
pub fn strip_frontmatter(md: &str) -> &str {
    let trimmed = md.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else { return md };
    match rest.find("\n---") {
        Some(end) => rest[end + 4..].trim_start_matches(['\r', '\n']),
        None => md,
    }
}

/// Fetch a repo's model card (its `README.md`). `Ok(None)` when the repo has no
/// card (404) — distinct from a real error.
pub async fn fetch_model_card(endpoint: &str, repo: &str) -> AppResult<Option<String>> {
    validate_repo(repo)?;
    let client = probe_client()?;
    let url = format!("{endpoint}/{repo}/raw/main/README.md");
    let resp = client.get(url).send().await.map_err(|e| AppError::Inference(e.to_string()))?;
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    if let Some(err) = map_status(resp.status(), repo) {
        return Err(err);
    }
    let body = resp.text().await.map_err(|e| AppError::Inference(e.to_string()))?;
    Ok(Some(strip_frontmatter(&body).to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_frontmatter_removes_a_leading_yaml_block() {
        let md = "---\nlicense: mit\ntags: [a, b]\n---\n# Title\n\nBody.";
        assert_eq!(strip_frontmatter(md), "# Title\n\nBody.");
    }

    #[test]
    fn strip_frontmatter_leaves_plain_markdown_untouched() {
        let md = "# Title\n\nNo frontmatter here.";
        assert_eq!(strip_frontmatter(md), md);
        // An unterminated block is left as-is rather than eating the whole doc.
        assert_eq!(strip_frontmatter("---\nlicense: mit\n# oops"), "---\nlicense: mit\n# oops");
    }
}
