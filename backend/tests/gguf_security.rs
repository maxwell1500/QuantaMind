use quantamind_lib::errors::AppError;
use quantamind_lib::inference::gguf::inspect_gguf_bytes;

#[test]
fn malicious_huge_string_length_rejected_not_panicked() {
    // Header claims a u64 key string of length u64::MAX. Without
    // bounds check the take(N) arithmetic would overflow (panic in
    // debug, wrap in release) or attempt a huge slice. With the fix,
    // a clean Validation error is returned.
    let mut b = b"GGUF".to_vec();
    b.extend_from_slice(&3u32.to_le_bytes());
    b.extend_from_slice(&0u64.to_le_bytes());
    b.extend_from_slice(&1u64.to_le_bytes());
    b.extend_from_slice(&u64::MAX.to_le_bytes());
    match inspect_gguf_bytes(&b) {
        Err(AppError::Validation(_)) => {}
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn malicious_huge_array_count_rejected_not_panicked() {
    // Build a header containing one KV pair whose value is an array
    // of u8 with claimed count u64::MAX. Pre-fix this would iterate
    // 2^64 times (or truncate on 32-bit). Post-fix it errors clean.
    let mut b = b"GGUF".to_vec();
    b.extend_from_slice(&3u32.to_le_bytes());
    b.extend_from_slice(&0u64.to_le_bytes());
    b.extend_from_slice(&1u64.to_le_bytes());
    let key = "evil.arr";
    b.extend_from_slice(&(key.len() as u64).to_le_bytes());
    b.extend_from_slice(key.as_bytes());
    b.extend_from_slice(&9u32.to_le_bytes());          // value tag = array
    b.extend_from_slice(&0u32.to_le_bytes());          // elem tag = u8
    b.extend_from_slice(&u64::MAX.to_le_bytes());      // count
    match inspect_gguf_bytes(&b) {
        Err(AppError::Validation(_)) => {}
        other => panic!("expected Validation, got {other:?}"),
    }
}
