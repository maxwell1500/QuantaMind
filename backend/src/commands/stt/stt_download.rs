use crate::commands::emit::log_emit;
use crate::commands::stt::stt_disk::{reconcile_stt_dir, staging_dir, stt_dir, vad_dest, whisper_dest};
use crate::errors::{AppError, AppResult};
use crate::inference::hf::hf_download::{download_file, DownloadProgress};
use crate::inference::stt::stt_catalog::{find, SttCatalogEntry, VAD_FILE, VAD_REPO};
use crate::inference::stt::stt_format::{validate_stt_model, SttModelKind};
use crate::sync::MutexExt;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

const HF_ENDPOINT: &str = "https://huggingface.co";
pub const EVENT_STT_PROGRESS: &str = "stt-install-progress";

/// Single-in-flight guard + cancel channel for STT installs (mirrors
/// `HfInstallState`). The download is the *only* networked action in the STT
/// layer.
#[derive(Default)]
pub struct SttInstallState {
    current: Mutex<Option<CancellationToken>>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum SttInstallProgress {
    Downloading { file: String, bytes_completed: u64, bytes_total: u64, speed_bps: u64 },
    Done,
}

#[derive(Debug, PartialEq)]
pub enum SttInstallOutcome {
    Installed,
    AlreadyInstalled,
    Cancelled,
}

fn wipe(staging: &Path) {
    let _ = fs::remove_dir_all(staging);
    // Prune the now-empty `.staging` root too (succeeds only if empty; the
    // single-in-flight guard means no other install is using it).
    if let Some(root) = staging.parent() {
        let _ = fs::remove_dir(root);
    }
}

/// Validate every staged file, then atomically promote them all (rename into
/// place). If any fails validation, wipe the staging dir and return the error —
/// the R3 all-or-nothing rule: a half-validated pair never lands canonical.
fn promote_or_wipe(staging: &Path, files: &[(PathBuf, PathBuf, SttModelKind)]) -> AppResult<()> {
    for (staged, _canon, kind) in files {
        if let Err(e) = validate_stt_model(staged, *kind) {
            wipe(staging);
            return Err(e);
        }
    }
    for (staged, canon, _) in files {
        fs::rename(staged, canon).map_err(|e| AppError::Io(e.to_string()))?;
    }
    wipe(staging);
    Ok(())
}

/// Download one file into `staged`. Ok(true) = complete, Ok(false) = cancelled
/// mid-stream (download_file leaves only the `.partial`, never the final name).
async fn download_one(
    endpoint: &str,
    repo: &str,
    filename: &str,
    staged: &Path,
    on_progress: &impl Fn(SttInstallProgress),
    cancel: &CancellationToken,
) -> AppResult<bool> {
    let f = filename.to_string();
    let prog = |p: DownloadProgress| {
        on_progress(SttInstallProgress::Downloading {
            file: f.clone(),
            bytes_completed: p.bytes_completed,
            bytes_total: p.bytes_total,
            speed_bps: p.speed_bps,
        })
    };
    download_file(endpoint, repo, filename, staged, prog, cancel.clone()).await?;
    Ok(!cancel.is_cancelled())
}

/// Download a whisper model + the shared silero VAD as one atomic install into
/// `dir`: stage, validate, promote-both-or-none, wipe on any failure or cancel.
/// Idempotent — skips files already canonical and valid.
pub async fn install_to_dir(
    endpoint: &str,
    dir: &Path,
    entry: &SttCatalogEntry,
    on_progress: impl Fn(SttInstallProgress),
    cancel: CancellationToken,
) -> AppResult<SttInstallOutcome> {
    fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    reconcile_stt_dir(dir).map_err(|e| AppError::Io(e.to_string()))?;

    let whisper_canon = whisper_dest(dir, entry.id);
    let vad_canon = vad_dest(dir, VAD_FILE);
    let whisper_ok =
        whisper_canon.exists() && validate_stt_model(&whisper_canon, SttModelKind::Whisper).is_ok();
    let vad_ok = vad_canon.exists() && validate_stt_model(&vad_canon, SttModelKind::Vad).is_ok();
    if whisper_ok && vad_ok {
        return Ok(SttInstallOutcome::AlreadyInstalled);
    }

    let staging = staging_dir(dir, entry.id);
    wipe(&staging);
    fs::create_dir_all(&staging).map_err(|e| AppError::Io(e.to_string()))?;

    let mut to_promote: Vec<(PathBuf, PathBuf, SttModelKind)> = Vec::new();
    if !whisper_ok {
        let staged = staging.join(entry.whisper_file);
        match download_one(endpoint, entry.whisper_repo, entry.whisper_file, &staged, &on_progress, &cancel).await {
            Ok(true) => to_promote.push((staged, whisper_canon, SttModelKind::Whisper)),
            Ok(false) => {
                wipe(&staging);
                return Ok(SttInstallOutcome::Cancelled);
            }
            Err(e) => {
                wipe(&staging);
                return Err(e);
            }
        }
    }
    if !vad_ok {
        let staged = staging.join(VAD_FILE);
        match download_one(endpoint, VAD_REPO, VAD_FILE, &staged, &on_progress, &cancel).await {
            Ok(true) => to_promote.push((staged, vad_canon, SttModelKind::Vad)),
            Ok(false) => {
                wipe(&staging);
                return Ok(SttInstallOutcome::Cancelled);
            }
            Err(e) => {
                wipe(&staging);
                return Err(e);
            }
        }
    }

    promote_or_wipe(&staging, &to_promote)?;
    on_progress(SttInstallProgress::Done);
    Ok(SttInstallOutcome::Installed)
}

#[tauri::command]
pub async fn download_stt_model(
    app: AppHandle,
    state: tauri::State<'_, SttInstallState>,
    id: String,
) -> Result<(), AppError> {
    let entry = find(&id).ok_or_else(|| AppError::Validation(format!("unknown STT model id: {id}")))?;
    let token = CancellationToken::new();
    {
        let mut g = state.current.lock_recover();
        if g.is_some() {
            return Err(AppError::Validation("another STT install is already in progress".into()));
        }
        *g = Some(token.clone());
    }
    let dir = stt_dir();
    let ev_app = app.clone();
    let on_progress = move |p: SttInstallProgress| log_emit(&ev_app, EVENT_STT_PROGRESS, p);
    let result = install_to_dir(HF_ENDPOINT, &dir, entry, on_progress, token).await;
    *state.current.lock_recover() = None;
    result.map(|_| ())
}

#[tauri::command]
pub fn cancel_stt_install(state: tauri::State<'_, SttInstallState>) -> Result<(), AppError> {
    if let Some(token) = state.current.lock_recover().take() {
        token.cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::stt_catalog::find;
    use mockito::Server;

    const GGML: [u8; 4] = [0x6c, 0x6d, 0x67, 0x67];

    fn ggml_body(total: usize) -> Vec<u8> {
        let mut b = GGML.to_vec();
        b.resize(total, 0);
        b
    }

    /// Mock HEAD (content-length) + GET (body) for one repo file at the URL
    /// `download_file` builds: `/{repo}/resolve/main/{filename}`.
    fn mock_file(srv: &mut mockito::ServerGuard, repo: &str, filename: &str, body: &[u8]) {
        let path = format!("/{repo}/resolve/main/{filename}");
        srv.mock("HEAD", path.as_str())
            .with_status(200)
            .with_header("content-length", &body.len().to_string())
            .create();
        srv.mock("GET", path.as_str()).with_status(200).with_body(body).create();
    }

    fn entry() -> &'static SttCatalogEntry {
        find("tiny.en").unwrap()
    }

    #[test]
    fn promote_all_when_valid_then_staging_is_gone() {
        let dir = tempfile::tempdir().unwrap();
        let staging = dir.path().join(".staging/tiny.en");
        fs::create_dir_all(&staging).unwrap();
        let sw = staging.join("ggml-tiny.en.bin");
        let sv = staging.join(VAD_FILE);
        fs::write(&sw, ggml_body(1024 * 1024 + 16)).unwrap();
        fs::write(&sv, ggml_body(300 * 1024)).unwrap();
        let cw = dir.path().join("ggml-tiny.en.bin");
        let cv = dir.path().join(VAD_FILE);

        promote_or_wipe(
            &staging,
            &[(sw, cw.clone(), SttModelKind::Whisper), (sv, cv.clone(), SttModelKind::Vad)],
        )
        .unwrap();
        assert!(cw.exists() && cv.exists(), "both promoted");
        assert!(!staging.exists(), "staging cleaned");
    }

    #[test]
    fn promote_wipes_and_errors_when_one_is_invalid_leaving_nothing_canonical() {
        let dir = tempfile::tempdir().unwrap();
        let staging = dir.path().join(".staging/tiny.en");
        fs::create_dir_all(&staging).unwrap();
        let sw = staging.join("ggml-tiny.en.bin");
        let sv = staging.join(VAD_FILE);
        fs::write(&sw, ggml_body(1024 * 1024 + 16)).unwrap(); // valid
        fs::write(&sv, ggml_body(1024)).unwrap(); // too small -> invalid VAD
        let cw = dir.path().join("ggml-tiny.en.bin");
        let cv = dir.path().join(VAD_FILE);

        let err = promote_or_wipe(
            &staging,
            &[(sw, cw.clone(), SttModelKind::Whisper), (sv, cv.clone(), SttModelKind::Vad)],
        )
        .unwrap_err();
        assert!(format!("{err:?}").contains("too small"));
        assert!(!cw.exists() && !cv.exists(), "nothing promoted on a failed pair");
        assert!(!staging.exists(), "staging wiped");
    }

    #[tokio::test]
    async fn install_downloads_both_and_promotes_them() {
        let mut srv = Server::new_async().await;
        let e = entry();
        mock_file(&mut srv, e.whisper_repo, e.whisper_file, &ggml_body(1024 * 1024 + 16));
        mock_file(&mut srv, VAD_REPO, VAD_FILE, &ggml_body(300 * 1024));
        let dir = tempfile::tempdir().unwrap();

        let out = install_to_dir(&srv.url(), dir.path(), e, |_| {}, CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(out, SttInstallOutcome::Installed);
        assert!(dir.path().join("ggml-tiny.en.bin").exists());
        assert!(dir.path().join(VAD_FILE).exists());
        assert!(!dir.path().join(".staging").exists(), "staging cleaned");
    }

    #[tokio::test]
    async fn a_bad_second_file_leaves_no_canonical_files() {
        let mut srv = Server::new_async().await;
        let e = entry();
        mock_file(&mut srv, e.whisper_repo, e.whisper_file, &ggml_body(1024 * 1024 + 16)); // ok
        mock_file(&mut srv, VAD_REPO, VAD_FILE, &ggml_body(1024)); // truncated VAD
        let dir = tempfile::tempdir().unwrap();

        let err = install_to_dir(&srv.url(), dir.path(), e, |_| {}, CancellationToken::new())
            .await
            .unwrap_err();
        assert!(format!("{err:?}").contains("too small"));
        assert!(!dir.path().join("ggml-tiny.en.bin").exists(), "whisper not promoted (atomic)");
        assert!(!dir.path().join(VAD_FILE).exists());
        assert!(!dir.path().join(".staging").exists(), "staging wiped");
    }

    #[tokio::test]
    async fn a_truncated_whisper_is_rejected_and_nothing_promotes() {
        let mut srv = Server::new_async().await;
        let e = entry();
        mock_file(&mut srv, e.whisper_repo, e.whisper_file, &ggml_body(4096)); // below floor
        mock_file(&mut srv, VAD_REPO, VAD_FILE, &ggml_body(300 * 1024));
        let dir = tempfile::tempdir().unwrap();

        let err = install_to_dir(&srv.url(), dir.path(), e, |_| {}, CancellationToken::new())
            .await
            .unwrap_err();
        assert!(format!("{err:?}").contains("too small"));
        assert!(!dir.path().join("ggml-tiny.en.bin").exists());
        assert!(!dir.path().join(".staging").exists());
    }

    #[tokio::test]
    async fn a_pre_cancelled_install_wipes_staging_and_reports_cancelled() {
        let mut srv = Server::new_async().await;
        let e = entry();
        mock_file(&mut srv, e.whisper_repo, e.whisper_file, &ggml_body(1024 * 1024 + 16));
        mock_file(&mut srv, VAD_REPO, VAD_FILE, &ggml_body(300 * 1024));
        let dir = tempfile::tempdir().unwrap();
        let cancel = CancellationToken::new();
        cancel.cancel();

        let out = install_to_dir(&srv.url(), dir.path(), e, |_| {}, cancel).await.unwrap();
        assert_eq!(out, SttInstallOutcome::Cancelled);
        assert!(!dir.path().join("ggml-tiny.en.bin").exists());
        assert!(!dir.path().join(".staging").exists(), "staging wiped on cancel");
    }

    #[tokio::test]
    async fn already_installed_is_idempotent_without_downloading() {
        let dir = tempfile::tempdir().unwrap();
        // Pre-place valid canonical files; no mock server, so any download would error.
        fs::write(dir.path().join("ggml-tiny.en.bin"), ggml_body(1024 * 1024 + 16)).unwrap();
        fs::write(dir.path().join(VAD_FILE), ggml_body(300 * 1024)).unwrap();

        let out = install_to_dir("http://127.0.0.1:1", dir.path(), entry(), |_| {}, CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(out, SttInstallOutcome::AlreadyInstalled);
    }
}
