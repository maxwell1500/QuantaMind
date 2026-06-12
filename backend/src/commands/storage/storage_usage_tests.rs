use super::*;

// 127.0.0.1:1 refuses connections, simulating Ollama being down. Disk usage
// must still resolve (free/total come from the filesystem) with the model
// sum zeroed — never bubble a "connection refused" up to the Storage panel.
#[tokio::test]
async fn disk_usage_degrades_when_ollama_is_unreachable() {
    let usage = disk_usage_for("http://127.0.0.1:1").await;
    assert_eq!(usage.ollama_models_bytes, 0, "model sum zeroes when Ollama is down");
    assert!(usage.free_bytes > 0, "free space still reported from the filesystem");
}
