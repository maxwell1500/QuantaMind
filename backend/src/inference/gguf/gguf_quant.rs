/// Map GGUF's `general.file_type` u32 enum to a quantization label.
/// Returns None for values we don't recognize (caller may fall back
/// to filename inspection).
pub fn file_type_to_quant(file_type: u32) -> Option<&'static str> {
    match file_type {
        0 => Some("F32"),
        1 => Some("F16"),
        2 => Some("Q4_0"),
        3 => Some("Q4_1"),
        7 => Some("Q8_0"),
        8 => Some("Q5_0"),
        9 => Some("Q5_1"),
        10 => Some("Q2_K"),
        11 => Some("Q3_K_S"),
        12 => Some("Q3_K_M"),
        13 => Some("Q3_K_L"),
        14 => Some("Q4_K_S"),
        15 => Some("Q4_K_M"),
        16 => Some("Q5_K_S"),
        17 => Some("Q5_K_M"),
        18 => Some("Q6_K"),
        25 => Some("IQ4_NL"),
        30 => Some("IQ4_XS"),
        32 => Some("BF16"),
        _ => None,
    }
}

/// Inspect a filename for an embedded quant suffix. Matches `Q4_K_M`,
/// `Q5_K_M`, `Q8_0`, `Q4_0`, `F16`, `BF16`, etc. — uppercase the
/// candidate substring so we accept `q4_k_m.gguf`.
pub fn quant_from_filename(filename: &str) -> Option<String> {
    let up = filename.to_uppercase();
    const CANDIDATES: &[&str] = &[
        "Q2_K_S", "Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q3_K",
        "Q4_K_S", "Q4_K_M", "Q4_K", "Q4_0", "Q4_1",
        "Q5_K_S", "Q5_K_M", "Q5_K", "Q5_0", "Q5_1",
        "Q6_K", "Q8_0",
        "IQ4_NL", "IQ4_XS", "IQ3_S", "IQ3_M", "IQ2_S", "IQ2_M", "IQ1_S", "IQ1_M",
        "BF16", "F16", "F32",
    ];
    CANDIDATES.iter().find(|c| up.contains(*c)).map(|s| (*s).to_string())
}
