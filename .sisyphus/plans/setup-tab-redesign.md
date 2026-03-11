# Setup Tab Redesign — Section-Based Configuration

## TL;DR

> **Quick Summary**: Replace IronWing's 7-step linear setup wizard and merge with Config tab into a single section-based Setup tab with 18 purpose-built panels. Each section uses INAV Configurator-style UI (labeled controls, visual previews, human-readable labels from ArduPilot param metadata). Goal: flash firmware elsewhere → configure entirely in IronWing → fly.
>
> **Deliverables**:
> - New section-based Setup tab shell with sidebar navigation (5 groups, 18 sections)
> - Shared param input primitives (ParamSelect, ParamNumberInput, ParamBitmaskInput, ParamToggle)
> - 10 new section components (GPS, RC, Battery, RTL, Geofence, Arming, PID Tuning, Serial Ports, Peripherals, Initial Params)
> - 5 refactored section components (Overview, Frame, Calibration, Flight Modes, Failsafe)
> - 3 extracted section components (Motors, Servos, Full Parameters)
> - Config tab removed; raw param browser moved to "Full Parameters" section
> - Motor layout diagram data (APMotorLayout.json) + battery/sensor presets
> - Section completion tracking with param-derived heuristics
> - ArduCopter and ArduPlane support throughout
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 4 waves + final verification
> **Critical Path**: T1 (primitives) → T6 (tab merge + shell wiring) → T26 (cleanup)

---

## Context

### Original Request
Replace the linear setup wizard with a section-based Setup tab. Merge Config tab into it. Add purpose-built UI for every parameter needed to go from flashed flight controller to flying: GPS, RC, battery, motors, servos, serial ports, failsafe, RTL, geofence, arming, PID tuning, initial parameter calculator, and auto-generated peripheral config. Support ArduCopter and ArduPlane. Keep raw param browser as "Full Parameters" section.

### Interview Summary
**Key Discussions**:
- **Layout**: Section-based with sidebar navigation, not linear wizard. Free-form access to any section.
- **Tab merge**: Setup + Config tabs merge into one "Setup" tab. Config content becomes "Full Parameters" section.
- **18 sections in 5 sidebar groups**: Essential Setup, Hardware, Safety, Tuning, Peripherals & Advanced.
- **Peripherals**: Auto-generated param sections from ArduPilot XML metadata for simple peripherals (rangefinder, airspeed, opt flow, gimbal, compass config). One reusable component.
- **PID tuning**: Extended panel covering ATC_RAT_*, ATC_ANG_*, PSC_*, filter params. Initial Parameters calculator provides starting values.
- **Param metadata**: Already fetched and cached in IronWing (`param-metadata.ts`) — use for labels, descriptions, enum dropdowns.
- **Test strategy**: Vitest (tests-after) for logic-heavy tasks (T1, T3, T4, T5, T22). UI section components (T6-T21) verified by typecheck + manual testing only. User tests all runtime/visual behavior manually.
- **OSD**: Deferred to a future plan — too complex for this scope.
- **Excluded**: Firmware flashing, BLHeli passthrough.

**Research Findings**:
- MissionPlanner has ~30 setup sections in 2 groups (Mandatory/Optional Hardware) but no dedicated GPS, RTL, or Arming sections — IronWing innovations.
- INAV Configurator has ~27 tabs with excellent purpose-built UX patterns (motor SVG diagrams, 3D orientation preview, battery config panels, ESC protocol dropdowns, servo config tables).
- ArduPilot params grouped into 13 categories with clear must-configure vs nice-to-have priority. Recommended setup order documented.
- IronWing already has: param metadata fetching, param staging workflow, calibration wizards (accel, compass, radio), motor test IPC, flight mode presets.

### Metis Review
**Identified Gaps** (addressed):
- **Duplicated param primitives**: `ParamDropdown` exists in both `FailsafeStep` and `FrameMotorStep` with different implementations. `getStagedOrCurrent()` is copy-pasted into every step. → Extract shared primitives in Wave 1 before any sections.
- **Two near-identical staged diff bars**: `WizardStagedBar` and `StagedDiffPanel` in ConfigPanel. → Unify into one component in the new section shell.
- **Mobile nav for 18 sections**: Horizontal scroll strip (current wizard) unusable for 18 items. → Use collapsible group accordion in a slide-out drawer on mobile.
- **Double sidebar layout**: Vehicle control sidebar + section nav sidebar = cramped on 1024-1280px. → Section nav uses narrower rail on medium screens; full sidebar on wide. Vehicle sidebar is in outer layout, not our concern.
- **Metadata loading race**: Section opens before metadata arrives → no descriptions. → Every param input must render raw param name/value as fallback.
- **Copter vs Plane divergence**: Several sections differ significantly (frame, motors, tuning, failsafe). → Config-driven conditional content within shared components; vehicle type detected from heartbeat `vehicleState.vehicle_type`.
- **Section completion without wizard flow**: "Free-form access" but overview tracks progress. → Lightweight param-derived status badges (e.g., GPS section ✓ if `GPS1_TYPE != 0`), not blocking gates.
- **Config tab removal muscle memory**: Users who navigate to Config lose their workflow. → Keep a redirect or alias; Full Parameters section has all ConfigPanel functionality.
- **Cross-param validation**: Battery (LOW > CRT voltages), Geofence (MAX > MIN alt), Serial (protocol conflicts). → Inline validation warnings in purpose-built sections.
- **Unmount/remount state loss**: If sections unmount on switch, half-typed input is lost. → Param staging preserves all edits; re-renders from staged state.

### INAV Configurator UX Patterns (design reference)
- **Motor diagrams**: SVG per frame type showing circles with CW/CCW arrows, numbered labels, arm lines, nose direction arrow.
- **Battery config**: Purpose-built panel with voltage meter type dropdown, cell count, per-cell voltages, capacity, live voltage/current readout.
- **Board orientation**: 3D preview with dropdown (ArduPilot uses fixed AHRS_ORIENTATION presets, not free-angle sliders).
- **Outputs**: ESC protocol dropdown, motor test with visual diagram overlay, per-motor sliders.
- **Ports**: Table with one row per UART, columns for each protocol type (MSP, telemetry, RC, sensors, peripherals).
- **Receiver**: Type dropdown, serial RX protocol, channel map, RSSI source, RC smoothing.
- **Principle**: Each setting has a human-readable label. Visual previews where helpful. Raw CLI/param access available but not primary.

---

## Work Objectives

### Core Objective
Replace IronWing's linear 7-step setup wizard and Config tab with a unified section-based Setup tab containing 18 purpose-built panels, enabling complete from-scratch vehicle configuration for ArduCopter and ArduPlane.

### Concrete Deliverables
- `src/components/setup/SetupSectionPanel.tsx` — New section-based shell with sidebar nav
- `src/components/setup/primitives/` — Shared param input components (5+ files)
- `src/components/setup/sections/` — 18 section components
- `src/hooks/use-setup-sections.ts` — Section navigation + completion tracking hook
- `src/data/motor-layouts.json` — Motor position data from APMotorLayout.json
- `src/data/battery-presets.ts` — Sensor/board preset constants
- Modified `src/types.ts`, `src/App.tsx`, `src/components/TopBar.tsx`, `src/components/BottomNav.tsx` — Tab merge

### Definition of Done
- [x] `pnpm run frontend:typecheck` passes with zero errors
- [x] `pnpm run frontend:build` succeeds (Vite production build)
- [x] `pnpm test` passes (all vitest tests including new ones from T1, T3, T4, T5)
- [x] Setup tab shows sidebar with 5 groups and 18 sections
- [x] Clicking any section renders its purpose-built panel
- [x] Config tab no longer exists in navigation
- [x] Full Parameters section provides all raw param browser functionality
- [x] Staging params in any section shows them in the shared staged bar
- [x] Every section renders without crashing when params/metadata/vehicleState are null

### Must Have
- All 18 sections rendering with correct param controls
- Shared param primitives used consistently (no duplicated implementations)
- Mobile-responsive layout (drawer navigation for sections)
- ArduCopter and ArduPlane conditional content where params differ
- Param metadata labels/descriptions/enum values used throughout
- Inline validation warnings for cross-param relationships
- Section completion indicators in Overview (param-derived heuristics)

### Must NOT Have (Guardrails)
- No Context, Redux, Zustand, or any state management library — keep hooks + prop drilling
- No new Tauri IPC commands unless a section requires functionality not currently available
- No changes to `useParams` hook API — only consume it, create wrapper hooks if needed
- No OSD layout editor (deferred to future plan)
- No firmware flashing, BLHeli passthrough
- No AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp)
- No `as any` or `@ts-ignore` — proper TypeScript types throughout
- No broken intermediate states — every commit must typecheck and build

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** for build verification. User handles all functional/visual testing.

### Test Decision
- **Infrastructure exists**: YES — vitest 4.0.18 configured
- **Automated tests**: YES (tests-after) — logic-heavy tasks only
- **Framework**: vitest (`pnpm test` = `vitest run`)
- **Test scope**: T1 (`param-helpers.ts`), T3 (completion heuristics), T4 (motor layout lookups), T5 (battery presets + calculator formulas), T22 (references T5 formula tests)
- **NOT tested**: UI section components (T6-T21, T23-T24) — typecheck + manual testing only
- **Automated gates**: `pnpm run frontend:typecheck` + `pnpm run frontend:build` + `pnpm test`

### Test Conventions (match existing codebase)
- Test files: colocated as `*.test.ts` next to source (e.g., `param-helpers.test.ts` beside `param-helpers.ts`)
- Environment: `node` by default. Use `// @vitest-environment jsdom` directive when DOM APIs needed.
- Imports: `import { describe, it, expect } from "vitest"`
- Pattern: Test pure/exported functions directly. No React component rendering (no @testing-library/react).
- Reference: `src/param-metadata.test.ts`, `src/playback.test.ts`, `src/lib/mav-commands.test.ts` for style.

### QA Policy
Every task MUST pass `pnpm run frontend:typecheck` before completion.
Logic-heavy tasks (T1, T3, T4, T5, T22) MUST also pass `pnpm test`.
Evidence: terminal output showing zero errors from typecheck + test commands.
User handles all functional and visual testing (runtime QA requires SITL + connected vehicle).

**Agent-Executable Structural QA** (applies to ALL tasks):
Since the app requires a connected vehicle to render meaningful UI, agent QA is structural verification via file reads and grep — NOT runtime browser testing. Each task's QA scenario verifies:
1. **File exists**: Read the created/modified files
2. **Typecheck passes**: `pnpm run frontend:typecheck` exits with 0
3. **Build succeeds**: `pnpm run frontend:build` exits with 0
4. **Tests pass** (T1, T3, T4, T5, T22): `pnpm test` exits with 0
5. **Structure correct**: Grep for expected exports, imports, patterns
6. **No forbidden patterns**: Grep for `as any`, `@ts-ignore`, duplicated primitives, wrong API usage

Tool for all structural QA: **Bash** (grep, read file, run typecheck/build/test commands).

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — shared primitives + data):
├── T1: Extract shared param primitives [quick]
├── T2: Section shell + sidebar navigation component [visual-engineering]
├── T3: Section completion tracking hook [quick]
├── T4: Motor layout JSON data + TS types [quick]
└── T5: Battery/sensor preset constants [quick]

Wave 2 (Tab merge + ALL section components, MAX PARALLEL):
├── T6: Tab merge + wire section shell (depends: T2) [quick]
├── T7: Overview section (depends: T1, T3) [visual-engineering]
├── T8: Frame & Orientation section (depends: T1) [visual-engineering]
├── T9: Calibration section (depends: T1) [visual-engineering]
├── T10: RC / Receiver section (depends: T1) [visual-engineering]
├── T11: GPS section (depends: T1) [visual-engineering]
├── T12: Battery Monitor section (depends: T1, T5) [visual-engineering]
├── T13: Full Parameters section (depends: T1) [visual-engineering]
├── T14: Motors & ESC section (depends: T1, T4) [visual-engineering]
├── T15: Servo Outputs section (depends: T1) [visual-engineering]
├── T16: Serial Ports section (depends: T1) [visual-engineering]
├── T17: Flight Modes section (depends: T1) [visual-engineering]
├── T18: Failsafe section (depends: T1) [visual-engineering]
├── T19: RTL / Return section (depends: T1) [quick]
├── T20: Geofence section (depends: T1) [quick]
└── T21: Arming section (depends: T1) [visual-engineering]

Wave 3 (Complex sections, PARALLEL):
├── T22: Initial Parameters calculator (depends: T1, T5) [deep]
├── T23: PID Tuning section (depends: T1) [visual-engineering]
└── T24: Auto-generated Peripherals section (depends: T1) [deep]

Wave 4 (Cleanup + polish):
├── T25: Delete old wizard + ConfigPanel + dead code (depends: ALL T6-T24) [quick]
└── T26: Mobile responsive polish + final integration (depends: T25) [visual-engineering]

Wave FINAL (Verification, 3 parallel):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
└── F3: Scope fidelity check [deep]

Critical Path: T1 → T6 → T25 → T26 → F1-F3
Parallel Speedup: ~75% faster than sequential
Max Concurrent: 16 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T6-T24 | 1 |
| T2 | — | T6 | 1 |
| T3 | — | T7 | 1 |
| T4 | — | T14 | 1 |
| T5 | — | T12, T22 | 1 |
| T6 | T2 | T25 | 2 |
| T7 | T1, T3 | T25 | 2 |
| T8-T11 | T1 | T25 | 2 |
| T12 | T1, T5 | T25 | 2 |
| T13 | T1 | T25 | 2 |
| T14 | T1, T4 | T25 | 2 |
| T15-T21 | T1 | T25 | 2 |
| T22 | T1, T5 | T25 | 3 |
| T23-T24 | T1 | T25 | 3 |
| T25 | T6-T24 | T26 | 4 |
| T26 | T25 | F1-F3 | 4 |
| F1-F3 | T26 | — | Final |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1,T3,T4,T5 → `quick`; T2 → `visual-engineering`
- **Wave 2**: 16 tasks — T6 → `quick`; T7-T18,T21 → `visual-engineering`; T19,T20 → `quick`
- **Wave 3**: 3 tasks — T22,T24 → `deep`; T23 → `visual-engineering`
- **Wave 4**: 2 tasks — T25 → `quick`; T26 → `visual-engineering`
- **Final**: 3 tasks — F1 → `oracle`; F2 → `unspecified-high`; F3 → `deep`

