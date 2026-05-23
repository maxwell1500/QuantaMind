use crate::errors::AppError;

pub struct GgufReader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> GgufReader<'a> {
    pub fn new(bytes: &'a [u8]) -> Self { Self { bytes, pos: 0 } }
    pub fn pos(&self) -> usize { self.pos }

    fn take(&mut self, n: usize) -> Result<&'a [u8], AppError> {
        if self.pos + n > self.bytes.len() {
            return Err(AppError::Validation(format!(
                "GGUF truncated: need {n} bytes at offset {}, have {}",
                self.pos, self.bytes.len() - self.pos
            )));
        }
        let out = &self.bytes[self.pos..self.pos + n];
        self.pos += n;
        Ok(out)
    }

    pub fn u8(&mut self) -> Result<u8, AppError> { Ok(self.take(1)?[0]) }
    pub fn u16(&mut self) -> Result<u16, AppError> { Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn u32(&mut self) -> Result<u32, AppError> { Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn u64(&mut self) -> Result<u64, AppError> { Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn i32(&mut self) -> Result<i32, AppError> { Ok(i32::from_le_bytes(self.take(4)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn i64(&mut self) -> Result<i64, AppError> { Ok(i64::from_le_bytes(self.take(8)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn f32(&mut self) -> Result<f32, AppError> { Ok(f32::from_le_bytes(self.take(4)?.try_into().expect("take(N) returns exactly N bytes"))) }

    pub fn magic(&mut self, expected: &[u8; 4]) -> Result<(), AppError> {
        let got = self.take(4)?;
        if got == expected { Ok(()) }
        else { Err(AppError::Validation(format!("expected magic {expected:?}, got {got:?}"))) }
    }

    pub fn string(&mut self) -> Result<String, AppError> {
        let len = self.u64()? as usize;
        let bytes = self.take(len)?;
        String::from_utf8(bytes.to_vec())
            .map_err(|e| AppError::Validation(format!("bad UTF-8 in GGUF string: {e}")))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum GgufValue {
    U8(u8), I8(i8), U16(u16), I16(i16),
    U32(u32), I32(i32), F32(f32), Bool(bool),
    String(String), U64(u64), I64(i64), F64(f64),
    // Array carries no payload here — we drain the bytes but don't keep
    // values, since callers in M.7 only inspect scalar metadata.
    ArraySkipped,
}

fn skip_value(r: &mut GgufReader, tag: u32) -> Result<(), AppError> {
    match tag {
        0 | 1 | 7 => { r.u8()?; }
        2 | 3 => { r.u16()?; }
        4..=6 => { r.u32()?; }
        8 => { r.string()?; }
        9 => {
            let elem = r.u32()?;
            let n = r.u64()? as usize;
            for _ in 0..n { skip_value(r, elem)?; }
        }
        10..=12 => { r.u64()?; }
        _ => return Err(AppError::Validation(format!("unknown GGUF value tag: {tag}"))),
    }
    Ok(())
}

pub fn read_value(r: &mut GgufReader) -> Result<GgufValue, AppError> {
    let tag = r.u32()?;
    match tag {
        0 => Ok(GgufValue::U8(r.u8()?)),
        1 => Ok(GgufValue::I8(r.u8()? as i8)),
        4 => Ok(GgufValue::U32(r.u32()?)),
        5 => Ok(GgufValue::I32(r.i32()?)),
        6 => Ok(GgufValue::F32(r.f32()?)),
        7 => Ok(GgufValue::Bool(r.u8()? != 0)),
        8 => Ok(GgufValue::String(r.string()?)),
        9 => {
            let elem = r.u32()?;
            let n = r.u64()? as usize;
            for _ in 0..n { skip_value(r, elem)?; }
            Ok(GgufValue::ArraySkipped)
        }
        10 => Ok(GgufValue::U64(r.u64()?)),
        11 => Ok(GgufValue::I64(r.i64()?)),
        _ => Err(AppError::Validation(format!("unsupported GGUF value tag: {tag}"))),
    }
}
