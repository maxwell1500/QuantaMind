use super::*;

#[test]
fn retain_dest_targets_the_sanitized_name_in_the_folder() {
    let dest = retain_dest(Path::new("/g"), "meta/llama:8b", Path::new("/downloads/x.gguf"));
    assert_eq!(dest, Some(PathBuf::from("/g/meta_llama_8b.gguf")));
}

#[test]
fn retain_dest_skips_when_src_already_is_the_target() {
    let already = retain_dest(Path::new("/g"), "phi3", Path::new("/g/phi3.gguf"));
    assert_eq!(already, None);
}
