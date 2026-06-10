use crate::inference::mlx::server::mlx_locate::candidate_dirs;
use std::path::{Path, PathBuf};

const EXE: &str = "mlx_audio.server";

/// First candidate dir that contains `mlx_audio.server`. `exists` is injected so
/// the search is unit-testable without a real filesystem.
pub fn resolve_in(dirs: &[PathBuf], exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    dirs.iter().map(|d| d.join(EXE)).find(|p| exists(p))
}

/// Resolve `mlx_audio.server` (the mlx-audio STT engine): an explicit
/// `configured` full path wins (if it exists), else search PATH + common
/// venv/conda + Homebrew (reusing the mlx_lm locator's `candidate_dirs`).
/// `None` → mlx-audio not installed.
pub fn locate(configured: Option<&str>) -> Option<PathBuf> {
    if let Some(c) = configured.filter(|s| !s.is_empty()) {
        let p = PathBuf::from(c);
        if p.exists() {
            return Some(p);
        }
    }
    let home = std::env::var("HOME").ok();
    let path_env = std::env::var("PATH").ok();
    resolve_in(&candidate_dirs(home.as_deref(), path_env.as_deref()), |p| p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_in_picks_the_first_dir_that_has_mlx_audio_server() {
        let dirs = vec![PathBuf::from("/a"), PathBuf::from("/b")];
        let found = resolve_in(&dirs, |p| p == Path::new("/b/mlx_audio.server"));
        assert_eq!(found, Some(PathBuf::from("/b/mlx_audio.server")));
        assert!(resolve_in(&dirs, |_| false).is_none());
    }
}
