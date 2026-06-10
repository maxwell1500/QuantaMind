use crate::errors::{AppError, AppResult};
use crate::inference::http::http::streaming_client;
use crate::inference::stt::profile::behavioral::BehavioralAccumulator;
use crate::inference::stt::profile::perf;
use crate::inference::stt::stt_probe::ensure_local_reachable;
use crate::inference::stt::transcribe::audio;
use crate::inference::stt::transcribe::sink::TranscribeSink;
use crate::inference::stt::transcribe::transcript::{
    Segment, SttProfile, Transcript, TranscribeStats, Word,
};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use std::path::Path;
use std::time::Instant;

// Strict structs over mlx-audio's OpenAI-compatible `verbose_json`. Timestamps
// default to 0.0 so a server that omits them on a segment still parses (we then
// have text without a usable span rather than a hard failure).
#[derive(Deserialize)]
struct MlxResponse {
    #[serde(default)]
    text: String,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    segments: Vec<MlxSegment>,
}

#[derive(Deserialize)]
struct MlxSegment {
    #[serde(default)]
    text: String,
    #[serde(default)]
    start: f64,
    #[serde(default)]
    end: f64,
    #[serde(default)]
    avg_logprob: Option<f64>,
    #[serde(default)]
    no_speech_prob: Option<f64>,
    #[serde(default)]
    words: Option<Vec<MlxWord>>,
}

#[derive(Deserialize)]
struct MlxWord {
    #[serde(default)]
    word: String,
    #[serde(default)]
    start: f64,
    #[serde(default)]
    end: f64,
    #[serde(default)]
    probability: Option<f64>,
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError::Internal(format!("mlx-audio request failed: {e}"))
}

