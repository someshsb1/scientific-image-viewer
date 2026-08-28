#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${NEUROSCOPE_RUNTIME_DIR:-$APP_DIR/.runtime}"
PID_FILE="$RUNTIME_DIR/neuroscope.pid"
PGID_FILE="$RUNTIME_DIR/neuroscope.pgid"
INSTANCE_FILE="$RUNTIME_DIR/neuroscope.instance"
LOG_FILE="$RUNTIME_DIR/neuroscope.log"
PYTHON_BIN="${NEUROSCOPE_PYTHON:-python3}"
SERVER_HOST="${NEUROSCOPE_HOST:-127.0.0.1}"
SERVER_PORT="${NEUROSCOPE_PORT:-8088}"
COMMAND="${1:-start}"

if [[ ! "$SERVER_PORT" =~ ^[0-9]+$ ]] || (( SERVER_PORT < 1 || SERVER_PORT > 65535 )); then
  echo "Invalid NEUROSCOPE_PORT: $SERVER_PORT" >&2
  exit 2
fi

mkdir -p "$RUNTIME_DIR"

read_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(tr -d '[:space:]' < "$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$pid"
}

read_pgid() {
  [[ -f "$PGID_FILE" ]] || return 1
  local pgid
  pgid="$(tr -d '[:space:]' < "$PGID_FILE")"
  [[ "$pgid" =~ ^[0-9]+$ ]] && (( pgid > 1 )) || return 1
  printf '%s' "$pgid"
}

read_instance_token() {
  [[ -f "$INSTANCE_FILE" ]] || return 1
  local token
  token="$(tr -d '[:space:]' < "$INSTANCE_FILE")"
  [[ "$token" =~ ^[A-Za-z0-9._:-]{16,128}$ ]] || return 1
  printf '%s' "$token"
}

new_instance_token() {
  local token=""
  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    IFS= read -r token < /proc/sys/kernel/random/uuid || true
  fi
  if [[ ! "$token" =~ ^[A-Za-z0-9._:-]{16,128}$ ]]; then
    token="neuroscope-${BASHPID:-$$}-${RANDOM}-$(date +%s%N)"
  fi
  printf '%s' "$token"
}

process_pgid() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  local pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [[ "$pgid" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$pgid"
}

group_is_alive() {
  local pgid="${1:-}"
  [[ "$pgid" =~ ^[0-9]+$ ]] || return 1
  local member_pid member_pgid member_state
  while read -r member_pid member_pgid member_state; do
    if [[ "$member_pgid" == "$pgid" && "$member_state" != Z* ]]; then
      return 0
    fi
  done < <(ps -eo pid=,pgid=,stat= 2>/dev/null)
  return 1
}

process_has_script_argument() {
  local pid="${1:-}"
  local expected="${2:-}"
  local cwd=""
  [[ "$pid" =~ ^[0-9]+$ && -n "$expected" ]] || return 1
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ "$cwd" == "$APP_DIR" ]] || return 1

  local argument candidate
  while IFS= read -r -d '' argument; do
    [[ -n "$argument" ]] || continue
    case "$argument" in
      server.py|*/server.py|overlay_index_fast.js|*/overlay_index_fast.js) ;;
      *) continue ;;
    esac
    if [[ "$argument" == /* ]]; then
      candidate="$(readlink -f -- "$argument" 2>/dev/null || true)"
    else
      candidate="$(readlink -f -- "$cwd/$argument" 2>/dev/null || true)"
    fi
    [[ "$candidate" == "$expected" ]] && return 0
  done < "/proc/$pid/cmdline"
  return 1
}

process_has_instance_token() {
  local pid="${1:-}"
  local token="${2:-}"
  [[ "$pid" =~ ^[0-9]+$ && -n "$token" ]] || return 1
  [[ -r "/proc/$pid/environ" ]] || return 1
  local entry
  while IFS= read -r -d '' entry; do
    [[ "$entry" == "NEUROSCOPE_INSTANCE_TOKEN=$token" ]] && return 0
  done < "/proc/$pid/environ"
  return 1
}

process_command_is_ours() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)" == "$APP_DIR" ]] || return 1

  if process_has_script_argument "$pid" "$APP_DIR/server.py" \
    || process_has_script_argument "$pid" "$APP_DIR/overlay_index_fast.js"; then
    return 0
  fi

  local executable=""
  IFS= read -r -d '' executable < "/proc/$pid/cmdline" || true
  case "${executable##*/}" in
    vips|vipsheader|kdu_expand) return 0 ;;
  esac
  return 1
}

