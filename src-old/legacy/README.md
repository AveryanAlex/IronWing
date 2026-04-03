# Archived React source tree

This subtree preserves the last in-repo React-owned frontend source after the Svelte cutover.

## Layout

```text
src-old/legacy/
├── App.firmware-navigation.test.tsx
├── types.ts
├── components/
└── hooks/
```

## What lives here

- Legacy React feature panels, shells, setup flows, hooks, and component tests.
- Reference-only AGENTS guides that describe the archived mission/setup architecture.
- Files that would otherwise keep active `src/` looking like a mixed Svelte + React tree.

## What does not live here

- Neutral active TypeScript bridges and domain helpers that still serve the shipped runtime.
- The old React bootstrap entrypoint, which remains separately under `src-old/runtime/`.

## Usage rule

Read this tree when porting behavior, contracts, or UX intent into the active Svelte runtime. Do not import or re-activate modules from here directly.
