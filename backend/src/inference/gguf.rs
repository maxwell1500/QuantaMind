use crate::errors::AppError;
use crate::inference::gguf_family::family_from_architecture;
use crate::inference::gguf_quant::{file_type_to_quant, quant_from_filename};
use crate::inference::gguf_reader::{read_value, GgufReader, GgufValue};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

const HEADER_READ_BYTES: usize = 64 * 1024;
const MIN_FILE_SIZE: u64 = 64 * 1024;

#[derive(Serialize, Clone, Debug)]
pub struct GgufMetadata {
    pub architecture: String,
    pub parameter_count: Option<u64>,
    pub context_length: Option<u32>,
    pub quantization: Option<String>,
    pub family: String,
}

fn as_string(v: &GgufValue) -> Option<&str> {
    if let GgufValue::String(s) = v { Some(s.as_str()) } else { None }
}

fn as_u64(v: &GgufValue) -> Option<u64> {
    match v {
        GgufValue::U64(n) => Some(*n),
        GgufValue::U32(n) => Some(*n as u64),
        GgufValue::I64(n) if *n >= 0 => Some(*n as u64),
        GgufValue::I32(n) if *n >= 0 => Some(*n as u64),
        _ => None,
    }
}

pub fn inspect_gguf_bytes(bytes: &[u8]) -> Result<GgufMetadata, AppError> {
    let mut r = GgufReader::new(bytes);
    r.magic(b"GGUF")?;
    let version = r.u32()?;
    if !(1..=3).contains(&version) {
        return Err(AppError::Validation(format!("unsupported GGUF version: {version}")));
    }
    let _tensor_count = r.u64()?;
    let kv_count = r.u64()?;
    let mut kv: HashMap<String, GgufValue> = HashMap::with_capacity(kv_count as usize);
    for _ in 0..kv_count {
        let key = r.string()?;
        let value = read_value(&mut r)?;
        kv.insert(key, value);
    }

    let architecture = kv.get("general.architecture")
        .and_then(as_string).unwrap_or("").to_string();
    let parameter_count = kv.get("general.parameter_count").and_then(as_u64);
    let context_length = kv
        .get(&format!("{architecture}.context_length"))
        .and_then(as_u64)
        .map(|n| n.min(u32::MAX as u64) as u32);
    let quantization = kv
        .get("general.file_type")
        .and_then(|v| match v {
            GgufValue::U32(n) => Some(*n),
            _ => None,
        })
        .and_then(file_type_to_quant)
        .map(|s| s.to_string());
    let family = family_from_architecture(&architecture);

    Ok(GgufMetadata { architecture, parameter_count, context_length, quantization, family })
}

pub fn inspect_gguf(path: &Path) -> Result<GgufMetadata, AppError> {
    let ext_ok = path.extension().and_then(|e| e.to_str())
        .map(|s| s.eq_ignore_ascii_case("gguf")).unwrap_or(false);
    if !ext_ok {
        return Err(AppError::Validation(format!("not a .gguf file: {}", path.display())));
    }
    let md = fs::metadata(path).map_err(|e| AppError::Io(e.to_string()))?;
    if md.len() < MIN_FILE_SIZE {
        return Err(AppError::Validation(format!(
            "file too small to be a real GGUF: {} bytes", md.len()
        )));
    }
    let mut f = fs::File::open(path).map_err(|e| AppError::Io(e.to_string()))?;
    let mut buf = vec![0u8; HEADER_READ_BYTES];
    let n = f.read(&mut buf).map_err(|e| AppError::Io(e.to_string()))?;
    buf.truncate(n);
    let mut meta = inspect_gguf_bytes(&buf)?;
    if meta.quantization.is_none() {
        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            meta.quantization = quant_from_filename(name);
        }
    }
    Ok(meta)
}