/// Transcribe `path` via the **mlx-audio** server at `base` (e.g.
/// `http://127.0.0.1:8094`) over its OpenAI-compatible
/// `/v1/audio/transcriptions`. Offline-guarded (loopback only). Unlike
/// whisper-server this returns the whole transcription in one response (no
/// windowed streaming), so the original file is sent as-is — mlx-audio does its
/// own decode — and the segments stream once on completion. `model` is the
/// per-request whisper repo (mlx-audio loads no model at startup). The silence
/// metric is `None` on this path (the independent VAD runs over the 16 kHz PCM
/// windows the whisper path produces, which this single-shot path doesn't).
pub async fn transcribe(
    base: &str,
    path: &Path,
    model: &str,
    id: &str,
    sink: &dyn TranscribeSink,
) -> AppResult<Transcript> {
    ensure_local_reachable(base, "/v1/models").await?;
    let spec = audio::probe(path)?;
    let bytes = std::fs::read(path).map_err(|e| AppError::Io(e.to_string()))?;
    let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("audio").to_string();
    let client = streaming_client()?;
    let started = Instant::now();

    let form = Form::new()
        .part(
            "file",
            Part::bytes(bytes).file_name(filename).mime_str("application/octet-stream").map_err(net_err)?,
        )
        .text("model", model.to_string())
        .text("response_format", "verbose_json")
        .text("temperature", "0");

    let resp = client
        .post(format!("{base}/v1/audio/transcriptions"))
        .multipart(form)
        .send()
        .await
        .map_err(net_err)?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(AppError::Internal(format!(
            "mlx-audio /v1/audio/transcriptions returned {status}: {}",
            resp.text().await.unwrap_or_default()
        )));
    }
    let body: MlxResponse = resp.json().await.map_err(net_err)?;
    // First (and only) response = the first-segment latency on this path.
    let first_segment_ms = Some(started.elapsed().as_millis() as u64);

    let mut segments: Vec<Segment> = body
        .segments
        .into_iter()
        .map(|s| Segment {
            text: s.text,
            start_secs: s.start,
            end_secs: s.end,
            avg_logprob: s.avg_logprob,
            no_speech_prob: s.no_speech_prob,
            words: s.words.map(|ws| {
                ws.into_iter()
                    .map(|w| Word { text: w.word, start_secs: w.start, end_secs: w.end, probability: w.probability })
                    .collect()
            }),
        })
        .collect();
    // Fallback: a server that returns only `text` (no segments) → one segment
    // spanning the clip, so the transcript isn't empty when speech was present.
    if segments.is_empty() && !body.text.trim().is_empty() {
        segments.push(Segment {
            text: body.text.clone(),
            start_secs: 0.0,
            end_secs: spec.duration_secs.max(0.0),
            avg_logprob: None,
            no_speech_prob: None,
            words: None,
        });
    }

    sink.segments(&segments);
    sink.progress(spec.duration_secs.max(0.0), spec.duration_secs.max(0.0));
    let wall_ms = started.elapsed().as_millis() as u64;

    // Behavioral fold synchronously — one response, so no off-path channel needed.
    let mut behavioral = BehavioralAccumulator::new();
    behavioral.push(&segments);
    let behavioral = behavioral.finish(); // silence_hallucination_rate stays None

    let stats = TranscribeStats {
        source_duration_secs: Some(spec.duration_secs),
        audio_decoded_secs: Some(spec.duration_secs),
        transcribe_wall_ms: Some(wall_ms),
        segment_count: Some(segments.len()),
        detected_language: body.language.clone(),
        received_sample_rate_hz: Some(spec.sample_rate_hz),
        rtf: perf::rtf(spec.duration_secs, wall_ms),
    };
    let stt_profile = Some(SttProfile {
        perf: Some(perf::profile(first_segment_ms)),
        behavioral: Some(behavioral),
        vram_bytes: None,
    });
    Ok(Transcript {
        id: id.to_string(),
        model: model.to_string(),
        language: body.language,
        audio: spec,
        segments,
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

    fn write_wav(path: &Path, secs: usize) {
        let spec = WavSpec { channels: 1, sample_rate: 16_000, bits_per_sample: 16, sample_format: SampleFormat::Int };
        let mut w = WavWriter::create(path, spec).unwrap();
        for _ in 0..(16_000 * secs) {
            w.write_sample(0i16).unwrap();
        }
        w.finalize().unwrap();
    }

    #[tokio::test]
    async fn parses_verbose_json_segments() {
        let mut server = mockito::Server::new_async().await;
        let base = server.url();
        let _m = server.mock("GET", "/v1/models").with_status(200).create_async().await;
        let _t = server
            .mock("POST", "/v1/audio/transcriptions")
            .with_header("content-type", "application/json")
            .with_body(r#"{"language":"en","text":" hello there","segments":[{"text":" hello there","start":0.0,"end":1.4,"avg_logprob":-0.2}]}"#)
            .create_async()
            .await;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("clip.wav");
        write_wav(&p, 2);

        let t = transcribe(&base, &p, "mlx-community/whisper-tiny", "clip-1", &NullSink).await.unwrap();
        assert!(t.complete);
        assert_eq!(t.segments.len(), 1);
        assert_eq!(t.segments[0].text.trim(), "hello there");
        assert_eq!(t.language.as_deref(), Some("en"));
        assert!(t.stats.rtf.is_some(), "RTF from probe duration ÷ wall");
        assert!(t.stt_profile.as_ref().unwrap().perf.as_ref().unwrap().first_segment_ms.is_some());
    }

    #[tokio::test]
    async fn falls_back_to_one_segment_for_text_only_responses() {
        let mut server = mockito::Server::new_async().await;
        let base = server.url();
        let _m = server.mock("GET", "/v1/models").with_status(200).create_async().await;
        let _t = server
            .mock("POST", "/v1/audio/transcriptions")
            .with_body(r#"{"text":"just text, no segments"}"#)
            .create_async()
            .await;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("c.wav");
        write_wav(&p, 1);

        let t = transcribe(&base, &p, "m", "s1", &NullSink).await.unwrap();
        assert_eq!(t.segments.len(), 1, "text-only → a single spanning segment");
        assert_eq!(t.segments[0].text, "just text, no segments");
    }

    #[tokio::test]
    async fn server_error_is_a_hard_error() {
        let mut server = mockito::Server::new_async().await;
        let base = server.url();
        let _m = server.mock("GET", "/v1/models").with_status(200).create_async().await;
        let _t = server.mock("POST", "/v1/audio/transcriptions").with_status(500).with_body("boom").create_async().await;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("c.wav");
        write_wav(&p, 1);
        assert!(transcribe(&base, &p, "m", "x", &NullSink).await.is_err());
    }

    #[tokio::test]
    async fn refuses_a_non_loopback_base() {
        let r = transcribe("http://api.openai.com", Path::new("/none.wav"), "m", "x", &NullSink).await;
        assert!(r.is_err(), "must refuse a non-loopback endpoint (no egress)");
    }
}
