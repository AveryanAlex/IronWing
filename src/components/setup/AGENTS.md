# Setup UI

## Overview

The setup UI is a layered subsystem: orchestration at the top, shared helpers and param primitives underneath, then section files that compose those pieces into wizards and staged-config flows.

## Structure

```text
setup/
├── SetupSectionPanel.tsx      # setup tab orchestrator
├── FirmwareFlashWizard.tsx    # firmware flow UI
├── Accel/Compass/Radio...     # standalone wizard flows
├── sections/                  # section screens and local helpers
├── shared/                    # cross-section display + helper utilities
└── primitives/                # param input widgets
```

## Dependency Direction

```text
sections/ → shared/ → primitives/ → param-helpers.ts
```

- Keep this one-way. Do not import `sections/` from `shared/` or `primitives/`.
- `SetupSectionPanel.tsx` owns section routing, nav state, staged tray placement, and cross-section navigation.
- Section registration and progress heuristics live with `use-setup-sections.ts`, not inside random sections.

## Shared Contracts

- `ParamInputParams` is the standard param prop shape across setup primitives and sections.
- Docs links go through `resolveDocsUrl()` and `DocsLink`; do not hardcode ArduPilot URLs.
- Vehicle type branching goes through `shared/vehicle-helpers.ts`.
- Batch stage/apply previews go through `shared/PreviewStagePanel.tsx`.
- Setup status visuals go through `shared/SectionStatusIcon.tsx` and `shared/SetupCheckbox.tsx`.
- Param display formatting goes through `shared/param-format-helpers.ts` or `primitives/param-helpers.ts`.

## Tests

- Keep helper tests close to the layer they serve: `shared/*.test.ts`, `primitives/*.test.ts`, `sections/*.test.ts`.
- Runtime jsdom tests belong only where behavior is genuinely UI-specific (`SetupCheckbox`, `PreviewStagePanel`, etc.).
- Do not revive source-grep tests in this subtree.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Add a new section | `sections/AGENTS.md` | Section anatomy and local helper rules |
| Change setup navigation or staged tray behavior | `SetupSectionPanel.tsx`, `hooks/use-setup-sections.ts` | Cross-section orchestration |
| Add a reusable param widget | `primitives/` | Preserve `ParamInputParams` and staged-badge conventions |
| Add a cross-section setup helper | `shared/` | Reuse before duplicating section logic |
