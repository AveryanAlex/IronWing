# Frontend development guidelines

## Overview

- `src/` is the shipped Svelte runtime mounted from `src/main.ts`.

## Required Skills

- Before writing, editing, or reviewing any `.svelte`, `.svelte.ts`, or `.svelte.js` file in `src/`, ALWAYS load `svelte-code-writer` and `svelte-core-bestpractices`.
- If a frontend task is mostly advanced type design in shared `.ts` helpers, also load `typescript-advanced-types`.

## Core Rules

- Keep active `src/` on `.svelte` and neutral `.ts` only. Do not introduce alternate frontend runtimes into active code.
- Frontend IPC imports go through `@platform/core`, `@platform/event`, or `@platform/http` only.
- Put shared state and shared logic in Svelte stores or neutral helpers under `src/lib/*`, not ad-hoc component or module globals.
- Keep Rust and TypeScript wire contracts aligned. Event payloads use Rust serde names; invoke arguments stay camelCase on the frontend.
- If you change SITL runtime port math, update `scripts/workflow/runtime.mjs` and its tests.

## Styling Rules

- Prefer Tailwind for new UI code.
- Use shared theme tokens from `src/styles/*` and the Tailwind v4 theme layer instead of introducing one-off colors or spacing values.
- Keep raw CSS for `src/styles/*`, vendor overrides, generated/map DOM, and dense visual widgets where utilities would reduce clarity.
- If a component needs custom CSS, keep it scoped and minimal. Do not add large style blocks to otherwise utility-first components without a clear reason.
- New UI must work cleanly on mobile phones, tablets, and desktop; for layout changes, verify phone-width scrolling containers, dialogs/drawers, sticky bars, bottom safe-area spacing, usable tap targets, and behavior that does not depend on mouse-only interaction.

## Svelte Rules

- Use Svelte 5 for active frontend code.
- Prefer runes-mode patterns such as `$props`, `$state`, `$derived`, and `$effect` over legacy APIs.
- Async Svelte is enabled in this repo.
- Use awaited markup and `<svelte:boundary>` when they make lazy or pending UI materially simpler.
- Do not force async Svelte into routine imperative flows that are already clearer as regular `async` functions in `<script>`.

## Where To Look

- Bootstrap and shell: `main.ts`, `App.svelte`, `app/shell/*`
- Reusable view primitives: `components/ui/*`
- Feature UI: `components/<feature>/*`
- Shared stores, helpers, and domain glue: `lib/*` plus top-level bridge/domain files like `session.ts`, `telemetry.ts`, `mission.ts`, `params.ts`, `logs.ts`, and `firmware.ts`
- Static data, global styles, and platform boundary: `data/*`, `styles/*`, `platform/*`

## Entry Points

- Shell and workspace orchestration: `app/shell/*`
- Connection flow: `components/connection/*`
- Setup: `components/setup/*`, `lib/stores/setup-workspace.ts`, `lib/setup-sections.ts`
- Mission: `components/mission/*`, `lib/mission-*`, `lib/stores/mission-planner-view.ts`
- Parameters: `components/params/*`, `lib/params/*`, `lib/stores/params.ts`
- Logs and playback: `components/logs/*`, `logs.ts`, `recording.ts`, `playback.ts`
- Firmware: `components/firmware/*`, `firmware.ts`
