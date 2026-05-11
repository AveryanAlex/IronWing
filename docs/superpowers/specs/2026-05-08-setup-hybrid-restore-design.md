# Setup Hybrid Restore Design

## Goal

Restore the strongest operator-facing setup behavior from the archived React setup flow while keeping the worthwhile parts of the active Svelte architecture. The target result is a setup tab that feels operational again: explicit gating, direct raw-parameter access, plain language, and no user-visible scaffold leakage.

## Scope

This design covers the active setup workspace under `src/components/setup/`, the raw parameter workspace under `src/components/params/`, and the setup workspace store under `src/lib/stores/setup-workspace.ts`.

It does not redesign the current guided section implementations themselves beyond copy, gating, and entry behavior. It also does not remove the beginner wizard or the shared shell-level staged-parameter tray.

## Confirmed Product Decisions

### 1. Soft gate rules

- If no parameters are loaded, nothing in Setup is available yet, including Full Parameters.
- In that state, the operator should see an explicit first-run / parameter-download state instead of a half-live workspace.
- If parameters are loaded but metadata is missing, Overview remains available and Full Parameters becomes the only editable recovery surface.
- In that metadata-missing state, all guided sections remain blocked until metadata becomes available.

### 2. Unimplemented sections remain visible

- Unimplemented sections should stay visible in the navigation so you can track what still needs implementation.
- They should be disabled.
- Their presentation should be neutral, for example `Coming later`, without scaffold, slice, or planning-language leakage.
- The main detail pane must not show the current scaffold panel with implementation-status prose.

### 3. Full Parameters defaults back to raw browser first

- Entering Full Parameters should land directly in the raw searchable parameter browser.
- The raw browser should again be the primary surface for this section.
- Workflow cards may remain in the product, but only as secondary helpers and not as the entry screen for Full Parameters.

### 4. Copy direction

- User-facing setup copy should return to direct operational language.
- Internal framing terms such as `Conservative truth`, `Keep raw access explicit`, `workflow handoff`, `shared shell-owned review tray`, and `recovery stays explicit` should be removed from operator-facing setup surfaces.
- Copy should focus on:
  - connection state
  - whether parameters are loaded
  - whether metadata is available
  - what is blocked
  - what the operator should do next

## Keep / Change Boundary

### Keep

- Shared shell-level `ParameterReviewTray`
- Beginner wizard and its current store wiring
- Existing Svelte guided-section implementations
- Current scope-aware store model and section confirmation plumbing
- Parameter file import/export support

### Change

- Setup entry-state behavior
- Setup overview state rendering and copy
- Full Parameters entry behavior
- Raw parameter browser density and editing ergonomics where needed
- Nav and detail handling for unimplemented sections
- Setup copy across section headers and recovery surfaces

## Target User Experience

### State A: disconnected

The setup tab should clearly tell the operator to connect to a vehicle. This state should replace the current “always-live dashboard” feeling with a clear unavailable state.

### State B: connected, no parameters loaded

The setup tab should present an explicit parameter-download state similar in intent to the archived onboarding state:

- clear explanation that setup requires parameter data
- clear primary action to download or refresh parameters
- progress feedback while the download is running
- no guided sections available yet
- Full Parameters unavailable as well

### State C: parameters loaded, metadata loading

The setup tab should present a metadata-loading state:

- parameters are already loaded
- metadata is still loading
- guided sections remain unavailable
- Full Parameters remains blocked until the metadata result resolves

This is stricter than the current active implementation and matches the product decision that “if no params are loaded, nothing available” and that guided surfaces should not partially light up early.

### State D: parameters loaded, metadata failed or unavailable

The setup tab should present a metadata-failure recovery state:

- explain that parameter descriptions could not be loaded
- guided sections stay blocked
- Full Parameters becomes available as the fallback editing surface
- the operator should have a clear recovery path without being forced through architecture-language banners

### State E: parameters + metadata ready

The setup tab should behave like the normal ready state:

- Overview available
- guided sections available subject to section-specific conditions
- Full Parameters available
- unimplemented sections still visible but disabled with neutral copy

## Information Architecture

### Overview

The current Overview should stop acting like a permanent architecture dashboard and return to a state-driven setup landing page.

The Overview should once again be the place that answers:

- are we connected?
- do we have parameters?
- do we have metadata?
- what can I do right now?
- what is the next setup step?

The current metric-card framing (`Expert inventory`, `Trackable progress`, `Conservative truth`) should be removed or rewritten into direct operator language.

The docs/file-action tools restored in the active implementation can remain, but they should sit under plain labels and coexist with explicit setup readiness messaging.

### Setup navigation

The current grouped Svelte nav layout can stay. The behavior changes are:

- do not let unimplemented sections be selected
- show them as disabled with neutral status text
- when setup is not ready, do not pretend blocked guided sections are inspectable working surfaces
- restore clearer status semantics around unavailable vs available

The nav should avoid copy that suggests planned work is part of the operator workflow.

### Detail pane fallback behavior

