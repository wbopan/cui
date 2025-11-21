#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.prod-local"

# Load optional local overrides
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

PORT="${PORT:-3001}"
if [[ -z "${CLAUDE_HOME_PATH:-}" ]]; then
  echo "CLAUDE_HOME_PATH is required. Set it in $ENV_FILE (see .env.test-local.example as reference)." >&2
  exit 1
fi
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

# Optional: sweep session-local project outputs created with literal ${CLAUDE_SHARED_ROOT}
ROOT_PARENT="$(cd "$(dirname "$CLAUDE_HOME_PATH")" && pwd)"  # e.g., /Users/nikolaiheum/support-bot-data
SESSIONS_DIR="$ROOT_PARENT/sessions"
if [[ -d "$SESSIONS_DIR" ]]; then
  while IFS= read -r proj; do
    base="$(basename "$proj")"
    dest="$CLAUDE_HOME_PATH/projects/$base"
    if [[ ! -e "$dest" ]]; then
      echo "Importing stray session project: $base"
      mkdir -p "$dest"
      cp -R "$proj"/* "$dest" 2>/dev/null || true
    fi
  done < <(find "$SESSIONS_DIR" -path '*/${CLAUDE_SHARED_ROOT}/claude-home/projects/*' -maxdepth 6 -type d 2>/dev/null)
fi

echo "Starting prod console on port $PORT"
echo "  CLAUDE_HOME_PATH=$CLAUDE_HOME_PATH"
echo "  WORKSPACE_CLAUDE_HOME=$WORKSPACE_CLAUDE_HOME"

cd "$ROOT_DIR"
CLAUDE_HOME_PATH="$CLAUDE_HOME_PATH" \
WORKSPACE_CLAUDE_HOME="$WORKSPACE_CLAUDE_HOME" \
PORT="$PORT" \
npm start -- --port "$PORT"
