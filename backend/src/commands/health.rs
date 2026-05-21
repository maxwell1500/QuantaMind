use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_OLLAMA: &str = "http://localhost:11434";
const PROBE_TIMEOUT: Duration = Duration::from_millis(800);

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct HealthStatus {
    pub available: bool,
    pub version: Option<String>,
}

#[derive(Deserialize)]
struct VersionResponse {
    version: String,
}

pub async fn probe_health(endpoint: &str) -> HealthStatus {
    let client = match Client::builder().timeout(PROBE_TIMEOUT).build() {
        Ok(c) => c,
        Err(_) => return HealthStatus { available: false, version: None },
    };
    let resp = match client.get(format!("{endpoint}/api/version")).send().await {
        Ok(r) => r,
        Err(_) => return HealthStatus { available: false, version: None },
    };
    if !resp.status().is_success() {
        return HealthStatus { available: false, version: None };
    }
    match resp.json::<VersionResponse>().await {
        Ok(v) => HealthStatus { available: true, version: Some(v.version) },
        Err(_) => HealthStatus { available: true, version: None },
    }
}

#[tauri::command]
pub async fn check_ollama_health() -> HealthStatus {
    probe_health(DEFAULT_OLLAMA).await
}
