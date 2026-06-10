use crate::errors::{AppError, AppResult};
use crate::inference::stt::transcribe::transcript::AudioSpec;
use hound::{SampleFormat, WavReader, WavSpec, WavWriter};
use rubato::{FftFixedInOut, Resampler};
use std::io::Cursor;
use std::path::Path;

/// Whisper's expected input rate. Resampling to this is explicit + logged.
pub const TARGET_RATE_HZ: u32 = 16_000;

/// Windows overlap by this much so a word straddling a cut isn't truncated into
/// garbage; the duplicated boundary segments are removed by `dedup`.
pub const OVERLAP_SECS: f64 = 1.0;

fn wav_err(e: hound::Error) -> AppError {
    AppError::Validation(format!("WAV decode failed: {e}"))
}

/// Decoded truth: rate, channels, and duration from the actual decoded frame
/// count (`frames / rate`), never the container's declared duration.
pub fn probe(path: &Path) -> AppResult<AudioSpec> {
    let reader = WavReader::open(path).map_err(wav_err)?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as u64;
    let frames = reader.len() as u64 / channels; // len() = interleaved samples across channels
    Ok(AudioSpec {
        sample_rate_hz: spec.sample_rate,
        channels: spec.channels,
        duration_secs: frames as f64 / spec.sample_rate.max(1) as f64,
    })
}

/// A normalized-`f32` interleaved sample stream over the WAV, owning the reader
/// so it can be pulled lazily (bounded memory — the whole file is never buffered).
fn f32_samples(reader: WavReader<std::io::BufReader<std::fs::File>>) -> AppResult<Box<dyn Iterator<Item = AppResult<f32>>>> {
    let spec = reader.spec();
    match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Float, 32) => Ok(Box::new(reader.into_samples::<f32>().map(|r| r.map_err(wav_err)))),
        (SampleFormat::Int, 16) => Ok(Box::new(
            reader.into_samples::<i16>().map(|r| r.map(|v| v as f32 / 32_768.0).map_err(wav_err)),
        )),
        (SampleFormat::Int, bits @ (24 | 32)) => {
            let div = if bits == 24 { 8_388_608.0 } else { 2_147_483_648.0_f32 };
            Ok(Box::new(reader.into_samples::<i32>().map(move |r| r.map(|v| v as f32 / div).map_err(wav_err))))
        }
        (sf, bits) => Err(AppError::Validation(format!("unsupported WAV sample format: {sf:?} {bits}-bit"))),
    }
}

/// One window of 16 kHz mono PCM, with the absolute time it covers in the source.
pub struct AudioWindow {
    pub samples_16k_mono: Vec<f32>,
    pub start_secs: f64,
    pub end_secs: f64,
}

/// Lazily decode → downmix → resample the WAV in fixed-duration windows that
/// **overlap** by `overlap_frames` (so a word straddling a cut isn't truncated).
/// Each `next()` pulls only one window's frames (so a 60-min file never lands in
/// one `Vec`). Resampling to 16 kHz is an explicit, logged step.
pub struct WindowReader {
    samples: Box<dyn Iterator<Item = AppResult<f32>>>,
    channels: usize,
    in_rate: usize,
    window_frames: usize,
    overlap_frames: usize,
    /// Mono tail of the previous window, prepended to the next (the overlap).
    carry: Vec<f32>,
    carry_start_frame: u64,
    next_new_frame: u64,
    done: bool,
}

