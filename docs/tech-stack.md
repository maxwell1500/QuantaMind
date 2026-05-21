# Tech Stack — Locked Decisions

Do not substitute. Alternatives go to `future-considerations.md`.

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2.x | 30MB binary, native WebView, Rust backend |
| Backend language | Rust (stable, ed. 2021) | Tauri default, safe IPC + HTTP |
| Frontend framework | React 18 + TS 5.x | Largest open-source contributor pool |
| Build tool | Vite 5.x | Fast HMR, Tauri-friendly |
| Styling | Tailwind CSS 3.x | Utility-first, no design-system overhead |
| State management | Zustand | 1KB, no boilerplate, scales |
| Editor component | `@monaco-editor/react` | Same editor as VS Code |
| HTTP client (Rust) | `reqwest` + `tokio` | Standard, battle-tested |
| Serialization | `serde` + `serde_json` / native JSON | Type-safe across IPC |
| Validation (TS) | `zod` | Runtime schema validation |
| Validation (Rust) | `validator` + `serde` | Type-level + custom validators |
| Testing (Rust) | `cargo test` + `mockito` | Built-in, no setup |
| Testing (TS) | `vitest` + `@testing-library/react` | Fast, Vite-native |
| E2E (Phase 2+) | Playwright | Cross-platform |
| CI | GitHub Actions | Free for open source |
| Format | `rustfmt` + Prettier | Auto-format on save |
| Lint | Clippy + ESLint | Catch problems pre-runtime |
| Pre-commit | lefthook | Lighter than Husky |

## What is explicitly NOT installed (yet)

- Logging library — use `println!` / `console.log` until Phase 2.
- State-machine library — Zustand is enough.
- UI component library — Tailwind utility classes only.
- Form library — no forms in Phase 1.
- Extra Tauri plugins — Phase 2 introduces `plugin-store`, `plugin-fs`.
- AI/ML libraries — we call Ollama, we do not run models in-process.

Resist additions. Every dependency is a maintenance debt.

## Update this doc when

- A locked choice is replaced (requires a PR with rationale).
- A new layer is added (e.g., telemetry in Phase 4).
