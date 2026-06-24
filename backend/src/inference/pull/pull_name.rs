use crate::errors::{AppError, AppResult};

pub fn validate_name(name: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name is empty".into()));
    }
    let bad = ['/', '\\', '\0', '"', '\'', ' ', '\t', '\n'];
    if name.chars().any(|c| bad.contains(&c)) {
        return Err(AppError::Validation(format!("name has illegal char: {name}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_name_rejected() {
        assert!(matches!(validate_name(""), Err(AppError::Validation(_))));
        assert!(matches!(validate_name("   "), Err(AppError::Validation(_))));
    }

    #[test]
    fn path_separators_and_quotes_rejected() {
        for bad in ["foo/bar", "x\\y", "foo bar", "say \"hi\"", "it's"] {
            assert!(
                matches!(validate_name(bad), Err(AppError::Validation(_))),
                "should reject {bad}",
            );
        }
    }

    #[test]
    fn valid_names_accepted() {
        for ok in [
            "llama3.2:1b",
            "phi3.5:latest",
            "qwen2.5-coder:7b-instruct-q4_K_M",
        ] {
            validate_name(ok).expect("should accept");
        }
    }
}
