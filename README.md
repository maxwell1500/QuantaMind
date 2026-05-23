# Splice

A Tauri 2.x desktop app for local AI model inference.

## Getting Started

### Prerequisites

- **Rust** 1.75+ (for backend)
- **Node.js** 20+ (for frontend)
- **pnpm** 9+ (package manager)
- **Ollama** (for local AI models)

### Installation

```sh
# Install dependencies
pnpm install

# Pull AI models (optional, for inference)
ollama pull llama3.2:1b
```

### Running the Project

```sh
# Development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Folder Structure

```
QM-Dev/
├── frontend/          # React + TS + Vite app
│   ├── src/
│   │   ├── app/       # App entry, routes, providers
│   │   ├── features/  # Feature modules (workspace, inspector, bench, settings)
│   │   └── shared/    # Shared components, IPC, styles
│   └── package.json
│
├── backend/           # Rust + Tauri 2 app
│   ├── src/
│   │   ├── commands/  # Tauri commands
│   │   ├── inference/ # AI model inference
│   │   ├── metrics/   # Performance tracking
│   │   └── persistence/ # Data storage
│   └── Cargo.toml
│
└── docs/              # Project documentation
```

See [docs/setup.md](docs/setup.md) for detailed setup instructions.
