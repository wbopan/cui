#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.test-local"

# Load optional local env overrides
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

PORT="${PORT:-3002}"

if [[ -z "${CLAUDE_HOME_PATH:-}" ]]; then
  echo "CLAUDE_HOME_PATH is required. Set it in $ENV_FILE (see .env.test-local.example)." >&2
  exit 1
fi

# Default WORKSPACE_CLAUDE_HOME to CLAUDE_HOME_PATH if not set explicitly
WORKSPACE_CLAUDE_HOME="${WORKSPACE_CLAUDE_HOME:-$CLAUDE_HOME_PATH}"

for VAR in CLAUDE_HOME_PATH WORKSPACE_CLAUDE_HOME; do
  VAL="${!VAR}"
  if [[ ${VAL:0:1} != "/" ]]; then
    echo "$VAR must be an absolute path. Got: $VAL" >&2
    exit 1
  fi
  if [[ ! -d "$VAL/projects" ]]; then
    echo "$VAR ($VAL) is invalid: missing projects directory at $VAL/projects" >&2
    exit 1
  fi
done

echo "Starting test console on port $PORT"
echo "  CLAUDE_HOME_PATH=$CLAUDE_HOME_PATH"
echo "  WORKSPACE_CLAUDE_HOME=$WORKSPACE_CLAUDE_HOME"

cd "$ROOT_DIR"
CLAUDE_HOME_PATH="$CLAUDE_HOME_PATH" \
WORKSPACE_CLAUDE_HOME="$WORKSPACE_CLAUDE_HOME" \
PORT="$PORT" \
npm start -- --port "$PORT"
