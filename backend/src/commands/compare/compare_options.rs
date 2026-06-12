use crate::commands::prompt::prompt_options::to_generate_options;
use crate::inference::ollama::ollama::GenerateOptions;
use crate::persistence::prompts::schema::InferenceParams;
use std::collections::HashMap;

/// Resolve one model's generate options: a per-model override wins over the
/// shared params; temperature falls back to the per-model setting.
pub fn options_for(
    model: &str,
    params: Option<&InferenceParams>,
    per_model: Option<&HashMap<String, InferenceParams>>,
    temp: f32,
) -> GenerateOptions {
    let p = per_model.and_then(|map| map.get(model)).or(params);
    let mut opts = p.map(to_generate_options).unwrap_or_default();
    if opts.temperature.is_none() {
        opts.temperature = Some(temp);
    }
    opts
}

#[cfg(test)]
#[path = "compare_options_tests.rs"]
mod tests;