impl Iterator for WindowReader {
    type Item = AppResult<AudioWindow>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.done {
            return None;
        }
        let mut mono = std::mem::take(&mut self.carry); // start with the overlap tail
        let start_frame = if mono.is_empty() { self.next_new_frame } else { self.carry_start_frame };
        let mut frame: Vec<f32> = Vec::with_capacity(self.channels);
        let mut new_read: u64 = 0;
        while mono.len() < self.window_frames {
            frame.clear();
            for _ in 0..self.channels {
                match self.samples.next() {
                    Some(Ok(s)) => frame.push(s),
                    Some(Err(e)) => {
                        self.done = true;
                        return Some(Err(e));
                    }
                    None => {
                        self.done = true;
                        break;
                    }
                }
            }
            if frame.len() < self.channels {
                break; // EOF (drop a partial trailing frame)
            }
            mono.push(frame.iter().sum::<f32>() / self.channels as f32); // downmix
            new_read += 1;
        }
        self.next_new_frame += new_read;
        // No fresh audio (only the already-emitted overlap remained at EOF).
        if new_read == 0 {
            self.done = true;
            return None;
        }
        let window_end_frame = start_frame + mono.len() as u64;
        if !self.done && self.overlap_frames > 0 && mono.len() > self.overlap_frames {
            self.carry = mono[mono.len() - self.overlap_frames..].to_vec();
            self.carry_start_frame = window_end_frame - self.overlap_frames as u64;
        }
        let start_secs = start_frame as f64 / self.in_rate as f64;
        let end_secs = window_end_frame as f64 / self.in_rate as f64;
        match resample_mono(&mono, self.in_rate, TARGET_RATE_HZ as usize) {
            Ok(samples_16k_mono) => Some(Ok(AudioWindow { samples_16k_mono, start_secs, end_secs })),
            Err(e) => {
                self.done = true;
                Some(Err(e))
            }
        }
    }
}

/// Open a WAV and stream it as 16 kHz mono windows of `window_secs`, overlapping
/// by `overlap_secs`.
pub fn windows(path: &Path, window_secs: f64, overlap_secs: f64) -> AppResult<WindowReader> {
    let reader = WavReader::open(path).map_err(wav_err)?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let in_rate = spec.sample_rate.max(1) as usize;
    let window_frames = ((window_secs * in_rate as f64) as usize).max(1);
    let overlap_frames = ((overlap_secs * in_rate as f64) as usize).min(window_frames.saturating_sub(1));
    let samples = f32_samples(reader)?;
    Ok(WindowReader {
        samples,
        channels,
        in_rate,
        window_frames,
        overlap_frames,
        carry: Vec::new(),
        carry_start_frame: 0,
        next_new_frame: 0,
        done: false,
    })
}

/// Resample a mono `f32` buffer to `out_rate` (rubato FFT). A no-op when the
/// rates already match. The rate change is logged (no logging lib per the stack
/// rule — `eprintln!` to stderr).
pub fn resample_mono(input: &[f32], in_rate: usize, out_rate: usize) -> AppResult<Vec<f32>> {
    if in_rate == out_rate || input.is_empty() {
        return Ok(input.to_vec());
    }
    eprintln!("[stt] resample {in_rate} Hz -> {out_rate} Hz ({} frames)", input.len());
    let mut rs = FftFixedInOut::<f32>::new(in_rate, out_rate, 2048, 1)
        .map_err(|e| AppError::Internal(format!("resampler init: {e}")))?;
    let mut out: Vec<f32> = Vec::with_capacity(input.len() * out_rate / in_rate + 64);
    let mut pos = 0usize;
    loop {
        let need = rs.input_frames_next();
        if pos + need > input.len() {
            break;
        }
        let res = rs.process(&[&input[pos..pos + need]], None)
            .map_err(|e| AppError::Internal(format!("resample: {e}")))?;
        out.extend_from_slice(&res[0]);
        pos += need;
    }
    if pos < input.len() {
        let res = rs.process_partial(Some(&[&input[pos..]]), None)
            .map_err(|e| AppError::Internal(format!("resample tail: {e}")))?;
        out.extend_from_slice(&res[0]);
    }
    Ok(out)
}

