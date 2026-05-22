use crate::inference::chat_template_data::ChatTemplate;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ModelfileSpec {
    pub gguf_path: PathBuf,
    pub chat_template: Option<ChatTemplate>,
    pub parameters: ModelfileParameters,
}

#[derive(Debug, Clone, Default)]
pub struct ModelfileParameters {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub repeat_penalty: Option<f32>,
    pub stop: Vec<String>,
}

/// Inside Ollama's `TEMPLATE """..."""` we have to neutralize any literal
/// triple-quote sequence in the template body (would otherwise close the
/// block prematurely). Stop tokens go in single-quoted `PARAMETER stop`
/// lines so the embedded `"` needs `\"` escaping.
fn escape_triple_quotes(s: &str) -> String { s.replace("\"\"\"", "\\\"\\\"\\\"") }
fn escape_quote(s: &str) -> String { s.replace('"', "\\\"") }

pub fn generate_modelfile(spec: &ModelfileSpec) -> String {
    let mut out = String::new();
    out.push_str(&format!("FROM {}\n", spec.gguf_path.display()));

    if let Some(t) = &spec.chat_template {
        out.push_str(&format!(
            "\nTEMPLATE \"\"\"{}\"\"\"\n",
            escape_triple_quotes(t.template_string)
        ));
        for stop in t.stop_tokens {
            out.push_str(&format!("PARAMETER stop \"{}\"\n", escape_quote(stop)));
        }
    }

    let p = &spec.parameters;
    if let Some(v) = p.temperature {
        out.push_str(&format!("PARAMETER temperature {v}\n"));
    }
    if let Some(v) = p.top_p {
        out.push_str(&format!("PARAMETER top_p {v}\n"));
    }
    if let Some(v) = p.top_k {
        out.push_str(&format!("PARAMETER top_k {v}\n"));
    }
    if let Some(v) = p.repeat_penalty {
        out.push_str(&format!("PARAMETER repeat_penalty {v}\n"));
    }
    for stop in &p.stop {
        out.push_str(&format!("PARAMETER stop \"{}\"\n", escape_quote(stop)));
    }

    out
}
