# Quick Start

## Install

```bash
git clone https://github.com/raymkf/scidavinci.git
cd scidavinci
pip install -e .
```

## Initialize

```bash
scidavinci onboard
```

This creates the local config and workspace under `~/.scidavinci/`.

## Configure A Model

Edit `~/.scidavinci/config.json`:

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "YOUR_API_KEY"
    }
  },
  "agents": {
    "defaults": {
      "provider": "openrouter",
      "model": "anthropic/claude-opus-4-6"
    }
  }
}
```

## Start Terminal Chat

```bash
scidavinci agent
```

## Start The Web UI

Enable the WebSocket channel in `~/.scidavinci/config.json`:

```json
{
  "channels": {
    "websocket": {
      "enabled": true
    }
  }
}
```

Start the gateway:

```bash
scidavinci gateway
```

Start the frontend:

```bash
cd webui
bun install
bun run dev
```

Open the local Vite URL, usually `http://localhost:5173`.
