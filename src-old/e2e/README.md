# Archived browser proof suites

This directory preserves Playwright/browser proofs for legacy UI surfaces that no longer ship in the active Svelte runtime.

## What lives here

- Setup-flow, firmware, mission-editor, and guided-affordance browser suites that targeted the pre-quarantine frontend surface.
- Their supporting helpers and fixtures (`helpers/`, `fixtures/`).

## Active vs archived lane

- Active browser proofs stay under `e2e/` and are the only files targeted by the default `pnpm e2e` / `pnpm e2e:headed` scripts.
- Files in `src-old/e2e/` are archive/reference material. They should not be treated as current shipped-path verification.

## Usage rule

Read these specs when porting behaviors into the active Svelte runtime. Prefer rewriting the specific active-path assertion you need instead of moving archived suites back into the default Playwright lane.
