//! Simulated-filesystem environment (Phase 1). A deterministic, immutable file tree the agent
//! browses with `read_file` / `list_dir` / `search_files` / `grep`. Getters return REAL content
//! (or a deterministic not-found) — the fix for the world_state acks-empty bug, where
//! `read_file` used to ack `{"ok":true}` instead of the file. Built from a task's authored
//! `world_state`: a flat map of `path -> content`. Directories are implied by path prefixes.
//! Stateless-per-call (a pure function of the immutable tree + the call), so determinism is
//! structural and the visual replay can never disagree with the score.

use crate::inference::eval::agentic::env_view::{FsNode, FsOp, FsView};
use crate::inference::eval::toolcall::tasks::Call;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// The recognized filesystem getter tool names. A call to one of these performs the matching
/// read/list/search; any other recognized tool acks; an unrecognized tool is a decoy (None).
const READ: &str = "read_file";
const LIST: &str = "list_dir";
const SEARCH: &[&str] = &["search_files", "search_symbol", "grep"];

/// An immutable simulated filesystem: absolute-ish relative `path -> file content`.
#[derive(Clone, Debug, PartialEq)]
pub struct FsState {
    files: BTreeMap<String, String>,
}

impl FsState {
    /// Build from authored JSON, e.g.
    /// `{ "src/cart.py": "def add(): ...", "config.yaml": "timeout: 30" }`.
    /// Non-string values are stringified (so a task may author structured content) — but the
    /// canonical authoring form is a path→string map. Paths are normalized (`./` stripped,
    /// trailing `/` removed).
    pub fn from_world_state(ws: &Value) -> Self {
        let mut files = BTreeMap::new();
        if let Some(obj) = ws.as_object() {
            for (path, content) in obj {
                let body = match content {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                files.insert(normalize(path), body);
            }
        }
        Self { files }
    }

    /// Deterministic tool result for a call, or `None` for an unrecognized (decoy) tool so the
    /// runner injects its unknown-tool nudge. `recognized` is the task's real-tool whitelist
    /// (empty = legacy "every tool recognized").
    pub fn respond(&self, call: &Call, recognized: &HashSet<String>) -> Option<String> {
        let name = call.name.as_str();
        if name == READ {
            Some(self.read(&path_arg(call)))
        } else if name == LIST {
            Some(self.list(&path_arg(call)))
        } else if SEARCH.contains(&name) {
            Some(self.search(&query_arg(call)))
        } else if recognized.is_empty() || recognized.contains(name) {
            // A recognized non-getter (e.g. `reply`): generic ack, never the file content.
            Some(r#"{"ok":true}"#.to_string())
        } else {
            None
        }
    }

    /// The per-turn snapshot for the visual replay: the full (small) tree, the path the call
    /// touched, the op, and the returned content/matches. Picks the turn's LAST filesystem
    /// call (so a `read_file` batched before a `reply` still shows the read, not the reply).
    pub fn view(&self, calls: &[Call]) -> FsView {
        let tree = self.tree();
        let Some(call) = calls.iter().rev().find(|c| is_fs_op(&c.name)) else {
            return FsView { tree, focus_path: None, op: FsOp::None, content: None, matches: vec![] };
        };
        let name = call.name.as_str();
        if name == READ {
            let p = path_arg(call);
            FsView { tree, focus_path: Some(p.clone()), op: FsOp::Read, content: Some(self.read(&p)), matches: vec![] }
        } else if name == LIST {
            let p = path_arg(call);
            FsView { tree, focus_path: Some(p.clone()), op: FsOp::List, content: None, matches: self.list_entries(&p) }
        } else if SEARCH.contains(&name) {
            let q = query_arg(call);
            FsView { tree, focus_path: Some(q.clone()), op: FsOp::Search, content: None, matches: self.search_lines(&q) }
        } else {
            FsView { tree, focus_path: None, op: FsOp::None, content: None, matches: vec![] }
        }
    }

    // ---- getters (real content, deterministic) ----

    fn read(&self, path: &str) -> String {
        match self.files.get(path) {
            Some(content) => content.clone(),
            None => json!({ "error": "not found", "path": path }).to_string(),
        }
    }

    fn list(&self, dir: &str) -> String {
        serde_json::to_string(&self.list_entries(dir)).unwrap_or_else(|_| "[]".to_string())
    }

    fn search(&self, query: &str) -> String {
        serde_json::to_string(&self.search_lines(query)).unwrap_or_else(|_| "[]".to_string())
    }

    /// Immediate children (files + subdirs) directly under `dir`, as full relative paths so the
    /// model can `read_file` them next. Sorted, deduped.
    fn list_entries(&self, dir: &str) -> Vec<String> {
        let prefix = if dir.is_empty() { String::new() } else { format!("{dir}/") };
        let mut out = BTreeSet::new();
        for path in self.files.keys() {
            let Some(rest) = path.strip_prefix(&prefix) else { continue };
            if rest.is_empty() {
                continue;
            }
            // The immediate child segment; if there's a further `/`, it's a subdir.
            let child = rest.split('/').next().unwrap_or(rest);
            out.insert(format!("{prefix}{child}"));
        }
        out.into_iter().collect()
    }

    /// `path:line: text` for every line containing `query` (case-insensitive), sorted by path
    /// then line — a deterministic grep.
    fn search_lines(&self, query: &str) -> Vec<String> {
        let needle = query.to_lowercase();
        let mut out = Vec::new();
        for (path, content) in &self.files {
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    out.push(format!("{path}:{}: {}", i + 1, line.trim()));
                }
            }
        }
        out
    }