process_matches_instance() {
  local pid="${1:-}"
  local token="${2:-}"
  process_command_is_ours "$pid" || return 1
  [[ -z "$token" ]] || process_has_instance_token "$pid" "$token"
}

group_members_are_ours() {
  local pgid="${1:-}"
  local token="${2:-}"
  [[ "$pgid" =~ ^[0-9]+$ ]] && (( pgid > 1 )) || return 1
  local member_pid member_pgid member_state
  local found=0
  while read -r member_pid member_pgid member_state; do
    [[ "$member_pgid" == "$pgid" && "$member_state" != Z* ]] || continue
    found=1
    process_matches_instance "$member_pid" "$token" || return 1
  done < <(ps -eo pid=,pgid=,stat= 2>/dev/null)
  (( found == 1 ))
}

group_contains_our_processes() {
  local pgid="${1:-}"
  local token="${2:-}"
  [[ "$pgid" =~ ^[0-9]+$ ]] || return 1
  local member_pid member_pgid member_state
  while read -r member_pid member_pgid member_state; do
    [[ "$member_pgid" == "$pgid" && "$member_state" != Z* ]] || continue
    process_matches_instance "$member_pid" "$token" && return 0
  done < <(ps -eo pid=,pgid=,stat= 2>/dev/null)
  return 1
}

signal_our_group_members() {
  local signal="${1:-TERM}"
  local pgid="${2:-}"
  local token="${3:-}"
  local member_pid member_pgid member_state
  while read -r member_pid member_pgid member_state; do
    [[ "$member_pgid" == "$pgid" && "$member_state" != Z* ]] || continue
    if process_matches_instance "$member_pid" "$token"; then
      kill "-$signal" -- "$member_pid" 2>/dev/null || true
    fi
  done < <(ps -eo pid=,pgid=,stat= 2>/dev/null)
}

clear_runtime_identity() {
  rm -f "$PID_FILE" "$PGID_FILE" "$INSTANCE_FILE"
}

process_is_ours() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  process_has_script_argument "$pid" "$APP_DIR/server.py" || return 1
  local token=""
  token="$(read_instance_token 2>/dev/null || true)"
  [[ -z "$token" ]] || process_has_instance_token "$pid" "$token"
}

health_url() {
  local health_host="$SERVER_HOST"
  if [[ "$health_host" == "0.0.0.0" || "$health_host" == "::" ]]; then
    health_host="127.0.0.1"
  fi
  printf 'http://%s:%s/api/health' "$health_host" "$SERVER_PORT"
}

display_url() {
  local display_host="$SERVER_HOST"
  if [[ "$display_host" == "0.0.0.0" || "$display_host" == "::" ]]; then
    display_host="127.0.0.1"
  fi
  printf 'http://%s:%s' "$display_host" "$SERVER_PORT"
}

port_is_busy() {
  command -v ss >/dev/null 2>&1 || return 1
  [[ -n "$(ss -H -ltn "sport = :$SERVER_PORT" 2>/dev/null)" ]]
}

