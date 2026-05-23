use crate::inference::create_spec::{CreateParameters, CreateSpec};
use serde_json::{json, Map, Value};

fn parameters_to_json(p: &CreateParameters) -> Map<String, Value> {
    let mut m = Map::new();
    if let Some(v) = p.temperature { m.insert("temperature".into(), json!(v)); }
    if let Some(v) = p.top_p { m.insert("top_p".into(), json!(v)); }
    if let Some(v) = p.top_k { m.insert("top_k".into(), json!(v)); }
    if let Some(v) = p.repeat_penalty { m.insert("repeat_penalty".into(), json!(v)); }
    if !p.stop.is_empty() { m.insert("stop".into(), json!(p.stop)); }
    m
}

pub fn build_create_body(spec: &CreateSpec, model_name: &str, digest: &str) -> Value {
    let filename = spec.gguf_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("model.gguf")
        .to_string();

    let mut body = Map::new();
    body.insert("model".into(), json!(model_name));
    body.insert("files".into(), json!({ &filename: format!("sha256:{digest}") }));

    if let Some(t) = &spec.chat_template {
        body.insert("template".into(), json!(t.template_string));
        let mut params = parameters_to_json(&spec.parameters);
        let mut stops: Vec<String> = t.stop_tokens.iter().map(|s| (*s).to_string()).collect();
        stops.extend(spec.parameters.stop.iter().cloned());
        if !stops.is_empty() {
            params.insert("stop".into(), json!(stops));
        }
        if !params.is_empty() { body.insert("parameters".into(), Value::Object(params)); }
    } else {
        let params = parameters_to_json(&spec.parameters);
        if !params.is_empty() { body.insert("parameters".into(), Value::Object(params)); }
    }
    Value::Object(body)
}
