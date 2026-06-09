// The mlx-audio STT engine (Apple Silicon): spawn `mlx_audio.server` on a free
// loopback port and acquire `mlx-community/whisper-*` snapshots. A parallel
// engine to whisper.cpp (the frontend routes by the selected STT engine).
// Strictly offline — the server binds 127.0.0.1 only and never reaches the cloud.
pub mod mlx_stt_download;
pub mod mlx_stt_locate;
pub mod mlx_stt_models;
pub mod mlx_stt_runtime;
pub mod mlx_stt_server_types;
pub mod mlx_stt_start;
