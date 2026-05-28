use crate::errors::{AppError, AppResult};
use crate::inference::ollama::GenerateOptions;
use crate::persistence::prompts::schema::InferenceParams;

fn in_range(name: &str, v: Option<f32>, lo: f32, hi: f32) -> AppResult<()> {
    if let Some(x) = v {
        if !x.is_finite() || x < lo || x > hi {
            return Err(AppError::Validation(format!("{name} must be {lo}–{hi}, got {x}")));
        }
    }
    Ok(())
}

pub fn validate_params(p: &InferenceParams) -> AppResult<()> {
    in_range("temperature", p.temperature, 0.0, 2.0)?;
    in_range("top_p", p.top_p, 0.0, 1.0)?;
    in_range("repeat_penalty", p.repeat_penalty, 0.0, 2.0)?;
    Ok(())
}

/// Map persisted per-prompt params onto Ollama's option block.
/// `max_tokens` becomes Ollama's `num_predict`.
pub fn to_generate_options(p: &InferenceParams) -> GenerateOptions {
    GenerateOptions {
        temperature: p.temperature,
        top_p: p.top_p,
        top_k: p.top_k,
        num_predict: p.max_tokens,
        repeat_penalty: p.repeat_penalty,
        seed: p.seed,
    }
}

#[cfg(test)]
#[path = "prompt_options_tests.rs"]
mod tests;
