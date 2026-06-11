#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/leo/Library/Mobile Documents/com~apple~CloudDocs/Personal/M3U Codex Workspace/Correction Notebook"
API_ENV_FILE="${REPO_DIR}/services/api/.env"
API_URL="${API_URL:-http://127.0.0.1:8787}"

cd "$REPO_DIR"

stop_existing_node_api_for_project() {
  local pid
  for pid in $(lsof -tiTCP:8787 -sTCP:LISTEN 2>/dev/null || true); do
    local command
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$REPO_DIR"* ]] && [[ "$command" != *"com.docker"* ]]; then
      echo "Stopping existing local API process on port 8787: ${pid}"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      if ps -p "$pid" >/dev/null 2>&1; then
        kill -KILL "$pid" >/dev/null 2>&1 || true
      fi
    fi
  done
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker Desktop is not running. Start Docker Desktop first."
  exit 1
fi

if [ ! -f "$API_ENV_FILE" ]; then
  echo "Missing API env file: $API_ENV_FILE"
  exit 1
fi

google_key_length="$(awk -F= '
  /^GOOGLE_CLOUD_VISION_API_KEY=/ {
    value = substr($0, index($0, "=") + 1)
    gsub(/^[ \t"'"'"']+|[ \t"'"'"']+$/, "", value)
    print length(value)
    found = 1
  }
  END {
    if (!found) print 0
  }
' "$API_ENV_FILE")"

if [ "$google_key_length" = "0" ]; then
  echo "GOOGLE_CLOUD_VISION_API_KEY is empty in $API_ENV_FILE; OCR will fail."
fi

stop_existing_node_api_for_project
docker compose up -d --build correction-notebook-api

for _ in $(seq 1 30); do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    echo "Correction Notebook API is running at ${API_URL}"
    exit 0
  fi
  sleep 1
done

echo "API container started, but ${API_URL}/health did not answer within 30 seconds."
echo "Check logs with: docker logs -f correction-notebook-api"
exit 1