---

## TODOs

### Wave 1 — Foundation (all parallel, no dependencies)

- [x] 1. Extract shared param input primitives

  **What to do**:
  - Create `src/components/setup/primitives/` directory with these reusable components:
    - `ParamSelect.tsx` — Dropdown for enum params. Props: `paramName`, `params` (from `useParams` return type — includes `store`, `staged`, `metadata`). Reads `metadata.get(paramName)?.values` array (`{code, label}[]`) to populate `<option>` elements with human-readable labels. Falls back to raw numeric value if no metadata. Uses `getStagedOrCurrent()` for current value. Calls `params.stage(name, Number(value))` on change. Shows `rebootRequired` badge if metadata indicates it.
    - `ParamNumberInput.tsx` — Numeric input for scalar params. Same props pattern. Uses `metadata.get(paramName)?.range` (`{min, max}`) for input validation. Shows `units` or `unitText` suffix. Calls `params.stage()` on change. Shows `rebootRequired` warning badge from metadata.
    - `ParamBitmaskInput.tsx` — Checkbox group for bitmask params. Same props. Reads `metadata.get(paramName)?.bitmask` array (`{bit, label}[]`) for checkbox labels. Each checkbox toggles its bit in the integer value. Stages the computed integer via `params.stage()`.
    - `ParamToggle.tsx` — Simple on/off toggle for boolean-like params (0/1). Same props. Shows metadata `humanName` as label, `description` as helper text.
    - `ParamDisplay.tsx` — Read-only param value display with metadata label. For informational params.
    - `param-helpers.ts` — Shared utilities:
      - `getStagedOrCurrent(paramName, params)` — Returns staged value from `params.staged.get(paramName)` if exists, else current from `params.store?.params.find(p => p.name === paramName)?.value`. Consolidates the copy-pasted pattern from every existing wizard step.
      - `getParamMeta(paramName, metadata)` — Safe lookup: `metadata?.get(paramName) ?? null`.
      - `formatParamValue(value, meta)` — Format value with units, find matching `values[]` entry label for enums, etc.
  - Each component must handle gracefully: `params.store === null` (no download), `metadata === null` (still loading), param not found in store.
  - Study the existing duplicated implementations in `FrameMotorStep.tsx` (lines ~50-120 for its `ParamDropdown`) and `FailsafeStep.tsx` (its own `ParamDropdown`) to understand the pattern, then build a unified version.

  **Must NOT do**:
  - Do NOT modify any existing wizard step files — just create new primitives
  - Do NOT introduce any state management library
  - Do NOT change the `useParams` hook API

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Param inputs need proper styling consistent with existing codebase

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5)
  - **Blocks**: T6-T24 (all sections depend on these primitives)
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/components/setup/wizard/FrameMotorStep.tsx:47-120` — Existing `ParamDropdown` implementation with `getStagedOrCurrent` pattern. Study this to understand the param metadata → dropdown mapping. The new `ParamSelect` replaces this.
  - `src/components/setup/wizard/FailsafeStep.tsx:10-55` — Another `ParamDropdown` implementation (slightly different API). Shows the duplication problem.
  - `src/components/setup/wizard/FrameMotorStep.tsx:122-170` — Existing numeric param input pattern. Shows how `params.stage(name, value)` is called.

  **API/Type References** (contracts to implement against):
  - `src/hooks/use-params.ts:27-37` — `ReturnType<typeof useParams>` is the `params` prop type. Key fields: `params.store: ParamStore | null` (current vehicle values), `params.staged: Map<string, number>` (pending edits), `params.metadata: ParamMetadataMap | null` (from `fetchParamMetadata`). Key method: `params.stage(name, value)` stages an edit.
  - `src/param-metadata.ts:3-15` — `ParamMeta` type with fields: `humanName: string`, `description: string`, `range?: { min: number; max: number }`, `increment?: number`, `units?: string`, `unitText?: string`, `values?: { code: number; label: string }[]` (enum options as array, NOT Map), `bitmask?: { bit: number; label: string }[]` (bit options as array, NOT Map), `rebootRequired?: boolean`, `readOnly?: boolean`, `userLevel?: "Standard" | "Advanced"`. Metadata is accessed via `params.metadata` (a `Map<string, ParamMeta>` returned by `useParams`), NOT a separate hook.

  **External References**:
  - ArduPilot param metadata XML: `https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml` — Source of metadata values/bitmask/range used by `param-metadata.ts`.

  **Acceptance Criteria**:
- [x] `src/components/setup/primitives/` directory exists with 6 files
- [x] `pnpm run frontend:typecheck` passes
- [x] `ParamSelect` renders a `<select>` populated from metadata `values` array (`{code, label}[]`)
- [x] `ParamNumberInput` renders an `<input type="number">` with `range.min`/`range.max` validation
- [x] `ParamBitmaskInput` renders checkboxes for each entry from metadata `bitmask` array (`{bit, label}[]`)
- [x] All components call `params.stage()` on user input (never `params.write()`)
- [x] All components handle null store/metadata/param gracefully (no crash)
- [x] `pnpm test` passes (tests for param-helpers.ts)

  **Tests** (tests-after — create `src/components/setup/primitives/param-helpers.test.ts`):

  Test `getStagedOrCurrent()`:
  - Returns staged value when param is staged (`staged.get(name)` exists)
  - Returns current value when param is not staged but exists in `store.params`
  - Returns `undefined` (or null) when param is neither staged nor in store
  - Returns staged value even when current also exists (staged takes precedence)
  - Handles `store === null` gracefully (returns undefined/null, no crash)

  Test `getParamMeta()`:
  - Returns `ParamMeta` object when metadata map has the param
  - Returns `null` when param not in metadata map
  - Returns `null` when metadata is `null` (still loading)

  Test `formatParamValue()`:
  - Returns matching enum label when value matches a `values[]` entry code
  - Returns raw numeric string when no matching enum entry
  - Appends unit suffix when metadata has `units` or `unitText`
  - Returns raw value when metadata is null

  Reference existing test style: `src/param-metadata.test.ts` (pure function tests with `describe/it/expect`).

  **QA Scenarios**:
  ```
  Scenario: Primitives directory structure
    Tool: Bash (ls + grep)
    Steps:
      1. ls src/components/setup/primitives/ — verify 6+ files exist (ParamSelect, ParamNumberInput, ParamBitmaskInput, ParamToggle, ParamDisplay, param-helpers)
      2. grep 'getStagedOrCurrent' src/components/setup/primitives/param-helpers.ts — verify helper exported
      3. grep 'params.stage' src/components/setup/primitives/ParamSelect.tsx — verify staging call present
      4. grep -r 'as any\|@ts-ignore' src/components/setup/primitives/ — must be zero matches
      5. Run pnpm run frontend:typecheck — exit 0
      6. Run pnpm test — all pass (includes param-helpers.test.ts)
    Expected Result: 6 files, helpers exported, staging used, no type escapes, all gates pass
  ```

  **Commit**: YES
  - Message: `feat(setup): extract shared param input primitives`
  - Files: `src/components/setup/primitives/*`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 2. Section shell + sidebar navigation component

  **What to do**:
  - Create `src/components/setup/SetupSectionPanel.tsx` — The new top-level setup component replacing `SetupWizardPanel.tsx`. Layout:
    - **Desktop (lg+)**: Left sidebar (w-56) with section groups + right content area. Sidebar has 5 collapsible groups (Essential Setup, Hardware, Safety, Tuning, Peripherals & Advanced). Each group shows its sections as nav items. Active section highlighted with `bg-accent/10 text-accent` (existing wizard sidebar pattern from `SetupWizardPanel.tsx:317-341`). Each nav item shows a completion status icon (✓/○).
    - **Mobile (<lg)**: Full-width content with a hamburger button that opens a slide-out drawer containing the grouped section nav. Use Radix `Dialog` or similar for the drawer.
    - **Bottom**: Persistent `StagedParamsBar` — unified version of the existing `WizardStagedBar` and `StagedDiffPanel`. Shows count of staged params, expandable diff list, "Apply Changes" and "Discard All" buttons. Always visible when there are staged changes.
  - Define `SetupSectionId` type union with all 18 section IDs: `"overview" | "frame_orientation" | "calibration" | "rc_receiver" | "gps" | "battery_monitor" | "motors_esc" | "servo_outputs" | "serial_ports" | "flight_modes" | "failsafe" | "rtl_return" | "geofence" | "arming" | "initial_params" | "pid_tuning" | "peripherals" | "full_parameters"`.
  - Define `SETUP_SECTIONS` constant array with metadata per section: `{ id, label, icon (Lucide), group }`.
  - Define `SECTION_GROUPS` constant: `[{ id, label, sections[] }]`.
  - The content area renders the active section component via a switch statement (like current `renderStep()` in `SetupWizardPanel.tsx:56-93`). Initially use placeholder `<div>Section: {id}</div>` stubs — real sections added by other tasks.
  - The component receives the same props as current `SetupWizardPanel`: `params`, `vehicleState`, `telemetry`, `connected`, `sensorHealth`, `metadata`, etc.

  **Must NOT do**:
  - Do NOT delete `SetupWizardPanel.tsx` yet — it's still wired in App.tsx until T6
  - Do NOT introduce Context/Redux — receive props from App.tsx
  - Do NOT build real section content — just stubs

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Sidebar layout, mobile drawer, responsive breakpoints

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4, T5)
  - **Blocks**: T6 (tab merge needs this shell to wire)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/setup/SetupWizardPanel.tsx:317-341` — Existing sidebar implementation to match style: `w-56`, `border-r`, active item `bg-accent/10 text-accent`, group headers. Extend this pattern to 5 groups.
  - `src/components/setup/SetupWizardPanel.tsx:56-93` — Existing `renderStep()` switch statement pattern for content rendering. Same pattern but with 18 section IDs.
  - `src/components/setup/SetupWizardPanel.tsx:343-376` — Existing mobile horizontal scroll strip. Replace with drawer approach for 18 sections.
  - `src/components/setup/SetupWizardPanel.tsx:252-315` — Existing `WizardStagedBar` implementation — reuse the staged diff display logic but make it a standalone component.

  **API/Type References**:
  - `src/hooks/use-setup-wizard.ts:1-30` — `WizardStepId` type union + `STEPS` array. Same pattern for `SetupSectionId` + `SETUP_SECTIONS`.
  - `src/hooks/use-breakpoint.ts` — `useBreakpoint()` hook for responsive layout. `isLg` = desktop sidebar, `!isLg` = mobile drawer.
  - `src/types.ts:ActiveTab` — The tab type. Will be modified by T6 to remove `"config"`.

  **Acceptance Criteria**:
- [x] `SetupSectionPanel.tsx` exists and renders sidebar + content area
- [x] `SetupSectionId` type has 18 literals
- [x] `SETUP_SECTIONS` and `SECTION_GROUPS` constants defined
- [x] Desktop: sidebar with 5 collapsible groups, clickable section items
- [x] Mobile: drawer triggered by hamburger button
- [x] Staged params bar at bottom (persistent when staged changes exist)
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Shell component structure
    Tool: Bash (grep + read)
    Steps:
      1. Read src/components/setup/SetupSectionPanel.tsx — verify file exists and exports a React component
      2. grep 'SetupSectionId' in the file — verify type union is defined or imported
      3. grep 'SECTION_GROUPS' in the file — verify 5 groups defined
      4. grep 'SETUP_SECTIONS' in the file — verify 18 sections defined
      5. grep 'overview.*frame_orientation.*calibration.*rc_receiver.*gps' — verify section IDs present
      6. grep 'useBreakpoint' — verify responsive breakpoint hook is used
      7. Run pnpm run frontend:typecheck — must exit 0
      8. Run pnpm run frontend:build — must exit 0
    Expected Result: File exists, exports component, has 18 section IDs in 5 groups, typecheck+build pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add section-based shell with sidebar navigation`
  - Files: `src/components/setup/SetupSectionPanel.tsx`
  - Pre-commit: `pnpm run frontend:typecheck`

- [x] 3. Section completion tracking hook

  **What to do**:
  - Create `src/hooks/use-setup-sections.ts` — Hook that manages section navigation state and computes completion status for each section based on param-derived heuristics.
  - **Navigation state**: `activeSection: SetupSectionId`, `setActiveSection(id)`. Persist to `localStorage` keyed by `ironwing_setup_section_{sysId}` so the active section survives page reload.
  - **Completion heuristics** — Lightweight param-derived status badges (not blocking gates). Return `Map<SetupSectionId, SectionStatus>` where `SectionStatus = "not_started" | "in_progress" | "complete"`. Rules:
    - `frame_orientation`: `complete` if `FRAME_CLASS > 0` (copter) or always `complete` for plane
    - `calibration`: `complete` if accel offsets ≠ 0 AND compass offsets ≠ 0 AND RC calibrated (reuse existing `deriveStepCompletion` logic from `use-setup-wizard.ts`)
    - `gps`: `complete` if `GPS1_TYPE > 0` (or `GPS_TYPE > 0` for older firmware)
    - `battery_monitor`: `complete` if `BATT_MONITOR > 0`
    - `motors_esc`: `complete` if `FRAME_CLASS > 0` (motors auto-assigned)
    - `flight_modes`: user confirmation (localStorage checkbox)
    - `failsafe`: user confirmation (localStorage checkbox)
    - `rc_receiver`: `complete` if `RC1_MIN != 1100` (default) — means RC calibrated
    - Other sections: `not_started` by default (no param-derived heuristic; user can mark complete in Overview)
  - Hook accepts `params`, `sensorHealth` as inputs (same as current `use-setup-wizard.ts`).
  - Export a `computeOverallProgress()` function: `{ completed: number, total: number, percentage: number }`.

  **Must NOT do**:
  - Do NOT delete `use-setup-wizard.ts` yet — still used until T25
  - Do NOT use localStorage for ALL section completion — only for user-confirmed sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4, T5)
  - **Blocks**: T7 (Overview section uses completion data)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/hooks/use-setup-wizard.ts:140-250` — Existing `deriveStepCompletion()` function. Shows param-derived completion logic for calibration, frame, etc. Reuse the same thresholds and param checks.
  - `src/hooks/use-setup-wizard.ts:50-90` — Existing `WizardStep` type and `STEPS` array. Same concept but for sections.
  - `src/hooks/use-setup-wizard.ts:252-297` — localStorage persistence pattern for per-vehicle state.

  **Acceptance Criteria**:
- [x] `use-setup-sections.ts` exports `useSetupSections()` hook
- [x] Returns `activeSection`, `setActiveSection`, `sectionStatuses`, `overallProgress`
- [x] At least 6 sections have param-derived completion heuristics
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm test` passes (tests for completion heuristics)

  **Tests** (tests-after — create `src/hooks/use-setup-sections.test.ts`):

  Extract completion heuristic logic into pure testable functions (e.g., `computeSectionStatuses(params, sensorHealth)` and `computeOverallProgress(statuses)`). Test those functions, not the React hook itself.

  Test `computeSectionStatuses()`:
  - `frame_orientation`: returns `"complete"` when `FRAME_CLASS > 0` (copter)
  - `frame_orientation`: returns `"complete"` always for plane vehicle type
  - `gps`: returns `"complete"` when `GPS1_TYPE > 0`
  - `gps`: returns `"not_started"` when `GPS1_TYPE === 0`
  - `battery_monitor`: returns `"complete"` when `BATT_MONITOR > 0`
  - `rc_receiver`: returns `"complete"` when `RC1_MIN !== 1100` (calibrated)
  - Returns `"not_started"` for sections without heuristics

  Test `computeOverallProgress()`:
  - Returns `{ completed: 0, total: 18, percentage: 0 }` when all sections are `"not_started"`
  - Returns correct percentage when some sections are complete
  - Counts `"in_progress"` as not yet complete

  Reference existing hook test patterns: pure function extraction tested with vitest, hook itself not tested (would need testing-library).

  **QA Scenarios**:
  ```
  Scenario: Completion hook structure
    Tool: Bash (grep + read)
    Steps:
      1. Read src/hooks/use-setup-sections.ts — verify exports useSetupSections
      2. grep 'computeSectionStatuses\|computeOverallProgress' — verify pure functions exported
      3. grep 'FRAME_CLASS\|GPS1_TYPE\|GPS_TYPE\|BATT_MONITOR\|RC1_MIN' — verify param-derived heuristics reference correct params
      4. grep 'localStorage' — verify per-vehicle persistence pattern
      5. Run pnpm run frontend:typecheck — exit 0
      6. Run pnpm test — all pass (includes use-setup-sections.test.ts)
    Expected Result: Hook exports, pure functions testable, correct params referenced, tests pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add section completion tracking hook`
  - Files: `src/hooks/use-setup-sections.ts`, `src/hooks/use-setup-sections.test.ts`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 4. Motor layout JSON data + TS types

  **What to do**:
  - Copy `/home/alex/projects/MissionPlanner/APMotorLayout.json` (3671 lines) into `src/data/motor-layouts.json`. This file contains motor position data per frame class/type: motor number, Roll factor (+1/-1/0), Pitch factor, Yaw factor (CW=+1, CCW=-1), test order.
  - Create `src/data/motor-layouts.ts` — TypeScript types and lookup function:
    - `MotorLayout { motorNumber: number; rollFactor: number; pitchFactor: number; yawFactor: number; testOrder: number }` — CW if `yawFactor > 0`, CCW if `yawFactor < 0`.
    - `FrameLayout { frameClass: number; frameType: number; motors: MotorLayout[] }`
    - `getMotorLayout(frameClass: number, frameType: number): FrameLayout | null` — Lookup by class + type. Returns null for unknown combinations.
    - `getMotorCount(frameClass: number, frameType: number): number` — Convenience.
  - Create `src/components/setup/MotorDiagram.tsx` — SVG/CSS visual component that renders motor positions:
    - Accept `frameClass`, `frameType`, `activeMotor?` (for motor test highlighting), `size?` props.
    - Render circles for each motor positioned by Roll/Pitch factors on a relative grid.
    - Show CW/CCW rotation arrows (clockwise vs counter-clockwise based on yawFactor sign).
    - Show motor number labels.
    - Show nose direction indicator (arrow pointing up = forward).
    - Show "No layout available" message for unknown frame types.
    - Reference INAV's SVG motor diagrams in `~/projects/inav-configurator/resources/motor_order/` for visual design inspiration (simple circles, arrows, numbered labels on ~200x200 viewBox).

  **Must NOT do**:
  - Do NOT modify APMotorLayout.json content — copy as-is
  - Do NOT create SVG files per frame type (unlike INAV) — render dynamically from data

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Motor diagram SVG rendering needs clean visual design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T5)
  - **Blocks**: T14 (Motors & ESC section uses this)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `~/projects/inav-configurator/resources/motor_order/quad_x.svg` — Visual design reference for motor diagram. Simple 200x200 SVG with circles, CW/CCW arrows, motor numbers, nose arrow.
  - `~/projects/inav-configurator/resources/motor_order/hex_x.svg` — Another reference showing 6-motor layout.

  **API/Type References**:
  - `~/projects/MissionPlanner/APMotorLayout.json` — Source data. Structure: array of objects with `FrameClass`, `FrameType`, motor entries with `Roll`, `Pitch`, `Yaw`, `TestOrder` fields.

  **Acceptance Criteria**:
- [x] `src/data/motor-layouts.json` exists with APMotorLayout data
- [x] `src/data/motor-layouts.ts` exports `getMotorLayout()` and types
- [x] `src/components/setup/MotorDiagram.tsx` renders motor positions from data
- [x] Quad X (class 1, type 1) renders 4 motors in X pattern with CW/CCW arrows
- [x] Unknown frame type shows "No layout available"
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm test` passes (tests for motor-layouts.ts)

  **Tests** (tests-after — create `src/data/motor-layouts.test.ts`):

  Test `getMotorLayout()`:
  - Quad X (frameClass 1, frameType 1) returns layout with exactly 4 motors
  - Each motor in Quad X has non-zero rollFactor and pitchFactor
  - Quad X has 2 CW motors (yawFactor > 0) and 2 CCW motors (yawFactor < 0)
  - Hexa X (frameClass 2, frameType 1) returns layout with 6 motors
  - Octo X (frameClass 3, frameType 1) returns layout with 8 motors
  - Unknown frame (frameClass 999, frameType 999) returns null

  Test `getMotorCount()`:
  - Returns 4 for Quad X
  - Returns 6 for Hexa X
  - Returns 0 (or null) for unknown frame

  Test data integrity:
  - All motor entries have motorNumber > 0
  - All motor entries have yawFactor ∈ {-1, 0, 1}
  - testOrder values are sequential starting from 1

  **QA Scenarios**:
  ```
  Scenario: Motor layout data and component
    Tool: Bash (grep + wc + read)
    Steps:
      1. wc -l src/data/motor-layouts.json — verify non-trivial size (>100 lines, source is 3671 lines)
      2. grep 'getMotorLayout\|getMotorCount' src/data/motor-layouts.ts — verify lookup functions exported
      3. Read src/components/setup/MotorDiagram.tsx — verify component exists and renders SVG/div
      4. grep 'yawFactor\|rollFactor\|pitchFactor' src/data/motor-layouts.ts — verify type fields
      5. Run pnpm run frontend:typecheck — exit 0
      6. Run pnpm test — all pass (includes motor-layouts.test.ts)
    Expected Result: JSON data present, lookup functions work, MotorDiagram component exists, tests pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add motor layout data from APMotorLayout.json`
  - Files: `src/data/motor-layouts.json`, `src/data/motor-layouts.ts`, `src/data/motor-layouts.test.ts`, `src/components/setup/MotorDiagram.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 5. Battery and sensor preset constants

  **What to do**:
  - Create `src/data/battery-presets.ts` with two independent preset dimensions (from Metis review):
  - **Board presets** — Map board type to ADC pin assignments. These set `BATT_VOLT_PIN` and `BATT_CURR_PIN`:
    ```ts
    type BoardPreset = { label: string; voltPin: number; currPin: number };
    const BOARD_PRESETS: BoardPreset[] = [
      { label: "Pixhawk / Cube", voltPin: 2, currPin: 3 },
      { label: "Pixhawk 6X / 6C", voltPin: 8, currPin: 4 },
      // ... from MissionPlanner ConfigBatteryMonitoring.cs board detection logic
    ];
    ```
  - **Sensor presets** — Map power module to voltage/current calibration values. These set `BATT_VOLT_MULT` and `BATT_AMP_PERVLT`:
    ```ts
    type SensorPreset = { label: string; voltMult: number; ampPerVolt: number };
    const SENSOR_PRESETS: SensorPreset[] = [
      { label: "Power Module (3DR)", voltMult: 10.1, ampPerVolt: 17.0 },
      { label: "AttoPilot 45A", voltMult: 13.64, ampPerVolt: 27.28 },
      { label: "AttoPilot 90A", voltMult: 13.64, ampPerVolt: 13.64 },
      { label: "AttoPilot 180A", voltMult: 13.64, ampPerVolt: 6.82 },
      // ... from MissionPlanner ConfigBatteryMonitoring.cs sensor presets
    ];
    ```
  - **Battery chemistry defaults** — Per-chemistry voltage thresholds (from MissionPlanner `ConfigInitialParams.cs:236-260`):
    ```ts
    type BatteryChemistry = { label: string; cellVoltMax: number; cellVoltMin: number };
    const BATTERY_CHEMISTRIES: BatteryChemistry[] = [
      { label: "LiPo", cellVoltMax: 4.2, cellVoltMin: 3.3 },
      { label: "LiPo HV", cellVoltMax: 4.35, cellVoltMin: 3.3 },
      { label: "LiIon", cellVoltMax: 4.1, cellVoltMin: 2.8 },
    ];
    ```
  - **Battery voltage computation functions** (from MissionPlanner `ConfigInitialParams.cs:115-119`):
    ```ts
    // Derived voltage thresholds from cell count + chemistry:
    // BATT_ARM_VOLT  = (cells - 1) * 0.1 + (cellVoltMin + 0.3) * cells
    // BATT_LOW_VOLT  = (cellVoltMin + 0.3) * cells
    // BATT_CRT_VOLT  = (cellVoltMin + 0.2) * cells
    // MOT_BAT_VOLT_MAX = cellVoltMax * cells
    // MOT_BAT_VOLT_MIN = cellVoltMin * cells
    // Reference: 4S LiPo → ARM=14.7, LOW=14.4, CRT=14.0, MAX=16.8, MIN=13.2
    ```
  - Read `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigBatteryMonitoring.cs` for the canonical values.
  - Also include **Initial Parameters calculator formulas** (from `ConfigInitialParams.cs:89-113`):
    ```ts
    // Canonical MissionPlanner formulas (line numbers reference ConfigInitialParams.cs):
    // MOT_THST_EXPO = min(round(0.15686 * ln(propInches) + 0.23693, 2), 0.80)  (line 112)
    // INS_GYRO_FILTER = max(20, round(289.22 * propInches^(-0.838)))            (line 98)
    // INS_ACCEL_FILTER = 10 (fixed constant, NOT derived from gyro filter)      (line 111)
    // ATC_RAT_PIT_FLTD/FLTT = max(10, INS_GYRO_FILTER / 2)                     (lines 100-108)
    // ATC_RAT_PIT_FLTE = 0, ATC_RAT_YAW_FLTD = 0, ATC_RAT_YAW_FLTE = 2       (lines 101,106-107)
    // ATC_ACCEL_Y_MAX = max(8000, roundTo(-900 * prop + 36000, -2))             (line 91)
    // ATC_ACCEL_P/R_MAX = max(10000, roundTo(poly(prop), -2))                   (line 95)
    // MOT_THST_HOVER = 0.2, ATC_THR_MIX_MAN = 0.1                             (lines 110,113)
    // Reference: 9" prop + 4S LiPo → MOT_THST_EXPO=0.58, INS_GYRO_FILTER=46, INS_ACCEL_FILTER=10
    // Note: 0.80 cap on MOT_THST_EXPO only triggers at ~36" props — effectively unreachable
    ```

  **Must NOT do**:
  - Do NOT hardcode MOT_PWM_TYPE values — those come from param metadata
  - Do NOT hardcode AHRS_ORIENTATION values — those come from param metadata

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T4)
  - **Blocks**: T12 (Battery section), T22 (Initial Params calculator)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigBatteryMonitoring.cs` — Reference for battery monitoring param structure (BATT_MONITOR, BATT_VOLT_MULT, BATT_AMP_PERVLT param names). Note: sensor preset VALUES are NOT in this file — they come from ArduPilot documentation.
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigInitialParams.cs:89-121` — Canonical source for initial parameter calculator formulas. `calc_values()` method.
  - ArduPilot Power Module documentation: https://ardupilot.org/copter/docs/common-powermodule-landingpage.html — Source for sensor preset values (3DR Power Module, AttoPilot 45A/90A/180A voltage/current calibration).

  **Acceptance Criteria**:
- [x] `src/data/battery-presets.ts` exports `BOARD_PRESETS`, `SENSOR_PRESETS`, `BATTERY_CHEMISTRIES`
- [x] Contains initial parameter calculator formula functions
- [x] Sensor preset values sourced from ArduPilot documentation (3DR Power Module, AttoPilot series)
- [x] Reference values documented in comments (9" prop + 4S → MOT_THST_EXPO=0.58, INS_GYRO_FILTER=46)
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm test` passes (tests for battery-presets.ts)

  **Tests** (tests-after — create `src/data/battery-presets.test.ts`):

  Test preset data integrity:
  - `BOARD_PRESETS` has at least 3 entries (Pixhawk, Pixhawk 6X, etc.)
  - Each board preset has non-empty label, valid pin numbers (≥ 0)
  - `SENSOR_PRESETS` includes a 3DR Power Module entry (values from ArduPilot documentation)
  - `SENSOR_PRESETS` includes AttoPilot variants (45A, 90A, 180A from ArduPilot documentation)
  - Each sensor preset has non-empty label, positive voltMult and ampPerVolt
  - `BATTERY_CHEMISTRIES` includes LiPo with cellVoltMax=4.2, cellVoltMin=3.3
  - `BATTERY_CHEMISTRIES` includes LiIon with cellVoltMax=4.1, cellVoltMin=2.8
  - All chemistries satisfy: cellVoltMax > cellVoltMin

  Test calculator formulas (canonical MissionPlanner reference values from `ConfigInitialParams.cs`):
  - `calcMotThrustExpo(9)` ≈ 0.58 (9-inch prop, line 112)
  - `calcMotThrustExpo(5)` should be > 0 and < 0.58 (smaller prop = lower expo)
  - `calcMotThrustExpo(20)` ≈ 0.71 (cap at 0.80 only triggers at ~36" props)
  - `calcGyroFilter(9)` = 46 (9-inch prop, line 98: `max(20, round(289.22 * 9^(-0.838)))`)
  - `calcGyroFilter(5)` > 46 (smaller prop = higher filter freq)
  - `calcGyroFilter(20)` ≥ 20 (floor at 20)
  - `INS_ACCEL_FILTER` is always fixed at 10 (line 111, NOT computed from gyro filter)
  - Battery voltage: 4S LiPo (cellMax=4.2, cellMin=3.3):
    - `calcBattArmVolt(4, 3.3)` ≈ 14.7: (4-1)*0.1 + (3.3+0.3)*4 (line 115)
    - `calcBattLowVolt(4, 3.3)` ≈ 14.4: (3.3+0.3)*4 (line 117)
    - `calcBattCrtVolt(4, 3.3)` ≈ 14.0: (3.3+0.2)*4 (line 116)
    - `calcBattVoltMax(4, 4.2)` = 16.8: cellMax*cells (line 118)
    - `calcBattVoltMin(4, 3.3)` = 13.2: cellMin*cells (line 119)
  - Filter values: `ATC_RAT_PIT_FLTD` = max(10, gyroFilter/2) (line 100)

  These are the highest-value tests in this plan — the formulas must match MissionPlanner exactly.

  **QA Scenarios**:
  ```
  Scenario: Battery presets and calculator functions
    Tool: Bash (grep + read)
    Steps:
      1. grep 'BOARD_PRESETS\|SENSOR_PRESETS\|BATTERY_CHEMISTRIES' src/data/battery-presets.ts — verify all three exported
      2. grep 'calcMotThrustExpo\|calcGyroFilter\|calcBattArmVolt\|calcBattLowVolt\|calcBattCrtVolt' src/data/battery-presets.ts — verify formula functions exported
      3. grep 'Power Module\|3DR' src/data/battery-presets.ts — verify 3DR Power Module preset present
      4. grep '4.1' src/data/battery-presets.ts — verify LiIon cellVoltMax=4.1 (not 4.2)
      5. grep 'ins_accel_filter\|INS_ACCEL_FILTER\|= 10' src/data/battery-presets.ts — verify accel filter is fixed 10
      6. Run pnpm run frontend:typecheck — exit 0
      7. Run pnpm test — all pass (includes battery-presets.test.ts with formula verification)
    Expected Result: All presets and formulas present, values match MissionPlanner source, tests pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add battery and sensor preset constants`
  - Files: `src/data/battery-presets.ts`, `src/data/battery-presets.test.ts`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

### Wave 2 — Tab merge + ALL section components (all parallel, depend on Wave 1)

- [x] 6. Tab merge — remove Config tab, wire section shell

  **What to do**:
  - Modify `src/types.ts`: Remove `"config"` from `ActiveTab` union. Remove `{ id: "config", ... }` from `TABS` array.
  - Modify `src/App.tsx`: Remove `ConfigPanel` import and `activeTab === "config"` rendering branch. In the `activeTab === "setup"` branch, replace `SetupWizardPanel` with the new `SetupSectionPanel` (from T2). Pass all required props: `params`, `vehicleState`, `telemetry`, `connected`, `sensorHealth`, `metadata`, `homePosition`, `missionState`.
  - Modify `src/components/TopBar.tsx`: The `TABS` change in `types.ts` auto-removes Config from desktop nav.
  - Modify `src/components/BottomNav.tsx`: Same — TABS change auto-removes Config from mobile nav.
  - This is the "big bang" commit — after this, the old wizard is gone and the new section shell is live. All sections initially render stubs (from T2), and other Wave 2 tasks fill in real content.

  **Must NOT do**:
  - Do NOT delete `ConfigPanel.tsx` yet — it's referenced by T13 (Full Parameters section)
  - Do NOT delete old wizard components yet — cleanup is T25

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7-T21)
  - **Parallel Group**: Wave 2
  - **Blocks**: T25 (cleanup)
  - **Blocked By**: T2 (section shell)

  **References**:
  - `src/types.ts:1-20` — `ActiveTab` union and `TABS` array to modify
  - `src/App.tsx:1-50` — Tab routing and panel rendering to modify
  - `src/components/TopBar.tsx` — Auto-updates from TABS change
  - `src/components/BottomNav.tsx` — Auto-updates from TABS change
  - `src/components/ConfigPanel.tsx` — Keep file (don't delete), just remove import from App.tsx

  **Acceptance Criteria**:
- [x] `ActiveTab` no longer includes `"config"`
- [x] `TABS` array has no config entry
- [x] `App.tsx` renders `SetupSectionPanel` for `activeTab === "setup"`
- [x] No reference to `ConfigPanel` in `App.tsx`
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm run frontend:build` succeeds

  **QA Scenarios**:
  ```
  Scenario: Config tab removed from type system
    Tool: Bash (grep + read)
    Steps:
      1. grep '"config"' src/types.ts — must NOT match inside ActiveTab union or TABS array
      2. grep 'ConfigPanel' src/App.tsx — must NOT match (no import, no render)
      3. grep 'SetupSectionPanel' src/App.tsx — must match (new shell wired)
      4. grep 'activeTab.*setup' src/App.tsx — must match the rendering branch
      5. Run pnpm run frontend:typecheck — exit 0
      6. Run pnpm run frontend:build — exit 0
    Expected Result: Config fully removed from tab system, SetupSectionPanel wired, typecheck+build pass

  Scenario: TopBar and BottomNav no longer show Config
    Tool: Bash (grep)
    Steps:
      1. grep -c 'config' src/components/TopBar.tsx — count should be 0 or only in non-tab contexts
      2. grep -c 'config' src/components/BottomNav.tsx — same
    Expected Result: No Config tab references in nav components
  ```

  **Commit**: YES
  - Message: `feat(setup): merge Config tab into Setup, wire section shell`
  - Files: `src/types.ts`, `src/App.tsx`, `src/components/TopBar.tsx`, `src/components/BottomNav.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 7. Overview section

  **What to do**:
  - Create `src/components/setup/sections/OverviewSection.tsx` — Dashboard merging InspectionStep + ReadinessStep + pre-arm status.
  - **Setup Progress Panel**: Use `sectionStatuses` from `useSetupSections` (T3). Show a progress bar + count (e.g., "8/18 sections configured"). List all 18 sections with status icons (✓ complete, ○ not started, ◑ in progress). Each section row is clickable → navigates to that section.
  - **Vehicle Info Card**: Vehicle type, autopilot name, system ID, firmware version (from `vehicleState`). Same info as current `InspectionStep`.
  - **Sensor Health Table**: Reuse sensor health grid from `InspectionStep.tsx:95-180`. Show healthy/unhealthy/disabled/not_present per sensor.
  - **Live Status Cards**: GPS status (fix type, sat count), battery status (voltage, current, remaining %), link status (connected/disconnected). From `telemetry` prop.
  - **Pre-Arm Status**: ARM button (calls `armVehicle(false)` from `telemetry.ts`). DISARM button (calls `disarmVehicle(false)` from `telemetry.ts`). Pre-arm check status (green shield = good, red shield = blockers). If blockers, show categorized list (reuse pattern from `PrearmStep.tsx`). Refresh button calls `requestPrearmChecks()` from `calibration.ts`.
  - **Quick Actions**: "Download All Params" button, "Reboot Vehicle" button.

  **Must NOT do**:
  - Do NOT delete InspectionStep, PrearmStep, or ReadinessStep — that's T25
  - Do NOT copy-paste — refactor patterns from existing steps into clean components

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6, T8-T21)
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1 (primitives), T3 (completion tracking)

  **References**:
  - `src/components/setup/wizard/InspectionStep.tsx` — Vehicle info + sensor health patterns to reuse
  - `src/components/setup/wizard/PrearmStep.tsx` — Pre-arm check display + ARM button patterns
  - `src/components/setup/wizard/ReadinessStep.tsx` — Readiness checklist + live checks patterns
  - `src/telemetry.ts:146-152` — `armVehicle(force: boolean)`, `disarmVehicle(force: boolean)` IPC functions
  - `src/calibration.ts:31-33` — `requestPrearmChecks()` IPC function
  - `src/sensor-health.ts` — `SensorHealth` type and `useSensorHealth()` hook

  **QA Scenarios**:
  ```
  Scenario: Overview section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'sectionStatuses\|overallProgress\|useSetupSections' src/components/setup/sections/OverviewSection.tsx — verify completion tracking used
      2. grep 'armVehicle\|disarmVehicle' src/components/setup/sections/OverviewSection.tsx — verify ARM/DISARM calls present
      3. grep 'requestPrearmChecks' src/components/setup/sections/OverviewSection.tsx — verify prearm check call
      4. grep 'ParamDisplay\|primitives' src/components/setup/sections/OverviewSection.tsx — verify shared primitives used
      5. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Overview wires completion tracking, ARM/DISARM, prearm checks, shared primitives
  ```

  **Acceptance Criteria**:
- [x] `OverviewSection.tsx` renders progress dashboard with all 18 sections listed
- [x] Vehicle info card shows type/autopilot/sysID when connected
- [x] Sensor health table shows per-sensor status
- [x] Pre-arm status with ARM button
- [x] Handles disconnected state gracefully
- [x] `pnpm run frontend:typecheck` passes

  **Commit**: YES
  - Message: `feat(setup): add Overview section`
  - Files: `src/components/setup/sections/OverviewSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck`

- [x] 8. Frame & Orientation section

  **What to do**:
  - Create `src/components/setup/sections/FrameOrientationSection.tsx` — Frame class/type selection + board orientation.
  - **Frame Selection Panel**:
    - `FRAME_CLASS` dropdown using `ParamSelect` (from T1). Populated from param metadata `values` array (`{code, label}[]`). Shows human-readable labels (Quad, Hexa, Octa, etc.).
    - `FRAME_TYPE` dropdown using `ParamSelect`. Filtered to show only valid types for the selected class. Populated from metadata.
    - Motor diagram (from T4 `MotorDiagram` component) showing the selected frame's motor positions. Updates live as class/type changes.
    - Reboot required warning badge (both params require reboot).
    - **Plane handling**: If `vehicleState.vehicle_type` indicates plane, hide FRAME_CLASS/TYPE (not applicable). Show a note explaining frame type is set by firmware selection. For QuadPlane, show `Q_FRAME_CLASS` and `Q_FRAME_TYPE` instead.
  - **Board Orientation Panel**:
    - `AHRS_ORIENTATION` dropdown using `ParamSelect`. The metadata `values` array contains all 44+ rotation presets (`{code, label}[]`) with human-readable labels (None, Yaw45, Yaw90, Roll180, etc.).
    - Description text explaining: "Set the physical orientation of the flight controller on your frame. The arrow on the FC should point forward. If mounted differently, select the rotation that matches."
    - Reboot required warning badge.

  **Must NOT do**:
  - Do NOT hardcode FRAME_CLASS/TYPE/AHRS_ORIENTATION values — use param metadata
  - Do NOT use free-angle sliders for orientation (ArduPilot uses fixed presets, not INAV-style)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6, T7, T9-T21)
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1 (primitives)

  **References**:
  - `src/components/setup/wizard/FrameMotorStep.tsx:200-300` — Existing frame class/type selection UI to reuse pattern
  - `src/components/setup/MotorDiagram.tsx` — Motor diagram component from T4
  - `src/param-metadata.ts` — ParamMeta.values for AHRS_ORIENTATION preset labels
  - `~/projects/inav-configurator/tabs/magnetometer.html` — INAV board orientation UI reference (but ArduPilot uses dropdown not sliders)

  **Acceptance Criteria**:
- [x] Frame class and type dropdowns populated from metadata
- [x] Motor diagram updates when frame selection changes
- [x] AHRS_ORIENTATION dropdown with all preset labels from metadata
- [x] Reboot required badges shown
- [x] Plane mode hides FRAME_CLASS/TYPE, shows Q_ variants for QuadPlane
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Frame section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect' src/components/setup/sections/FrameOrientationSection.tsx — verify shared primitives used
      2. grep 'FRAME_CLASS\|FRAME_TYPE\|AHRS_ORIENTATION' in the file — verify key params
      3. grep 'MotorDiagram' in the file — verify motor diagram component used
      4. grep 'Q_FRAME_CLASS\|Q_FRAME_TYPE' in the file — verify QuadPlane support
      5. grep 'reboot' in the file — verify reboot warning
      6. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, correct params, motor diagram, QuadPlane handling, reboot warnings
  ```

  **Commit**: YES
  - Message: `feat(setup): add Frame & Orientation section`
  - Files: `src/components/setup/sections/FrameOrientationSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 9. Calibration section

  **What to do**:
  - Create `src/components/setup/sections/CalibrationSection.tsx` — Refactored from existing `CalibrationStep.tsx`.
  - **Move `CompassCalibWizard.tsx`**: Move from `src/components/setup/wizard/CompassCalibWizard.tsx` to `src/components/setup/CompassCalibWizard.tsx` (sibling of `AccelCalibWizard.tsx` and `RadioCalibWizard.tsx` which are already at this level). Update any imports referencing the old path.
  - Reuse the existing calibration sub-wizards as-is: `AccelCalibWizard`, `CompassCalibWizard`, `RadioCalibWizard`. These are already well-built components with full calibration flows.
  - Layout: 4 collapsible card sections (same as current CalibrationStep):
    1. **Accelerometer** — AccelCalibWizard (6-position calibration via STATUSTEXT)
    2. **Gyroscope** — Simple "Calibrate" button calling `calibrateGyro()`
    3. **Compass** — CompassCalibWizard (MAG_CAL_PROGRESS/REPORT events)
    4. **Radio** — RadioCalibWizard (live RC channel bars, min/max capture)
  - Each card shows completion status (calibrated/not calibrated) based on param values (accel offsets ≠ 0, compass offsets ≠ 0, RC1_MIN calibrated).
  - The main change vs CalibrationStep: use `ParamDisplay` primitives for showing current calibration values, and adapt props to section interface (not wizard step interface).

  **Must NOT do**:
  - Do NOT rewrite AccelCalibWizard, CompassCalibWizard, or RadioCalibWizard — they work fine
  - Do NOT change calibration IPC calls

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6-T8, T10-T21)
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1 (primitives)

  **References**:
  - `src/components/setup/wizard/CalibrationStep.tsx` — Source to refactor from. Keep structure, adapt props.
  - `src/components/setup/AccelCalibWizard.tsx` — Reuse directly
  - `src/components/setup/RadioCalibWizard.tsx` — Reuse directly
  - `src/components/setup/wizard/CompassCalibWizard.tsx` — Move to `src/components/setup/CompassCalibWizard.tsx`, then reuse
  - `src/calibration.ts` — IPC: `calibrateGyro()`, `calibrateAccel()`, `calibrateCompassStart/Accept/Cancel(compassMask)`

  **Acceptance Criteria**:
- [x] 4 calibration cards render (accel, gyro, compass, radio)
- [x] CompassCalibWizard.tsx moved to `src/components/setup/` (alongside AccelCalib/RadioCalib)
- [x] Existing calibration wizards embedded and functional
- [x] Completion indicators per calibration type
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Calibration section structure and wizard move
    Tool: Bash (grep + ls)
    Steps:
      1. ls src/components/setup/CompassCalibWizard.tsx — must exist (moved from wizard/)
      2. ls src/components/setup/wizard/CompassCalibWizard.tsx — must NOT exist (moved away)
      3. grep 'AccelCalibWizard\|CompassCalibWizard\|RadioCalibWizard' src/components/setup/sections/CalibrationSection.tsx — all three referenced
      4. grep 'calibrateGyro' src/components/setup/sections/CalibrationSection.tsx — gyro calibration call
      5. Run pnpm run frontend:typecheck — exit 0
    Expected Result: CompassCalib moved, all wizards embedded, gyro call present, typecheck pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add Calibration section`
  - Files: `src/components/setup/sections/CalibrationSection.tsx`, `src/components/setup/CompassCalibWizard.tsx` (moved from wizard/)
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 10. RC / Receiver section

  **What to do**:
  - Create `src/components/setup/sections/RcReceiverSection.tsx` — RC protocol + channel mapping + RSSI config.
  - **Receiver Protocol Panel**: Info text explaining serial RC protocols. If `SERIALn_PROTOCOL` is relevant (CRSF/ELRS/SRXL2 = serial RC protocol 23), show which serial port has RC protocol set. Use `ParamSelect` for `RC_PROTOCOLS` bitmask selection (auto-detect vs specific protocol).
  - **Channel Mapping Panel**: `RCMAP_ROLL`, `RCMAP_PITCH`, `RCMAP_THROTTLE`, `RCMAP_YAW` — four `ParamSelect` dropdowns (channels 1-16). Show common presets: "Mode 2 (AETR)" = 1/2/3/4, "Mode 1 (AERT)" = 1/2/3/4 rearranged.
  - **RSSI Panel**: `RSSI_TYPE` dropdown using `ParamSelect` (Disabled/AnalogPin/RCChannel/ReceiverProtocol/PWMInputPin). Conditional: if type=2 (RCChannel), show `RSSI_CHANNEL` dropdown. Description: "Set to ReceiverProtocol (3) for CRSF/ELRS receivers."
  - **Live RC Values**: Show current RC1-RC8 values as horizontal bars (reuse pattern from RadioCalibWizard). Read-only live display of current channel PWM values from telemetry.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/setup/RadioCalibWizard.tsx` — Live RC channel bar rendering pattern
  - `src/param-metadata.ts` — Metadata for RC_PROTOCOLS, RSSI_TYPE enum values
  - ArduPilot CRSF setup: `SERIALn_PROTOCOL=23`, `RC_PROTOCOLS=64`, `RSSI_TYPE=3`

  **Acceptance Criteria**:
- [x] RC_PROTOCOLS, RCMAP_*, RSSI_TYPE dropdowns render with metadata labels
- [x] RSSI_CHANNEL conditionally shown when RSSI_TYPE=2
- [x] Live RC channel bars displayed
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: RC section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect\|ParamNumberInput' src/components/setup/sections/RcReceiverSection.tsx — shared primitives
      2. grep 'RCMAP_ROLL\|RCMAP_PITCH\|RCMAP_THROTTLE\|RCMAP_YAW' in the file — channel mapping params
      3. grep 'RSSI_TYPE\|RSSI_CHANNEL' in the file — RSSI config
      4. grep 'RC_PROTOCOLS' in the file — protocol selection
      5. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, channel mapping, RSSI config, protocol selection present
  ```

  **Commit**: YES
  - Message: `feat(setup): add RC / Receiver section`
  - Files: `src/components/setup/sections/RcReceiverSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 11. GPS section

  **What to do**:
  - Create `src/components/setup/sections/GpsSection.tsx` — GPS type, serial port, constellation config.
  - **GPS 1 Panel**:
    - `GPS1_TYPE` (or `GPS_TYPE` for older firmware) dropdown via `ParamSelect`. Values from metadata: 0=None, 1=AUTO, 2=uBlox, etc.
    - Serial port info: Show which `SERIALn_PROTOCOL` is set to 5 (GPS). If none, show warning "No serial port configured for GPS — set one in the Serial Ports section."
    - `GPS_AUTO_CONFIG` toggle via `ParamToggle`.
    - `GPS_GNSS_MODE` bitmask via `ParamBitmaskInput` (GPS, GLONASS, Galileo, BeiDou checkboxes).
  - **GPS 2 Panel** (collapsible, collapsed by default):
    - `GPS2_TYPE` dropdown. Same as GPS1 but for second GPS.
    - `GPS_AUTO_SWITCH` dropdown: 0=Use primary, 1=Use best, 2=Blend.
  - **Live GPS Status** (read-only): Fix type, satellite count, HDOP from telemetry. Show current lat/lon if available.
  - Cross-validation: If `GPS1_TYPE > 0` but no serial port has protocol=5, show inline warning.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/param-metadata.ts` — Metadata for GPS1_TYPE, GPS_GNSS_MODE values
  - `src/telemetry.ts:17-65` — `Telemetry` type with GPS fields: `gps_fix_type?: string`, `gps_satellites?: number`, `gps_hdop?: number`, `latitude_deg?: number`, `longitude_deg?: number`
  - ArduPilot GPS docs: GPS1_TYPE values, SERIAL3_PROTOCOL=5 for GPS

  **Acceptance Criteria**:
- [x] GPS1_TYPE and GPS2_TYPE dropdowns with metadata labels
- [x] GPS_GNSS_MODE bitmask checkboxes
- [x] Cross-validation warning when GPS enabled but no serial port configured
- [x] Live GPS status display
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: GPS section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect\|ParamToggle\|ParamBitmaskInput' src/components/setup/sections/GpsSection.tsx — shared primitives
      2. grep 'GPS1_TYPE\|GPS_TYPE\|GPS2_TYPE' in the file — GPS type params
      3. grep 'GPS_GNSS_MODE' in the file — constellation bitmask
      4. grep 'gps_fix_type\|gps_satellites\|gps_hdop' in the file — correct telemetry field names
      5. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, GPS params, constellation config, correct telemetry fields
  ```

  **Commit**: YES
  - Message: `feat(setup): add GPS section`
  - Files: `src/components/setup/sections/GpsSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 12. Battery Monitor section

  **What to do**:
  - Create `src/components/setup/sections/BatteryMonitorSection.tsx` — Full MissionPlanner parity for battery configuration.
  - **Monitor Type Panel**: `BATT_MONITOR` dropdown via `ParamSelect` (0=Disabled, 3=Analog Voltage, 4=Analog V+I, 7=SMBus, 8=DroneCAN, 9=ESC). Conditional panels below based on selection.
  - **Board Preset Dropdown** (when analog): Select from `BOARD_PRESETS` (T5). Auto-fills `BATT_VOLT_PIN` and `BATT_CURR_PIN` via staging. Show "Custom" option for manual pin entry.
  - **Sensor Preset Dropdown** (when analog): Select from `SENSOR_PRESETS` (T5). Auto-fills `BATT_VOLT_MULT` and `BATT_AMP_PERVLT` via staging. Show "Custom" option for manual calibration.
  - **Voltage Calibration Panel**: `BATT_VOLT_MULT` numeric input. Show live battery voltage from telemetry alongside. Instructions: "Measure actual voltage with multimeter. Adjust multiplier until displayed voltage matches."
  - **Current Calibration Panel**: `BATT_AMP_PERVLT` numeric input + `BATT_AMP_OFFSET`. Live current readout from telemetry.
  - **Battery Settings Panel**: `BATT_CAPACITY` (mAh input). Battery chemistry dropdown (from `BATTERY_CHEMISTRIES` in T5) — auto-fills voltage thresholds. Cell count numeric input (auto-calculates from `BATT_CAPACITY` and chemistry). `BATT_ARM_VOLT`, `BATT_LOW_VOLT`, `BATT_CRT_VOLT` numeric inputs with cross-validation (ARM < LOW > CRT ordering).
  - **Battery 2 Panel** (collapsible): Same layout but with `BATT2_*` prefix params.
  - **Live Battery Status** (read-only): Voltage, current, remaining %, mAh consumed from telemetry.

  **Must NOT do**:
  - Do NOT hardcode pin values — use board presets from T5
  - Do NOT skip cross-validation warnings (LOW > CRT voltages)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1 (primitives), T5 (battery presets)

  **References**:
  - `src/data/battery-presets.ts` (T5) — Board presets, sensor presets, chemistry defaults
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigBatteryMonitoring.cs` — MP battery monitoring UI reference (param structure)
  - `~/projects/inav-configurator/tabs/configuration.html` — INAV battery config UI reference
  - `src/telemetry.ts:17-65` — `Telemetry` type with battery fields: `battery_voltage_v?: number`, `battery_current_a?: number`, `battery_pct?: number`, `battery_voltage_cells?: number[]`

  **Acceptance Criteria**:
- [x] BATT_MONITOR type dropdown with conditional panels
- [x] Board preset and sensor preset dropdowns auto-fill params
- [x] Voltage calibration with live readout
- [x] Battery chemistry auto-fills voltage thresholds
- [x] Cross-validation: LOW_VOLT > CRT_VOLT warning
- [x] BATT2 panel available
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Battery section structure and imports
    Tool: Bash (grep + read)
    Steps:
      1. Read src/components/setup/sections/BatteryMonitorSection.tsx — verify file exists
      2. grep 'BOARD_PRESETS\|SENSOR_PRESETS\|BATTERY_CHEMISTRIES' in the file — verify all three imported from battery-presets.ts
      3. grep 'ParamSelect\|ParamNumberInput' — verify shared primitives used (not custom dropdowns)
      4. grep 'battery_voltage_v\|battery_current_a\|battery_pct' — verify correct telemetry field names
      5. grep 'BATT2_' — verify Battery 2 support exists
      6. grep 'BATT_LOW_VOLT\|BATT_CRT_VOLT' — verify cross-validation params referenced
      7. Run pnpm run frontend:typecheck — exit 0
    Expected Result: File exists with correct imports, shared primitives, correct telemetry fields, BATT2 support
  ```

  **Commit**: YES
  - Message: `feat(setup): add Battery Monitor section`
  - Files: `src/components/setup/sections/BatteryMonitorSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 13. Full Parameters section

  **What to do**:
  - Create `src/components/setup/sections/FullParametersSection.tsx` — Move existing `ConfigPanel.tsx` functionality into a section component.
  - This is largely a refactor/re-wrap of `ConfigPanel.tsx` content. The existing ConfigPanel is a self-contained 647-line component with its own toolbar, filter pills, search, staged diff panel, and param groups. Options:
    - **Option A** (recommended): Import and render `ConfigPanel` directly as a child component within the section wrapper, passing the required props. Minimal code change.
    - **Option B**: Extract ConfigPanel's internals into the section file. More work, same result.
  - Ensure the same functionality: param search, Standard/All/Modified filter pills, collapsible param groups, staged diff panel, Apply/Discard buttons, load/save .param files.
  - The staged bar in the section shell (from T2) may overlap with ConfigPanel's built-in staged diff. Resolution: Hide the section shell's staged bar when Full Parameters section is active (it has its own), OR remove ConfigPanel's built-in staged diff and rely on the shell's bar.

  **Must NOT do**:
  - Do NOT delete ConfigPanel.tsx — it's still used as a component. Cleanup is T25.
  - Do NOT break any existing functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/ConfigPanel.tsx` — Entire file. 647 lines. The content to wrap/embed.
  - `src/hooks/use-params.ts` — Param staging API used by ConfigPanel

  **Acceptance Criteria**:
- [x] Full Parameters section renders all ConfigPanel functionality
- [x] Param search, filter pills, group collapse all work
- [x] Load/save .param file works
- [x] No duplicate staged diff UI (resolve overlap with shell's staged bar)
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Full Parameters section wraps ConfigPanel
    Tool: Bash (grep)
    Steps:
      1. grep 'ConfigPanel' src/components/setup/sections/FullParametersSection.tsx — verify ConfigPanel imported/rendered
      2. grep -c 'ParamDropdown\|getStagedOrCurrent' src/components/setup/sections/FullParametersSection.tsx — should be 0 (uses ConfigPanel, not duplicating)
      3. Run pnpm run frontend:typecheck — exit 0
    Expected Result: ConfigPanel wrapped as section, no duplicated param controls
  ```

  **Commit**: YES
  - Message: `feat(setup): add Full Parameters section`
  - Files: `src/components/setup/sections/FullParametersSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 14. Motors & ESC section

  **What to do**:
  - Create `src/components/setup/sections/MotorsEscSection.tsx` — ESC protocol + motor test + spin thresholds + motor diagram.
  - **ESC Protocol Panel**: `MOT_PWM_TYPE` dropdown via `ParamSelect`. Populated from param metadata `values` array (`{code, label}[]`: Normal/OneShot/OneShot125/Brushed/DShot150-1200/PWMRange). DO NOT hardcode values — use metadata. Show DShot recommendation note.
  - **Motor Range Panel**: `MOT_SPIN_ARM` (throttle when armed, 0-1), `MOT_SPIN_MIN` (minimum thrust, 0-1), `MOT_SPIN_MAX` (max throttle, 0-1), `MOT_PWM_MIN`, `MOT_PWM_MAX` (PWM range in µs, only shown for PWM protocols). All via `ParamNumberInput`.
  - **Motor Test Panel**: Safety toggle (must enable before testing). Throttle slider 0-5% (per existing FrameMotorStep pattern). Per-motor test buttons (count from motor layout data). Active motor highlighted on the MotorDiagram component. Prop removal safety dialog. Calls `motorTest()` IPC from `calibration.ts`.
  - **Motor Diagram**: Render `MotorDiagram` (T4) showing current frame's motor positions. Highlight active motor during test.
  - **ESC Calibration Panel** (collapsible): DShot detection → show "DShot ESCs don't need calibration." For PWM: `ESC_CALIBRATION=3` staging + reboot instructions (same as existing FrameMotorStep pattern).
  - **Plane handling**: If plane, motor section is simpler — no motor test buttons per motor, just throttle servo config. Show `THR_MAX`, `THR_MIN`, `THR_SLEWRATE`.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1 (primitives), T4 (motor layout data)

  **References**:
  - `src/components/setup/wizard/FrameMotorStep.tsx:300-600` — Existing motor test UI, ESC calibration, motor range config. Reuse patterns.
  - `src/components/setup/MotorDiagram.tsx` (T4) — Motor diagram component
  - `src/calibration.ts` — `motorTest(motorNumber, throttlePct, duration)` IPC
  - `src/param-metadata.ts` — MOT_PWM_TYPE metadata values

  **Acceptance Criteria**:
- [x] MOT_PWM_TYPE dropdown populated from metadata (not hardcoded)
- [x] Motor test with safety toggle and per-motor buttons
- [x] Motor diagram with active motor highlighting
- [x] ESC calibration panel with DShot detection
- [x] Spin threshold params configurable
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Motors section structure and integration
    Tool: Bash (grep + read)
    Steps:
      1. Read src/components/setup/sections/MotorsEscSection.tsx — verify file exists
      2. grep 'MotorDiagram' — verify motor diagram component imported and rendered
      3. grep 'motorTest' — verify motorTest IPC imported from calibration.ts
      4. grep 'ParamSelect\|ParamNumberInput' — verify shared primitives used
      5. grep 'MOT_PWM_TYPE' — verify ESC protocol param referenced
      6. grep 'MOT_SPIN_ARM\|MOT_SPIN_MIN\|MOT_SPIN_MAX' — verify spin threshold params
      7. grep -c 'DShot\|dshot' — verify DShot detection logic present
      8. Run pnpm run frontend:typecheck — exit 0
    Expected Result: File uses shared primitives, MotorDiagram, motorTest IPC, metadata-driven dropdowns
  ```

  **Commit**: YES
  - Message: `feat(setup): add Motors & ESC section`
  - Files: `src/components/setup/sections/MotorsEscSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 15. Servo Outputs section

  **What to do**:
  - Create `src/components/setup/sections/ServoOutputsSection.tsx` — Editable servo/output table.
  - **Dynamic channel count**: Detect from params — show all `SERVOn_FUNCTION` params that exist in `params.store`. Most vehicles have SERVO1-16; some have up to SERVO32.
  - **Servo table**: One row per detected output. Columns:
    - **Output #**: SERVO1, SERVO2, etc.
    - **Function**: `SERVOn_FUNCTION` dropdown via `ParamSelect` (0=Disabled, 1=RCPassThru, 4=Aileron, 19=Elevator, 21=Rudder, 22=Throttle, 33-40=Motor1-8, etc.). Labels from metadata.
    - **Min**: `SERVOn_MIN` numeric input (µs, default 1100)
    - **Max**: `SERVOn_MAX` numeric input (µs, default 1900)
    - **Trim**: `SERVOn_TRIM` numeric input (µs, default 1500)
    - **Reversed**: `SERVOn_REVERSED` toggle (0/1)
  - **Note**: Motor function assignments (33-40) are auto-set by FRAME_CLASS/FRAME_TYPE. Show informational banner: "Motor assignments are automatic based on frame type. Changing motor-assigned servo functions is for advanced users only."
  - **Plane-specific**: Servo outputs are critical for planes (aileron, elevator, rudder, throttle assignment). Show a recommended setup guide for common airframes.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/setup/wizard/FrameMotorStep.tsx:600-700` — Existing servo output display (read-only, 8 channels). This section makes it editable and dynamic count.
  - `~/projects/inav-configurator/tabs/outputs.html` — INAV servo config table reference (Name, Mid, Min, Max, Rate, Reverse)
  - `src/param-metadata.ts` — SERVOn_FUNCTION metadata values (long list of function assignments)

  **Acceptance Criteria**:
- [x] Dynamic row count based on detected SERVOn_FUNCTION params
- [x] Function dropdown populated from metadata
- [x] Min/Max/Trim editable with numeric inputs
- [x] Reversed toggle per servo
- [x] Motor assignment info banner shown
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Servo section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect\|ParamNumberInput\|ParamToggle' src/components/setup/sections/ServoOutputsSection.tsx — shared primitives
      2. grep 'SERVO.*_FUNCTION\|SERVO.*_MIN\|SERVO.*_MAX\|SERVO.*_TRIM\|SERVO.*_REVERSED' in the file — servo params
      3. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, dynamic servo params, typecheck pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add Servo Outputs section`
  - Files: `src/components/setup/sections/ServoOutputsSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 16. Serial Ports section

  **What to do**:
  - Create `src/components/setup/sections/SerialPortsSection.tsx` — Serial port protocol/baud assignment (like INAV Ports tab).
  - **Port table**: One row per detected serial port (`SERIAL1_PROTOCOL`, `SERIAL2_PROTOCOL`, etc. — detect from params). Columns:
    - **Port**: SERIAL1, SERIAL2, etc. (with board-specific label if known, e.g., "TELEM1", "GPS", "SERIAL4/5")
    - **Protocol**: `SERIALn_PROTOCOL` dropdown via `ParamSelect`. Values from metadata: 1=MAVLink1, 2=MAVLink2, 5=GPS, 23=RCInput, etc.
    - **Baud Rate**: `SERIALn_BAUD` dropdown via `ParamSelect`. Values from metadata (common: 57=57600, 115=115200, 921=921600).
  - **Conflict detection**: If two ports have the same protocol that doesn't support sharing (e.g., two GPS ports), show inline warning.
  - **Common setup hints**: "GPS typically on SERIAL3 (protocol=5, baud=115200)" and "CRSF/ELRS receiver: set protocol=23 on the connected UART."
  - Reboot required warning (serial port changes require reboot).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `~/projects/inav-configurator/tabs/ports.html` — INAV Ports tab reference (table with per-UART protocol assignments)
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigSerial.cs` — MP serial config reference
  - `src/param-metadata.ts` — SERIALn_PROTOCOL metadata values

  **Acceptance Criteria**:
- [x] Dynamic port count from detected SERIAL params
- [x] Protocol and baud dropdowns from metadata
- [x] Reboot required warnings
- [x] Common setup hints displayed
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Serial ports section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect' src/components/setup/sections/SerialPortsSection.tsx — shared primitives
      2. grep 'SERIAL.*_PROTOCOL\|SERIAL.*_BAUD' in the file — serial params
      3. grep 'reboot\|Reboot' in the file — reboot warning present
      4. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, dynamic serial params, reboot warning, typecheck pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add Serial Ports section`
  - Files: `src/components/setup/sections/SerialPortsSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 17. Flight Modes section

  **What to do**:
  - Create `src/components/setup/sections/FlightModesSection.tsx` — Refactored from existing `FlightModesStep.tsx`.
  - Same core functionality: 6 mode slots (`FLTMODE1`-`FLTMODE6`), each with a dropdown populated from metadata values. `FLTMODE_CH` channel selection. Live PWM-to-slot highlighting (active slot indicator based on current RC channel value).
  - **Improvements over existing**:
    - Use `ParamSelect` primitives (T1) instead of inline dropdowns
    - Keep the "Apply Recommended Preset" button (copter/plane/rover presets from existing step)
    - Simple/Super Simple mode toggles for copter
  - **Plane handling**: Plane uses same `FLTMODE` params but different mode values. The metadata `values` array handles this automatically (different metadata per vehicle type).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/setup/wizard/FlightModesStep.tsx` — Source to refactor from. 309 lines. Core logic reusable.
  - `src/param-metadata.ts` — FLTMODE values per vehicle type

  **Acceptance Criteria**:
- [x] 6 flight mode slot dropdowns with metadata labels
- [x] Live active slot highlighting from RC PWM
- [x] Recommended preset button works
- [x] Uses ParamSelect primitives
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Flight modes section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect' src/components/setup/sections/FlightModesSection.tsx — shared primitives
      2. grep 'FLTMODE[1-6]\|FLTMODE_CH' in the file — flight mode params
      3. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, 6 mode slots, typecheck pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add Flight Modes section`
  - Files: `src/components/setup/sections/FlightModesSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 18. Failsafe section

  **What to do**:
  - Create `src/components/setup/sections/FailsafeSection.tsx` — Refactored from existing `FailsafeStep.tsx`, expanded.
  - **RC Failsafe Panel**: `FS_THR_ENABLE` dropdown (Disabled/RTL/Land/SmartRTL), `FS_THR_VALUE` numeric input (PWM threshold). For plane: `THR_FAILSAFE` + `THR_FS_VALUE` instead.
  - **Battery Failsafe Panel**: `BATT_FS_LOW_ACT` dropdown (None/Land/RTL/SmartRTL), `BATT_LOW_VOLT` + `BATT_LOW_MAH` thresholds. `BATT_FS_CRT_ACT` + `BATT_CRT_VOLT` + `BATT_CRT_MAH`. Cross-validation: LOW_VOLT > CRT_VOLT warning.
  - **GCS Failsafe Panel**: `FS_GCS_ENABLE` dropdown (Disabled/RTL/SmartRTL/Land).
  - **EKF Failsafe Panel** (new, not in existing wizard): `FS_EKF_ACTION` dropdown, `FS_EKF_THRESH` numeric input.
  - **Crash Detection Panel** (new): `FS_CRASH_CHECK` toggle.
  - **"Apply Recommended Defaults" button**: Sets safe defaults for all failsafe params (same concept as existing step).
  - All dropdowns via `ParamSelect`, all numeric via `ParamNumberInput` from T1 primitives.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/setup/wizard/FailsafeStep.tsx` — Source to refactor from. 338 lines. Expand with EKF + crash detection.
  - `src/param-metadata.ts` — FS_THR_ENABLE, FS_GCS_ENABLE, BATT_FS_LOW_ACT metadata values

  **Acceptance Criteria**:
- [x] RC, Battery, GCS, EKF, Crash failsafe panels
- [x] Copter vs Plane conditional params
- [x] Cross-validation: LOW_VOLT > CRT_VOLT
- [x] Apply Recommended Defaults button
- [x] Uses ParamSelect/ParamNumberInput primitives
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Failsafe section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamSelect\|ParamNumberInput' src/components/setup/sections/FailsafeSection.tsx — shared primitives
      2. grep 'FS_THR_ENABLE\|BATT_FS_LOW_ACT\|FS_GCS_ENABLE\|FS_EKF_ACTION\|FS_CRASH_CHECK' in the file — all failsafe params
      3. grep 'BATT_LOW_VOLT.*BATT_CRT_VOLT\|cross.*valid\|warning' in the file — cross-validation present
      4. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, all failsafe types, cross-validation, typecheck pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add Failsafe section`
  - Files: `src/components/setup/sections/FailsafeSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 19. RTL / Return section

  **What to do**:
  - Create `src/components/setup/sections/RtlReturnSection.tsx` — RTL/Return-to-Launch configuration.
  - **Copter RTL Panel** (shown when `vehicleState.vehicle_type` is copter):
    - `RTL_ALT` — Return altitude in cm. `ParamNumberInput` with description "Altitude to climb to before returning home (0 = maintain current altitude)". Show in meters with auto-conversion (param is in cm, display in m).
    - `RTL_ALT_FINAL` — Final altitude in cm. "Altitude to hover at above home after RTL. 0 = land automatically."
    - `RTL_SPEED` — Return speed in cm/s. "Horizontal speed during return. 0 = use default waypoint speed."
    - `RTL_CLIMB_MIN` — Minimum climb in cm before returning.
    - `RTL_LOIT_TIME` — Loiter time in ms above home before descending.
  - **Plane RTL Panel** (shown for plane):
    - `ALT_HOLD_RTL` — Return altitude in cm.
    - `RTL_AUTOLAND` — Auto-land behavior dropdown (0=Loiter, 1=Land if home reached, 2=Always land).
  - Show unit conversions inline (cm → m, cm/s → m/s, ms → s).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/param-metadata.ts` — RTL_ALT, ALT_HOLD_RTL metadata
  - ArduPilot RTL docs: parameter descriptions and defaults

  **Acceptance Criteria**:
- [x] Copter RTL params shown for copter, Plane RTL params for plane
- [x] Unit display conversions (cm→m)
- [x] All params use ParamNumberInput with metadata
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: RTL section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamNumberInput\|ParamSelect' src/components/setup/sections/RtlReturnSection.tsx — shared primitives
      2. grep 'RTL_ALT\|RTL_ALT_FINAL\|RTL_SPEED\|ALT_HOLD_RTL' in the file — copter and plane RTL params
      3. grep 'vehicle_type\|vehicleState' in the file — vehicle type conditional rendering
      4. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, both copter/plane RTL params, vehicle type branching
  ```

  **Commit**: YES
  - Message: `feat(setup): add RTL / Return section`
  - Files: `src/components/setup/sections/RtlReturnSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 20. Geofence section

  **What to do**:
  - Create `src/components/setup/sections/GeofenceSection.tsx` — Geofence configuration.
  - **Enable Panel**: `FENCE_ENABLE` toggle via `ParamToggle`. Note: "Enabling fence with circle/polygon requires GPS lock to arm."
  - **Fence Type Panel**: `FENCE_TYPE` bitmask via `ParamBitmaskInput` (Max Altitude, Circle Radius, Polygon, Min Altitude).
  - **Fence Parameters Panel** (shown when enabled):
    - `FENCE_ALT_MAX` — Max altitude in meters. `ParamNumberInput`.
    - `FENCE_ALT_MIN` — Min altitude in meters (copter only).
    - `FENCE_RADIUS` — Circle radius in meters (copter only).
    - `FENCE_MARGIN` — Margin before breach action in meters.
    - Cross-validation: `FENCE_ALT_MAX > FENCE_ALT_MIN` warning.
  - **Breach Action Panel**: `FENCE_ACTION` dropdown via `ParamSelect` (Report Only, RTL/Land, Land, SmartRTL/RTL, etc.).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigAC_Fence.cs` — MP geofence UI
  - `src/param-metadata.ts` — FENCE_TYPE bitmask, FENCE_ACTION values

  **Acceptance Criteria**:
- [x] FENCE_ENABLE toggle
- [x] FENCE_TYPE bitmask checkboxes
- [x] Conditional params shown when enabled
- [x] Cross-validation: ALT_MAX > ALT_MIN
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Geofence section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamToggle\|ParamBitmaskInput\|ParamNumberInput\|ParamSelect' src/components/setup/sections/GeofenceSection.tsx — shared primitives
      2. grep 'FENCE_ENABLE\|FENCE_TYPE\|FENCE_ALT_MAX\|FENCE_ACTION' in the file — geofence params
      3. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, geofence params, typecheck pass
  ```

  **Commit**: YES
  - Message: `feat(setup): add Geofence section`
  - Files: `src/components/setup/sections/GeofenceSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 21. Arming section

  **What to do**:
  - Create `src/components/setup/sections/ArmingSection.tsx` — Arming checks + pre-arm status.
  - **Arming Checks Panel**: `ARMING_CHECK` bitmask via `ParamBitmaskInput`. Each check has a human-readable label (All, Barometer, Compass, GPS, INS, Parameters, RC Channels, Voltage, Battery, Airspeed, Logging, Switch, GPS Config). Strong recommendation banner: "Setting ARMING_CHECK=1 (All) is strongly recommended for flight safety."
  - **Arming Method Panel**: `ARMING_REQUIRE` dropdown via `ParamSelect` (Disabled, Throttle-Yaw-Right, Arm Switch). Warning if set to Disabled.
  - **Pre-Arm Status Panel**: Live pre-arm check results (reuse pattern from `PrearmStep.tsx`). Green shield = all good, red shield = blockers with categorized list. Refresh button calls `requestPrearmChecks()`.
  - **ARM/DISARM Buttons**: ARM button (calls `armVehicle(false)` from `telemetry.ts`) with confirmation dialog. DISARM button (calls `disarmVehicle(false)` from `telemetry.ts`). Show current armed state from `vehicleState.armed`.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/setup/wizard/PrearmStep.tsx` — Pre-arm check display pattern to reuse
  - `src/telemetry.ts:146-152` — `armVehicle(force)`, `disarmVehicle(force)` IPC
  - `src/calibration.ts:31-33` — `requestPrearmChecks()` IPC
  - `src/statustext.ts` — STATUSTEXT subscription for pre-arm messages
  - `src/param-metadata.ts` — ARMING_CHECK bitmask labels (`bitmask: {bit, label}[]`)

  **Acceptance Criteria**:
- [x] ARMING_CHECK bitmask with human-readable check labels
- [x] ARMING_REQUIRE dropdown
- [x] Live pre-arm status with blocker list
- [x] ARM/DISARM buttons with state display
- [x] Safety warnings for disabled checks
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Arming section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamBitmaskInput\|ParamSelect' src/components/setup/sections/ArmingSection.tsx — shared primitives
      2. grep 'ARMING_CHECK\|ARMING_REQUIRE' in the file — arming params
      3. grep 'armVehicle\|disarmVehicle' in the file — ARM/DISARM IPC calls
      4. grep 'requestPrearmChecks' in the file — prearm check call
      5. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, arming params, ARM/DISARM + prearm calls present
  ```

  **Commit**: YES
  - Message: `feat(setup): add Arming section`
  - Files: `src/components/setup/sections/ArmingSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

### Wave 3 — Complex sections (all parallel, depend on Wave 1)

- [x] 22. Initial Parameters calculator section

  **What to do**:
  - Create `src/components/setup/sections/InitialParamsSection.tsx` — Calculator that computes starting tuning params from physical characteristics.
  - **Input Panel**: User inputs:
    - Prop size in inches (dropdown: 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)
    - Battery cell count (dropdown: 3S, 4S, 5S, 6S)
    - Battery type (dropdown from `BATTERY_CHEMISTRIES` in T5: LiPo, LiPo HV, LiIon)
  - **Output Panel**: Computed parameters with current-vs-proposed diff preview. Show each param with: name, human label, current value, proposed value, delta. Params computed:
     - `MOT_THST_EXPO` = `min(round(0.15686 * ln(propInches) + 0.23693, 2), 0.80)` (line 112)
    - `INS_GYRO_FILTER` = `max(20, round(289.22 * propInches^(-0.838)))` (line 98)
    - `INS_ACCEL_FILTER` = `10` (fixed constant, NOT derived from gyro filter — line 111)
    - `ATC_RAT_PIT_FLTD`, `ATC_RAT_PIT_FLTE`, `ATC_RAT_PIT_FLTT` = filter freq based on prop size
    - `ATC_RAT_RLL_FLTD`, `ATC_RAT_RLL_FLTE`, `ATC_RAT_RLL_FLTT` = same
    - `ATC_RAT_YAW_FLTD`, `ATC_RAT_YAW_FLTE`, `ATC_RAT_YAW_FLTT` = same
    - `BATT_ARM_VOLT` = (cells-1)*0.1 + (cellMin+0.3)*cells, `BATT_LOW_VOLT` = (cellMin+0.3)*cells, `BATT_CRT_VOLT` = (cellMin+0.2)*cells, `MOT_BAT_VOLT_MAX` = cellMax*cells, `MOT_BAT_VOLT_MIN` = cellMin*cells
    - `BATT_FS_LOW_ACT`, `BATT_FS_CRT_ACT`, `FENCE_ENABLE`, `FENCE_TYPE`, `FENCE_ACTION`, `FENCE_ALT_MAX` = recommended safety defaults
    - Full formula set from `ConfigInitialParams.cs`
  - **Stage All Button**: "Stage All Recommended" button stages all computed values. "Stage Selected" lets user cherry-pick.
  - **Reference Values**: Show known-good reference in comments: "9-inch prop + 4S LiPo → MOT_THST_EXPO=0.58, INS_GYRO_FILTER=46, INS_ACCEL_FILTER=10"
  - **QuadPlane handling**: For QuadPlane, use `Q_A_` and `Q_M_` prefix variants of the same params.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Complex formula implementation + diff preview UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T23, T24)
  - **Blocks**: T25
  - **Blocked By**: T1 (primitives), T5 (battery presets + formulas)

  **References**:
  - `src/data/battery-presets.ts` (T5) — Calculator formula functions and chemistry defaults
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigInitialParams.cs:89-121` — Canonical formulas. `calc_values()` method (lines 89-121). Battery chemistry dropdown (lines 236-260).
  - `src/hooks/use-params.ts` — `params.stage()` for staging computed values

  **Acceptance Criteria**:
- [x] Prop size + cell count + chemistry inputs
- [x] All formulas produce correct output (verify: 9" + 4S LiPo → MOT_THST_EXPO≈0.58, INS_GYRO_FILTER=46, INS_ACCEL_FILTER=10)
- [x] Diff preview showing current vs proposed values
- [x] Stage All / Stage Selected buttons
- [x] QuadPlane Q_ prefix support
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm test` passes (formula correctness covered by T5's tests)

  **Tests**: The core calculator formulas (`calcMotThrustExpo`, `calcGyroFilter`, battery voltage math) are defined and tested in T5 (`src/data/battery-presets.ts` + `src/data/battery-presets.test.ts`). This task imports and uses those functions — no additional test file needed unless this task introduces new computation logic beyond T5's formulas. If it does (e.g., QuadPlane prefix mapping, compound parameter set generation), create `src/components/setup/sections/initial-params.test.ts` to test those pure functions.

  **QA Scenarios**:
  ```
  Scenario: Initial params calculator structure
    Tool: Bash (grep)
    Steps:
      1. grep 'calcMotThrustExpo\|calcGyroFilter\|calcBattArmVolt\|BATTERY_CHEMISTRIES' src/components/setup/sections/InitialParamsSection.tsx — imports from T5
      2. grep 'Q_A_\|Q_M_' in the file — QuadPlane prefix support
      3. grep 'params.stage' in the file — staging computed values
      4. grep 'INS_ACCEL_FILTER.*10\|= 10' in the file — accel filter fixed at 10
      5. Run pnpm run frontend:typecheck — exit 0
      6. Run pnpm test — all pass (formula tests from T5)
    Expected Result: Imports formulas from T5, QuadPlane support, staging, correct accel filter
  ```

  **Commit**: YES
  - Message: `feat(setup): add initial parameters calculator section`
  - Files: `src/components/setup/sections/InitialParamsSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 23. PID Tuning section

  **What to do**:
  - Create `src/components/setup/sections/PidTuningSection.tsx` — Extended PID tuning panel.
  - **Rate PIDs Panel** (copter): Grouped display for Roll, Pitch, Yaw rate controllers. Each axis shows `ATC_RAT_{axis}_P`, `_I`, `_D`, `_FF`, `_FLTD`, `_FLTE`, `_FLTT`, `_IMAX` via `ParamNumberInput`. Organize as a table or card-per-axis layout.
  - **Angle PIDs Panel** (copter): `ATC_ANG_RLL_P`, `ATC_ANG_PIT_P`, `ATC_ANG_YAW_P` — outer loop angle gains.
  - **Position Controller Panel** (copter): `PSC_ACCZ_P/I/D`, `PSC_VELZ_P`, `PSC_POSZ_P`, `PSC_VELXY_P/I/D`, `PSC_POSXY_P` — altitude and position hold tuning.
  - **Filter Panel**: `INS_GYRO_FILTER`, `INS_ACCEL_FILTER` — main filter cutoffs. Harmonic notch: `INS_HNTCH_ENABLE`, `INS_HNTCH_FREQ`, `INS_HNTCH_BW`, `INS_HNTCH_REF`, `INS_HNTCH_MODE`.
  - **Plane Tuning Panel** (plane): `RLL2SRV_P/I/D`, `PTCH2SRV_P/I/D`, `YAW2SRV_DAMP/INT/RLL`. Different param structure than copter.
  - **Plane Speed Panel** (plane): `ARSPD_FBW_MIN`, `ARSPD_FBW_MAX`, `TRIM_THROTTLE`, `TRIM_ARSPD_CM`.
  - Vehicle type conditional rendering: show copter panels for copter, plane panels for plane.
  - All params via `ParamNumberInput` with metadata labels and ranges.

  **Must NOT do**:
  - Do NOT build an EzTune-style meta-tuner — just direct param editing with good grouping
  - Do NOT build AutoTune integration — that's a flight mode, not a config panel

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
    - Reason: Complex multi-panel layout with many params needing clear visual organization

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T22, T24)
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigArducopter.cs` — MP Extended Tuning reference for copter PIDs
  - `~/projects/MissionPlanner/GCSViews/ConfigurationView/ConfigArduplane.cs` — MP Plane tuning reference
  - `~/projects/inav-configurator/tabs/pid_tuning.html` — INAV PID tuning layout reference (table with P/I/D/FF columns per axis)
  - `src/param-metadata.ts` — ATC_RAT_*, PSC_*, RLL2SRV_* metadata

  **Acceptance Criteria**:
- [x] Copter: Rate PID table (Roll/Pitch/Yaw × P/I/D/FF/filters)
- [x] Copter: Angle P gains and position controller params
- [x] Plane: RLL2SRV/PTCH2SRV PID params
- [x] Filter params (gyro, accel, harmonic notch)
- [x] Vehicle type conditional rendering
- [x] All params via ParamNumberInput with metadata
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: PID tuning section structure
    Tool: Bash (grep)
    Steps:
      1. grep 'ParamNumberInput' src/components/setup/sections/PidTuningSection.tsx — shared primitives
      2. grep 'ATC_RAT_PIT_P\|ATC_RAT_RLL_P\|ATC_RAT_YAW_P' in the file — copter rate PIDs
      3. grep 'PSC_ACCZ_P\|PSC_VELZ_P\|PSC_POSZ_P' in the file — position controller
      4. grep 'RLL2SRV\|PTCH2SRV' in the file — plane PIDs
      5. grep 'INS_HNTCH_ENABLE\|INS_GYRO_FILTER' in the file — filter params
      6. grep 'vehicle_type\|vehicleState' in the file — vehicle type branching
      7. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Shared primitives, copter + plane PIDs, filters, vehicle branching
  ```

  **Commit**: YES
  - Message: `feat(setup): add PID tuning section`
  - Files: `src/components/setup/sections/PidTuningSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 24. Auto-generated Peripherals section

  **What to do**:
  - Create `src/components/setup/sections/PeripheralsSection.tsx` — Auto-generated param groups for peripheral devices.
  - **Architecture**: One reusable `PeripheralGroup` component that takes a param prefix + group label and auto-generates the UI:
    1. Finds all params in `params.store` matching the prefix
    2. For each param, looks up metadata for label, description, values/bitmask/range
    3. Renders appropriate control: `ParamSelect` for enums, `ParamBitmaskInput` for bitmasks, `ParamNumberInput` for scalars, `ParamToggle` for 0/1 params
    4. Groups sub-params visually (e.g., `RNGFND_` vs `RNGFND2_`)
  - **Peripheral Groups** (collapsible cards, collapsed by default):
    - Rangefinder: `RNGFND_*` params
    - Airspeed: `ARSPD_*` params
    - Optical Flow: `FLOW_*` params
    - Camera Gimbal: `MNT_*`, `MNT2_*` params
    - Compass Config: `COMPASS_*` params (orientation, external, motor compensation — NOT calibration which is in Calibration section)
    - CAN Bus: `CAN_*`, `CAN_D1_*` params
    - Any additional groups detected from param prefixes not covered by other sections
  - **"Show Configured Only" toggle**: Filter to show only peripheral groups where the enable param is non-zero (e.g., `RNGFND_TYPE > 0`). Default: show all.
  - The auto-generated approach means ANY ArduPilot peripheral works — even future ones we don't know about yet. The metadata provides all the labels/values/ranges.

  **Must NOT do**:
  - Do NOT build custom UI per peripheral (that's the point of auto-generation)
  - Do NOT duplicate params already covered by other sections (exclude BATT_*, SERVO_*, MOT_*, FRAME_*, etc.)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`frontend-ui-ux`]
    - Reason: Needs smart param grouping logic + metadata-driven rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T22, T23)
  - **Blocks**: T25
  - **Blocked By**: T1

  **References**:
  - `src/components/ConfigPanel.tsx:200-400` — Existing param group rendering logic. The auto-generated peripheral section is an enhanced version of this.
  - `src/param-metadata.ts` — ParamMeta type with values/bitmask/range for auto-UI generation
  - `src/components/setup/primitives/*` (T1) — ParamSelect, ParamNumberInput, ParamBitmaskInput to use

  **Acceptance Criteria**:
- [x] `PeripheralGroup` reusable component renders UI from prefix + metadata
- [x] At least 6 peripheral groups shown (rangefinder, airspeed, opt flow, gimbal, compass, CAN)
- [x] Enum params get dropdowns, bitmask params get checkboxes, numeric get inputs
- [x] "Show Configured Only" toggle works
- [x] Excludes params covered by other sections
- [x] `pnpm run frontend:typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Peripherals auto-generation structure
    Tool: Bash (grep)
    Steps:
      1. grep 'PeripheralGroup' src/components/setup/sections/PeripheralsSection.tsx — reusable component
      2. grep 'RNGFND\|ARSPD\|FLOW\|MNT\|COMPASS\|CAN' in the file — peripheral prefixes
      3. grep 'ParamSelect\|ParamBitmaskInput\|ParamNumberInput\|ParamToggle' in the file — shared primitives
      4. grep 'metadata' in the file — metadata-driven rendering
      5. Run pnpm run frontend:typecheck — exit 0
    Expected Result: Reusable PeripheralGroup, correct prefixes, metadata-driven, shared primitives
  ```

  **Commit**: YES
  - Message: `feat(setup): add auto-generated peripherals section`
  - Files: `src/components/setup/sections/PeripheralsSection.tsx`
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

### Wave 4 — Cleanup + Polish (sequential, after ALL sections)

- [x] 25. Delete old wizard components + ConfigPanel dead code

  **What to do**:
  - Delete old wizard step components that are now replaced by sections:
    - `src/components/setup/wizard/InspectionStep.tsx` → replaced by OverviewSection
    - `src/components/setup/wizard/CalibrationStep.tsx` → replaced by CalibrationSection
    - `src/components/setup/wizard/FrameMotorStep.tsx` → replaced by FrameOrientationSection + MotorsEscSection + ServoOutputsSection
    - `src/components/setup/wizard/FlightModesStep.tsx` → replaced by FlightModesSection
    - `src/components/setup/wizard/FailsafeStep.tsx` → replaced by FailsafeSection
    - `src/components/setup/wizard/PrearmStep.tsx` → replaced by ArmingSection
    - `src/components/setup/wizard/ReadinessStep.tsx` → replaced by OverviewSection
  - Delete old shell: `src/components/setup/SetupWizardPanel.tsx` → replaced by SetupSectionPanel
  - Delete old hook: `src/hooks/use-setup-wizard.ts` → replaced by use-setup-sections
  - Delete dead code: `src/components/setup/SetupPanel.tsx` (never rendered, confirmed dead)
  - Remove `ConfigPanel` from being directly rendered in App.tsx (already done by T6, but now delete the import if any remaining references exist outside the Full Parameters section).
  - Update any imports that reference deleted files.
  - Run `pnpm run frontend:typecheck` to verify no broken references.

  **Must NOT do**:
  - Do NOT delete calibration sub-wizards (AccelCalibWizard, CompassCalibWizard, RadioCalibWizard) — they're reused by CalibrationSection
  - Do NOT delete ConfigPanel.tsx if FullParametersSection wraps it — only delete if content was fully extracted

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Sequential**: After all T6-T24 complete
  - **Blocks**: T26
  - **Blocked By**: T6-T24 (all sections must be built first)

  **References**:
  - `src/components/setup/wizard/` — All files in this directory (candidates for deletion)
  - `src/components/setup/SetupWizardPanel.tsx` — Old shell to delete
  - `src/hooks/use-setup-wizard.ts` — Old hook to delete

  **Acceptance Criteria**:
- [x] All listed old files deleted
- [x] No remaining imports to deleted files
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm run frontend:build` succeeds
- [x] `pnpm test` passes (no tests broke from deletions)

  **QA Scenarios**:
  ```
  Scenario: Old wizard files are gone
    Tool: Bash (ls + grep)
    Steps:
      1. ls src/components/setup/wizard/ — must NOT exist or be empty (all step files deleted)
      2. ls src/components/setup/SetupWizardPanel.tsx — must NOT exist (file deleted)
      3. ls src/hooks/use-setup-wizard.ts — must NOT exist (file deleted)
      4. ls src/components/setup/SetupPanel.tsx — must NOT exist (dead code deleted)
      5. grep -r 'SetupWizardPanel\|use-setup-wizard\|SetupPanel' src/ --include='*.ts' --include='*.tsx' — zero matches (no dangling imports)
      6. grep -r 'InspectionStep\|CalibrationStep\|FrameMotorStep\|FlightModesStep\|FailsafeStep\|PrearmStep\|ReadinessStep' src/ --include='*.ts' --include='*.tsx' — zero matches
      7. Run pnpm run frontend:typecheck — exit 0
      8. Run pnpm run frontend:build — exit 0
      9. Run pnpm test — all pass
    Expected Result: All old files deleted, no broken imports, typecheck+build+tests pass

  Scenario: Calibration wizards preserved (all at setup/ level, not in wizard/)
    Tool: Bash (ls)
    Steps:
      1. ls src/components/setup/AccelCalibWizard.tsx — must exist (was already here)
      2. ls src/components/setup/CompassCalibWizard.tsx — must exist (moved from wizard/ by T9)
      3. ls src/components/setup/RadioCalibWizard.tsx — must exist (was already here)
    Expected Result: All three calibration sub-wizards at setup/ level, reused by CalibrationSection
  ```

  **Commit**: YES
  - Message: `refactor(setup): delete old wizard components and dead code`
  - Files: Delete 9+ files
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

- [x] 26. Mobile responsive polish + final integration

  **What to do**:
  - Review all 18 sections on mobile viewport (< 1024px, the `!lg` breakpoint):
    - Ensure section content doesn't overflow horizontally
    - Tables (servo outputs, serial ports, PID tuning) should scroll horizontally or stack vertically on mobile
    - Motor diagram should scale down appropriately
    - Sidebar drawer works correctly on mobile
  - Review desktop layout at 1024-1280px (medium screens):
    - Section nav sidebar should be narrower or use icon-only rail
    - Content area should have sufficient width
  - Verify the staged params bar works correctly across all sections:
    - Stage params in multiple sections, verify they all appear in the bar
    - Apply staged params, verify they're written
    - Discard all, verify they're cleared
  - Ensure the render switch in `SetupSectionPanel` correctly handles all 18 section IDs — no missing cases, no stubs remaining.
  - Update `PLAN.md` if this materially changes milestone status.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Sequential**: After T25
  - **Blocks**: F1-F3
  - **Blocked By**: T25

  **References**:
  - `src/hooks/use-breakpoint.ts` — `useBreakpoint()` for responsive layout
  - `src/components/setup/SetupSectionPanel.tsx` — Main shell to review
  - All `src/components/setup/sections/*.tsx` — All sections to check

  **Acceptance Criteria**:
- [x] All sections render without overflow on mobile viewport
- [x] Tables scroll or stack on mobile
- [x] Sidebar drawer opens/closes correctly on mobile
- [x] Desktop 1024px layout doesn't feel cramped
- [x] Staged bar works across all sections
- [x] No stub sections remaining in render switch
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm run frontend:build` succeeds
- [x] `pnpm test` passes

  **QA Scenarios**:
  ```
  Scenario: Render switch completeness
    Tool: Bash (grep)
    Steps:
      1. grep -c 'overview\|frame_orientation\|calibration\|rc_receiver\|gps\|battery_monitor\|motors_esc\|servo_outputs\|serial_ports\|flight_modes\|failsafe\|rtl_return\|geofence\|arming\|initial_params\|pid_tuning\|peripherals\|full_parameters' src/components/setup/SetupSectionPanel.tsx — count ≥ 18
      2. grep 'default:' src/components/setup/SetupSectionPanel.tsx — verify exhaustive switch (should have unreachable default or no unhandled cases)
      3. Run pnpm run frontend:typecheck — exit 0
      4. Run pnpm run frontend:build — exit 0
      5. Run pnpm test — all pass
    Expected Result: All 18 section IDs handled in render switch, no stubs, all gates pass

  Scenario: Mobile-responsive patterns present
    Tool: Bash (grep)
    Steps:
      1. grep 'useBreakpoint\|isLg\|isMobile' src/components/setup/SetupSectionPanel.tsx — verify responsive breakpoint used
      2. grep -l 'overflow-x-auto\|overflow-auto\|@media\|sm:\|md:\|lg:' src/components/setup/sections/*.tsx — verify responsive utilities in section files with tables
    Expected Result: Shell uses breakpoint hook, table-heavy sections have scroll/stack handling
  ```

  **Commit**: YES
  - Message: `fix(setup): mobile responsive polish and final integration`
  - Files: various section files + SetupSectionPanel.tsx
  - Pre-commit: `pnpm run frontend:typecheck && pnpm test`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check component renders). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Compare deliverables against plan.
  **Specific verifications**:
  1. Read `src/types.ts` — confirm `"config"` is NOT in `ActiveTab` union
  2. Read `src/components/setup/SetupSectionPanel.tsx` — confirm 18 section IDs in switch statement
  3. Read `src/components/setup/primitives/` — confirm shared components exist (ParamSelect, ParamNumberInput, ParamBitmaskInput, ParamToggle, ParamDisplay, param-helpers)
  4. Read `src/components/setup/sections/` — confirm all 18 section files exist
  5. Grep for `useParamMetadata` — must NOT exist (metadata comes through `useParams`)
  6. Grep for `as any` and `@ts-ignore` — must be zero occurrences in new files
  7. Grep for `import.*from.*SetupWizardPanel` — must NOT exist (old shell deleted)
  8. Grep for `import.*from.*ConfigPanel` in `App.tsx` — must NOT exist
  9. Run `pnpm run frontend:typecheck` — must pass
  10. Run `pnpm run frontend:build` — must succeed
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm run frontend:typecheck` + `pnpm run frontend:build` + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, duplicated param primitives. Check AI slop: excessive comments, over-abstraction, generic names.
  **Specific verifications**:
  1. Grep for `getStagedOrCurrent` — must ONLY exist in `primitives/param-helpers.ts`, NOT duplicated in any section
  2. Grep for `ParamDropdown` — old duplicated component name must NOT exist in new sections
  3. Every section file must import from `../primitives/` — no inline param controls
  4. Every section component must accept `params` prop of `ReturnType<typeof useParams>` type
  5. Every section must handle `params.store === null` gracefully (check for `?.` or null guards)
  6. Verify `ParamMeta.values` is accessed as array (`values?.map`, `values?.find`), never as Map
  7. Verify `ParamMeta.bitmask` is accessed as array, never as Map
  Output: `Typecheck [PASS/FAIL] | Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  **Specific verifications**:
  1. Old files deleted: `SetupWizardPanel.tsx`, `use-setup-wizard.ts`, `SetupPanel.tsx`, all 7 wizard step files in `wizard/` dir
  2. Old files NOT deleted: `AccelCalibWizard.tsx`, `RadioCalibWizard.tsx`, `CompassCalibWizard.tsx` (reused by CalibrationSection)
  3. No Context/Redux/Zustand imports in any new file
  4. No new Tauri `invoke()` calls in section files (sections only stage params, never call IPC directly except calibration/arm commands)
  5. ConfigPanel.tsx: either deleted or only imported by FullParametersSection (not by App.tsx)
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Each task produces one commit. Group small related tasks where noted.

| Task(s) | Commit Message | Key Files |
|---------|---------------|-----------|
| T1 | `feat(setup): extract shared param input primitives` | `src/components/setup/primitives/*` |
| T2 | `feat(setup): add section-based shell with sidebar navigation` | `SetupSectionPanel.tsx` |
| T3 | `feat(setup): add section completion tracking hook` | `use-setup-sections.ts` |
| T4 | `feat(setup): add motor layout data from APMotorLayout.json` | `src/data/motor-layouts.*` |
| T5 | `feat(setup): add battery and sensor preset constants` | `src/data/battery-presets.ts` |
| T6 | `feat(setup): merge Config tab into Setup, wire section shell` | `types.ts`, `App.tsx`, `TopBar.tsx`, `BottomNav.tsx` |
| T7–T21 | `feat(setup): add {SectionName} section` (one each) | `src/components/setup/sections/{Name}Section.tsx` |
| T22 | `feat(setup): add initial parameters calculator section` | `InitialParamsSection.tsx` |
| T23 | `feat(setup): add PID tuning section` | `PidTuningSection.tsx` |
| T24 | `feat(setup): add auto-generated peripherals section` | `PeripheralsSection.tsx` |
| T25 | `refactor(setup): delete old wizard components and ConfigPanel` | delete 8+ files |
| T26 | `fix(setup): mobile responsive polish and final integration` | various |

Pre-commit check for ALL: `pnpm run frontend:typecheck && pnpm test`

---

## Success Criteria

### Verification Commands
```bash
pnpm run frontend:typecheck   # Expected: zero errors
pnpm run frontend:build       # Expected: successful build
pnpm test                     # Expected: all tests pass (existing 34 + new from T1,T3,T4,T5)
```

### Final Checklist
- [x] Setup tab shows 5 sidebar groups with 18 sections
- [x] Config tab no longer exists
- [x] Full Parameters section has all raw param browser functionality
- [x] All sections render without crash when disconnected / no params / no metadata
- [x] Staging params in any section appears in the shared staged bar
- [x] Apply staged params writes to vehicle
- [x] ArduCopter-specific content hidden for ArduPlane and vice versa
- [x] Mobile layout uses drawer navigation for sections
- [x] Overview section shows completion status for all sections
- [x] Motor diagram renders for known frame types
- [x] Battery presets auto-fill voltage/current multipliers
- [x] Initial Parameters calculator produces correct output for known inputs (9" + 4S LiPo → expo=0.58, gyro=46)
- [x] `pnpm run frontend:typecheck` passes
- [x] `pnpm run frontend:build` succeeds
- [x] `pnpm test` passes (all tests green)
