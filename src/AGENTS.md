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
- Use shared theme tokens from `src/styles/*` and the Tailwind v4 `@theme` layer instead of introducing one-off colors, spacing, or radius values. Do not add `tailwind.config.js`.
- Prefer the standard Tailwind text scale such as `text-xs`, `text-sm`, `text-base`, and `text-lg` before arbitrary font sizes.
- Prefer the standard spacing scale such as `gap-2/3/4`, `p-2/3/4`, and related utilities before custom spacing values.
- Prefer semantic theme utilities such as `text-text-primary`, `bg-bg-secondary`, and `border-border` over hardcoded palette classes.
- Prefer `rounded-md`, `rounded-lg`, and `rounded-full` over arbitrary radius utilities.
- Prefer standard breakpoints such as `sm`, `md`, `lg`, and `xl` before arbitrary breakpoint values.
- Keep arbitrary utilities for true exceptions only: dense widgets, generated or map DOM, HUD or chart overlays, range pseudo-elements, calc-based geometry, and similar cases where standard utilities would reduce clarity.
- Keep raw CSS for `src/styles/*`, vendor overrides, generated/map DOM, and the same exceptional dense visual widgets where utilities would reduce clarity.
- If a component needs custom CSS, keep it scoped and minimal. Do not add large style blocks to otherwise utility-first components without a clear reason.
- New UI must work cleanly on mobile phones, tablets, and desktop; for layout changes, verify phone-width scrolling containers, dialogs/drawers, sticky bars, bottom safe-area spacing, usable tap targets, and behavior that does not depend on mouse-only interaction.

## Icon Rules

- Use `lucide-svelte` for generic UI icons, don't hand-copy generic Lucide SVG paths.
- Decorative icons must be hidden from assistive tech with `aria-hidden="true"`; icon-only controls still need explicit accessible labels or titles.
- Prefer `size={14}` for dense labels/navigation and `size={16}` for normal controls. Let icons inherit `currentColor` through text color utilities.
- Keep custom SVGs for domain graphics such as vehicle markers, HUD instruments, motor diagrams, and generated/map DOM where a Lucide glyph would be less accurate.

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
