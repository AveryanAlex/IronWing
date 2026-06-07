# IronWing Dev Container

This container is for web development and static web builds without Nix, direnv, or flakes.

Open the repository with VS Code Dev Containers, then run:

```bash
pnpm run build:web
```

The image installs Node 22, Corepack, `pnpm@10.28.0`, Rust stable, the `wasm32-unknown-unknown` target, and `wasm-pack`. `postCreateCommand` runs `pnpm install --frozen-lockfile`; it does not run a full build on every container start.

Build artifacts are written to `dist/web`.
