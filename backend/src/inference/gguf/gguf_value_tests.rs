use super::*;
use crate::inference::gguf::gguf_reader::GgufReader;

// Each case: a value-type tag (u32 LE) followed by its little-endian payload.
fn read_one(bytes: &[u8]) -> GgufValue {
    let mut r = GgufReader::new(bytes);
    read_value(&mut r).expect("read_value should accept every in-spec tag")
}

#[test]
fn reads_u16_scalar_tag_2() {
    // tag 2 (UINT16), value 0x0102 = 258
    let v = read_one(&[2, 0, 0, 0, 0x02, 0x01]);
    assert_eq!(v, GgufValue::U16(258));
}

#[test]
fn reads_i16_scalar_tag_3() {
    // tag 3 (INT16), value -2 = 0xFFFE
    let v = read_one(&[3, 0, 0, 0, 0xFE, 0xFF]);
    assert_eq!(v, GgufValue::I16(-2));
}

#[test]
fn reads_f64_scalar_tag_12() {
    // tag 12 (FLOAT64), value 1.5
    let mut bytes = vec![12, 0, 0, 0];
    bytes.extend_from_slice(&1.5f64.to_le_bytes());
    assert_eq!(read_one(&bytes), GgufValue::F64(1.5));
}

#[test]
fn rejects_genuinely_unknown_tag() {
    // tag 99 is outside the GGUF value-type spec (0..=12)
    let mut r = GgufReader::new(&[99, 0, 0, 0]);
    let err = read_value(&mut r).expect_err("out-of-spec tag must error");
    assert!(format!("{err:?}").contains("unknown GGUF value tag"));
}
