#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/leo/Library/Mobile Documents/com~apple~CloudDocs/Personal/M3U Codex Workspace/Correction Notebook"
API_PORT="${API_PORT:-8787}"
EXPO_PORT="${EXPO_PORT:-8081}"
API_ENV_FILE="${REPO_DIR}/services/api/.env"

find_lan_ip() {
  local default_iface
  default_iface="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}')"

  for iface in "$default_iface" en0 en1; do
    if [ -z "$iface" ]; then
      continue
    fi

    local ip
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      printf '%s\n' "$ip"
      return 0
    fi
  done

  printf '%s\n' "127.0.0.1"
}

escape_for_applescript() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

LAN_IP="${LAN_IP:-$(find_lan_ip)}"
API_URL="http://${LAN_IP}:${API_PORT}"

google_key_length() {
  if [ ! -f "$API_ENV_FILE" ]; then
    printf '0\n'
    return 0
  fi

  awk -F= '
    /^GOOGLE_CLOUD_VISION_API_KEY=/ {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[ \t"'"'"']+|[ \t"'"'"']+$/, "", value)
      print length(value)
      found = 1
    }
    END {
      if (!found) print 0
    }
  ' "$API_ENV_FILE"
}

GOOGLE_KEY_LENGTH="$(google_key_length)"

if [ "$GOOGLE_KEY_LENGTH" = "0" ]; then
  cat <<MESSAGE
Google Vision OCR is not configured.

Set GOOGLE_CLOUD_VISION_API_KEY in:
${API_ENV_FILE}

Current value is empty, so screenshot OCR will fail with:
Set GOOGLE_CLOUD_VISION_API_KEY on the API service.

The services can still start, but OCR will not work until this key is set and the API window is restarted.
MESSAGE
fi

stop_existing_expo_for_project() {
  local pid
  for pid in $(lsof -tiTCP:"$EXPO_PORT" -sTCP:LISTEN 2>/dev/null || true); do
    local command
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$REPO_DIR"* ]] && [[ "$command" == *"expo start"* ]]; then
      echo "Stopping existing Correction Notebook Expo process on port ${EXPO_PORT}: ${pid}"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      if ps -p "$pid" >/dev/null 2>&1; then
        kill -KILL "$pid" >/dev/null 2>&1 || true
      fi
    fi
  done
}

stop_existing_node_api_for_project() {
  local pid
  for pid in $(lsof -tiTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null || true); do
    local command
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$REPO_DIR"* ]] && [[ "$command" != *"com.docker"* ]]; then
      echo "Stopping existing local API process on port ${API_PORT}: ${pid}"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      if ps -p "$pid" >/dev/null 2>&1; then
        kill -KILL "$pid" >/dev/null 2>&1 || true
      fi
    fi
  done
}

start_docker_api() {
  cd "$REPO_DIR"
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed or not on PATH."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop is not running. Start Docker Desktop first."
    exit 1
  fi

  stop_existing_node_api_for_project
  API_URL="http://127.0.0.1:${API_PORT}" scripts/start-api-docker.sh
}

start_docker_api
stop_existing_expo_for_project

printf -v MOBILE_CMD 'cd %q && echo %q && echo %q && i=0; while ! curl -fsS %q >/dev/null 2>&1; do i=$((i + 1)); if [ "$i" -ge 30 ]; then echo %q; break; fi; sleep 1; done; EXPO_PUBLIC_API_BASE_URL=%q npx expo start --host lan --port %q --clear' \
  "${REPO_DIR}/apps/mobile" \
  "Correction Notebook Expo Go" \
  "Using API URL: ${API_URL}" \
  "${API_URL}/health" \
  "API did not answer within 30 seconds. Starting Expo anyway; if refresh fails, check the API window." \
  "$API_URL" \
  "$EXPO_PORT"

MOBILE_CMD_ESCAPED="$(escape_for_applescript "$MOBILE_CMD")"

osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "$MOBILE_CMD_ESCAPED"
end tell
APPLESCRIPT

echo "Started Correction Notebook API in Docker and Expo in Terminal."
echo "API: ${API_URL}"
echo "Expo Go: scan the QR code in the Expo terminal window."
