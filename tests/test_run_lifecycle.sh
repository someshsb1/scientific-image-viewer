#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_SCRIPT="$PROJECT_DIR/run.sh"
HELPER_SCRIPT="$PROJECT_DIR/overlay_index_fast.js"
NODE_BIN="$(command -v node 2>/dev/null || true)"

if [[ -z "$NODE_BIN" ]] || ! command -v setsid >/dev/null 2>&1; then
  echo "run lifecycle: skipped (node or setsid unavailable)"
  exit 0
fi

TEST_ROOT="$(mktemp -d /tmp/neuroscope-run-lifecycle.XXXXXX)"
OWNED_PID=""
UNRELATED_PID=""

cleanup() {
  if [[ -n "$OWNED_PID" ]] && kill -0 "$OWNED_PID" 2>/dev/null; then
    kill -TERM "$OWNED_PID" 2>/dev/null || true
    wait "$OWNED_PID" 2>/dev/null || true
  fi
  if [[ -n "$UNRELATED_PID" ]] && kill -0 "$UNRELATED_PID" 2>/dev/null; then
    kill -TERM "$UNRELATED_PID" 2>/dev/null || true
    wait "$UNRELATED_PID" 2>/dev/null || true
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT INT TERM

wait_for_group() {
  local pid="$1"
  local pgid=""
  local attempt
  for attempt in {1..40}; do
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$pgid" =~ ^[0-9]+$ ]]; then
      printf '%s' "$pgid"
      return 0
    fi
    sleep 0.05
  done
  return 1
}

OWNED_RUNTIME="$TEST_ROOT/owned"
mkdir -p "$OWNED_RUNTIME"
OWNED_TOKEN="neuroscope-owned-test-0001"
(
  cd "$PROJECT_DIR"
  exec setsid env NEUROSCOPE_INSTANCE_TOKEN="$OWNED_TOKEN" \
    "$NODE_BIN" -e 'setInterval(() => {}, 1000)' "$HELPER_SCRIPT"
) >/dev/null 2>&1 &
OWNED_PID=$!
OWNED_PGID="$(wait_for_group "$OWNED_PID")"
printf '%s\n' 99999999 > "$OWNED_RUNTIME/neuroscope.pid"
printf '%s\n' "$OWNED_PGID" > "$OWNED_RUNTIME/neuroscope.pgid"
printf '%s\n' "$OWNED_TOKEN" > "$OWNED_RUNTIME/neuroscope.instance"

OWNED_OUTPUT="$(NEUROSCOPE_RUNTIME_DIR="$OWNED_RUNTIME" "$RUN_SCRIPT" stop)"
wait "$OWNED_PID" 2>/dev/null || true
OWNED_PID=""
[[ "$OWNED_OUTPUT" == *"Stopping surviving NeuroScope worker group"* ]]
[[ ! -e "$OWNED_RUNTIME/neuroscope.pid" ]]
[[ ! -e "$OWNED_RUNTIME/neuroscope.pgid" ]]
[[ ! -e "$OWNED_RUNTIME/neuroscope.instance" ]]

UNRELATED_RUNTIME="$TEST_ROOT/unrelated"
mkdir -p "$UNRELATED_RUNTIME"
(
  cd "$PROJECT_DIR"
  exec setsid env -u NEUROSCOPE_INSTANCE_TOKEN \
    "$NODE_BIN" -e 'setInterval(() => {}, 1000)' "$HELPER_SCRIPT"
) >/dev/null 2>&1 &
UNRELATED_PID=$!
UNRELATED_PGID="$(wait_for_group "$UNRELATED_PID")"
printf '%s\n' 99999999 > "$UNRELATED_RUNTIME/neuroscope.pid"
printf '%s\n' "$UNRELATED_PGID" > "$UNRELATED_RUNTIME/neuroscope.pgid"
printf '%s\n' neuroscope-recycled-test-0002 > "$UNRELATED_RUNTIME/neuroscope.instance"

UNRELATED_OUTPUT="$(NEUROSCOPE_RUNTIME_DIR="$UNRELATED_RUNTIME" "$RUN_SCRIPT" stop)"
[[ "$UNRELATED_OUTPUT" == *"leaving it untouched"* ]]
kill -0 "$UNRELATED_PID" 2>/dev/null
[[ ! -e "$UNRELATED_RUNTIME/neuroscope.pid" ]]
[[ ! -e "$UNRELATED_RUNTIME/neuroscope.pgid" ]]
[[ ! -e "$UNRELATED_RUNTIME/neuroscope.instance" ]]

kill -TERM "$UNRELATED_PID" 2>/dev/null || true
wait "$UNRELATED_PID" 2>/dev/null || true
UNRELATED_PID=""

echo "run lifecycle: ok"
