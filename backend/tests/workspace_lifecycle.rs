// End-to-end data-quality check for Step 2.4: a workspace folder holds
// many prompt files; the tree lists them; files round-trip through disk
// without losing fields. Exercises the persistence layer the Tauri
// commands delegate to.

use quantamind_lib::persistence::prompts::io;
use quantamind_lib::persistence::prompts::schema::{InferenceParams, PromptFile};
use quantamind_lib::persistence::prompts::tree::{list, TreeNode};
use tempfile::tempdir;

fn prompt(name: &str) -> PromptFile {
    PromptFile {
        name: name.into(),
        system: "You are helpful.".into(),
        user: format!("Prompt body for {name}"),
        model: Some("llama3.2:1b".into()),
        params: InferenceParams { temperature: Some(0.4), seed: Some(7), ..Default::default() },
        created_at: "2026-05-27T10:00:00Z".into(),
        updated_at: "2026-05-27T10:00:00Z".into(),
        auto_rerun: false,
    }
}

#[test]
fn full_workspace_lifecycle_preserves_data() {
    let ws = tempdir().unwrap();
    let root = ws.path();

    // Create two prompts, one nested in a subfolder.
    let top = root.join("summarize.quantamind.yaml");
    let nested = root.join("drafts/kickoff.quantamind.yaml");
    io::write(&top, &prompt("summarize")).unwrap();
    io::write(&nested, &prompt("kickoff")).unwrap();

    // The tree shows the folder (sorted first) then the top-level file.
    let tree = list(root).unwrap();
    assert_eq!(tree.len(), 2);
    assert!(matches!(tree[0], TreeNode::Folder { .. }));
    assert!(matches!(tree[1], TreeNode::File { .. }));

    // Reading back yields byte-identical structures.
    assert_eq!(io::read(&top).unwrap(), prompt("summarize"));
    assert_eq!(io::read(&nested).unwrap(), prompt("kickoff"));

    // Edit + re-save survives a round-trip.
    let mut edited = io::read(&top).unwrap();
    edited.user = "A wholly new prompt body.".into();
    edited.params.top_p = Some(0.95);
    io::write(&top, &edited).unwrap();
    let reloaded = io::read(&top).unwrap();
    assert_eq!(reloaded.user, "A wholly new prompt body.");
    assert_eq!(reloaded.params.top_p, Some(0.95));
    assert_eq!(reloaded.params.seed, Some(7));

    // Rename moves the file and the tree reflects it.
    let renamed = root.join("final.quantamind.yaml");
    io::rename(&top, &renamed).unwrap();
    assert!(!top.exists() && renamed.exists());

    // Delete removes it; the hidden .quantamind dir would be ignored.
    io::write(&root.join(".quantamind/history.yaml"), &prompt("ignored")).unwrap();
    io::delete(&renamed).unwrap();
    let after = list(root).unwrap();
    // Only the drafts folder remains visible.
    assert_eq!(after.len(), 1);
    assert!(matches!(after[0], TreeNode::Folder { .. }));
}

#[test]
fn yaml_on_disk_is_human_readable() {
    let ws = tempdir().unwrap();
    let p = ws.path().join("x.quantamind.yaml");
    io::write(&p, &prompt("x")).unwrap();
    let raw = std::fs::read_to_string(&p).unwrap();
    assert!(raw.contains("name: x"));
    assert!(raw.contains("system: You are helpful."));
    assert!(raw.contains("temperature: 0.4"));
    // Unset params are omitted, keeping the file small.
    assert!(!raw.contains("top_k"));
    assert!(!raw.contains("max_tokens"));
}
