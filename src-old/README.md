# Legacy frontend quarantine

This directory holds archived frontend code that is intentionally outside the shipped runtime.

## Layout

- `src-old/runtime/` — the retired React entrypoint (`main.tsx` / `App.tsx`) that existed before milestone `M004-tk9luk` switched IronWing to the Svelte boot path.
- `src-old/legacy/` — the remaining React-era components, hooks, and related proof files moved out of active `src/` during the quarantine sweep.
- `src-old/e2e/` — archived Playwright/browser proofs for the retired setup, mission, guided, and firmware surfaces. These remain as rewrite context only and are not part of the active verification lane.

## Status

- Nothing under `src-old/` is part of the shipped frontend entrypoint.
- The active runtime now boots from `src/main.ts` and mounts `src/App.svelte`.
- The only active UI surface left under `src/components/` is the Svelte runtime set (`connection/`, `status/`, and `telemetry/`).

## Guardrail

Treat `src-old/` as read-only legacy context while the rewrite is in progress. Do not import from it into the active `src/` runtime.