    /// Every node (files + implied ancestor dirs), sorted by path for a stable render.
    fn tree(&self) -> Vec<FsNode> {
        let mut nodes: BTreeMap<String, bool> = BTreeMap::new(); // path -> is_dir
        for path in self.files.keys() {
            nodes.insert(path.clone(), false);
            // every ancestor dir
            let mut acc = String::new();
            let segs: Vec<&str> = path.split('/').collect();
            for seg in &segs[..segs.len().saturating_sub(1)] {
                if !acc.is_empty() {
                    acc.push('/');
                }
                acc.push_str(seg);
                nodes.entry(acc.clone()).or_insert(true);
            }
        }
        nodes.into_iter().map(|(path, is_dir)| FsNode { path, is_dir }).collect()
    }
}

/// Is this tool name one of the filesystem getters (drives the replay's per-turn op)?
fn is_fs_op(name: &str) -> bool {
    name == READ || name == LIST || SEARCH.contains(&name)
}

/// Normalize an authored path: strip a leading `./`, strip a trailing `/`.
fn normalize(p: &str) -> String {
    p.strip_prefix("./").unwrap_or(p).trim_end_matches('/').to_string()
}

/// The `path` argument of a call (or the first string arg), normalized. `""` for the root.
fn path_arg(call: &Call) -> String {
    let raw = call
        .args
        .get("path")
        .and_then(Value::as_str)
        .or_else(|| call.args.as_object().and_then(|o| o.values().find_map(Value::as_str)))
        .unwrap_or("");
    let n = normalize(raw);
    if n == "." || n == "/" {
        String::new()
    } else {
        n
    }
}

