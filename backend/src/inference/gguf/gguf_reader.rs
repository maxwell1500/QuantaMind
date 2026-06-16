use crate::errors::AppError;

pub struct GgufReader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> GgufReader<'a> {
    pub fn new(bytes: &'a [u8]) -> Self { Self { bytes, pos: 0 } }
    pub fn pos(&self) -> usize { self.pos }

    fn take(&mut self, n: usize) -> Result<&'a [u8], AppError> {
        let end = self.pos.checked_add(n).ok_or_else(|| AppError::Validation(
            format!("GGUF overflow: pos {} + n {n} exceeds usize", self.pos)
        ))?;
        if end > self.bytes.len() {
            return Err(AppError::Validation(format!(
                "GGUF truncated: need {n} bytes at offset {}, have {}",
                self.pos, self.bytes.len() - self.pos
            )));
        }
        let out = &self.bytes[self.pos..end];
        self.pos = end;
        Ok(out)
    }

    pub fn u8(&mut self) -> Result<u8, AppError> { Ok(self.take(1)?[0]) }
    pub fn u16(&mut self) -> Result<u16, AppError> { Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn u32(&mut self) -> Result<u32, AppError> { Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn u64(&mut self) -> Result<u64, AppError> { Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn i16(&mut self) -> Result<i16, AppError> { Ok(i16::from_le_bytes(self.take(2)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn i32(&mut self) -> Result<i32, AppError> { Ok(i32::from_le_bytes(self.take(4)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn i64(&mut self) -> Result<i64, AppError> { Ok(i64::from_le_bytes(self.take(8)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn f32(&mut self) -> Result<f32, AppError> { Ok(f32::from_le_bytes(self.take(4)?.try_into().expect("take(N) returns exactly N bytes"))) }
    pub fn f64(&mut self) -> Result<f64, AppError> { Ok(f64::from_le_bytes(self.take(8)?.try_into().expect("take(N) returns exactly N bytes"))) }

    pub fn magic(&mut self, expected: &[u8; 4]) -> Result<(), AppError> {
        let got = self.take(4)?;
        if got == expected { Ok(()) }
        else { Err(AppError::Validation(format!("expected magic {expected:?}, got {got:?}"))) }
    }

    pub fn string(&mut self) -> Result<String, AppError> {
        let len64 = self.u64()?;
        let len = usize::try_from(len64).map_err(|_| AppError::Validation(
            format!("GGUF string length {len64} exceeds usize on this platform")
        ))?;
        let bytes = self.take(len)?;
        String::from_utf8(bytes.to_vec())
            .map_err(|e| AppError::Validation(format!("bad UTF-8 in GGUF string: {e}")))
    }
}
