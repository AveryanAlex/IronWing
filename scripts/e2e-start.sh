#!/usr/bin/env bash
#
# E2E startup orchestrator for IronWing + SITL.
#
# Builds frontend assets (with remote-ui platform), compiles the Tauri app
# with e2e-remote-ui + custom-protocol features, brings up SITL bridge,
# launches the app, and waits for the Remote UI liveness endpoint.
#
# Usage:
#   scripts/e2e-start.sh              # build + bridge + launch + wait
#   scripts/e2e-start.sh --no-build   # skip build steps (reuse existing)
#   scripts/e2e-start.sh --no-bridge  # skip SITL bridge (app-only)
#
# Cleanup on exit (SIGINT/SIGTERM/normal):
#   - Kills the app process
#   - Runs `make bridge-down` (unless --no-bridge)
#
# Environment:
#   E2E_LIVENESS_URL     Override liveness URL (default: http://127.0.0.1:9515/keep_alive)
#   E2E_LIVENESS_TIMEOUT Seconds to wait for liveness (default: 120)
#   E2E_APP_PROFILE      Cargo profile: debug (default) or release
#   E2E_KEEP_RUNNING     If "1", block after readiness until interrupted (for manual testing)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Configuration ---
LIVENESS_URL="${E2E_LIVENESS_URL:-http://127.0.0.1:9515/keep_alive}"
LIVENESS_TIMEOUT="${E2E_LIVENESS_TIMEOUT:-120}"
PROFILE="${E2E_APP_PROFILE:-debug}"
APP_PID_FILE="/tmp/ironwing-e2e-app.pid"

DO_BUILD=1
DO_BRIDGE=1
KEEP_RUNNING=0

for arg in "$@"; do
  case "$arg" in
    --no-build)  DO_BUILD=0 ;;
    --no-bridge) DO_BRIDGE=0 ;;
    --keep)      KEEP_RUNNING=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ "${E2E_KEEP_RUNNING:-}" == "1" ]]; then
  KEEP_RUNNING=1
fi

# --- Resolve binary path ---
CARGO_TARGET_DIR="$(cd "$PROJECT_ROOT" && cargo metadata --no-deps --format-version 1 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['target_directory'])" 2>/dev/null \
  || echo "$PROJECT_ROOT/target")"

if [[ "$PROFILE" == "release" ]]; then
  PROFILE_DIR="release"
  CARGO_PROFILE_FLAG="--release"
else
  PROFILE_DIR="debug"
  CARGO_PROFILE_FLAG=""
fi
APP_BIN="$CARGO_TARGET_DIR/$PROFILE_DIR/ironwing-app"

# --- Cleanup handler ---
APP_PID=""
cleanup() {
  local exit_code=$?
  echo ""
  echo "[e2e] Cleaning up..."

  # Kill app
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    echo "[e2e] Stopping app (pid=$APP_PID)"
    kill "$APP_PID" 2>/dev/null || true
    # Give it a moment to exit gracefully
    for _ in $(seq 1 10); do
      kill -0 "$APP_PID" 2>/dev/null || break
      sleep 0.2
    done
    # Force kill if still alive
    kill -0 "$APP_PID" 2>/dev/null && kill -9 "$APP_PID" 2>/dev/null || true
  fi
  rm -f "$APP_PID_FILE"

  # Stop bridge
  if [[ "$DO_BRIDGE" == "1" ]]; then
    echo "[e2e] Stopping SITL bridge..."
    make -C "$PROJECT_ROOT" bridge-down 2>/dev/null || true
  fi

  echo "[e2e] Cleanup complete (exit=$exit_code)"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# --- Step 1: Build frontend assets ---
if [[ "$DO_BUILD" == "1" ]]; then
  echo "[e2e] Building frontend assets (remote-ui platform)..."
  (cd "$PROJECT_ROOT" && IRONWING_E2E=1 pnpm run build)
  echo "[e2e] Frontend build complete → dist/"

  echo "[e2e] Building Rust binary (features: custom-protocol, e2e-remote-ui)..."
  (cd "$PROJECT_ROOT" && cargo build -p ironwing --features custom-protocol,e2e-remote-ui $CARGO_PROFILE_FLAG)
  echo "[e2e] Rust build complete → $APP_BIN"
else
  echo "[e2e] Skipping build (--no-build)"
  if [[ ! -f "$APP_BIN" ]]; then
    echo "[e2e] ERROR: Binary not found at $APP_BIN" >&2
    echo "[e2e] Run without --no-build first." >&2
    exit 1
  fi
fi

# --- Step 2: Start SITL bridge ---
if [[ "$DO_BRIDGE" == "1" ]]; then
  echo "[e2e] Starting SITL bridge..."
  make -C "$PROJECT_ROOT" bridge-up
  echo "[e2e] SITL bridge ready"
else
  echo "[e2e] Skipping SITL bridge (--no-bridge)"
fi

# --- Step 3: Launch the app ---
echo "[e2e] Launching app with IRONWING_E2E=1..."
# Run from src-tauri/ so tauri-remote-ui resolves frontendDist "../dist" to project-root dist/
(cd "$PROJECT_ROOT/src-tauri" && IRONWING_E2E=1 exec "$APP_BIN") &
APP_PID=$!
echo "$APP_PID" > "$APP_PID_FILE"
echo "[e2e] App started (pid=$APP_PID)"

# Verify the process is actually running
sleep 0.5
if ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "[e2e] ERROR: App exited immediately" >&2
  wait "$APP_PID" 2>/dev/null || true
  exit 1
fi

# --- Step 4: Wait for liveness ---
echo "[e2e] Waiting for liveness at $LIVENESS_URL (timeout=${LIVENESS_TIMEOUT}s)..."
elapsed=0
while [[ "$elapsed" -lt "$LIVENESS_TIMEOUT" ]]; do
  # Check app is still running
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "[e2e] ERROR: App exited while waiting for liveness" >&2
    wait "$APP_PID" 2>/dev/null || true
    exit 1
  fi

  if curl -sf "$LIVENESS_URL" >/dev/null 2>&1; then
    echo "[e2e] ✓ Liveness confirmed at $LIVENESS_URL (after ${elapsed}s)"
    break
  fi

  sleep 1
  elapsed=$((elapsed + 1))
done

if [[ "$elapsed" -ge "$LIVENESS_TIMEOUT" ]]; then
  echo "[e2e] ERROR: Liveness timeout after ${LIVENESS_TIMEOUT}s" >&2
  exit 1
fi

# --- Ready ---
echo "[e2e] ═══════════════════════════════════════"
echo "[e2e] E2E environment ready"
echo "[e2e]   App PID:    $APP_PID"
echo "[e2e]   Remote UI:  http://127.0.0.1:9515/"
echo "[e2e]   Liveness:   $LIVENESS_URL"
echo "[e2e] ═══════════════════════════════════════"

if [[ "$KEEP_RUNNING" == "1" ]]; then
  echo "[e2e] Running until interrupted (Ctrl+C to stop)..."
  wait "$APP_PID" 2>/dev/null || true
fi
