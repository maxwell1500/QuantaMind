# Folder Structure

```
QM-Dev/
├── .github/
│   ├── workflows/{ci.yml,release.yml,nightly.yml}
│   └── PULL_REQUEST_TEMPLATE.md
│
├── frontend/                       # React + TS + Vite app
│   ├── src/
│   │   ├── app/{App.tsx,routes.tsx,providers.tsx}
│   │   ├── features/
│   │   │   ├── workspace/          # Phase 1
│   │   │   │   ├── components/{PromptEditor,OutputStream,ModelPicker,RunControls}.tsx
│   │   │   │   ├── hooks/{useStreamingRun,usePromptStore}.ts
│   │   │   │   ├── state/workspaceStore.ts
│   │   │   │   ├── types.ts
│   │   │   │   ├── schemas.ts      # zod
│   │   │   │   └── __tests__/
│   │   │   ├── inspector/          # Phase 4
│   │   │   ├── bench/              # Phase 3
│   │   │   └── settings/           # Phase 2
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   ├── ipc/{client.ts,types.ts,__tests__/}
│   │   │   └── styles/tokens.css
│   │   ├── test/setup.ts
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── backend/                        # Rust + Tauri 2 app
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/{mod,prompt,models,settings,workspace}.rs
│   │   ├── inference/{mod,ollama,llama_cpp,mlx,traits}.rs
│   │   ├── metrics/{mod,timing,vram}.rs
│   │   ├── persistence/{mod,prompts,history}.rs
│   │   ├── validation/{mod,schemas}.rs
│   │   └── errors.rs
│   ├── tests/{ollama_stream,models_list,prompt_stream}.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   └── icons/
│
├── docs/                           # this directory
├── CLAUDE.md .gitignore
└── LICENSE README.md CHANGELOG.md
```

## Rationale

- **`frontend/` + `backend/` top split.** Two languages, two toolchains.
  Co-locating each side's configs with its source means a frontend dev
  rarely needs to read backend files and vice versa.
- **`features/` over `components/` at top level.** Each feature is a
  vertical slice: components + hooks + state + tests. Deletable in one
  `rm -rf`.
- **`commands/` mirrors `features/`.** Every command corresponds to a
  frontend need. If they drift, something is wrong.
- **`__tests__/` next to code.** Rust integration tests are the exception
  — they live in `backend/tests/` because cargo requires it.

## Tauri CLI: pointing at `backend/`

Tauri 2's CLI discovers the project by searching subfolders of cwd
for `tauri.conf.json`. From `frontend/` it can't see `backend/`, so
`frontend/package.json`'s `tauri` script is `"cd .. && tauri"` —
shifting cwd to the QM-Dev root where `backend/` is a subfolder.

`backend/tauri.conf.json` then references the frontend via
`pnpm --dir=../frontend dev` / `build` and `frontendDist: ../frontend/dist`.
Both directions of the cross-folder hop are explicit.

## When to add a new top-level folder

Almost never. New work fits into:
- a new feature → `frontend/src/features/<name>/`
- a new command + domain → `backend/src/commands/` + matching module dir
