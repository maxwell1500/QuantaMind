use crate::persistence::publish::row::PublishRow;

/// Locally re-run the SAME plausibility checks the server enforces, so a malformed
/// row never enters the batch — the server becomes a backstop, not the primary
/// gate. Returns the index of the FIRST offending row plus a reason naming the
/// field + value (mirrors the server's 422-with-index), or `Ok(())` for a clean
/// batch. Decorative on the client by design; authoritative validation is server-side.
pub fn pre_validate(rows: &[PublishRow]) -> Result<(), (usize, String)> {
    for (i, r) in rows.iter().enumerate() {
        let bad = |msg: String| Err((i, msg));
        if r.model.trim().is_empty() {
            return bad("model is empty".into());
        }
        if r.quant.trim().is_empty() {
            return bad("quant is empty".into());
        }
        if r.cohort_key.trim().is_empty() {
            return bad("cohort_key is empty".into());
        }
        let m = &r.metrics;
        if !(0.0..=1.0).contains(&m.pass_k) || m.pass_k.is_nan() {
            return bad(format!("pass_k {} out of range 0..=1", m.pass_k));
        }
        if let Some(e) = m.effort {
            if !(e > 0.0) {
                return bad(format!("effort {e} must be > 0"));
            }
        }
        if let Some(s) = m.avg_steps {
            if !(s >= 0.0) {
                return bad(format!("avg_steps {s} must be >= 0"));
            }
        }
        if r.collection_name.trim().is_empty() {
            return bad("collection_name is empty".into());
        }
        if r.collection_hash.trim().is_empty() {
            return bad("collection_hash is empty".into());
        }
        for t in &r.by_tier {
            if !(0.0..=1.0).contains(&t.pass_k_rate) || t.pass_k_rate.is_nan() {
                return bad(format!("by_tier pass_k_rate {} out of range 0..=1", t.pass_k_rate));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "validate_tests.rs"]
mod tests;
