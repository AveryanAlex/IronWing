# Setup Sections

## Overview

Section files are the leaf setup screens. They compose shared setup primitives, read staged/current params, and present docs-backed workflows without owning global setup orchestration.

## Standard Section Anatomy

1. Top-level `SetupSectionIntro`
2. One or more cards with `SectionCardHeader`
3. Param widgets from `../primitives/*`
4. Optional batch preview via `PreviewStagePanel`
5. Optional local pure helpers for section-specific calculations

## Rules

- Prefer extracting pure helpers in the section file or adjacent helper module before adding UI-specific logic.
- Use `resolveDocsUrl()` for docs. Never hardcode ArduPilot URLs.
- Use `ParamInputParams` and the shared primitives instead of ad-hoc inputs when the UI is param-backed.
- Reuse `vehicle-helpers.ts`, `prearm-helpers.ts`, and `initial-params-selection.ts` instead of re-implementing those behaviors inline.
- Keep section-local batch staging flows compatible with `PreviewStagePanel` and include `paramName` when row navigation matters.
- Prefer subscription through hooks/bridges. Direct event subscriptions in this subtree are exceptions, not the default.

## Special Cases

- `OverviewSection.tsx` is the setup dashboard and action hub.
- `FirmwareSection.tsx` is a thin wrapper over `FirmwareFlashWizard.tsx`.
- `FullParametersSection.tsx` is a wrapper around `ConfigPanel.tsx`, not an independent settings system.

## Tests

- Keep section tests behavior-focused: helpers, derived defaults, option tables, conversion logic, state-machine helpers.
- Use jsdom only when real runtime rendering or interaction matters.
- Do not add structural/source-order/class-name assertions against section source.
