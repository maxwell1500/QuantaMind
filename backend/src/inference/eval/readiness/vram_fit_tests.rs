use super::estimate;

const GIB: u64 = 1_073_741_824;
// Llama-3-8B (GQA): 32 layers, 32 heads, 8 KV heads, 4096 emb → KV @ 8k = exactly 1 GiB.
fn llama3_8b(weights: u64, ctx: u32, cap: u64) -> super::MemoryProfile {
    estimate(weights, 32, 32, 8, 4096, ctx, cap)
}

#[test]
fn kv_cache_uses_the_canonical_formula() {
    let p = llama3_8b(5 * GIB, 8192, 16 * GIB);
    assert_eq!(p.kv_cache_bytes, GIB); // 1 GiB at 8k context
    assert_eq!(p.total_bytes, 6 * GIB); // 5 GiB weights + 1 GiB cache
    assert_eq!(p.context_length, 8192);
}

#[test]
fn fits_comfortably_below_the_cap() {
    let p = llama3_8b(5 * GIB, 8192, 16 * GIB); // 6 GiB total vs 16 GiB cap
    assert!(p.fits);
    assert!(!p.pressure); // 6/16 = 37%, well under the 85% band
}

#[test]
fn fits_but_flags_pressure_near_the_ceiling() {
    // 6 GiB total vs a 6.5 GiB cap → 92% of cap → fits with pressure.
    let cap = 6 * GIB + GIB / 2;
    let p = llama3_8b(5 * GIB, 8192, cap);
    assert!(p.fits);
    assert!(p.pressure);
}

#[test]
fn does_not_fit_when_total_exceeds_cap() {
    let p = llama3_8b(5 * GIB, 8192, 5 * GIB); // 6 GiB total vs 5 GiB cap
    assert!(!p.fits);
    assert!(!p.pressure); // pressure only meaningful when it fits
}

#[test]
fn larger_context_grows_the_cache_and_can_tip_the_fit() {
    let small = llama3_8b(5 * GIB, 8192, 7 * GIB); // 6 GiB total → fits
    let large = llama3_8b(5 * GIB, 16384, 7 * GIB); // 5 + 2 GiB cache = 7 GiB → still fits exactly
    assert!(small.fits);
    assert_eq!(large.kv_cache_bytes, 2 * GIB);
    assert!(large.fits); // 7 GiB total == 7 GiB cap (≤)
    let tighter = llama3_8b(5 * GIB, 16384, 7 * GIB - 1);
    assert!(!tighter.fits); // one byte over → won't fit
}
