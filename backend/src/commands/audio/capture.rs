use crate::commands::stt::transcribe::write_scratch_wav;
use crate::errors::{AppError, AppResult};
use crate::sync::MutexExt;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use hound::{SampleFormat as WavFmt, WavSpec, WavWriter};
use serde::Serialize;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::AppHandle;

/// The result of a finished recording.
#[derive(Serialize)]
pub struct RecordingResult {
    pub path: String,
    /// False when the whole take is essentially silent (muted/wrong mic) — the UI
    /// surfaces "no audio detected" rather than a blank "successful" run.
    pub had_audio: bool,
}

struct Active {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    buffer: Arc<Mutex<Vec<f32>>>,
    level: Arc<AtomicU32>,
    sample_rate: u32,
    channels: u16,
}

/// The single in-progress recording. The cpal `Stream` is `!Send`, so it lives
/// entirely on the capture thread — this state holds only `Send` handles.
#[derive(Default)]
pub struct CaptureState {
    inner: Mutex<Option<Active>>,
}

impl Drop for CaptureState {
    fn drop(&mut self) {
        if let Some(mut a) = self.inner.lock_recover().take() {
            a.stop.store(true, Ordering::Relaxed);
            if let Some(h) = a.handle.take() {
                let _ = h.join();
            }
        }
    }
}

fn cpal_err(e: cpal::StreamError) {
    eprintln!("[stt] mic stream error: {e}");
}

/// Append a chunk to the buffer + publish its RMS as the live level.
fn ingest(samples: &[f32], buffer: &Mutex<Vec<f32>>, level: &AtomicU32) {
    buffer.lock_recover().extend_from_slice(samples);
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    let rms = (sum / samples.len().max(1) as f32).sqrt();
    level.store(rms.to_bits(), Ordering::Relaxed);
}

fn build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    fmt: SampleFormat,
    buffer: Arc<Mutex<Vec<f32>>>,
    level: Arc<AtomicU32>,
) -> Result<cpal::Stream, String> {
    let res = match fmt {
        SampleFormat::F32 => {
            let (b, l) = (buffer, level);
            device.build_input_stream(config, move |d: &[f32], _| ingest(d, &b, &l), cpal_err, None)
        }
        SampleFormat::I16 => {
            let (b, l) = (buffer, level);
            device.build_input_stream(
                config,
                move |d: &[i16], _| {
                    let f: Vec<f32> = d.iter().map(|&v| v as f32 / 32_768.0).collect();
                    ingest(&f, &b, &l);
                },
                cpal_err,
                None,
            )
        }
        SampleFormat::U16 => {
            let (b, l) = (buffer, level);
            device.build_input_stream(
                config,
                move |d: &[u16], _| {
                    let f: Vec<f32> = d.iter().map(|&v| (v as f32 - 32_768.0) / 32_768.0).collect();
                    ingest(&f, &b, &l);
                },
                cpal_err,
                None,
            )
        }
        other => return Err(format!("unsupported mic sample format: {other:?}")),
    };
    res.map_err(|e| format!("couldn't open the microphone: {e}"))
}

/// Start capturing the default input device. The mic's TCC prompt is driven by
/// `NSMicrophoneUsageDescription` from `Info.plist`, which Tauri's
/// `generate_context!` embeds into the binary (covers `tauri dev` too).
#[tauri::command]
pub fn start_recording(state: tauri::State<'_, CaptureState>) -> Result<(), AppError> {
    let mut guard = state.inner.lock_recover();
    if guard.is_some() {
        return Err(AppError::Validation("already recording".into()));
    }
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| AppError::Validation("no microphone found".into()))?;
    let supported = device
        .default_input_config()
        .map_err(|e| AppError::Internal(format!("mic config: {e}")))?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let sample_format = supported.sample_format();
    let stream_config: cpal::StreamConfig = supported.into();

    let buffer = Arc::new(Mutex::new(Vec::<f32>::new()));
    let level = Arc::new(AtomicU32::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<Result<(), String>>();

    let (b, l, s) = (buffer.clone(), level.clone(), stop.clone());
    let handle = std::thread::spawn(move || {
        // The Stream is built, played, and dropped all on this thread (it's !Send).
        match build_stream(&device, &stream_config, sample_format, b, l) {
            Ok(stream) => {
                if let Err(e) = stream.play() {
                    let _ = tx.send(Err(format!("mic start: {e}")));
                    return;
                }
                let _ = tx.send(Ok(()));
                while !s.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(50));
                }
                drop(stream);
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
    });

    match rx.recv() {
        Ok(Ok(())) => {
            *guard = Some(Active { stop, handle: Some(handle), buffer, level, sample_rate, channels });
            Ok(())
        }
        Ok(Err(e)) => {
            let _ = handle.join();
            Err(AppError::Internal(e))
        }
        Err(_) => Err(AppError::Internal("mic capture thread died on startup".into())),
    }
}

/// Stop capturing, encode the take as a WAV (its native rate/channels — P1
/// resamples to 16 kHz), and return the scratch path + whether any audio landed.
#[tauri::command]
pub fn stop_recording(
    app: AppHandle,
    state: tauri::State<'_, CaptureState>,
) -> Result<RecordingResult, AppError> {
    let active = state.inner.lock_recover().take();
    let Some(mut active) = active else {
        return Err(AppError::Validation("not recording".into()));
    };
    active.stop.store(true, Ordering::Relaxed);
    if let Some(h) = active.handle.take() {
        let _ = h.join();
    }
    let samples = std::mem::take(&mut *active.buffer.lock_recover());
    let had_audio = samples.iter().fold(0f32, |m, &s| m.max(s.abs())) > 0.005;
    let bytes = encode_wav(&samples, active.sample_rate, active.channels)?;
    let path = write_scratch_wav(&app, &bytes)?;
    Ok(RecordingResult { path, had_audio })
}

/// The current input level (RMS, 0..~1) while recording — polled for the meter.
#[tauri::command]
pub fn recording_level(state: tauri::State<'_, CaptureState>) -> f32 {
    state
        .inner
        .lock_recover()
        .as_ref()
        .map(|a| f32::from_bits(a.level.load(Ordering::Relaxed)))
        .unwrap_or(0.0)
}

fn encode_wav(samples: &[f32], rate: u32, channels: u16) -> AppResult<Vec<u8>> {
    let spec = WavSpec { channels: channels.max(1), sample_rate: rate, bits_per_sample: 16, sample_format: WavFmt::Int };
    let mut cursor = Cursor::new(Vec::<u8>::new());
    {
        let mut w = WavWriter::new(&mut cursor, spec).map_err(|e| AppError::Internal(format!("wav: {e}")))?;
        for &s in samples {
            w.write_sample((s.clamp(-1.0, 1.0) * 32_767.0) as i16)
                .map_err(|e| AppError::Internal(format!("wav: {e}")))?;
        }
        w.finalize().map_err(|e| AppError::Internal(format!("wav: {e}")))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_wav_writes_a_readable_header() {
        let pcm: Vec<f32> = (0..1000).map(|i| (i as f32 / 50.0).sin() * 0.4).collect();
        let bytes = encode_wav(&pcm, 44_100, 1).unwrap();
        let r = hound::WavReader::new(Cursor::new(bytes)).unwrap();
        assert_eq!(r.spec().sample_rate, 44_100);
        assert_eq!(r.spec().channels, 1);
        assert_eq!(r.len(), 1000);
    }

    #[test]
    fn level_is_zero_when_idle() {
        let st = CaptureState::default();
        assert_eq!(st.inner.lock_recover().as_ref().map(|_| 1).unwrap_or(0), 0);
    }
}
