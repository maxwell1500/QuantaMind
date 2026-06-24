use crate::inference::eval::toolcall::tasks::Call;
use serde_json::Value;

/// world_state keys that are NOT discoverable entities — meta/oracle data the
/// responder must never hand back as if it were an entity an arg pointed at.
const RESERVED: [&str; 3] = ["calc", "threshold", "ground_truth"];

const ACK: &str = r#"{"ok":true}"#;

/// Derive a tool response from `world_state`. The model discovers ground truth by
/// calling tools; the sandbox returns the WHOLE entity sub-object for the first
/// string-valued arg whose value is a (non-reserved) world_state key — so every
/// tool on the same entity (`get_positions`, `compute_margin`, …) sees the same
/// blob and reads the field it needs (no per-tool projection). The `calc` sub-map
/// (`ws["calc"][expression]`) is handled first. A call that resolves to nothing
/// gets a generic ack (it still can't advance any checkpoint).
pub fn derive_response(ws: &Value, call: &Call) -> String {
    let Some(args) = call.args.as_object() else {
        return ACK.to_string();
    };

    // calc sub-map: an arg value that keys into ws["calc"] returns its result.
    if let Some(calc) = ws.get("calc").and_then(Value::as_object) {
        for v in args.values() {
            if let Some(s) = v.as_str() {
                if let Some(hit) = calc.get(s) {
                    return hit.to_string();
                }
            }
        }
    }

    // Entity resolution: first string arg whose value is a non-reserved ws key.
    if let Some(ws_obj) = ws.as_object() {
        for v in args.values() {
            if let Some(s) = v.as_str() {
                if RESERVED.contains(&s) {
                    continue;
                }
                if let Some(entity) = ws_obj.get(s) {
                    return entity.to_string();
                }
            }
        }
    }

    ACK.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ws() -> Value {
        json!({
            "M-3": { "ratio": 0.1, "maint": 0.25, "hedged": false },
            "M-4": { "ratio": 0.1, "hedged": true, "net_after_hedge": 0.3 },
            "threshold": { "ctr": 10000 },
            "calc": { "100000*0.03/12": 250.0 }
        })
    }
    fn call(name: &str, args: Value) -> Call {
        Call { name: name.into(), args }
    }

    #[test]
    fn every_tool_on_an_entity_gets_the_whole_sub_object() {
        let positions = derive_response(&ws(), &call("get_positions", json!({ "account": "M-3" })));
        let margin = derive_response(&ws(), &call("compute_margin", json!({ "account": "M-3" })));
        assert_eq!(positions, margin); // same blob, no per-tool projection
        assert_eq!(positions, json!({ "ratio": 0.1, "maint": 0.25, "hedged": false }).to_string());
    }

    #[test]
    fn calc_sub_map_resolves_an_expression() {
        let r = derive_response(&ws(), &call("calc", json!({ "expression": "100000*0.03/12" })));
        assert_eq!(r, "250.0");
    }

    #[test]
    fn reserved_keys_are_not_treated_as_entities() {
        // An arg literally naming a reserved key must NOT return that meta blob.
        let r = derive_response(&ws(), &call("peek", json!({ "x": "threshold" })));
        assert_eq!(r, ACK);
    }

    #[test]
    fn unresolved_call_gets_a_generic_ack() {
        assert_eq!(derive_response(&ws(), &call("noop", json!({ "account": "ZZ" }))), ACK);
        assert_eq!(derive_response(&ws(), &call("noop", json!({}))), ACK);
    }
}
