#!/usr/bin/env bash
set -euo pipefail

source_dir="${SOURCE_DIR:?SOURCE_DIR is required}"
worktree_dir="${WORKTREE_DIR:?WORKTREE_DIR is required}"

log() {
  printf '[gsd worktree post-create] %s\n' "$*" >&2
}

if [[ ! -d "$worktree_dir" ]]; then
  log "worktree directory not found: $worktree_dir"
  exit 1
fi

if command -v direnv >/dev/null 2>&1 && [[ -f "$worktree_dir/.envrc" ]]; then
  if ! direnv allow "$worktree_dir" >/dev/null 2>&1; then
    log "direnv allow failed for $worktree_dir; continuing"
  fi
fi

if [[ -d "$source_dir/node_modules" && ! -e "$worktree_dir/node_modules" ]]; then
  if ! ln -s "$source_dir/node_modules" "$worktree_dir/node_modules"; then
    log "node_modules symlink failed for $worktree_dir; continuing"
  fi
fi
