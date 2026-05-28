use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("validation: {0}")]
    Validation(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("inference: {0}")]
    Inference(String),

    #[error("io: {0}")]
    Io(String),

    #[error("timeout: {0}")]
    Timeout(String),

    #[error("auth required: {0}")]
    AuthRequired(String),

    #[error("internal: {0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    /// Translate well-known connection failures into actionable copy.
    /// Keeps the original string when there's no friendlier match.
    pub fn friendly(&self) -> String {
        let s = self.to_string();
        let low = s.to_lowercase();
        let looks_like_ollama_down = s.contains("Connection refused")
            || s.contains("error trying to connect")
            || s.contains("os error 61")
            || s.contains("tcp connect error")
            || (s.contains("error sending request") && s.contains("localhost:11434"));
        if looks_like_ollama_down {
            return "Ollama is not running. Start Ollama and try again.".to_string();
        }
        if low.contains("model") && low.contains("not found") {
            return "That model isn't installed. Install it from the Models tab and try again."
                .to_string();
        }
        if low.contains("out of memory") || low.contains("not enough memory") {
            return "Not enough memory to run this model. Try a smaller or more-quantized model."
                .to_string();
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::Validation("empty".into())).unwrap();
        assert_eq!(json, r#"{"kind":"validation","message":"empty"}"#);
    }

    #[test]
    fn not_found_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::NotFound("model x".into())).unwrap();
        assert_eq!(json, r#"{"kind":"not_found","message":"model x"}"#);
    }

    #[test]
    fn internal_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::Internal("boom".into())).unwrap();
        assert_eq!(json, r#"{"kind":"internal","message":"boom"}"#);
    }

    #[test]
    fn display_format_matches_thiserror_attr() {
        assert_eq!(format!("{}", AppError::Validation("x".into())), "validation: x");
    }

    #[test]
    fn timeout_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::Timeout("list_models after 5s".into())).unwrap();
        assert_eq!(json, r#"{"kind":"timeout","message":"list_models after 5s"}"#);
    }

    #[test]
    fn auth_required_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::AuthRequired("meta-llama/Llama-3".into())).unwrap();
        assert_eq!(json, r#"{"kind":"auth_required","message":"meta-llama/Llama-3"}"#);
    }

    #[test]
    fn friendly_maps_connection_refused_to_ollama_down() {
        let e = AppError::Inference("error trying to connect: Connection refused".into());
        assert_eq!(e.friendly(), "Ollama is not running. Start Ollama and try again.");
    }

    #[test]
    fn friendly_maps_model_not_found() {
        let e = AppError::Inference("model 'llama3' not found, try pulling it".into());
        assert!(e.friendly().contains("isn't installed"));
    }

    #[test]
    fn friendly_maps_out_of_memory() {
        let e = AppError::Inference("llama runner: out of memory".into());
        assert!(e.friendly().contains("Not enough memory"));
    }

    #[test]
    fn friendly_passes_through_unknown() {
        let e = AppError::Validation("weird thing".into());
        assert_eq!(e.friendly(), "validation: weird thing");
    }
}
