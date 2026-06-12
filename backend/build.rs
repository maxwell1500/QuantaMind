use std::path::Path;

fn main() {
    // `binaries/` is bundled as a Tauri resource (tauri.conf.json) but is
    // gitignored (multi-MB sidecar artifacts: llama-server, the shared
    // libggml-* dylibs whisper.cpp also loads). A fresh clone has no such
    // directory, so Tauri's resource check fails the build before anything else
    // runs. Create it so the build always succeeds, and warn loudly when the
    // sidecar itself is absent so the user knows to fetch it instead of hitting
    // a silent runtime failure.
    let binaries = Path::new("binaries");
    if let Err(e) = std::fs::create_dir_all(binaries) {
        println!("cargo:warning=could not create backend/binaries/: {e}");
    }
    if !binaries.join("llama-server").exists() {
        println!(
            "cargo:warning=backend/binaries/llama-server is missing — run \
             scripts/fetch-llama-server.sh before bundling, or llama.cpp \
             features will be unavailable at runtime."
        );
    }

    tauri_build::build()
}
