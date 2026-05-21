# Folder Structure

```
QM-Dev/
├── .github/
│   ├── workflows/{ci.yml,release.yml,nightly.yml}
│   ├── ISSUE_TEMPLATE/{bug_report.md,feature_request.md}
│   └── PULL_REQUEST_TEMPLATE.md
│
├── src/                            # React frontend
│   ├── app/{App.tsx,routes.tsx,providers.tsx}
│   ├── features/
│   │   ├── workspace/              # Phase 1
│   │   │   ├── components/{PromptEditor,OutputStream,ModelPicker,RunControls}.tsx
│   │   │   ├── hooks/{useStreamingRun,usePromptStore}.ts
│   │   │   ├── state/workspaceStore.ts
│   │   │   ├── types.ts
│   │   │   ├── schemas.ts          # zod
│   │   │   └── __tests__/
│   │   ├── inspector/              # Phase 4
│   │   ├── bench/                  # Phase 3
│   │   └── settings/               # Phase 2
│   ├── shared/
│   │   ├── components/
│   │   ├── ipc/{client.ts,types.ts,__tests__/}
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── styles/tokens.css
│   ├── main.tsx
│   └── index.css
│
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/{mod,prompt,models,settings,workspace}.rs
│   │   ├── inference/{mod,ollama,llama_cpp,mlx,traits}.rs
│   │   ├── metrics/{mod,timing,vram}.rs
│   │   ├── persistence/{mod,prompts,history}.rs
│   │   ├── validation/{mod,schemas}.rs
│   │   └── errors.rs
│   ├── tests/{ollama_integration,prompt_persistence}.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   └── icons/
│
├── e2e/                            # Phase 2+ Playwright
├── scripts/{dev.sh,test-all.sh,release.sh,seed-test-data.sh}
├── docs/                           # this directory
├── .editorconfig .gitignore .prettierrc .eslintrc.json
├── lefthook.yml package.json tsconfig.json vite.config.ts
├── tailwind.config.js vitest.config.ts
└── LICENSE README.md CHANGELOG.md CONTRIBUTING.md CODE_OF_CONDUCT.md
```

## Rationale

- **`features/` over `components/` at top level.** Each feature is a
  vertical slice: components + hooks + state + tests. Easy to delete,
  easy to extract, easy to reason about.
- **`commands/` mirrors `features/`.** Every command corresponds to a
  frontend need. If they drift, something is wrong.
- **`validation/` is first-class.** Schemas are not afterthoughts.
- **`__tests__/` next to code, not in `/tests`.** Tests die when they
  live far from the code they cover. Rust integration tests are the
  exception — they live in `src-tauri/tests/` because cargo requires it.

## When to add a new top-level folder

Almost never. New work usually fits into:
- a new feature → `src/features/<name>/`
- a new command + backend module → `src-tauri/src/commands/` + matching domain dir

If you think you need a new top-level, propose it in chat first.
