#!/usr/bin/env bash
# Start (or repair) the SSH tunnel from WSL → Lightning Studio → Ollama.
#
# Run once at the start of each dev session (or whenever Model health is Down):
#   ./scripts/lightning-ollama-tunnel.sh
#
# Optional overrides: copy scripts/lightning-ollama.local.example →
# scripts/lightning-ollama.local and edit values there.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_CONFIG="${SCRIPT_DIR}/lightning-ollama.local"

if [[ -f "$LOCAL_CONFIG" ]]; then
  # shellcheck source=/dev/null
  source "$LOCAL_CONFIG"
fi

LIGHTNING_STUDIO_ID="${LIGHTNING_STUDIO_ID:-s_01kv8qt5y96a31hqwjxve2fkdx}"
SSH_HOST="${SSH_HOST:-ssh.lightning.ai}"
LOCAL_PORT="${LOCAL_PORT:-11434}"
REMOTE_PORT="${REMOTE_PORT:-11434}"
SSH_KEY="${SSH_KEY:-${HOME}/.ssh/lightning_rsa}"
# Lightning key created by VS Code / lightning.ai setup on Windows.
WINDOWS_KEY="${WINDOWS_KEY:-/mnt/c/Users/${USER}/.ssh/lightning_rsa}"

SSH_MATCH="11434:localhost:11434.*ssh.lightning.ai"

usage() {
  cat <<EOF
Usage: $(basename "$0") [command]

Commands:
  start   Ensure the Ollama tunnel is up (default)
  stop    Kill the background tunnel
  status  Show tunnel + Ollama health

DocuPilot expects in apps/backend/.env:
  VLLM_BASE_URL=http://localhost:${LOCAL_PORT}/v1
  VLLM_API_KEY=ollama
  LLM_MODEL=qwen3:14b
EOF
}

ensure_key() {
  mkdir -p "${HOME}/.ssh"
  chmod 700 "${HOME}/.ssh"

  if [[ ! -f "$SSH_KEY" ]]; then
    if [[ -f "$WINDOWS_KEY" ]]; then
      echo "Copying Lightning SSH key from Windows → ${SSH_KEY}"
      cp "$WINDOWS_KEY" "$SSH_KEY"
    else
      echo "ERROR: No SSH key at ${SSH_KEY} or ${WINDOWS_KEY}" >&2
      echo "Run Lightning.ai SSH setup from your Studio (Connect local VS Code)." >&2
      exit 1
    fi
  fi

  chmod 600 "$SSH_KEY"
}

tunnel_pids() {
  pgrep -af "$SSH_MATCH" 2>/dev/null || true
}

ollama_up() {
  curl -sf --connect-timeout 3 --max-time 5 \
    "http://127.0.0.1:${LOCAL_PORT}/v1/models" >/dev/null 2>&1
}

stop_tunnel() {
  if pkill -f "$SSH_MATCH" 2>/dev/null; then
    sleep 1
    echo "Stopped existing tunnel."
  fi
}

start_tunnel() {
  echo "Starting tunnel: localhost:${LOCAL_PORT} → ${LIGHTNING_STUDIO_ID}@ssh.lightning.ai:${REMOTE_PORT}"
  ssh \
    -i "$SSH_KEY" \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=no \
    -o UpdateHostKeys=no \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=4 \
    -o ExitOnForwardFailure=yes \
    -f -N \
    -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" \
    "${LIGHTNING_STUDIO_ID}@${SSH_HOST}"

  for _ in 1 2 3 4 5; do
    if ollama_up; then
      return 0
    fi
    sleep 1
  done

  echo "ERROR: Tunnel started but Ollama did not respond on port ${LOCAL_PORT}." >&2
  echo "Is Ollama running in your Lightning Studio? (ollama serve)" >&2
  stop_tunnel
  exit 1
}

cmd_start() {
  ensure_key

  if ollama_up; then
    echo "OK: Ollama already reachable at http://localhost:${LOCAL_PORT}/v1/models"
    tunnel_pids | sed 's/^/  /' || true
    exit 0
  fi

  stop_tunnel
  start_tunnel
  echo "OK: Ollama tunnel is up."
  curl -sf --max-time 5 "http://127.0.0.1:${LOCAL_PORT}/v1/models" | head -c 200
  echo ""
}

cmd_status() {
  if ollama_up; then
    echo "Ollama: up (http://localhost:${LOCAL_PORT}/v1/models)"
    curl -sf --max-time 5 "http://127.0.0.1:${LOCAL_PORT}/v1/models"
    echo ""
  else
    echo "Ollama: down (nothing on localhost:${LOCAL_PORT})"
  fi

  if tunnel_pids | grep -q .; then
    echo "SSH tunnel process:"
    tunnel_pids | sed 's/^/  /'
  else
    echo "SSH tunnel: not running"
  fi
}

cmd_stop() {
  stop_tunnel
  echo "Tunnel stopped."
}

main() {
  local command="${1:-start}"
  case "$command" in
    start) cmd_start ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    -h | --help | help) usage ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