/// Encode 16 kHz mono PCM as a 16-bit WAV in memory — the `/inference` payload.
pub fn encode_wav_16k_mono(samples: &[f32]) -> AppResult<Vec<u8>> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE_HZ,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::<u8>::new());
    {
        let mut w = WavWriter::new(&mut cursor, spec).map_err(|e| AppError::Internal(format!("wav init: {e}")))?;
        for &s in samples {
            let v = (s.clamp(-1.0, 1.0) * 32_767.0).round() as i16;
            w.write_sample(v).map_err(|e| AppError::Internal(format!("wav write: {e}")))?;
        }
        w.finalize().map_err(|e| AppError::Internal(format!("wav finalize: {e}")))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Write a sine WAV: `channels`-channel, `rate` Hz, `frames` frames, 16-bit.
    fn write_wav(path: &Path, rate: u32, channels: u16, frames: usize) {
        let spec = WavSpec { channels, sample_rate: rate, bits_per_sample: 16, sample_format: SampleFormat::Int };
        let mut w = WavWriter::create(path, spec).unwrap();
        for i in 0..frames {
            let v = ((i as f32 / rate as f32 * 440.0 * std::f32::consts::TAU).sin() * 16_000.0) as i16;
            for _ in 0..channels {
                w.write_sample(v).unwrap();
            }
        }
        w.finalize().unwrap();
    }

    #[test]
    fn probe_reports_decoded_truth() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.wav");
        write_wav(&p, 44_100, 2, 44_100); // exactly 1.0s of 44.1k stereo
        let spec = probe(&p).unwrap();
        assert_eq!(spec.sample_rate_hz, 44_100);
        assert_eq!(spec.channels, 2);
        assert!((spec.duration_secs - 1.0).abs() < 1e-6, "duration from frames, got {}", spec.duration_secs);
    }

    #[test]
    fn windows_downmix_stereo_and_resample_to_16k() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("s.wav");
        write_wav(&p, 44_100, 2, 44_100); // 1s, 44.1k, stereo
        let wins: Vec<_> = windows(&p, 30.0, 1.0).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(wins.len(), 1, "1s fits one 30s window");
        let n = wins[0].samples_16k_mono.len();
        // ~16000 frames out of ~44100 in (allow FFT-chunk rounding).
        assert!((15_500..=16_500).contains(&n), "resampled length {n} ~ 16000");
    }

    #[test]
    fn sixteen_k_mono_passes_through_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("m.wav");
        write_wav(&p, 16_000, 1, 16_000); // 1s already at target
        let wins: Vec<_> = windows(&p, 30.0, 1.0).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(wins[0].samples_16k_mono.len(), 16_000, "no resample, same length");
    }

    #[test]
    fn long_audio_splits_into_overlapping_bounded_windows() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("long.wav");
        write_wav(&p, 16_000, 1, 16_000 * 70); // 70s
        let wins: Vec<_> = windows(&p, 30.0, 1.0).unwrap().collect::<Result<_, _>>().unwrap();
        // [0,30] [29,59] [58,70] — each advances 29s after the first.
        assert_eq!(wins.len(), 3, "70s, 30s windows, 1s overlap -> 3 windows");
        assert!((wins[0].start_secs - 0.0).abs() < 1e-9);
        assert!((wins[2].end_secs - 70.0).abs() < 0.01);
        // windows OVERLAP by ~1s: window n+1 starts 1s before window n ended.
        assert!((wins[1].start_secs - (wins[0].end_secs - 1.0)).abs() < 1e-6, "1s overlap");
        assert!((wins[2].start_secs - (wins[1].end_secs - 1.0)).abs() < 1e-6);
    }

    #[test]
    fn encoded_wav_round_trips_as_16k_mono() {
        let pcm: Vec<f32> = (0..16_000).map(|i| (i as f32 / 100.0).sin() * 0.5).collect();
        let bytes = encode_wav_16k_mono(&pcm).unwrap();
        let r = WavReader::new(Cursor::new(bytes)).unwrap();
        assert_eq!(r.spec().sample_rate, 16_000);
        assert_eq!(r.spec().channels, 1);
        assert_eq!(r.len(), 16_000);
    }
}