/// The search query of a call: `query`/`pattern`/`q`, else the first string arg.
fn query_arg(call: &Call) -> String {
    call.args
        .get("query")
        .or_else(|| call.args.get("pattern"))
        .or_else(|| call.args.get("q"))
        .or_else(|| call.args.get("name"))
        .and_then(Value::as_str)
        .or_else(|| call.args.as_object().and_then(|o| o.values().find_map(Value::as_str)))
        .unwrap_or("")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::env_view::FsOp;
    use serde_json::json;

    fn fs() -> FsState {
        FsState::from_world_state(&json!({
            "src/cart.py": "def add(x):\n    return x + 1\n",
            "config.yaml": "timeout: 30\nretries: 2\n",
            "tests/test_cart.py": "def test_add():\n    assert add(1) == 2\n",
        }))
    }
    fn call(name: &str, args: Value) -> Call {
        Call { name: name.into(), args }
    }
    fn recognized() -> HashSet<String> {
        ["read_file", "list_dir", "search_files", "search_symbol", "grep", "reply"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn read_file_returns_real_content_not_an_empty_ack() {
        // THE acks-empty bug fix: read_file hands back the actual file, never {"ok":true}.
        let got = fs().respond(&call("read_file", json!({ "path": "config.yaml" })), &recognized());
        assert_eq!(got.as_deref(), Some("timeout: 30\nretries: 2\n"));
    }

    #[test]
    fn read_missing_file_is_a_deterministic_not_found_never_empty() {
        let got = fs().respond(&call("read_file", json!({ "path": "nope.txt" })), &recognized());
        assert_eq!(got.as_deref(), Some(r#"{"error":"not found","path":"nope.txt"}"#));
    }

    #[test]
    fn list_dir_returns_immediate_children_as_full_paths() {
        let got = fs().respond(&call("list_dir", json!({ "path": "src" })), &recognized());
        assert_eq!(got.as_deref(), Some(r#"["src/cart.py"]"#));
        // Root lists top-level files + dirs.
        let root = fs().respond(&call("list_dir", json!({ "path": "." })), &recognized());
        assert_eq!(root.as_deref(), Some(r#"["config.yaml","src","tests"]"#));
    }

    #[test]
    fn grep_returns_deterministic_path_line_matches() {
        let got = fs().respond(&call("grep", json!({ "query": "return" })), &recognized());
        assert_eq!(got.as_deref(), Some(r#"["src/cart.py:2: return x + 1"]"#));
    }

    #[test]
    fn search_symbol_uses_name_arg_and_returns_match_lines() {
        let got = fs().respond(&call("search_symbol", json!({ "name": "add" })), &recognized());
        assert_eq!(got.as_deref(), Some(r#"["src/cart.py:1: def add(x):","tests/test_cart.py:1: def test_add():","tests/test_cart.py:2: assert add(1) == 2"]"#));
    }

    #[test]
    fn recognized_non_getter_acks_and_decoy_returns_none() {
        assert_eq!(fs().respond(&call("reply", json!({ "text": "done" })), &recognized()).as_deref(), Some(r#"{"ok":true}"#));
        // write_file is not in the recognized whitelist → decoy → None (runner nudges).
        assert!(fs().respond(&call("write_file", json!({ "path": "x", "content": "y" })), &recognized()).is_none());
    }

    #[test]
    fn view_carries_tree_focus_op_and_content_for_the_replay() {
        let v = fs().view(&[call("read_file", json!({ "path": "config.yaml" }))]);
        assert_eq!(v.op, FsOp::Read);
        assert_eq!(v.focus_path.as_deref(), Some("config.yaml"));
        assert_eq!(v.content.as_deref(), Some("timeout: 30\nretries: 2\n"));
        // The tree includes files + implied dirs, sorted.
        let paths: Vec<&str> = v.tree.iter().map(|n| n.path.as_str()).collect();
        assert_eq!(paths, ["config.yaml", "src", "src/cart.py", "tests", "tests/test_cart.py"]);
        assert!(v.tree.iter().find(|n| n.path == "src").unwrap().is_dir);
        assert!(!v.tree.iter().find(|n| n.path == "config.yaml").unwrap().is_dir);
    }

    #[test]
    fn view_picks_the_fs_call_even_when_batched_before_a_reply() {
        // Regression (caught by the live smoke): a model that batches read_file THEN reply in
        // one turn must still replay the READ, not the trailing reply.
        let v = fs().view(&[
            call("read_file", json!({ "path": "config.yaml" })),
            call("reply", json!({ "text": "timeout is 30" })),
        ]);
        assert_eq!(v.op, FsOp::Read);
        assert_eq!(v.focus_path.as_deref(), Some("config.yaml"));
        assert_eq!(v.content.as_deref(), Some("timeout: 30\nretries: 2\n"));
    }

    #[test]
    fn view_with_no_fs_call_is_tree_only() {
        let v = fs().view(&[call("reply", json!({ "text": "hi" }))]);
        assert_eq!(v.op, FsOp::None);
        assert_eq!(v.focus_path, None);
        assert!(!v.tree.is_empty()); // tree still rendered
    }

    #[test]
    fn view_is_a_pure_function_identical_across_calls() {
        // Determinism: same state + calls → byte-identical view (the picture can't disagree
        // with the score across two runs).
        let c = [call("list_dir", json!({ "path": "tests" }))];
        assert_eq!(fs().view(&c), fs().view(&c));
    }
}