The current `planned section` scaffold panel should be removed from the operator flow. If a disabled unimplemented section cannot be opened from the nav, the detail pane does not need a scaffold at all.

If a route/store mismatch still somehow selects an unimplemented section, the fallback should be a minimal neutral unavailable state, not roadmap prose.

## Full Parameters Design

### Entry behavior

`SetupFullParametersSection.svelte` should stop framing the section as a prose-heavy “recovery” document before the operator reaches useful controls.

When the section is available, the first useful content should be the raw parameter browser itself.

### Primary surface

The default content should be the raw parameter browser:

- search
- standard / all / modified filters
- grouped parameter prefixes
- direct staged editing
- import/export actions
- clear staged status/count summary

### Secondary workflow helpers

The current workflow-card system does not need to be deleted, but it should stop displacing the raw browser as the default experience.

Acceptable secondary placements:

- below the raw browser
- behind a helper toggle
- in a side panel

The important product rule is that raw access is immediate, not hidden behind `Open Advanced parameters`.

## Raw Parameter Browser Design

The current raw parameter browser regressed in density and editing speed relative to the archived `ConfigPanel`.

### Target behavior

- denser row presentation
- quicker scanability across many parameters
- editing that feels immediate instead of form-heavy
- bitmask editing that is interactive again, not read-only decoration
- persistent indication of staged changes and reboot-required edits

### What should return from the archived behavior

- compact grouped rows
- direct value editing affordance
- editable bitmask checkbox UI
- succinct status/footer summary

### What should stay from the active behavior

- store integration through the current Svelte param store
- shared review tray as the only apply/discard surface
- retained failure handling
- metadata fallback support when descriptions are unavailable

### Practical constraint

This should be a behavioral and layout restoration, not a React-source port. Reuse active Svelte types/stores and active tests.

## Copy Design Rules

### Replace with plain language

Examples of desired tone:

- `Connect to a vehicle to access setup`
- `Download parameters to continue`
- `Loading parameter descriptions`
- `Parameter descriptions unavailable. Full Parameters is still available.`
- `This section is not available until setup data is loaded.`
- `Coming later`

### Remove from operator-facing surfaces

- `Conservative truth`
- `Trackable progress`
- `Keep raw access explicit`
- `Recovery stays explicit`
- `workflow handoff`
- `shared shell-owned review tray`
- `purpose-built editors`
- `current-scope`
- `later in the slice`

### Exception

Internally, stores/tests/types may still use existing naming if renaming them would create needless churn. This design is about the operator-facing product language first.

## Store and State Model Impact

The existing setup workspace store is still the right coordination layer, but its output contract needs to describe stricter availability states.

### Required store behavior changes

- express the `no params` gate clearly enough for Setup Overview and nav to render an explicit unavailable state
- express the `metadata loading` and `metadata failed` states distinctly
- allow Full Parameters only in the metadata-failed path and the fully-ready path
- prevent guided sections from appearing effectively usable before their prerequisites are satisfied
- provide neutral display text for unimplemented sections

### Not required

- no redesign of checkpoint handling
- no redesign of scoped confirmations
- no removal of wizard-phase integration

## Testing Strategy

Primary verification should stay in active Vitest/Svelte tests close to the workspace and parameter components.

### Add or update tests for

- disconnected setup state
- connected-without-params setup state
- params-loaded + metadata-loading state
- params-loaded + metadata-failed state where only Full Parameters is available
- ready state where guided sections unlock again
- disabled visible nav items for unimplemented sections
- Full Parameters landing directly in raw browser mode
- raw parameter browser compact editing behavior and bitmask interaction
- removal of scaffold-panel rendering for disabled unimplemented sections
- updated operator-facing copy expectations

### Avoid

- source-grep tests for removed words unless there is already an established pattern for UI-copy guardrails

## Implementation Slices

This design is small enough for one implementation plan, but the code should be executed in discrete slices:

1. Setup gating and Overview states
2. Nav/fallback behavior for unimplemented sections
3. Full Parameters default entry behavior
4. Raw parameter browser density and editing restoration
5. Copy cleanup and regression tests

## Risks and Constraints

### Risk: over-restoring old gating

The archived React setup hard-redirected operators away from selected sections until fully ready. That should not automatically come back. The confirmed design is a soft gate, not a forced redirect model.

### Risk: workflow helpers competing with raw browser

If workflow cards remain too visually dominant inside Full Parameters, the product goal is missed even if the raw browser is technically present.

### Risk: store truth vs UI copy mismatch

If the store still reports “blocked but inspectable” semantics while the UI now wants plain operational states, the product will continue to feel internally inconsistent. The store output text and the rendered text must be aligned.

## Success Criteria

The work is successful when:

- Setup clearly blocks everything until parameters are loaded
- metadata failure leaves Overview + Full Parameters as the only useful path
- Full Parameters opens directly into raw parameters
- raw parameter editing is denser and faster again
- unimplemented sections remain visible but disabled without scaffold leakage
- operator-facing copy reads like a setup tool again rather than an internal architecture demo

