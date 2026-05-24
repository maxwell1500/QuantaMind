use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum PullProgress {
    PullingManifest,
    Downloading { digest: String, total: u64, completed: u64, speed_bps: u64 },
    Verifying,
    Writing,
    Success,
    Failed { message: String },
}

#[derive(Serialize)]
pub(crate) struct PullRequest<'a> {
    pub name: &'a str,
    pub stream: bool,
}

#[derive(Deserialize)]
pub(crate) struct PullChunk {
    #[serde(default)] pub status: Option<String>,
    #[serde(default)] pub error: Option<String>,
    #[serde(default)] pub digest: Option<String>,
    #[serde(default)] pub total: Option<u64>,
    #[serde(default)] pub completed: Option<u64>,
}

pub(crate) fn classify(chunk: &PullChunk, speed_bps: u64) -> Option<PullProgress> {
    if let (Some(d), Some(t), Some(c)) = (&chunk.digest, chunk.total, chunk.completed) {
        return Some(PullProgress::Downloading {
            digest: d.clone(), total: t, completed: c, speed_bps,
        });
    }
    let s = chunk.status.as_deref().unwrap_or("");
    if s.starts_with("pulling manifest") { Some(PullProgress::PullingManifest) }
    else if s.contains("verifying") { Some(PullProgress::Verifying) }
    else if s.contains("writing") { Some(PullProgress::Writing) }
    else if s == "success" { Some(PullProgress::Success) }
    else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(status: &str) -> PullChunk {
        PullChunk { status: Some(status.into()), error: None, digest: None, total: None, completed: None }
    }

    #[test]
    fn manifest_status_classifies() {
        assert_eq!(classify(&chunk("pulling manifest"), 0), Some(PullProgress::PullingManifest));
    }

    #[test]
    fn downloading_carries_speed_bps_through() {
        let c = PullChunk {
            status: Some("pulling sha256:abc".into()), error: None,
            digest: Some("sha256:abc".into()),
            total: Some(1_000_000),
            completed: Some(250_000),
        };
        let Some(PullProgress::Downloading { speed_bps, .. }) = classify(&c, 42) else {
            panic!("expected Downloading")
        };
        assert_eq!(speed_bps, 42);
    }

    #[test]
    fn unknown_status_classifies_as_none() {
        assert_eq!(classify(&chunk("removing unused layers"), 0), None);
    }

    #[test]
    fn parses_error_chunk_without_panicking_on_missing_status() {
        let raw = r#"{"error":"file does not exist"}"#;
        let parsed: PullChunk = serde_json::from_str(raw).expect("error-only chunks must deserialize");
        assert!(parsed.status.is_none());
        assert_eq!(parsed.error.as_deref(), Some("file does not exist"));
    }

    #[test]
    fn success_serializes_with_phase_tag() {
        let json = serde_json::to_string(&PullProgress::Success).unwrap();
        assert_eq!(json, r#"{"phase":"success"}"#);
    }

    #[test]
    fn downloading_serializes_with_all_fields() {
        let p = PullProgress::Downloading {
            digest: "sha256:abc".into(), total: 100, completed: 50, speed_bps: 25,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains(r#""phase":"downloading""#));
        assert!(json.contains(r#""total":100"#));
        assert!(json.contains(r#""speed_bps":25"#));
    }
}
