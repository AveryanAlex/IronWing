# Scripts and Workflow Helpers

## Overview

`scripts/` contains thin Node entrypoints for package scripts plus the shared `scripts/workflow/` orchestration library. Keep target-specific command shape in the entrypoints and put reusable process, environment, port, SITL, Tauri, and WASM behavior in `workflow/` modules.

SvelteKit's Vite CLI is now the web/WASM default: `pnpm exec vite` serves the pure web platform and `pnpm exec vite build` writes `dist/web`. Tauri and remote UI flows must opt into their platform explicitly through env helpers; browser E2E runs `build:web` by default and serves the same `dist/web` bundle with `e2e-serve.mjs`, while CI can set `IRONWING_E2E_SKIP_BUILD=1` after downloading the build artifact.

## Where To Look

### Public command entrypoints

| Task | Location | Notes |
|------|----------|-------|
| Desktop dev | `dev.mjs` | SITL + Tauri desktop dev with TCP defaults |
| Agent remote UI | `remote-ui.mjs` | SITL + Tauri dev + browser bridge; local agent workflow only |
| Android dev | `android-dev.mjs` | SITL + Tauri Android dev with emulator/physical-device TCP host handling |
| Web dev | `web-dev.mjs` | SITL + TCP→WebSocket bridge + Vite web dev |
| Desktop build | `desktop-build.mjs` | Tauri build with explicit Tauri frontend env |
| Android build | `android-build.mjs` | Tauri Android APK build with explicit Tauri frontend env |
| Web build | `web-build.mjs` | Web build wrapper; Vite builds the WASM module |
| Browser E2E launcher | `e2e-run.mjs` | Reserves a static-server port, then runs Playwright |
| Browser E2E static server | `e2e-serve.mjs` | Serves `dist/web` without SvelteKit/Vite preview state |
| Native E2E launcher | `e2e-native.mjs` | Debug Tauri build + SITL + WebDriverIO smoke lane |
| Standalone SITL WS bridge | `sitl-ws.mjs` | Tool command for manual TCP→WebSocket bridging |
| WASM build implementation | `wasm-web-build.mjs` | Internal `wasm-pack` build/cleanup command used by Vite |

### Shared workflow modules

| Task | Location | Notes |
|------|----------|-------|
| Environment composition | `workflow/env.mjs` | Frontend, Tauri, web, mock, SITL, Android, and remote UI env snippets |
| Frontend runners | `workflow/frontend.mjs` | Shared Vite dev and frontend build runners |
| Tauri runners | `workflow/tauri.mjs` | Shared Tauri desktop and Android dev runners |
| Paths / forwarded args | `workflow/paths.mjs` | Repository root and CLI passthrough helpers |
| Runtime port math | `workflow/runtime.mjs` | Canonical instance-to-port/container mapping |
| Runtime tests | `workflow/runtime.test.mjs` | Keep updated when changing runtime port/container math |
| Port helpers | `workflow/ports.mjs` | Reserved/free TCP port helpers |
| Docker SITL lifecycle | `workflow/sitl.mjs` | Start/stop helpers; force-removes old containers |
| Managed SITL sessions | `workflow/sitl-session.mjs` | Runtime resolution, readiness wait, cleanup, signal handling |
| SITL WebSocket bridge | `workflow/sitl-ws.mjs` | Bridge config, port parsing, bridge lifecycle |
| WASM web outputs | `workflow/wasm-web.mjs` | Generated WASM transient-file cleanup policy |
| Process spawning / cleanup | `workflow/process.mjs` | Cleanup stack, managed children, process-group termination |
| TCP / HTTP readiness waits | `workflow/wait.mjs` | SITL and generic readiness polling |
| Native E2E helpers | `workflow/native-e2e.mjs` | Native driver ports, app path, Tauri/SITL build env |

## Target Rules

- SvelteKit/Vite defaults to the pure web platform and `dist/web`; `vite.config.ts` triggers `internal:wasm` for web builds/dev.
- Do not add a second explicit `wasm-pack` call to `dev:web` or `build:web`; keep Rust WASM compilation centralized in Vite + `wasm-web-build.mjs`.
- Keep `src/platform/web/generated/ironwing_wasm.d.ts` checked in and do not modify it unless intentionally regenerating bindings. Generated JS/WASM runtime files remain transient and ignored.
- Tauri dev/build entrypoints must pass `tauriFrontendEnv()` so frontend aliases use `src/platform/tauri/*` and output goes to `dist/tauri`.
- Remote UI must pass `IRONWING_PLATFORM=remote` through `remoteUiEnv()` and stay a local agent workflow, not an automated Playwright lane.
- Browser Playwright E2E is the Web/WASM + MAVKit demo-vehicle UI lane with no app-internal mocks; broad UI coverage belongs there.
- Native E2E in `e2e-native.mjs` remains the thin real-stack integration lane: debug Tauri build, Docker SITL, TCP connection defaults, and WebDriverIO. Do not convert it to demo-only or expand it to mirror browser UI coverage.
- The demo vehicle is a normal connection type backed by MAVKit, not a separate mock build target and not a replacement for native SITL/TCP coverage.

## Core Rules

- Use `pnpm` only for Node/package commands.
- Keep target-specific environment variables in `workflow/env.mjs`; entrypoints should compose helpers instead of duplicating `VITE_IRONWING_*` names.
- `workflow/runtime.mjs` is the Node-side source of truth for instance, port, and container mapping.
- `resolveRequestedRuntime()` uses a pinned instance when env vars are set, otherwise it scans for a free one.
- `runtimeEnv()` is the canonical env serialization passed into child processes.
- `sitl-session.mjs` is the high-level wrapper for scripts that need managed SITL lifecycle and cleanup.
- Use `runManagedChild()` for long-running child processes that must terminate during cleanup.
- `createCleanupRunner()` is a LIFO cleanup stack; register teardown in reverse dependency order.
- `terminateChild()` targets the whole process group on non-Windows. Do not replace it with naive child killing.
- `sitl.mjs` always force-removes any old container before starting a new one.
- When changing scripts or workflow behavior, update package scripts, docs, and focused workflow tests together.
