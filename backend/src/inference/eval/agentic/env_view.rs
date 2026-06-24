use crate::inference::eval::agentic::sandbox::ResponderKind;
use crate::inference::eval::toolcall::tasks::Call;
use serde::{Deserialize, Serialize};

/// The per-turn environment snapshot for the visual replay — a PURE function of the
/// (immutable) responder and the turn's calls. Each environment picks its representative
/// action from the calls (the filesystem env uses the last read/list/search call, so a
/// `read_file` batched before a `reply` still shows the read). `EnvView::None` for
/// entity/static-mock tasks. The exhaustive match means adding a `ResponderKind` variant
/// forces a decision here.
pub fn env_view(responder: &ResponderKind, calls: &[Call]) -> EnvView {
    match responder {
        ResponderKind::StaticMocks | ResponderKind::WorldState(_) => EnvView::None,
        ResponderKind::FileSystem(fs) => EnvView::FileSystem(fs.view(calls)),
    }
}

/// A per-turn snapshot of the deterministic environment the agent acted on, streamed
/// alongside each [`crate::inference::eval::agentic::step::TrajectoryStep`] so the UI can
/// **visually replay** the run (file tree, later search results / web-UI state). It is a PURE
/// function of `(immutable env state, call)` — environments are stateless-per-call — so the
/// picture can never disagree with the score.
///
/// Internal / local-only: `EnvView` is the agent's run (= model output) and is **NEVER** added
/// to the publish allowlist (`persistence::publish`). The watchable replay is a local
/// experience; the leaderboard ships metrics only.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EnvView {
    /// No environment (entity/world_state and static-mock tasks) — the UI renders only the
    /// text trace, no replay panel.
    #[default]
    None,
    /// A simulated-filesystem turn (Phase 1).
    FileSystem(FsView),
}

/// What the simulated filesystem looked like and what the agent did to it this turn. The
/// `tree` is small for coding tasks, so slice 1 carries it per-turn for simplicity (a later
/// optimization can ship the static tree once and stream only the delta).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FsView {
    /// The (static) file tree, sorted by path for a stable render.
    pub tree: Vec<FsNode>,
    /// The path the agent touched this turn — highlighted in the panel. `None` if the turn's
    /// call didn't resolve to a path.
    pub focus_path: Option<String>,
    /// Which filesystem operation the agent performed this turn.
    pub op: FsOp,
    /// For a `read_file`: the returned file content (the real content — never an empty ack).
    pub content: Option<String>,
    /// For a `list_dir` / `search_files` / `grep`: the matched paths or lines.
    pub matches: Vec<String>,
}

/// One node in the rendered file tree.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FsNode {
    pub path: String,
    pub is_dir: bool,
}

/// The filesystem operation a turn performed (drives the panel's highlight + which detail
/// to show). `None` = a recognized call that didn't map to a filesystem op (e.g. `reply`).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum FsOp {
    #[default]
    None,
    Read,
    List,
    Search,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn none_serializes_as_tagged_object_matching_the_zod_schema() {
        // EnvView::None → {"kind":"none"} (internally tagged). The frontend Zod
        // discriminatedUnion("kind", …) expects exactly this.
        assert_eq!(serde_json::to_value(EnvView::None).unwrap(), json!({ "kind": "none" }));
    }

    #[test]
    fn filesystem_flattens_fsview_next_to_the_kind_tag() {
        // Internally-tagged newtype variant flattens FsView's fields beside "kind", which the
        // Zod file_system branch (tree/focus_path/op/content/matches) parses.
        let v = EnvView::FileSystem(FsView {
            tree: vec![FsNode { path: "config.yaml".into(), is_dir: false }],
            focus_path: Some("config.yaml".into()),
            op: FsOp::Read,
            content: Some("timeout: 30".into()),
            matches: vec![],
        });
        assert_eq!(
            serde_json::to_value(v).unwrap(),
            json!({
                "kind": "file_system",
                "tree": [{ "path": "config.yaml", "is_dir": false }],
                "focus_path": "config.yaml",
                "op": "read",
                "content": "timeout: 30",
                "matches": []
            })
        );
    }

    #[test]
    fn default_env_is_none() {
        assert_eq!(EnvView::default(), EnvView::None);
    }
}
