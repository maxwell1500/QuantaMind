use crate::errors::{AppError, AppResult};
use crate::inference::http::http::streaming_client;
use crate::inference::stt::stt_probe::ensure_local_reachable;
use crate::inference::stt::transcribe::audio;
use crate::inference::stt::transcribe::dedup::dedupe_incoming;
use crate::inference::stt::profile::{perf, Profiler};
use crate::inference::stt::transcribe::sink::TranscribeSink;
use crate::inference::stt::transcribe::transcript::{
    AudioSpec, Segment, SttProfile, Transcript, TranscribeStats, Word,
};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use std::path::Path;
use std::time::Instant;

const WINDOW_SECS: f64 = 30.0;

// Strict structs mirroring whisper-server `verbose_json` (validate untyped JSON by
// deserializing into a strict struct, not manual traversal). Unknown fields and
// absent optional fields are tolerated; `start`/`end` are required.
#[derive(Deserialize)]
struct WsResponse {
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    segments: Vec<WsSegment>,
}

#[derive(Deserialize)]
struct WsSegment {
    #[serde(default)]
    text: String,
    start: f64,
    end: f64,
    #[serde(default)]
    avg_logprob: Option<f64>,
    #[serde(default)]
    no_speech_prob: Option<f64>,
    #[serde(default)]
    words: Option<Vec<WsWord>>,
}

#[derive(Deserialize)]
struct WsWord {
    #[serde(default)]
    word: String,
    start: f64,
    end: f64,
    #[serde(default)]
    probability: Option<f64>,
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError::Internal(format!("whisper-server request failed: {e}"))
}

