# Legacy React runtime quarantine

This directory holds the retired React frontend runtime that existed before milestone `M004-tk9luk` switched IronWing to a fresh Svelte boot path.

## Status

- `src-old/runtime/main.tsx` and `src-old/runtime/App.tsx` are preserved for reference only.
- Nothing under `src-old/` is part of the shipped frontend entrypoint.
- The active runtime now boots from `src/main.ts` and mounts `src/App.svelte`.

## Guardrail

Treat `src-old/` as read-only legacy context while the rewrite is in progress. Do not import from it into the active `src/` runtime.
