/// f16 KV-cache size in bytes for a transformer at a given context length:
/// `2 (K+V) × layers × kv_heads × head_dim × 2 (bytes/f16) × ctx`, where
/// `head_dim = embedding_length / head_count`. The canonical, tested formula —
/// the frontend calls this (never re-implements it). Returns 0 if `head_count`
/// is 0 (avoids divide-by-zero on incomplete metadata).
pub fn calculate_kv_cache_bytes(
    layers: u64,
    head_count: u64,
    head_count_kv: u64,
    embedding_length: u64,
    context_length: u64,
) -> u64 {
    if head_count == 0 {
        return 0;
    }
    let head_dim = embedding_length / head_count;
    2 * layers * head_count_kv * head_dim * 2 * context_length
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llama3_8b_kv_at_8k_is_one_gib() {
        // Llama-3-8B (GQA): 32 layers, 32 heads, 8 KV heads, 4096 emb, head_dim 128.
        // 2 × 32 × 8 × 128 × 2 × 8192 = 1,073,741,824 bytes = exactly 1 GiB.
        let kv = calculate_kv_cache_bytes(32, 32, 8, 4096, 8192);
        assert_eq!(kv, 1_073_741_824);
    }

    #[test]
    fn scales_linearly_with_context() {
        let a = calculate_kv_cache_bytes(32, 32, 8, 4096, 8192);
        let b = calculate_kv_cache_bytes(32, 32, 8, 4096, 16384);
        assert_eq!(b, a * 2);
    }

    #[test]
    fn zero_head_count_does_not_panic() {
        assert_eq!(calculate_kv_cache_bytes(32, 0, 8, 4096, 8192), 0);
    }
}
