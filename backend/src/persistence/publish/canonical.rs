use crate::errors::AppResult;
use crate::persistence::publish::row::PublishRow;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// Re-emit a JSON value with every object's keys sorted, recursively. The hash is
/// computed over this canonical form so two clients (or a client and the server)
/// that build the same logical batch produce byte-identical JSON — an unordered
/// map would change the hash and the server would read it as tampered.
fn canonicalize(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            // BTreeMap iteration is key-sorted; collecting back into a serde Map
            // preserves that order regardless of serde_json's preserve_order feature.
            let sorted: std::collections::BTreeMap<&String, Value> =
                m.iter().map(|(k, val)| (k, canonicalize(val))).collect();
            Value::Object(sorted.into_iter().map(|(k, val)| (k.clone(), val)).collect::<Map<_, _>>())
        }
        Value::Array(a) => Value::Array(a.iter().map(canonicalize).collect()),
        other => other.clone(),
    }
}

/// Deterministic JSON for the batch: sorted keys at every depth, no whitespace.
///
/// The value is parsed back from the SERIALIZED row bytes (not `to_value(rows)`) so every
/// number's representation matches exactly what ships in the request body — and therefore
/// what the server re-canonicalizes. `to_value` widens `f32` fields (e.g. a `temperature`
/// param of `0.2`) to `f64` with a precision artifact (`0.20000000298023224`), while the
/// wire serializes the same `f32` as `0.2`; hashing the widened form would diverge from the
/// server's hash of the wire bytes and reject every publish carrying a float param.
pub fn canonical_json(rows: &[PublishRow]) -> AppResult<String> {
    let wire: Value = serde_json::from_str(&serde_json::to_string(rows)?)?;
    let canon = canonicalize(&wire);
    Ok(serde_json::to_string(&canon)?)
}

/// Lowercase-hex SHA-256 over the canonical JSON — the integrity hash sent
/// alongside the batch so TLS + bearer token + nonce + this hash close transit
/// tampering. (Self-fabrication is a separate, server-side concern.)
pub fn canonical_hash(rows: &[PublishRow]) -> AppResult<String> {
    let mut hasher = Sha256::new();
    hasher.update(canonical_json(rows)?.as_bytes());
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
#[path = "canonical_tests.rs"]
mod tests;
