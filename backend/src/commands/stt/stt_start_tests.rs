use super::*;
use crate::commands::stt::stt_runtime::bin_name;

#[test]
fn has_bin_requires_the_binary_in_the_dir() {
    let dir = tempfile::tempdir().unwrap();
    assert!(has_bin(dir.path().to_path_buf()).is_none(), "empty dir resolves to None");
    std::fs::write(dir.path().join(bin_name()), b"x").unwrap();
    assert_eq!(has_bin(dir.path().to_path_buf()).as_deref(), Some(dir.path()));
}

#[test]
fn adopt_decision_truth_table() {
    // ours, alive, same model -> already ours
    assert_eq!(adopt_decision(true, true, true), Adopt::AlreadyOurs);
    // our live server on a *different* model -> proceed (switch), not a conflict
    assert_eq!(adopt_decision(true, false, true), Adopt::Proceed);
    // port answers but no live child of ours -> foreign, fatal conflict
    assert_eq!(adopt_decision(false, false, true), Adopt::Conflict);
    assert_eq!(adopt_decision(false, true, true), Adopt::Conflict);
    // nothing on the port -> proceed
    assert_eq!(adopt_decision(false, false, false), Adopt::Proceed);
}

#[test]
fn precheck_not_bundled_when_dir_missing() {
    let err = precheck_spawn(None, "/m/model.bin", "/m/vad.bin").unwrap_err();
    assert!(matches!(err, SttStartResult::NotBundled { .. }));
}

#[test]
fn precheck_model_missing_then_vad_missing_then_ok() {
    let dir = tempfile::tempdir().unwrap();
    let model = dir.path().join("ggml-tiny.en.bin");
    let vad = dir.path().join("ggml-silero-v6.2.0.bin");

    // model absent -> ModelMissing
    let err = precheck_spawn(Some(dir.path()), model.to_str().unwrap(), vad.to_str().unwrap())
        .unwrap_err();
    assert!(matches!(err, SttStartResult::ModelMissing { .. }));

    // model present, vad absent -> VadMissing (the silence metric gate)
    std::fs::write(&model, b"x").unwrap();
    let err = precheck_spawn(Some(dir.path()), model.to_str().unwrap(), vad.to_str().unwrap())
        .unwrap_err();
    assert!(matches!(err, SttStartResult::VadMissing { .. }), "VAD presence gates ready");

    // both present -> Ok(dir)
    std::fs::write(&vad, b"x").unwrap();
    let ok = precheck_spawn(Some(dir.path()), model.to_str().unwrap(), vad.to_str().unwrap());
    assert_eq!(ok.unwrap(), dir.path());
}

#[test]
fn port_conflict_note_names_the_port_and_refuses_adoption() {
    let note = port_conflict_note();
    assert!(note.contains("8093"));
    assert!(note.contains("didn't start"));
}
