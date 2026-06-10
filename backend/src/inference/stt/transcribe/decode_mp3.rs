use crate::errors::{AppError, AppResult};
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions};
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

fn dec_err(e: impl std::fmt::Display) -> AppError {
    AppError::Validation(format!("audio decode failed: {e}"))
}

/// A lazily-decoded, normalized-`f32` interleaved sample stream over a compressed
/// file (MP3 …). Decodes one packet at a time into a small buffer, so a long file
/// never lands in memory at once.
struct SymphoniaSamples {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    buf: Vec<f32>,
    pos: usize,
    done: bool,
}

impl Iterator for SymphoniaSamples {
    type Item = AppResult<f32>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.pos < self.buf.len() {
                let s = self.buf[self.pos];
                self.pos += 1;
                return Some(Ok(s));
            }
            if self.done {
                return None;
            }
            match self.format.next_packet() {
                Ok(packet) => {
                    if packet.track_id() != self.track_id {
                        continue;
                    }
                    match self.decoder.decode(&packet) {
                        Ok(decoded) => {
                            let spec = *decoded.spec();
                            let mut sb = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                            sb.copy_interleaved_ref(decoded);
                            self.buf = sb.samples().to_vec();
                            self.pos = 0;
                        }
                        // A single corrupt packet is skippable, not fatal.
                        Err(SymError::DecodeError(_)) => continue,
                        Err(e) => {
                            self.done = true;
                            return Some(Err(dec_err(e)));
                        }
                    }
                }
                // Clean end of stream.
                Err(SymError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                    self.done = true;
                    return None;
                }
                Err(SymError::ResetRequired) => {
                    self.done = true;
                    return None;
                }
                Err(e) => {
                    self.done = true;
                    return Some(Err(dec_err(e)));
                }
            }
        }
    }
}

/// Open a compressed audio file: returns `(channels, sample_rate, declared
/// duration if the container reports it, streaming f32 sample iterator)`. The
/// declared duration is `None` for VBR MP3 with no frame count — the caller
/// computes the true decoded length while streaming.
pub fn open_symphonia(
    path: &Path,
) -> AppResult<(u16, u32, Option<f64>, Box<dyn Iterator<Item = AppResult<f32>> + Send>)> {
    let file = std::fs::File::open(path).map_err(|e| AppError::Io(e.to_string()))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(dec_err)?;
    let format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| AppError::Validation("audio file has no decodable track".into()))?;
    let params = track.codec_params.clone();
    let track_id = track.id;
    let sample_rate = params
        .sample_rate
        .ok_or_else(|| AppError::Validation("audio file has no sample rate".into()))?;
    let channels = params.channels.map(|c| c.count() as u16).unwrap_or(1);
    let declared = match (params.n_frames, params.time_base) {
        (Some(n), _) => Some(n as f64 / sample_rate as f64),
        _ => None,
    };
    let decoder = symphonia::default::get_codecs()
        .make(&params, &DecoderOptions::default())
        .map_err(dec_err)?;
    let iter = SymphoniaSamples { format, decoder, track_id, buf: Vec::new(), pos: 0, done: false };
    Ok((channels, sample_rate, declared, Box::new(iter)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{SampleFormat, WavSpec, WavWriter};

    // No MP3 encoder is available in CI, so exercise the symphonia decode machinery
    // (probe → packet loop → SampleBuffer → interleaved f32) via a WAV. MP3 shares
    // this exact path with a different demuxer/decoder.
    #[test]
    fn decodes_via_symphonia_with_correct_metadata_and_sample_count() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("t.wav");
        let spec = WavSpec { channels: 2, sample_rate: 22_050, bits_per_sample: 16, sample_format: SampleFormat::Int };
        let mut w = WavWriter::create(&p, spec).unwrap();
        for i in 0..22_050 {
            let v = (i % 100) as i16;
            w.write_sample(v).unwrap();
            w.write_sample(v).unwrap(); // stereo
        }
        w.finalize().unwrap();

        let (ch, rate, declared, iter) = open_symphonia(&p).unwrap();
        assert_eq!(ch, 2);
        assert_eq!(rate, 22_050);
        assert!(declared.map(|d| (d - 1.0).abs() < 0.05).unwrap_or(false), "~1s declared, got {declared:?}");
        let n = iter.collect::<Result<Vec<_>, _>>().unwrap().len();
        assert!((44_000..=44_200).contains(&n), "~22050 frames x 2 ch interleaved, got {n}");
    }
}
