use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

const EXT_SUFFIX: &str = ".quantamind.yaml";
const HIDDEN_DIR: &str = ".quantamind";

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TreeNode {
    File { name: String, path: String },
    Folder { name: String, path: String, children: Vec<TreeNode> },
}

pub fn list(root: &Path) -> AppResult<Vec<TreeNode>> {
    if !root.exists() {
        return Err(AppError::NotFound(root.display().to_string()));
    }
    if !root.is_dir() {
        return Err(AppError::Validation(format!("not a directory: {}", root.display())));
    }
    walk(root)
}

fn walk(dir: &Path) -> AppResult<Vec<TreeNode>> {
    let mut out: Vec<TreeNode> = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| AppError::Io(e.to_string()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if path.is_dir() {
            if name == HIDDEN_DIR { continue; }
            let children = walk(&path)?;
            if children.is_empty() { continue; }
            out.push(TreeNode::Folder { name, path: path.display().to_string(), children });
        } else if name.ends_with(EXT_SUFFIX) {
            out.push(TreeNode::File { name, path: path.display().to_string() });
        }
    }
    out.sort_by(|a, b| key(a).cmp(&key(b)));
    Ok(out)
}

fn key(n: &TreeNode) -> (u8, String) {
    match n {
        TreeNode::Folder { name, .. } => (0, name.clone()),
        TreeNode::File { name, .. } => (1, name.clone()),
    }
}

#[cfg(test)]
#[path = "tree_tests.rs"]
mod tests;