start_server() {
  local pid=""
  local python_path=""
  local instance_token=""
  pid="$(read_pid 2>/dev/null || true)"
  if process_is_ours "$pid"; then
    echo "NeuroScope is already running (PID $pid) at $(display_url)"
    return 0
  fi

  if [[ -f "$PID_FILE" || -f "$PGID_FILE" || -f "$INSTANCE_FILE" ]]; then
    # A prior Python parent may have died while a Node/libvips child survived.
    # stop_server validates the saved launch identity before touching that group.
    stop_server
  fi

  if port_is_busy; then
    echo "Cannot start NeuroScope: port $SERVER_PORT is already in use." >&2
    ss -ltnp "sport = :$SERVER_PORT" 2>/dev/null || true
    return 1
  fi

  python_path="$(command -v "$PYTHON_BIN" 2>/dev/null || true)"
  if [[ -z "$python_path" ]]; then
    echo "Cannot start NeuroScope: Python executable not found: $PYTHON_BIN" >&2
    return 1
  fi
  if ! command -v start-stop-daemon >/dev/null 2>&1; then
    echo "Cannot start NeuroScope: start-stop-daemon is not installed." >&2
    echo "Use '$0 foreground' or install the dpkg/start-stop-daemon package." >&2
    return 1
  fi

  instance_token="$(new_instance_token)"
  (umask 077; printf '%s\n' "$instance_token" > "$INSTANCE_FILE")
  export NEUROSCOPE_INSTANCE_TOKEN="$instance_token"
  touch "$LOG_FILE"
  if ! start-stop-daemon --start --background --make-pidfile \
    --pidfile "$PID_FILE" \
    --chdir "$APP_DIR" \
    --startas "$python_path" \
    --output "$LOG_FILE" \
    -- server.py; then
    echo "NeuroScope could not be launched. Inspect $LOG_FILE for details." >&2
    clear_runtime_identity
    return 1
  fi
  pid="$(read_pid 2>/dev/null || true)"

  local pgid=""
  pgid="$(process_pgid "$pid" 2>/dev/null || true)"
  if [[ -n "$pgid" ]]; then
    printf '%s\n' "$pgid" > "$PGID_FILE"
  fi

  local attempt
  for attempt in {1..40}; do
    if ! process_is_ours "$pid"; then
      echo "NeuroScope failed to start. Recent log output:" >&2
      tail -n 30 "$LOG_FILE" >&2 || true
      # Keep the saved group identity long enough to terminate a child that may
      # have outlived the failed Python parent.
      stop_server >/dev/null 2>&1 || clear_runtime_identity
      return 1
    fi
    if ! command -v curl >/dev/null 2>&1 || curl -fsS "$(health_url)" >/dev/null 2>&1; then
      echo "NeuroScope started (PID $pid)"
      echo "URL: $(display_url)"
      echo "Log: $LOG_FILE"
      return 0
    fi
    sleep 0.25
  done

  echo "NeuroScope process $pid started, but its health check did not become ready." >&2
  echo "Inspect the log with: $0 logs" >&2
  return 1
}

