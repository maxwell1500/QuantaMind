#!/usr/bin/env bash
# QuantaMind — install all runtime dependencies on Linux.
#
# This installs:
#   - Ollama (the LLM backend) via the official install script
#   - whisper.cpp build dependencies (for STT)
#   - Audio/video libraries (ffmpeg, ALSA, PulseAudio)
#
# Usage:
#   ./scripts/install-deps.sh           # install everything
#   ./scripts/install-deps.sh ollama    # install only Ollama
#   ./scripts/install-deps.sh whisper   # install only whisper.cpp deps
#   ./scripts/install-deps.sh libs      # install only system libraries
#
# Requires: sudo (or root), curl, apt (Debian/Ubuntu) or dnf (Fedora)

set -euo pipefail

INSTALL_OLLAMA=true
INSTALL_WHISPER=true
INSTALL_LIBS=true

if [[ "${1:-}" != "" ]]; then
    INSTALL_OLLAMA=false
    INSTALL_WHISPER=false
    INSTALL_LIBS=false
    case "$1" in
        ollama)  INSTALL_OLLAMA=true ;;
        whisper) INSTALL_WHISPER=true ;;
        libs)    INSTALL_LIBS=true ;;
        *)       echo "unknown component: $1" >&2; exit 1 ;;
    esac
fi

if [[ $EUID -ne 0 ]]; then
    SUDO=sudo
else
    SUDO=""
fi

# Detect package manager
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
    PKG_INSTALL="$SUDO apt-get install -y"
    PKG_UPDATE="$SUDO apt-get update"
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
    PKG_INSTALL="$SUDO dnf install -y"
    PKG_UPDATE="$SUDO dnf check-update || true"
elif command -v pacman >/dev/null 2>&1; then
    PKG_MGR="pacman"
    PKG_INSTALL="$SUDO pacman -S --noconfirm"
    PKG_UPDATE="$SUDO pacman -Sy"
else
    echo "error: no supported package manager found (apt, dnf, pacman)" >&2
    exit 1
fi

echo "==> Detected package manager: $PKG_MGR"

# --- System libraries ---
if $INSTALL_LIBS; then
    echo "==> Installing system libraries (ffmpeg, audio, etc.)"
    $PKG_UPDATE
    case "$PKG_MGR" in
        apt)
            $PKG_INSTALL \
                ffmpeg \
                libasound2-dev \
                libpulse-dev \
                libssl-dev \
                pkg-config \
                build-essential \
                cmake \
                git \
                curl \
                wget
            ;;
        dnf)
            $PKG_INSTALL \
                ffmpeg \
                alsa-lib-devel \
                pulseaudio-libs-devel \
                openssl-devel \
                pkgconfig \
                gcc gcc-c++ make \
                cmake \
                git \
                curl \
                wget
            ;;
        pacman)
            $PKG_INSTALL \
                ffmpeg \
                alsa-lib \
                libpulse \
                openssl \
                pkgconf \
                base-devel \
                cmake \
                git \
                curl \
                wget
            ;;
    esac
fi

# --- Ollama ---
if $INSTALL_OLLAMA; then
    if command -v ollama >/dev/null 2>&1; then
        echo "==> Ollama already installed: $(ollama --version 2>&1 || echo unknown)"
    else
        echo "==> Installing Ollama"
        curl -fsSL https://ollama.com/install.sh | sh
    fi
    # Start the systemd service if available
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl enable ollama 2>/dev/null || true
        $SUDO systemctl start ollama 2>/dev/null || true
    fi
fi

# --- whisper.cpp (STT) ---
if $INSTALL_WHISPER; then
    echo "==> Building whisper.cpp from source"
    if [[ ! -d "$HOME/whisper.cpp" ]]; then
        git clone https://github.com/ggerganov/whisper.cpp.git "$HOME/whisper.cpp"
    fi
    cd "$HOME/whisper.cpp"
    git pull --rebase || true
    cmake -B build
    cmake --build build --config Release -j"$(nproc)"
    mkdir -p "$HOME/.local/bin"
    ln -sf "$HOME/whisper.cpp/build/bin/whisper-server" "$HOME/.local/bin/whisper-server"
    echo "    whisper-server installed at $HOME/.local/bin/whisper-server"
    echo "    Make sure ~/.local/bin is on your PATH (or set the path in QuantaMind Settings)"
fi

echo ""
echo "==> Done. You can now launch QuantaMind:"
echo "    quantamind"