# Backend — Speech-to-Text (whisper.cpp)

The STT subsystem: the whisper.cpp `whisper-server` sidecar, native mic capture,
audio decode/resample/transcription, the no-fake-metrics STT profiler, and the
decoupled STT eval scorer. This is the Rust side; the UI is
[`frontend-stt.md`](frontend-stt.md), transcript/eval persistence is
[`backend-persistence.md`](backend-persistence.md), and the LLM the transcript
feeds is [`backend-inference-backends.md`](backend-inference-backends.md).

---

## Overview

### Why a separate STT axis

A speech-to-text model is bound to a *different* runtime than the text LLM. The
LLM backends (Ollama / llama.cpp / MLX) drive GGUF/MLX weights; STT drives
**whisper.cpp ggml** weights through `whisper-server`. The format binds the
engine, so STT is **its own state axis** — never derived from the selected LLM
backend, with its own model folder (`~/.quantamind/stt`), its own fixed port
(**:8093**, clear of MLX's 8082..8092 scan range), its own catalog, its own
health probe, and its own profile/eval. `mlx-audio` STT was **removed** (broken
upstream server threading — the broker crashed); STT is whisper.cpp **only**
today. `SttTranscribeEngine` is an enum with one variant (`WhisperCpp`) so a
`faster-whisper` could slot in later without touching the seam.

### What the voice → assistant loop is

```
mic (cpal, Rust)  ──► scratch WAV ──► transcribe_audio ──► Transcript (persisted)
   OR upload a file                       │                      │
                                          ▼                      ▼
                              whisper-server /inference     fed to the LLM
                              (one 30 s window at a time)   (chat / agent loop)
```

Audio (mic take or uploaded file) is decoded → **downmixed to mono** →
**resampled to 16 kHz** entirely in Rust, then sent to `whisper-server` **one
~30 s window at a time**. The canonical artifact is a `Transcript` (segments +
words + measured `SttProfile`), persisted on a complete run. The STT layer is
**offline by construction**: every transcribe/probe path is guarded to loopback
only, so an OpenAI-compatible engine can never silently egress.

### How — IPC commands

| Command | File | Purpose |
|---|---|---|
| `check_whisper_env` | `stt_start.rs` | Is `whisper-server` found AND runnable (dylibs resolve)? |
| `start_whisper_server` | `stt_start.rs` | Spawn the sidecar for one model + VAD; ownership/conflict gated |
| `stop_whisper_server` | `stt_start.rs` | Graceful-then-hard kill of our child |
| `check_whisper_health` | `stt_health.rs` | Ready (200, model loaded) AND we own the live child |
| `list_stt_catalog` | `stt_download.rs` | Curated downloadable models (pre-download disclosure) |
| `download_stt_model` | `stt_download.rs` | Atomic install of whisper ggml + shared VAD |
| `cancel_stt_install` | `stt_download.rs` | Cancel the single in-flight install |
| `list_installed_stt_models` | `stt_models.rs` | Installed-and-usable models (with resolved paths) |
| `delete_stt_model` | `stt_models.rs` | Remove a whisper `.bin` (keeps the shared VAD) |
| `transcribe_audio` | `transcribe.rs` | Transcribe a file via the running server; persist the `Transcript` |
| `load_transcript` | `transcribe.rs` | Reload a persisted transcript by id |
| `start_recording` / `stop_recording` / `recording_level` | `audio/capture.rs` | Native mic capture + live RMS meter |
| `run_stt_eval` | `eval/eval_cmd.rs` | Score stored transcripts against an eval spec |
| `list_transcripts` | `eval/eval_cmd.rs` | Transcript summaries for the spec editor |
| `list_stt_evals` / `load_stt_eval` / `save_stt_eval` / `delete_stt_eval` | `eval/eval_cmd.rs` | Eval spec CRUD |
| `load_stt_report` | `eval/eval_cmd.rs` | Load a streamed report |
| `assess_stt_readiness` | `eval/readiness_cmd.rs` | Aggregate a report → one verdict per model |
| `list/save/delete_stt_readiness_profile` | `eval/readiness_cmd.rs` | Readiness profile CRUD |

---

## `inference/stt/transcribe/` — the transcription seam

Tauri-free domain: decode in Rust → resample to 16 kHz → window → call
`whisper-server /inference` per window → stream segments through a sink →
assemble a canonical `Transcript`. Strictly loopback-only.

### whisper_cpp.rs — the HTTP client (load-bearing)

- **Responsibility:** Drive `whisper-server`, one `/inference` POST per ~30 s
  window, assembling the canonical `Transcript`.
- **Why:** whisper-server speaks an OpenAI-ish multipart API but caps audio at
  ~30 s; the client owns windowing, language pinning, dedup, profiling, and the
  honest RTF math.
- **What:** `transcribe(base, path, model, id, sink)`. Strict `WsResponse` /
  `WsSegment` / `WsWord` deserialize-structs (validate untyped JSON by parsing
  into a strict struct, not manual traversal). `WINDOW_SECS = 30.0`.
- **How:** Pre-flights `ensure_local_reachable` (offline guard). For each window:
  encode 16 kHz mono WAV in-memory, POST `verbose_json` + `temperature=0`, pin
  the language detected on window 1 so later windows can't drift, offset segment
  times to absolute, **dedup the overlapped boundary**, stream `fresh` to the
  sink, and fold profiling off the timed path. The wall clock stops at loop exit
  (before the profiler join) so RTF measures pure inference. Any window error is
  a **hard `Err`** — a partial is never marked complete.

```rust
let mut reader = audio::windows(path, WINDOW_SECS, audio::OVERLAP_SECS)?;
while let Some(win) = reader.next() {
    let win = win?;
    let wav = audio::encode_wav_16k_mono(&win.samples_16k_mono)?;
    let mut form = Form::new()
        .part("file", Part::bytes(wav).file_name("audio.wav").mime_str("audio/wav")?)
        .text("response_format", "verbose_json").text("temperature", "0");
    if let Some(lang) = &language { form = form.text("language", lang.clone()); } // pin lang
    let resp = client.post(format!("{base}/inference")).multipart(form).send().await?;
    // ... offset s.start + win.start_secs to absolute time ...
    let fresh = dedupe_incoming(&all, segs);      // drop repeated boundary segments
    sink.segments(&fresh);
    sink.progress(win.end_secs, container_secs);
    profiler.observe(&fresh, &win.samples_16k_mono, win.start_secs).await; // off-path
    all.extend(fresh);
}
let wall_ms = started.elapsed().as_millis() as u64; // clock stops BEFORE profiler join
let decoded_secs = reader.decoded_secs();           // hardware truth, not the header
```

- **Where used:** Sole impl behind `backend::transcribe(SttTranscribeEngine::WhisperCpp, …)`.

### audio.rs — decode / downmix / resample / window (load-bearing)

- **Responsibility:** Open any supported container and stream it as 16 kHz mono
  PCM windows, overlapping so a word straddling a cut isn't truncated.
- **Why:** Whisper needs 16 kHz mono; sources are arbitrary rate/channels. A
  long file must never land in one `Vec`, and RTF must divide by the *decoded*
  sample count (the container header is `0.0` for VBR).
- **What:** `probe`, `windows`, `WindowReader` (a lazy `Iterator<Item=AudioWindow>`
  with `decoded_secs()`), `resample_mono` (rubato FFT), `encode_wav_16k_mono`.
  Constants `TARGET_RATE_HZ = 16_000`, `OVERLAP_SECS = 1.0`.
- **How:** Each `next()` pulls only one window's frames, prepends the previous
  window's mono tail (the overlap carry), downmixes per frame (`sum/channels`),
  then resamples to 16 kHz. `decoded_secs()` is the de-overlapped mono frame
  count ÷ input rate — a hardware fact reproducible across WAV/MP3.

```rust
mono.push(frame.iter().sum::<f32>() / self.channels as f32); // downmix per frame
// ... at window end, keep the tail as the next window's overlap carry ...
if !self.done && self.overlap_frames > 0 && mono.len() > self.overlap_frames {
    self.carry = mono[mono.len() - self.overlap_frames..].to_vec();
    self.carry_start_frame = window_end_frame - self.overlap_frames as u64;
}
match resample_mono(&mono, self.in_rate, TARGET_RATE_HZ as usize) { /* 16 kHz mono */ }
```

```rust
pub fn resample_mono(input: &[f32], in_rate: usize, out_rate: usize) -> AppResult<Vec<f32>> {
    if in_rate == out_rate || input.is_empty() { return Ok(input.to_vec()); } // no-op
    eprintln!("[stt] resample {in_rate} Hz -> {out_rate} Hz ({} frames)", input.len());
    let mut rs = FftFixedInOut::<f32>::new(in_rate, out_rate, 2048, 1)?;
    // pump fixed input chunks through the FFT resampler, then a partial tail
}
```

### decode_mp3.rs — symphonia streaming decoder

- **Responsibility:** Lazily decode compressed audio (MP3, etc.) to a normalized
  `f32` interleaved sample stream.
- **Why:** Long files can't be buffered whole; a single corrupt packet must be
  skippable, not fatal.
- **What:** `open_symphonia(path) -> (channels, sample_rate, declared_duration?, iter)`.
  The `SymphoniaSamples` iterator decodes one packet at a time into a small
  `SampleBuffer`. Declared duration is `None` for VBR with no frame count.
- **How:** `Err(DecodeError)` → `continue` (skip the bad packet); `UnexpectedEof`
  / `ResetRequired` → clean stream end. WAV is handled by `hound` in `audio.rs`;
  everything else routes here. Downstream never branches on source.

### dedup.rs — overlap de-duplication (load-bearing)

- **Responsibility:** Drop the boundary segments the ~1 s window overlap repeats,
  so the emitted/persisted series stays monotonic + non-overlapping.
- **Why:** The overlap exists to protect a word at the cut; it duplicates the
  boundary segment, which must be removed — but a *genuinely* distinct segment at
  the boundary (different text, or a real repeat later) must be kept.
- **What/How:** `dedupe_incoming(already_emitted, incoming)`. Looks back only
  `TAIL_LOOKBACK = 8` segments. A duplicate = **same normalized text AND
  overlapping time range**. `norm` compares on alphanumerics only (lowercased,
  punctuation dropped) so `" hello world"` and `"Hello world."` match.

```rust
incoming.into_iter()
    .filter(|seg| !tail.iter().any(|e| overlaps(e, seg) && norm(&e.text) == norm(&seg.text)))
    .collect()
```

### transcript.rs — the canonical artifact

- **Responsibility:** Define `Transcript` (source of truth; SRT/VTT are derived
  later) and its measurement structs.
- **What:** `Transcript { id, model, language, audio, segments, complete, stats,
  stt_profile }`; `Segment`, `Word`, `AudioSpec`, `TranscribeStats`, `PerfProfile`,
  `BehavioralProfile`, `Confidence`, `SttProfile`. **Every metric is `Option`** —
  `None` unless the backend actually emitted it. `complete` is `true` only when
  the whole clip transcribed without error; `vram_bytes` is `None` (whisper.cpp
  doesn't report VRAM). No fabricated `0.0`/`1.0`.

### Thin transcribe modules

| File | One line |
|---|---|
| `backend.rs` | `SttTranscribeEngine` enum (one variant: `WhisperCpp`) + the dispatch `transcribe(engine, …)` — the single place the engine is chosen. |
| `sink.rs` | `TranscribeSink` trait (`segments`/`progress`) keeping the backend Tauri-free; `NullSink` no-op. |
| `mod.rs` | Barrel for the transcribe seam. |

---

## `inference/stt/` (root) — domain helpers

### stt_catalog.rs — the model catalog

Curated whisper.cpp ggml models hosted in one repo (`ggerganov/whisper.cpp`),
each paired with the **single shared silero VAD** (`ggml-org/whisper-vad` /
`ggml-silero-v6.2.0.bin`, `VAD_DISK_BYTES = 885_098`). `est_vram_bytes` is always
`None` (not measured → "Not available", never fabricated). `find(id)` / `catalog()`.

| id | display | file | disk bytes | multilingual |
|---|---|---|---:|:---:|
| `tiny.en` | Tiny (English) | ggml-tiny.en.bin | 77,704,715 | no |
| `tiny` | Tiny (multilingual) | ggml-tiny.bin | 77,691,713 | yes |
| `base.en` | Base (English) | ggml-base.en.bin | 147,964,211 | no |
| `base` | Base (multilingual) | ggml-base.bin | 147,951,465 | yes |
| `small.en` | Small (English) | ggml-small.en.bin | 487,614,201 | no |
| `small` | Small (multilingual) | ggml-small.bin | 487,601,967 | yes |
| `medium.en` | Medium (English) | ggml-medium.en.bin | 1,533,774,781 | no |
| `medium` | Medium (multilingual) | ggml-medium.bin | 1,533,763,059 | yes |
| `large-v3` | Large v3 (multilingual) | ggml-large-v3.bin | 3,095,033,483 | yes |
| `large-v3-turbo` | Large v3 Turbo (multilingual) | ggml-large-v3-turbo.bin | 1,624,555,275 | yes |
| `tiny.en-q5_1` | Tiny (English, quantized) | ggml-tiny.en-q5_1.bin | 32,166,155 | no |
| `small.en-q5_1` | Small (English, quantized) | ggml-small.en-q5_1.bin | 190,098,681 | no |
| `small-q5_1` | Small (multilingual, quantized) | ggml-small-q5_1.bin | 190,085,487 | yes |
| `medium.en-q5_0` | Medium (English, quantized) | ggml-medium.en-q5_0.bin | 539,225,533 | no |
| `large-v3-turbo-q5_0` | Large v3 Turbo (quantized) | ggml-large-v3-turbo-q5_0.bin | 574,041,195 | yes |
| `large-v3-q5_0` | Large v3 (quantized) | ggml-large-v3-q5_0.bin | 1,081,140,203 | yes |

### stt_format.rs — model-file validation

- **Responsibility:** Prove an on-disk `.bin` is a real ggml STT asset before it
  is promoted canonical or fed to the server.
- **What:** `validate_stt_model(path, kind)`, `validate_ggml_magic`, `SttModelKind {
  Whisper, Vad }`. Checks: `.bin` extension, a kind-specific size floor
  (`WHISPER_MIN_BYTES = 1 MiB` rejects empty `for-tests-*` stubs; `VAD_MIN_BYTES
  = 256 KiB`), and the ggml magic `6c 6d 67 67`. A **GGUF** (LLM) file is rejected
  with a distinct, actionable message — so a text model dropped in the STT slot
  fails loud, never "succeeds" transcribing garbage. (`stt_format_tests.rs` is the
  out-of-line test module.)

### stt_probe.rs — the offline guardrail

- **Responsibility:** Refuse any non-loopback STT endpoint, then confirm it
  answers within 5 s.
- **Why:** The STT layer must stay on-device; an OpenAI-compatible engine could
  otherwise fall back to `api.openai.com`. This is the guardrail seam reused by
  future engines.
- **What/How:** `is_loopback(base)` (handles `localhost`, `::1`, `127.*`, bracketed
  IPv6) and `ensure_local_reachable(base, path)` — a remote host fails loud
  *before any network call*; a down local server fails loud (never a hang).

| File | One line |
|---|---|
| `mod.rs` | Barrel: `eval`, `profile`, `stt_catalog`, `stt_format`, `stt_probe`, `transcribe`. Pure/domain — no AppHandle, no `crate::commands`. |

---

## `inference/stt/profile/` — the no-fake-metrics profiler (P3)

Turns a transcription run into a measured `SttProfile`. Fed the same `fresh`
batches the sink streams, but the heavy fold runs **off the timed critical path**
so its cost can't inflate RTF. Every field is `Option`, `None` when unmeasurable.

### mod.rs — `Profiler` orchestrator (load-bearing)

- **Responsibility:** Run the behavioral + VAD fold off the transcribe loop's
  wall clock, on a blocking thread, fed over a bounded channel.
- **Why:** The `webrtc_vad` `Vad` C handle is `!Send` (must live on one thread);
  PCM windows are ~2 MB so the channel is capped (`CHANNEL_CAP = 8`). Profiling
  is **best-effort** — a closed channel is ignored; it must never fail a
  transcription.
- **How:** `Profiler::spawn()` builds the detector on a `spawn_blocking` thread;
  `observe(segments, pcm_16k, start)` hands a window over and returns immediately;
  `finish()` drops the sender (thread drains, folds out) and joins — called
  **after** the wall clock stops, so the fold's time is excluded from RTF.
  `Drop` closes the channel on an error path so the thread exits.

```rust
let task = tokio::task::spawn_blocking(move || {       // Vad is !Send → lives here
    let mut behavioral = BehavioralAccumulator::new();
    let mut detector = SpeechDetector::new(EngineId::WhisperCpp);
    let mut silence = SilenceAccumulator::new();
    while let Some(chunk) = rx.blocking_recv() {
        behavioral.push(&chunk.segments);
        let speech = detector.speech_intervals(&chunk.pcm_16k, chunk.window_start_secs);
        silence.push(&chunk.segments, &speech);
    }
    let mut profile = behavioral.finish();
    profile.silence_hallucination_rate = silence.finish();
    profile
});
```

### vad.rs — independent voice-activity detection (load-bearing)

- **Responsibility:** A deterministic, **non-ML** VAD over 16 kHz mono PCM — by
  construction independent of the STT model.
- **Why:** The silence-hallucination metric is **circular** (meaningless) if it
  reuses the model's own speech/no-speech opinion. `SpeechDetector::new(stt_engine)`
  asserts the detector engine ≠ the engine under test, making that mistake
  impossible.
- **What/How:** `speech_intervals(pcm_16k, offset_secs)` classifies each 30 ms
  frame (480 samples at 16 kHz) via `webrtc_vad`, returning absolute speech
  intervals. f32→i16 per frame; a trailing partial frame is dropped.

```rust
pub fn new(stt_engine: EngineId) -> Self {
    assert_ne!(EngineId::WebRtcVad, stt_engine, "VAD must be independent of the STT engine under test");
    SpeechDetector { vad: Vad::new_with_rate_and_mode(SampleRate::Rate16kHz, VadMode::Quality) }
}
```

### silence.rs — silence-hallucination tally (load-bearing)

- **Responsibility:** Count emitted segments that fell in **VAD-silence** *and*
  that the model was **not confident** about.
- **Why:** A *confident* word inside a brief VAD gap is likelier a real word the
  detector clipped — only low-confidence text over silence is a hallucination.
- **What/How:** `SilenceAccumulator::push(segments, speech)` — two counters, no
  retained per-segment data (bounded on a 60-min file). `unsure` = `avg_logprob <
  LOW_LOGPROB (-1.0)` (a missing logprob counts as unsure). `finish()` →
  `hallucinated / emitted`, or `None` when nothing was emitted (never a fabricated 0).

```rust
let in_speech = overlaps_speech(s.start_secs, s.end_secs, speech);
let unsure = s.avg_logprob.map_or(true, |lp| lp < LOW_LOGPROB);
if !in_speech && unsure { self.hallucinated += 1; }
```

### behavioral.rs — repeat-rate + confidence fold

- **Responsibility:** Stream segments → `repeat_rate` (adjacent duplicate text = a
  stuck/looping decode) + word-level `confidence`.
- **What/How:** `BehavioralAccumulator` holds only running aggregates (a
  last-text tracker + a bounded `UnitStats`). `repeat_rate` is **always
  measurable** when anything transcribed (`Some(0.0)` = counted/none found;
  `None` only at zero segments). `confidence` comes from word `probability` only
  (a real 0..1) — segment `avg_logprob` is a different unit, never mixed in;
  `None` when no word carried a probability.

### accumulator.rs — bounded streaming stats

- **Responsibility:** `UnitStats` — a fixed-memory summary of values in `[0,1]`.
- **What/How:** A 1000-bucket histogram + running sum, so millions of word
  probabilities never blow the budget. `mean()` / `percentile(p)` return `None`
  when empty (never a fabricated 0). The value domain is known `[0,1]`, so a
  fixed histogram is bounded and exact-to-resolution (no P² marker math).

### perf.rs — RTF + first-segment latency

- **Responsibility:** Assemble the performance profile honestly.
- **What/How:** `rtf(decoded_secs, wall_ms)` = decoded audio seconds ÷ wall-clock
  seconds (`>1.0` = faster than real time); **the denominator is the decoded
  length, never the container header**, so RTF is reproducible across formats.
  `None` when either factor is non-positive. `profile(first_segment_ms)` leaves
  `encode_ms`/`decode_ms` **`None`** — whisper-server exposes no encoder/decoder
  split, so the total wall is never split by a guessed ratio. `first_segment_ms`
  is the STT analog of TTFT.

| File | One line |
|---|---|
| `mod.rs` | Re-exports + the `Profiler` (above). |

### Profiling metrics

| Metric | Source | When `None` |
|---|---|---|
| `rtf` | decoded secs ÷ wall ms (`perf.rs`) | zero/empty run |
| `first_segment_ms` | submission → first streamed segment | nothing streamed |
| `encode_ms` / `decode_ms` | — | always (no whisper split) |
| `repeat_rate` | adjacent duplicate segment text (`behavioral.rs`) | zero segments |
| `confidence` (mean, low-pct) | word `probability` via `UnitStats` | no word probabilities |
| `silence_hallucination_rate` | low-confidence text in independent-VAD silence | nothing emitted |
| `vram_bytes` | — | always (whisper.cpp reports none) |

---

## `commands/stt/` — sidecar lifecycle + model acquisition

STT's own state axis: a parallel capability to the text backends, never derived
from the selected LLM backend.

### stt_runtime.rs — server spawn / health primitives (load-bearing)

- **Responsibility:** The low-level facts: port, readiness/liveness probes, spawn
  args, spawn, and graceful-then-hard kill.
- **What:** `PORT = 8093`, `READY_TIMEOUT_SECS = 30`, `POLL_INTERVAL_MS = 500`,
  `PROBE_TIMEOUT_MS = 1000`. `ready_at`/`is_ready` (200 = model loaded —
  whisper-server answers **503 `{"status":"loading model"}`** while loading),
  `reachable_at`/`is_reachable` (any HTTP answer = bound), `build_spawn_args`,
  `bin_name` (`.exe` on Windows), `spawn_server`, `kill_server`.
- **How:** `spawn_server` runs the binary from `dir` with `current_dir` +
  the platform library path var (`DYLD_FALLBACK_LIBRARY_PATH` on macOS,
  `LD_LIBRARY_PATH` on Linux) so the binary resolves its shared libs; stderr
  is piped into the tail ring, stdout/stdin nulled.
  `kill_server` does SIGTERM → up to 2 s grace → hard kill; the server only
  *reads* weights so a hard kill can't corrupt them. Idempotent.

```rust
pub fn build_spawn_args(model_path: &str, vad_path: &str, port: u16) -> Vec<String> {
    vec!["-m".into(), model_path.into(),
         "--host".into(), "127.0.0.1".into(),
         "--port".into(), port.to_string(),
         "--vad".into(), "--vad-model".into(), vad_path.into()]
}
```

### stt_start.rs — start / stop / env (load-bearing)

- **Responsibility:** The `start_whisper_server` / `stop_whisper_server` /
  `check_whisper_env` commands and engine-dir resolution.
- **What/How:**
  - `whisper_dir(app)` resolves, most-explicit first: **user setting → env →
    PATH → bundled resources → source tree**. The PATH step
    (`resolve_whisper_on_path`) discovers a system-installed `whisper-server` with
    no extra setup.
  - `check_whisper_env` → `WhisperEnv { found, dir, runnable, error }`. `found` =
    binary located; `runnable` = a `--help` **dry-run** exited 0. The split
    matters: a present-but-broken binary (missing `libwhisper` dylib) prints
    a shared-library error which is returned as the diagnostic, so the UI
    never signals "ready" then fails on start.
  - `start_whisper_server` runs the **R2 ownership** decision before spawning:

```rust
fn adopt_decision(ours_alive: bool, ours_model: bool, reachable: bool) -> Adopt {
    if ours_alive && ours_model { Adopt::AlreadyOurs }          // nothing to do
    else if !ours_alive && reachable { Adopt::Conflict }        // a stranger holds :8093 — fatal
    else { Adopt::Proceed }                                     // free, or ours-but-different model
}
```

  - `precheck_spawn` gates on dir / model / **VAD** presence (the VAD presence
    gate is mandatory — without it the silence metric would silently disable),
    returning a tagged `SttStartResult` the user can act on. `await_ready` polls
    `/health` but bails the instant our child dies, surfacing its stderr tail
    instead of a 30 s wait.

### stt_health.rs — ownership-gated health

- **Responsibility:** `check_whisper_health` → the shared `HealthStatus { available,
  version }` shape (same as Ollama/MLX/llama).
- **Why:** A foreign/orphaned whisper-server on :8093 also answers `/health`, but
  the app refuses to transcribe against a process it didn't start. So `available`
  = `owned && is_ready(...)` — a stranger on the port reads as **not** available
  (otherwise `stop` would look like it "auto-restarts" as the poll re-detects the
  stranger). `version: None` (whisper-server reports none).

### stt_disk.rs — paths + startup reconcile (load-bearing)

- **Responsibility:** Resolve the STT folder, name the canonical/staging paths,
  and **sweep half-installs**.
- **What/How:** `stt_dir_resolved` (setting → `QUANTAMIND_STT_DIR` env →
  `~/.quantamind/stt`), `whisper_dest` (sanitizes id, prefixes `ggml-`),
  `vad_dest`, `staging_dir`, and `reconcile_stt_dir` — the **R3** safety net.

```rust
/// Sweep the whole `.staging` tree + any stray `.partial` markers. Run at app
/// init and before each download, so a model reads as installed only when its
/// real files are present — never half-installed.
pub fn reconcile_stt_dir(dir: &Path) -> std::io::Result<u64> {
    let staging = staging_root(dir);
    if staging.exists() { std::fs::remove_dir_all(&staging)?; removed += 1; }
    for entry in std::fs::read_dir(dir)? {        // stray .partial resume markers
        let p = entry?.path();
        if p.is_file() && p.extension().is_some_and(|e| e == "partial") {
            std::fs::remove_file(&p)?; removed += 1;
        }
    }
    Ok(removed)
}
```

### stt_download.rs — atomic install (load-bearing)

- **Responsibility:** Download a whisper ggml + the shared silero VAD as **one
  atomic install**: stage → validate → promote-both-or-none → wipe on any
  failure or cancel.
- **Why:** A crash or a truncated download must never leave a half-installed
  pair (R3). Whisper without its VAD is unusable (the silence metric gate).
- **What:** `SttInstallState` (single in-flight guard + cancel token, shared so
  `cancel_stt_install` covers everything), `SttInstallProgress { Downloading,
  Done }`, `SttInstallOutcome { Installed, AlreadyInstalled, Cancelled }`,
  `install_to_dir`, `download_stt_model`, `cancel_stt_install`, `list_stt_catalog`.
- **How:** Idempotent — skips files already canonical+valid (returns
  `AlreadyInstalled`). Files download into a per-install `.staging` dir, then
  `promote_or_wipe` validates *all* before renaming *any* into place:

```rust
fn promote_or_wipe(staging: &Path, files: &[(PathBuf, PathBuf, SttModelKind)]) -> AppResult<()> {
    for (staged, _canon, kind) in files {                  // validate ALL first
        if let Err(e) = validate_stt_model(staged, *kind) { wipe(staging); return Err(e); }
    }
    for (staged, canon, _) in files {                      // then promote (rename) ALL
        fs::rename(staged, canon).map_err(|e| AppError::Io(e.to_string()))?;
    }
    wipe(staging);
    Ok(())
}
```

  On `Installed`, emits `EVENT_MODELS_CHANGED` so the header dropdown refreshes.

### STT install phases / events

| Event constant | Emitted by | Payload |
|---|---|---|
| `stt-install-progress` (`EVENT_STT_PROGRESS`) | `download_stt_model` | `Downloading { file, bytes_completed, bytes_total, speed_bps }` then `Done` |
| `models-changed` (`EVENT_MODELS_CHANGED`) | install / delete | `()` — refresh the model dropdown |
| `stt-segments` (`EVENT_STT_SEGMENTS`) | `transcribe_audio` | `{ segments }` per window |
| `stt-transcribe-progress` (`EVENT_STT_TRANSCRIBE_PROGRESS`) | `transcribe_audio` | `{ processed_secs, total_secs }` |

Install outcomes: `Installed` · `AlreadyInstalled` (idempotent skip) · `Cancelled`
(staging wiped). Start outcomes (`SttStartResult`, tagged by `status`):
`already_running` · `started{pid,port}` · `not_bundled` · `model_missing` ·
`vad_missing` · `port_conflict` · `start_failed{error,stderr_tail}`.

### stt_models.rs — installed list + delete

- **What/How:** `list_installed_stt_models` → `InstalledSttModel { id, display,
  model_path, vad_path, size_bytes }`. A model counts **only** when its ggml
  validates **AND** the shared VAD validates — without the VAD nothing is usable,
  so the whole list is empty. `delete_stt_model` removes the whisper `.bin` but
  **keeps the shared VAD** (other models rely on it); missing file is a no-op.

### stt_server_types.rs — server state

- **What/How:** `SttServerState` (a `Mutex<Option<Running>>`) and `SttStartResult`.
  `is_alive()` is the R2 ownership truth — a `try_wait() == Ok(None)` on *our*
  stored child, not merely the port being reachable. `running_model()` (used by
  the transcribe command to confirm readiness + label the artifact), `store`,
  `tail_snapshot` (stderr death diagnosis), `stop` (graceful-then-hard,
  idempotent). `Drop` reaps as a backstop (the `lib.rs` exit hook is primary). A
  new model stops the previous server.

### stt_stderr.rs — bounded stderr tail

- **What/How:** `push_tail` (a `TAIL_CAP = 20` ring) + `spawn_stderr_reader`
  (drains the child's piped stderr on a background thread). Readiness comes from
  `/health`, never stderr — this ring exists purely to surface *why* a server
  died (bad VAD flag, corrupt model, missing dylib) on `StartFailed`.

### transcribe.rs — the `transcribe_audio` command

- **Responsibility:** The only place `AppHandle` touches STT transcription.
- **What/How:** `transcribe_audio(path, id)` requires a **running** server
  (`stt.running_model()` else a clear notice, not a crash), wires a
  `TauriTranscribeSink` (forwards `segments`/`progress` as events), runs the
  domain `transcribe`, and **persists only on a complete run**
  (`transcripts::save` refuses incomplete). `write_scratch_wav` is the atomic
  "ready-to-transcribe" handoff from mic capture; `load_transcript` reloads by
  id (the on-disk artifact is the source of truth); `clear_scratch` runs at startup.

| File | One line |
|---|---|
| `mod.rs` | Barrel: `eval`, `stt_disk`, `stt_download`, `stt_health`, `stt_models`, `stt_runtime`, `stt_server_types`, `stt_start`, `stt_stderr`, `transcribe`. |

---

## `commands/audio/` — native microphone capture

### capture.rs — cpal mic capture (load-bearing)

- **Responsibility:** Capture the default mic in the Rust process and hand a WAV
  path to the transcribe path.
- **Why:** WKWebView can't reliably do `getUserMedia` on macOS, so capture lives
  in Rust. The cpal `Stream` is `!Send`, so it's built, played, and dropped
  entirely on its own thread; `CaptureState` holds only `Send` handles.
- **What:** `start_recording`, `stop_recording` → `RecordingResult { path,
  had_audio }`, `recording_level` (live RMS for the meter). `ingest` appends
  samples + publishes RMS; F32/I16/U16 input formats are normalized to f32.
- **How:** The mic TCC prompt is driven by `NSMicrophoneUsageDescription`.
  `classify_config_failure` maps CoreAudio's phantom-default-device case to a
  clean "No microphone found" (Validation) vs a permissions hint (Internal).
  `stop_recording` joins the thread, flags `had_audio` if the peak exceeds 0.005
  (catches a muted/wrong mic → "no audio detected"), and encodes the take at its
  **native** rate/channels (the transcribe path resamples to 16 kHz).

| File | One line |
|---|---|
| `mod.rs` | Barrel for `capture` (lives outside `commands/stt/`, which is at its 10-file limit). |

---

## `inference/stt/eval/` + `commands/stt/eval/` — STT eval (P4)

A **dumb, decoupled scorer over stored transcripts**. It reads a `Transcript`
artifact + an eval spec, **joins by id**, and does math — it never owns
transcription (no sidecar/retries/timeouts), so a sweep is reproducible and
re-scorable in milliseconds.

### wer.rs — the WER scorer (load-bearing)

- **Responsibility:** Word-error breakdown via sequence alignment, with critical
  tokens up-weighted and confident misreads excluded.
- **Why:** A missed dollar amount must dominate a missed "the"; a confident
  substitution is likely the reader's slip (a human misread), not a model error.
- **What:** `score_wer(reference, hyp: &[HypWord], critical_tokens) -> WerResult {
  wer, weighted_wer, adjusted_wer, substitutions, insertions, deletions, ref_words,
  critical_token_accuracy, misreads }`. `CRITICAL_WEIGHT = 5.0`, `MISREAD_CONF = 0.85`.
- **How:** A word-level Levenshtein DP **with backtrace**, so
  insertions/deletions don't smear into substitutions. `normalize` lowercases and
  drops punctuation but keeps `$`/`%`. A confident substitution (`prob ≥ 0.85`)
  is recorded as a `Misread` and removed from `adjusted_wer`.
  `critical_token_accuracy` is `None` when the reference has no critical tokens.

```rust
for (op, ri, hj) in &ops {
    match op {
        Op::Sub => {
            subs += 1; weighted_err += wt(&r[*ri]);            // critical token weighs 5×
            if crit.contains(&r[*ri]) { crit_total += 1; }
            if let Some(p) = h[*hj].1 { if p >= MISREAD_CONF {  // confident sub = human misread
                misreads.push(Misread { reference: r[*ri].clone(), heard: h[*hj].0.clone(), probability: p });
            }}
        }
        Op::Del => { del += 1; weighted_err += wt(&r[*ri]); /* ... */ }
        Op::Ins => { ins += 1; weighted_err += 1.0; }          // maps to no reference word
        Op::Match => { /* count critical hits */ }
    }
}
let adjusted_errors = errors - misreads.len() as f64;          // drop the reader's slips
```

### scorer.rs — the `SttScorer` trait

- **Responsibility:** A swappable scoring strategy over a stored `Transcript` + task.
- **What/How:** `SttScorer::score` → `SttReportRow`. The v1 `WerScorer` computes
  WER **only when the task carries a reference** (else `wer: None`, "accuracy
  unverified"), and passes behavioral/RTF straight through from the `SttProfile`
  — a `None` WER never bleeds into the other fields. `hypothesis_words` flattens
  word-level data (with confidences) for alignment, falling back to splitting
  segment text when the backend emitted no words (so WER still scores, just with
  no misread flagging). New metrics (semantic, phonetic) drop in here without
  touching the runner.

### readiness.rs — pure gating synthesis (load-bearing)

- **Responsibility:** `assess(inputs, profile) -> SttReadinessVerdict` and
  `verdicts(report, profile)` — measured inputs + a profile → a per-model verdict.
- **What/How:** Pure (no async/IO), identical contract to the text `assess()` so
  GUI and CLI can't diverge. Hard gates → `blocking` (NotReady); soft targets →
  `conditions` (Conditional); **required-but-unmeasured blocks** (ignorance is
  not a pass). The accuracy gate is **reference-gated** and gates on the
  **weighted** WER — a `None` (no reference) is an honest Conditional note,
  never a block and never a silent pass. `builtin_profiles()` seeds
  `production-dictation`, `high-accuracy-legal`, `fast-draft`. `verdicts`
  aggregates per model (means over its rows; `weighted_wer` averages only
  referenced rows so a `None` never drags the mean) and ranks best-first.

```rust
if let Some(max) = p.max_wer {
    match i.weighted_wer {
        Some(w) if w > max => blocking.push(format!("weighted WER {:.1}% > {:.1}% allowed", w*100.0, max*100.0)),
        Some(_) => {}
        None => conditions.push("accuracy unverified (no reference text)".into()), // never blocks, never passes
    }
}
```

### eval_cmd.rs — the dumb runner + eval CRUD

- **What/How:** `run(transcripts_dir, reports_dir, spec_name, spec)` — for each
  task, **load its transcript by id**, score it, stream the row to disk, then
  drop the transcript (and its alignment matrix) before the next. A missing
  transcript yields **no row** (an explicit skip — never a silent positional
  mis-pair, never a fabricated row). Commands: `run_stt_eval`, `list_transcripts`,
  and `list/load/save/delete_stt_eval`, `load_stt_report`.

```rust
for task in &spec.tasks {
    if let Some(t) = transcripts::load(transcripts_dir, &task.id)? {  // join by id, not position
        let row = scorer.score(&t, task);
        eval_reports::append_row(reports_dir, spec_name, &row)?;       // streamed
    }
}
```

### Thin eval modules

| File | One line |
|---|---|
| `spec.rs` | `SttEvalTask { id, reference?, critical_tokens }` + `SttEvalSpec`; `validate()` rejects empty/duplicate ids (the id is the join key). A bare `{"id":"x"}` parses (reference `None`). |
| `report.rs` | `SttReportRow` (every metric `Option`) + `SttReport { rows }`, streamed to disk one row at a time. |
| `inference/.../eval/mod.rs` | Barrel: `readiness`, `report`, `scorer`, `spec`, `wer`. Pure/domain. |
| `readiness_cmd.rs` | `assess_stt_readiness` + readiness-profile CRUD; all loading here, `verdicts`/`assess` stay pure. |
| `commands/stt/eval/mod.rs` | `evals_dir`/`reports_dir`/`readiness_dir`/`transcripts_dir` under the app config dir; barrel for the two cmd files. |

---

## Data-flow walkthroughs

### (a) record mic → decode → transcribe → transcript

1. `start_recording` opens the default cpal device on its own `!Send` thread;
   `ingest` buffers f32 samples + publishes RMS; the UI polls `recording_level`.
2. `stop_recording` joins the thread, flags `had_audio` (peak > 0.005), encodes a
   native-rate WAV, and `write_scratch_wav` returns the scratch path.
3. `transcribe_audio(path, id)` checks a server is running (`running_model()`),
   wires a `TauriTranscribeSink`, calls `backend::transcribe(WhisperCpp, …)`.
4. `whisper_cpp::transcribe` pre-flights the loopback guard, then
   `audio::windows` streams **decoded → downmixed → 16 kHz mono** windows
   (overlapping 1 s). Each window: encode WAV → POST `/inference` → offset times
   → `dedupe_incoming` → stream `fresh` to the sink → `profiler.observe` off-path.
5. At loop exit the wall clock stops; RTF = `decoded_secs ÷ wall`. The profiler
   joins (behavioral + independent-VAD silence). A complete `Transcript` is
   returned and `transcripts::save`'d (incomplete is never persisted).

### (b) atomic install + startup reconcile

1. At app init (and before each download) `reconcile_stt_dir` sweeps the
   `.staging` tree + stray `.partial` markers, so no half-install is ever
   reported installed.
2. `download_stt_model(id)` takes the single in-flight token, then `install_to_dir`:
   if both whisper + VAD are already canonical+valid → `AlreadyInstalled`.
3. Otherwise each missing file downloads into the per-install `.staging` dir
   (a cancel mid-stream → wipe + `Cancelled`; an error → wipe + `Err`).
4. `promote_or_wipe` **validates all staged files first** (ggml magic + size
   floor + GGUF rejection); if any fails → wipe staging + `Err` (nothing lands
   canonical). Only when all validate are they renamed into place — both-or-none.
5. On `Installed`, `EVENT_MODELS_CHANGED` refreshes the dropdown.

### (c) STT eval scoring over stored transcripts

1. `run_stt_eval(spec)` loads the `SttEvalSpec` (`validate()` first) and calls the
   dumb `run`.
2. `run` starts a streamed report, then per task **loads the transcript by id**
   (missing → skipped, no row).
3. `WerScorer.score` computes WER **only if the task has a reference** (else
   `None`), and passes RTF/repeat/silence/confidence straight from the stored
   `SttProfile` — no re-transcription, no fabricated accuracy.
4. Each `SttReportRow` is appended to disk; the assembled `SttReport` returns.
5. `assess_stt_readiness(spec, profile_id)` loads the report + profile and runs
   the pure `verdicts` → one `SttModelVerdict` per model (weighted-WER gated,
   ranked best-first).

---

## Cross-references

- **UI** (recorder, catalog cards, transcript view, eval/readiness panels):
  [`frontend-stt.md`](frontend-stt.md)
- **Persistence** (transcript store, streamed JSONL reports, eval specs &
  readiness profiles): [`backend-persistence.md`](backend-persistence.md)
- **The LLM** the transcript feeds (Ollama / llama.cpp / MLX, the parallel
  backend axis + the shared `HealthStatus`/endpoint scheme):
  [`backend-inference-backends.md`](backend-inference-backends.md)
- **Eval engine** the STT eval parallels (the text scorer + readiness contract):
  [`backend-eval-engine.md`](backend-eval-engine.md)
