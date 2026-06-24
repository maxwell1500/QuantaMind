/// Padding construction for the context-cliff probe. All slicing is
/// char-boundary-safe (`safe_boundary`) so a multi-byte UTF-8 preset or user file
/// can never panic the engine; source text is decoded once and only sliced here.

/// 4 KB accumulation chunk — the unit the spec streams padding in. Slicing the
/// final partial chunk at a char boundary is what keeps the byte target honest
/// without ever splitting a code point.
const CHUNK_BYTES: usize = 4096;

/// The largest char boundary `<= byte_idx` (clamped to the string length). Never
/// panics: a byte index that lands mid-code-point walks back to the start of that
/// code point. This is the single guard behind every slice in this module.
pub fn safe_boundary(s: &str, byte_idx: usize) -> usize {
    let mut i = byte_idx.min(s.len());
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// Build ~`target_bytes` of padding by cycling `source`, accumulating in 4 KB
/// chunks and cutting the final piece at a char boundary. The result is `<=`
/// `target_bytes` (never over, never mid-code-point); the engine measures the
/// model's REAL `prompt_eval_count` afterward — this byte target is only a seed.
pub fn build_padding(source: &str, target_bytes: usize) -> String {
    if source.is_empty() || target_bytes == 0 {
        return String::new();
    }
    let mut out = String::with_capacity(target_bytes);
    while out.len() < target_bytes {
        let remaining = target_bytes - out.len();
        let take = remaining.min(CHUNK_BYTES);
        if take >= source.len() {
            out.push_str(source);
        } else {
            // Final / partial chunk: cut the source at a safe boundary so we land
            // at or just under the target without splitting a code point.
            let cut = safe_boundary(source, take);
            if cut == 0 {
                break; // a remaining smaller than the first code point — stop clean.
            }
            out.push_str(&source[..cut]);
        }
    }
    out
}

/// Inject `needle` into `padding` at the fractional `depth` (0.0 = front,
/// 1.0 = back), splitting at a char-safe boundary. Mid-document depths are the
/// point — tail-appending would only test recency, the model's strongest position.
/// Blank-line separators keep the needle visually distinct from the filler.
pub fn inject_at_depth(padding: &str, needle: &str, depth: f32) -> String {
    let frac = depth.clamp(0.0, 1.0);
    let raw = (padding.len() as f32 * frac) as usize;
    let pos = safe_boundary(padding, raw);
    let mut out = String::with_capacity(padding.len() + needle.len() + 4);
    out.push_str(&padding[..pos]);
    if pos > 0 {
        out.push_str("\n\n");
    }
    out.push_str(needle);
    out.push_str("\n\n");
    out.push_str(&padding[pos..]);
    out
}

#[cfg(test)]
#[path = "padding_tests.rs"]
mod tests;
