# Day-Zero Setup

Run these in order. Each is a checkpoint — do not paste them all at once.

## 1. Prerequisites (macOS shown; adapt for Linux/Windows)

```sh
brew install rust node pnpm
rustc --version    # 1.75+
node --version     # 20+
pnpm --version     # 9+
xcode-select --install
```

## 2. Create the project

```sh
pnpm create tauri-app@latest
# Project name: quantamind
# Identifier: dev.quantamind.app
# Frontend: TypeScript
# Package manager: pnpm
# UI template: React (TypeScript flavor)
cd quantamind
```

## 3. Install frontend dependencies

```sh
pnpm add zustand zod @monaco-editor/react react-router-dom
pnpm add -D tailwindcss@3 postcss autoprefixer \
  vitest @testing-library/react @testing-library/jest-dom \
  @types/react jsdom
```

(Rust deps are added in Phase 1, step 1.)

## 4. Initialize Tailwind

```sh
pnpm exec tailwindcss init -p
```

- Add to `tailwind.config.js` content: `['./index.html','./src/**/*.{js,ts,jsx,tsx}']`
- Add to `src/index.css`:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```

## 5. Git + pre-commit hooks

```sh
git init
git add . && git commit -m "chore: initial Tauri + React + TS scaffold"
pnpm add -D lefthook
pnpm exec lefthook install
```

Create `lefthook.yml` (see CONTRIBUTING.md for content).

## 6. GitHub repo

```sh
gh repo create quantamind-dev/quantamind --public --source=. --remote=origin --push
gh repo edit --enable-discussions
```

Set up branch protection on `main` (require PRs).

## 7. Verify the dev loop

```sh
pnpm tauri dev
```

Edit `src/App.tsx`, save, see the window reload. If yes → ready.

## 8. Pull Ollama models

```sh
brew install ollama
ollama serve &
ollama pull llama3.2:1b       # dev workhorse, ~700MB
ollama pull phi3.5:latest     # variety for later phases
curl http://localhost:11434/api/tags
```

## 9. (Optional) Wire the in-app Feedback button

The Feedback modal POSTs to a [Web3Forms](https://web3forms.com/) relay,
read at compile time:

```sh
# For local dev: feedback is disabled if this isn't set — the modal
# still renders, but submit_feedback returns a clear "disabled in this
# build" error. Set it before any build that should send real mail.
export WEB3FORMS_ACCESS_KEY=<your-access-key>
pnpm tauri dev   # or `pnpm tauri build` for releases
```

See `docs/feedback.md` for the full wire and payload shape.

## Done

All 8 steps green → development environment ready. Stop here for day 0.
Day 1 starts with Phase 1 (see `phase-roadmap.md`).