stop_server() {
  local pid=""
  local pgid=""
  local saved_pgid=""
  local caller_pgid=""
  local instance_token=""
  local stop_group=0
  local orphaned_group=0
  pid="$(read_pid 2>/dev/null || true)"
  saved_pgid="$(read_pgid 2>/dev/null || true)"
  instance_token="$(read_instance_token 2>/dev/null || true)"
  caller_pgid="$(process_pgid "$$" 2>/dev/null || true)"

  if process_is_ours "$pid"; then
    pgid="$(process_pgid "$pid" 2>/dev/null || true)"
    if [[ -n "$pgid" && "$pgid" != "1" && "$pgid" != "$caller_pgid" ]] \
      && group_members_are_ours "$pgid" "$instance_token"; then
      stop_group=1
    fi
    echo "Stopping NeuroScope (PID $pid)..."
  elif [[ -n "$saved_pgid" && -n "$instance_token" \
      && "$saved_pgid" != "$caller_pgid" ]] \
      && group_members_are_ours "$saved_pgid" "$instance_token"; then
    # The launch token is inherited by subprocesses. Requiring it here means a
    # recycled PGID can never authorize killing an unrelated process group.
    pgid="$saved_pgid"
    stop_group=1
    orphaned_group=1
    echo "Stopping surviving NeuroScope worker group (PGID $pgid)..."
  else
    if [[ -n "$saved_pgid" ]] && group_is_alive "$saved_pgid"; then
      echo "Saved process group $saved_pgid does not match this NeuroScope launch; leaving it untouched."
    elif [[ -f "$PID_FILE" || -f "$PGID_FILE" || -f "$INSTANCE_FILE" ]]; then
      echo "Removing stale runtime files; no matching NeuroScope process is running."
    else
      echo "NeuroScope is not running."
    fi
    clear_runtime_identity
    return 0
  fi

  if (( stop_group )); then
    # Revalidate every live member immediately before the group signal. If the
    # membership changed, signal only processes carrying our launch identity.
    if group_members_are_ours "$pgid" "$instance_token"; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
    else
      signal_our_group_members TERM "$pgid" "$instance_token"
    fi
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
  local attempt
  for attempt in {1..50}; do
    if { (( stop_group )) && ! group_contains_our_processes "$pgid" "$instance_token"; } \
      || { (( ! stop_group )) && ! process_is_ours "$pid"; }; then
      clear_runtime_identity
      echo "NeuroScope stopped."
      return 0
    fi
    sleep 0.1
  done

  if (( orphaned_group )); then
    echo "Surviving NeuroScope workers did not stop within 5 seconds; forcing them down." >&2
  else
    echo "NeuroScope did not stop within 5 seconds; forcing its managed processes down." >&2
  fi
  if (( stop_group )) && group_members_are_ours "$pgid" "$instance_token"; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
  elif (( stop_group )); then
    signal_our_group_members KILL "$pgid" "$instance_token"
  else
    kill -KILL "$pid" 2>/dev/null || true
  fi
  for attempt in {1..20}; do
    if { (( stop_group )) && ! group_contains_our_processes "$pgid" "$instance_token"; } \
      || { (( ! stop_group )) && ! process_is_ours "$pid"; }; then
      clear_runtime_identity
      echo "NeuroScope stopped."
      return 0
    fi
    sleep 0.1
  done
  echo "NeuroScope could not be stopped cleanly. Review $LOG_FILE." >&2
  return 1
}

status_server() {
  local pid=""
  local pgid=""
  local instance_token=""
  pid="$(read_pid 2>/dev/null || true)"
  if process_is_ours "$pid"; then
    echo "NeuroScope is running (PID $pid)"
    echo "URL: $(display_url)"
    echo "Log: $LOG_FILE"
    if command -v curl >/dev/null 2>&1 && curl -fsS "$(health_url)" >/dev/null 2>&1; then
      echo "Health: ready"
    else
      echo "Health: process is running but the API is not responding"
      return 1
    fi
    return 0
  fi
  pgid="$(read_pgid 2>/dev/null || true)"
  instance_token="$(read_instance_token 2>/dev/null || true)"
  if [[ -n "$pgid" && -n "$instance_token" ]] \
    && group_members_are_ours "$pgid" "$instance_token"; then
    echo "NeuroScope's server parent is not running, but managed workers remain (PGID $pgid)."
    echo "Run '$0 stop' to terminate them safely."
    return 1
  fi
  echo "NeuroScope is not running."
  return 3
}

foreground_server() {
  local pid=""
  pid="$(read_pid 2>/dev/null || true)"
  if process_is_ours "$pid" || port_is_busy; then
    echo "Cannot run in foreground: NeuroScope or another service is already using port $SERVER_PORT." >&2
    return 1
  fi
  cd "$APP_DIR"
  exec "$PYTHON_BIN" server.py
}

usage() {
  cat <<EOF
Usage: ./run.sh {start|stop|restart|status|foreground|logs}

  start       Start NeuroScope in the background (default)
  stop        Gracefully stop the managed NeuroScope process
  restart     Stop, then start NeuroScope
  status      Show process and health status
  foreground  Run attached to the current terminal
  logs        Follow the background service log
EOF
}

case "$COMMAND" in
  start) start_server ;;
  stop) stop_server ;;
  restart) stop_server && start_server ;;
  status) status_server ;;
  foreground|fg) foreground_server ;;
  logs) touch "$LOG_FILE"; exec tail -n 100 -f "$LOG_FILE" ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
