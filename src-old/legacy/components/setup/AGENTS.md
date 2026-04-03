# Setup UI (archived React reference)

## Overview

This directory preserves the archived React-era setup subsystem. It documents the old orchestration and helper layering for reference while the active runtime lives elsewhere in Svelte.

## Structure

```text
setup/
├── SetupSectionPanel.tsx      # archived setup tab orchestrator
├── FirmwareFlashWizard.tsx    # archived firmware flow UI
├── Accel/Compass/Radio...     # archived standalone wizard flows
├── sections/                  # archived section screens and local helpers
├── shared/                    # archived cross-section display + helper utilities
└── primitives/                # archived param input widgets
```

## Dependency Direction

```text
sections/ → shared/ → primitives/ → param-helpers.ts
```

- Keep this one-way when reading or porting patterns.
- `SetupSectionPanel.tsx` owns the archived section routing, nav state, staged tray placement, and cross-section navigation.
- Archived section registration and progress heuristics live with `src-old/legacy/hooks/use-setup-sections.ts`; the active neutral progress contract now lives in `src/lib/setup-sections.ts`.

## Shared Contracts

- `ParamInputParams` is the standard param prop shape across the archived setup primitives and sections.
- Docs links go through `resolveDocsUrl()` and `DocsLink`; do not hardcode ArduPilot URLs when porting behavior forward.
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
| Read archived section anatomy | `sections/AGENTS.md` | Legacy section rules and helper placement |
| Review archived setup navigation or staged tray behavior | `SetupSectionPanel.tsx`, `../../hooks/use-setup-sections.ts` | Cross-section orchestration reference |
| Review archived reusable param widgets | `primitives/` | Preserved prop and staged-badge conventions |
| Review archived cross-section helpers | `shared/` | Reuse before duplicating when porting forward |
