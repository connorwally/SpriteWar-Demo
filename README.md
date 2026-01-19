# Sprite War (Demo)

This repository is a **non-functional demo project** and is **not intended to run as-is**. It exists as a reference implementation to show **how I approached specific systems** (client/game architecture, WebSocket messaging, server proxying, and game-simulation structure).

If you’re browsing this repo: treat it like a **code sample / portfolio artifact**, not a working game.

## What this demo is showing

- **Client/game architecture**: a structured client with separate modules for world generation, entity state, input/selection, and rendering.
- **Real-time networking shape**: WebSocket client wiring and message flow.
- **Server-side organization**: a “front” server that serves the client + a separate game server process.
- **Game server simulation structure**: controllers, message handlers, entity systems (movement/combat/training), interest management, and chunk/terrain systems.

## Repository layout

- `Client/`

  - Frontend client (Vue/TypeScript) with game UI and gameplay modules.
  - Networking lives under `Client/src/network/`.
  - Input/selection lives under `Client/src/input/`.
  - World generation + fog-of-war lives under `Client/src/world/`.
  - Entities/state/view lives under `Client/src/entities/`.

- `Server/` (ASP.NET Core)

  - Hosts controllers + static file hosting for the built client.
  - Exposes a WebSocket endpoint at `/ws` and **proxies** it to the game server.
  - Notable file: `Server/Services/GameServerProxyService.cs`.

- `GameServer/` (ASP.NET Core WebSocket host)
  - The authoritative game simulation/services.
  - Hosts WebSocket endpoint at `/ws` (default `ws://localhost:5038/ws`).
  - Organized into `Game/Controllers`, `Game/Handlers`, `Game/Services`, `Game/Models`.

## Why it won’t run

This repo intentionally does not include everything needed to run end-to-end. Common missing/intentional gaps:

- **Secrets / environment files** are expected outside the repo (e.g. `secrets/server.env`, `secrets/gameserver.env`).
- The **client build artifacts** may not be present when the server tries to serve static files.
- The **shared game-data file** referenced by the game server project may not be included (e.g. `entities.json` referenced from a `Shared/` path).
- Configuration defaults may not match your machine/ports/certs.

## Tech stack (at a glance)

- **Client**: Vue + TypeScript (Vite-style structure)
- **Server**: ASP.NET Core (serves static files + WebSocket proxy)
- **GameServer**: ASP.NET Core WebSockets (authoritative simulation)
- **Runtime target**: .NET (project targets `net9.0`)

## Notes for reviewers

If you’re here to understand how something was implemented, start with:

- **Server WebSocket proxy**: `Server/Services/GameServerProxyService.cs`
- **Game server host + DI setup**: `GameServer/Program.cs`
- **Game loop / hosted service**: `GameServer/Game/Core/GameServer.cs`
- **Message handling**: `GameServer/Game/Handlers/*` and `GameServer/Game/Handlers/Messages/*`
- **Client networking**: `Client/src/network/setupSocket.ts`
- **Client game view + state**: `Client/src/components/Game.vue` and `Client/src/core/*`

## License

No license is granted by default. If you intend to reuse code, please contact me first.
