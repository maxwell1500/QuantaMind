use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum PullProgress {
    PullingManifest,
    Downloading { digest: String, total: u64, completed: u64, speed_bps: u64 },
    Verifying,
    Writing,
    Success,
}

#[derive(Serialize)]
pub(crate) struct PullRequest<'a> {
    pub name: &'a str,
    pub stream: bool,
}

#[derive(Deserialize)]
pub(crate) struct PullChunk {
    pub status: String,
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
    let s = chunk.status.as_str();
    if s.starts_with("pulling manifest") { Some(PullProgress::PullingManifest) }
    else if s.contains("verifying") { Some(PullProgress::Verifying) }
    else if s.contains("writing") { Some(PullProgress::Writing) }
    else if s == "success" { Some(PullProgress::Success) }
    else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_status_classifies() {
        let c = PullChunk { status: "pulling manifest".into(), digest: None, total: None, completed: None };
        assert_eq!(classify(&c, 0), Some(PullProgress::PullingManifest));
    }

    #[test]
    fn downloading_carries_speed_bps_through() {
        let c = PullChunk {
            status: "pulling sha256:abc".into(),
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
        let c = PullChunk { status: "removing unused layers".into(), digest: None, total: None, completed: None };
        assert_eq!(classify(&c, 0), None);
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
