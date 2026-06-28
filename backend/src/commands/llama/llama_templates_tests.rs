use super::*;
use std::fs;

fn touch(dir: &Path, name: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join(name), "{{ messages }}").unwrap();
}

#[test]
fn model_stem_strips_dir_and_gguf_extension() {
    assert_eq!(model_stem("/g/gemma-4-12b-it-qat_q4_0.gguf"), "gemma-4-12b-it-qat_q4_0");
    assert_eq!(model_stem("phi3.gguf"), "phi3");
}

#[test]
fn resolve_prefers_model_name_over_arch() {
    let tmp = std::env::temp_dir().join("qm_ct_modelwin");
    let _ = fs::remove_dir_all(&tmp);
    touch(&tmp, "mymodel.gguf-stem.jinja");
    touch(&tmp, "gemma.jinja");
    let got = resolve_in_dirs(&[tmp.clone()], "mymodel.gguf-stem", "gemma").unwrap();
    assert_eq!(got, tmp.join("mymodel.gguf-stem.jinja"));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn resolve_falls_back_to_arch_then_none() {
    let tmp = std::env::temp_dir().join("qm_ct_archfb");
    let _ = fs::remove_dir_all(&tmp);
    touch(&tmp, "gemma.jinja");
    // model-name miss → arch hit
    assert_eq!(resolve_in_dirs(&[tmp.clone()], "some-model", "gemma").unwrap(), tmp.join("gemma.jinja"));
    // neither present → None (spawn uses the embedded template via --jinja)
    assert!(resolve_in_dirs(&[tmp.clone()], "some-model", "llama").is_none());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn user_dir_overrides_bundled_for_resolution_and_listing() {
    let user = std::env::temp_dir().join("qm_ct_user");
    let bundled = std::env::temp_dir().join("qm_ct_bundled");
    let _ = fs::remove_dir_all(&user);
    let _ = fs::remove_dir_all(&bundled);
    touch(&user, "gemma.jinja");
    touch(&bundled, "gemma.jinja");
    touch(&bundled, "llama.jinja");

    // Resolution: user dir (first) wins for gemma.
    let got = resolve_in_dirs(&[user.clone(), bundled.clone()], "x", "gemma").unwrap();
    assert_eq!(got, user.join("gemma.jinja"));

    // Listing: gemma reported once as User; llama as Bundled.
    let list = list_in_layers(&[
        (Some(user.clone()), TemplateSource::User),
        (Some(bundled.clone()), TemplateSource::Bundled),
    ]);
    let gemma = list.iter().find(|t| t.name == "gemma").unwrap();
    assert_eq!(gemma.source, TemplateSource::User);
    let llama = list.iter().find(|t| t.name == "llama").unwrap();
    assert_eq!(llama.source, TemplateSource::Bundled);
    assert_eq!(list.len(), 2, "gemma de-duped across layers");
    let _ = fs::remove_dir_all(&user);
    let _ = fs::remove_dir_all(&bundled);
}