/// Transcribe `path` via the whisper-server at `base` (e.g.
/// `http://127.0.0.1:8093`), one `/inference` call per ~30 s window. Offline-
/// guarded (loopback only — never an egress). Each window's segments stream
/// through `sink` with timestamps offset to absolute time. Any window failure
/// (e.g. the sidecar killed mid-transcribe) returns `Err` with no assembled
/// transcript — the caller must not persist a partial as complete.
pub async fn transcribe(
    base: &str,
    path: &Path,
    model: &str,
    id: &str,
    sink: &dyn TranscribeSink,
) -> AppResult<Transcript> {
    ensure_local_reachable(base, "/health").await?;
    let spec = audio::probe(path)?;
    // probe's duration is the container's declared estimate (or 0.0 for VBR) — fine
    // for the live progress denominator, but the decoded sample count below is the
    // truth RTF is computed from.
    let container_secs = spec.duration_secs;
    let client = streaming_client()?;
    let started = Instant::now();

    let mut all: Vec<Segment> = Vec::new();
    let mut language: Option<String> = None;
    // Time from submission to the first streamed segment — the STT analog of TTFT.
    let mut first_segment_ms: Option<u64> = None;
    // Behavioral analysis runs off the timed path so its cost can't inflate RTF.
    // Dropped on any `?` below → its task is aborted (no lingering state).
    let profiler = Profiler::spawn();

    let mut reader = audio::windows(path, WINDOW_SECS, audio::OVERLAP_SECS)?;
    while let Some(win) = reader.next() {
        let win = win?;
        let wav = audio::encode_wav_16k_mono(&win.samples_16k_mono)?;
        let mut form = Form::new()
            .part(
                "file",
                Part::bytes(wav).file_name("audio.wav").mime_str("audio/wav").map_err(net_err)?,
            )
            .text("response_format", "verbose_json")
            .text("temperature", "0");
        // Pin the language detected on window 1 so later windows can't drift.
        if let Some(lang) = &language {
            form = form.text("language", lang.clone());
        }

        let resp = client
            .post(format!("{base}/inference"))
            .multipart(form)
            .send()
            .await
            .map_err(net_err)?;
        if !resp.status().is_success() {
            let status = resp.status();
            return Err(AppError::Internal(format!(
                "whisper-server /inference returned {status}: {}",
                resp.text().await.unwrap_or_default()
            )));
        }
        let body: WsResponse = resp.json().await.map_err(net_err)?;
        if language.is_none() {
            language = body.language.clone();
        }

        let off = win.start_secs;
        let segs: Vec<Segment> = body
            .segments
            .into_iter()
            .map(|s| Segment {
                text: s.text,
                start_secs: s.start + off,
                end_secs: s.end + off,
                avg_logprob: s.avg_logprob,
                no_speech_prob: s.no_speech_prob,
                words: s.words.map(|ws| {
                    ws.into_iter()
                        .map(|w| Word {
                            text: w.word,
                            start_secs: w.start + off,
                            end_secs: w.end + off,
                            probability: w.probability,
                        })
                        .collect()
                }),
            })
            .collect();
        // Drop the boundary segments the window overlap repeats, so the streamed
        // view and the persisted artifact stay monotonic + non-overlapping.
        let fresh = dedupe_incoming(&all, segs);
        if first_segment_ms.is_none() && !fresh.is_empty() {
            first_segment_ms = Some(started.elapsed().as_millis() as u64);
        }
        sink.segments(&fresh);
        sink.progress(win.end_secs, container_secs);
        profiler.observe(&fresh).await; // off-path fold; doesn't block the loop
        all.extend(fresh);
    }

    // Stop the clock the instant the last segment landed (loop exit), before any
    // finalize work (incl. joining the profiler), so wall = pure inference.
    let wall_ms = started.elapsed().as_millis() as u64;
    // The decoded sample count is the hardware fact RTF divides by — not the
    // container header (which is 0.0 for VBR). Also refines the artifact's duration.
    let decoded_secs = reader.decoded_secs();

    let stats = TranscribeStats {
        source_duration_secs: Some(container_secs),
        audio_decoded_secs: Some(decoded_secs),
        transcribe_wall_ms: Some(wall_ms),
        segment_count: Some(all.len()),
        detected_language: language.clone(),
        received_sample_rate_hz: Some(audio::TARGET_RATE_HZ),
        rtf: perf::rtf(decoded_secs, wall_ms),
    };
    // Join the off-path fold (after the wall clock stopped) for the behavioral
    // layer. VRAM is None — whisper.cpp doesn't report it.
    let behavioral = profiler.finish().await;
    let stt_profile = Some(SttProfile {
        perf: Some(perf::profile(first_segment_ms)),
        behavioral: Some(behavioral),
        vram_bytes: None,
    });
    Ok(Transcript {
        id: id.to_string(),
        model: model.to_string(),
        language,
        audio: AudioSpec { duration_secs: decoded_secs, ..spec },
        segments: all,
        complete: true,
        stats,
        stt_profile,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::transcribe::sink::NullSink;
    use hound::{SampleFormat, WavSpec, WavWriter};
    use std::path::Path;

    fn write_mono_16k(path: &Path, secs: usize) {
        let spec = WavSpec { channels: 1, sample_rate: 16_000, bits_per_sample: 16, sample_format: SampleFormat::Int };
        let mut w = WavWriter::create(path, spec).unwrap();
        for _ in 0..(16_000 * secs) {
            w.write_sample(0i16).unwrap();
        }
        w.finalize().unwrap();
    }

    const BODY: &str = r#"{"language":"en","segments":[{"text":" hi","start":1.0,"end":2.0,"avg_logprob":-0.2,"no_speech_prob":0.01}]}"#;

    #[tokio::test]
    async fn parses_segments_and_offsets_per_window() {
        let mut server = mockito::Server::new_async().await;
        let base = server.url();
        let _h = server.mock("GET", "/health").with_status(200).create_async().await;
        let _i = server
            .mock("POST", "/inference")
            .with_header("content-type", "application/json")
            .with_body(BODY)
            .expect_at_least(2)
            .create_async()
            .await;

        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("clip.wav");
        write_mono_16k(&p, 35); // 35s -> 2 windows (30 + 5)

        let t = transcribe(&base, &p, "ggml-tiny.en.bin", "clip-1", &NullSink).await.unwrap();
        assert!(t.complete);
        assert_eq!(t.language.as_deref(), Some("en"));
        assert_eq!(t.segments.len(), 2, "one segment per window (distinct times, both kept)");
        // window 0 starts at 0 -> seg 1.0 ; window 1 starts at 29 (1s overlap) -> seg 30.0
        assert!((t.segments[0].start_secs - 1.0).abs() < 1e-6);
        assert!((t.segments[1].start_secs - 30.0).abs() < 1e-6, "offset by overlapped window start");
        // monotonic, non-overlapping across windows
        assert!(t.segments[1].start_secs >= t.segments[0].end_secs);
        assert_eq!(t.stats.received_sample_rate_hz, Some(16_000));
        // RTF is computed from the decoded sample count (35 s here), not the
        // container header, ÷ wall time. Two real mock roundtrips take > 0 ms.
        assert_eq!(t.stats.audio_decoded_secs, Some(35.0), "decoded-sample truth");
        assert!(t.stats.rtf.is_some_and(|r| r > 0.0), "RTF populated from decoded ÷ wall");
        // Perf layer: first-segment latency captured, encode/decode split honestly None.
        let profile = t.stt_profile.as_ref().unwrap();
        let perf = profile.perf.as_ref().unwrap();
        assert!(perf.first_segment_ms.is_some(), "first-segment latency measured");
        assert_eq!(perf.encode_ms, None, "no guessed encode/decode split");
        // Behavioral layer was folded off-path and joined: both windows emit " hi"
        // → an adjacent repeat; RTF (timed before the join) is still populated.
        let behavioral = profile.behavioral.as_ref().unwrap();
        assert_eq!(behavioral.repeat_rate, Some(1.0), "two identical segments → full repeat");
        assert!(t.stats.rtf.is_some(), "RTF computed before the off-path join, unaffected by it");
    }

    #[tokio::test]
    async fn empty_segments_stay_empty_not_fabricated() {
        let mut server = mockito::Server::new_async().await;
        let base = server.url();
        let _h = server.mock("GET", "/health").with_status(200).create_async().await;
        let _i = server
            .mock("POST", "/inference")
            .with_body(r#"{"language":"en","segments":[]}"#)
            .create_async()
            .await;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("silence.wav");
        write_mono_16k(&p, 2);
        let t = transcribe(&base, &p, "m", "s1", &NullSink).await.unwrap();
        assert!(t.segments.is_empty(), "no fabricated segments over silence");
        assert!(t.complete);
    }

    #[tokio::test]
    async fn server_error_mid_transcribe_is_a_hard_error() {
        let mut server = mockito::Server::new_async().await;
        let base = server.url();
        let _h = server.mock("GET", "/health").with_status(200).create_async().await;
        let _i = server.mock("POST", "/inference").with_status(500).with_body("boom").create_async().await;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("c.wav");
        write_mono_16k(&p, 2);
        let r = transcribe(&base, &p, "m", "c1", &NullSink).await;
        assert!(r.is_err(), "a 500 is a hard error, not a partial-complete transcript");
    }

    #[tokio::test]
    async fn refuses_a_non_loopback_base() {
        let r = transcribe("http://api.openai.com", Path::new("/none.wav"), "m", "x", &NullSink).await;
        assert!(r.is_err(), "must refuse a non-loopback endpoint (no egress)");
    }
}
