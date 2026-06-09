use crate::errors::AppError;
use std::fs;
use std::io::Read;
use std::path::Path;

/// On-disk ggml magic: the bytes `6c 6d 67 67`, i.e. the little-endian u32
/// encoding of `GGML_FILE_MAGIC` `0x67676d6c` ("ggml"). whisper.cpp models and
/// the silero VAD both begin with it (verified against the real
/// `ggerganov/whisper.cpp` and `ggml-org/whisper-vad` files).
const GGML_MAGIC_LE: [u8; 4] = [0x6c, 0x6d, 0x67, 0x67];
/// The marker an LLM weight file (GGUF) starts with — rejected explicitly so a
/// text model dropped into the STT slot fails loud instead of loading as
/// garbage or, worse, "succeeding" and transcribing noise.
const GGUF_MAGIC: [u8; 4] = *b"GGUF";

/// A real whisper ggml model is tens of MB (tiny.en ~75 MB); anything under
/// 1 MiB is a truncated download or one of whisper.cpp's empty `for-tests-*`
/// stubs (which ship with no weights and would "load" but transcribe garbage).
const WHISPER_MIN_BYTES: u64 = 1024 * 1024;
/// The silero VAD is small (~885 KB), so it gets a lower floor that still
/// rejects empty/stub files.
const VAD_MIN_BYTES: u64 = 256 * 1024;

/// Which STT asset a file is expected to be — they share the ggml magic but
/// have different size floors and user-facing labels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttModelKind {
    Whisper,
    Vad,
}

fn min_bytes(kind: SttModelKind) -> u64 {
    match kind {
        SttModelKind::Whisper => WHISPER_MIN_BYTES,
        SttModelKind::Vad => VAD_MIN_BYTES,
    }
}

fn label(kind: SttModelKind) -> &'static str {
    match kind {
        SttModelKind::Whisper => "whisper model",
        SttModelKind::Vad => "silero VAD model",
    }
}

/// Check the leading bytes are the ggml magic, rejecting a GGUF (LLM) file with
/// a distinct, actionable message. Pure over bytes so it can be asserted
/// without touching disk.
pub fn validate_ggml_magic(head: &[u8], kind: SttModelKind) -> Result<(), AppError> {
    if head.len() >= 4 && head[..4] == GGUF_MAGIC {
        return Err(AppError::Validation(format!(
            "this looks like an LLM GGUF, not a {} — pick a whisper.cpp ggml .bin, not a text model",
            label(kind)
        )));
    }
    if head.len() < 4 || head[..4] != GGML_MAGIC_LE {
        return Err(AppError::Validation(format!(
            "not a ggml {}: missing the ggml marker (got {:02x?})",
            label(kind),
            &head[..head.len().min(4)]
        )));
    }
    Ok(())
}

/// Validate an on-disk STT model file: `.bin` extension, a kind-specific
/// minimum size (rejects truncated downloads and empty stubs), and the ggml
/// magic. Mirrors `inference::gguf::gguf::inspect_gguf`'s guard structure.
pub fn validate_stt_model(path: &Path, kind: SttModelKind) -> Result<(), AppError> {
    let ext_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.eq_ignore_ascii_case("bin"))
        .unwrap_or(false);
    if !ext_ok {
        return Err(AppError::Validation(format!("not a .bin file: {}", path.display())));
    }
    let md = fs::metadata(path).map_err(|e| AppError::Io(e.to_string()))?;
    if md.len() < min_bytes(kind) {
        return Err(AppError::Validation(format!(
            "file too small to be a real {}: {} bytes",
            label(kind),
            md.len()
        )));
    }
    let mut head = [0u8; 4];
    let mut f = fs::File::open(path).map_err(|e| AppError::Io(e.to_string()))?;
    f.read_exact(&mut head).map_err(|e| AppError::Io(e.to_string()))?;
    validate_ggml_magic(&head, kind)
}

#[cfg(test)]
#[path = "stt_format_tests.rs"]
mod tests;
