use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_request::{map_status, validate_repo};
use crate::inference::http::http::probe_client;
use serde::Serialize;
use serde_yaml::Value;

/// A model card reduced to the fields worth showing in-app. The full README is
/// not rendered (real cards are arbitrary HTML); we extract structured data and
/// link out for the rest.
#[derive(Serialize, Default, Clone, Debug, PartialEq)]
pub struct ModelCard {
    pub description: String,
    pub license: Option<String>,
    pub base_model: Option<String>,
    pub pipeline_tag: Option<String>,
    pub tags: Vec<String>,
}

/// Split a README into (yaml-frontmatter, body). Empty frontmatter when absent.
pub fn split_frontmatter(md: &str) -> (&str, &str) {
    let trimmed = md.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else { return ("", md) };
    match rest.find("\n---") {
        Some(end) => (
            rest[..end].trim_start_matches(['\r', '\n']),
            rest[end + 4..].trim_start_matches(['\r', '\n']),
        ),
        None => ("", md),
    }
}

fn yaml_str(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

/// `base_model` is a string in some cards, a list in others — take the first.
fn yaml_first(v: &Value, key: &str) -> Option<String> {
    match v.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Sequence(seq)) => seq.iter().find_map(|x| x.as_str().map(str::to_string)),
        _ => None,
    }
}

fn yaml_list(v: &Value, key: &str) -> Vec<String> {
    match v.get(key) {
        Some(Value::Sequence(seq)) => seq.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
        Some(Value::String(s)) => vec![s.clone()],
        _ => Vec::new(),
    }
}

/// A prose line — not HTML / heading / table / list / image / code / comment.
fn is_prose(line: &str) -> bool {
    let t = line.trim_start();
    !t.is_empty() && !t.starts_with(['<', '#', '|', '>', '!', '-', '*', '`'])
}

/// The first ~3 prose paragraphs anywhere in the body, skipping HTML/tables/
/// headings — a readable description even for HTML-heavy cards.
pub fn extract_description(body: &str) -> String {
    let mut paras: Vec<String> = Vec::new();
    let mut cur: Vec<&str> = Vec::new();
    for line in body.lines() {
        if is_prose(line) {
            cur.push(line.trim());
        } else if !cur.is_empty() {
            paras.push(cur.join(" "));
            cur.clear();
            if paras.len() >= 3 {
                break;
            }
        }
    }
    if !cur.is_empty() && paras.len() < 3 {
        paras.push(cur.join(" "));
    }
    paras.join("\n\n")
}

/// Reduce a raw README into a `ModelCard`.
pub fn to_card(md: &str) -> ModelCard {
    let (fm_str, body) = split_frontmatter(md);
    let fm: Value = serde_yaml::from_str(fm_str).unwrap_or(Value::Null);
    ModelCard {
        description: extract_description(body),
        license: yaml_str(&fm, "license"),
        base_model: yaml_first(&fm, "base_model"),
        pipeline_tag: yaml_str(&fm, "pipeline_tag"),
        tags: yaml_list(&fm, "tags"),
    }
}

/// Fetch a repo's model card as structured data. `Ok(None)` when the repo has no
/// card (404).
pub async fn fetch_model_card(endpoint: &str, repo: &str) -> AppResult<Option<ModelCard>> {
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
    Ok(Some(to_card(&body)))
}

#[cfg(test)]
#[path = "hf_card_tests.rs"]
mod tests;
