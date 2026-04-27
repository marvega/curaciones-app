#!/usr/bin/env bash
# Sample backend memory usage at fixed interval and log to stdout + file.
#
# Usage:
#   HEALTH_TOKEN=xxx ./scripts/monitor-memory.sh [URL] [INTERVAL_SEC] [LOG_FILE]
#
# Defaults:
#   URL          = https://curaciones-api.onrender.com
#   INTERVAL_SEC = 10
#   LOG_FILE     = ./memory-monitor.log
#
# The endpoint /api/health/memory requires HEALTH_TOKEN env var to be set
# both on the server (Render) and in this shell.

set -u

URL="${1:-https://curaciones-api.onrender.com}"
INTERVAL="${2:-10}"
LOG_FILE="${3:-./memory-monitor.log}"

if [[ -z "${HEALTH_TOKEN:-}" ]]; then
  echo "ERROR: HEALTH_TOKEN env var is required" >&2
  exit 1
fi

echo "Sampling ${URL}/api/health/memory every ${INTERVAL}s -> ${LOG_FILE}"
echo "Press Ctrl+C to stop"
echo "---"

printf "%-25s %-7s %-8s %8s %8s %8s %8s %8s %8s\n" \
  "timestamp" "code" "uptime" "rss" "heapTot" "heapUse" "external" "arrBuf" "ms" \
  | tee "$LOG_FILE"

while true; do
  start_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  resp=$(curl -sS -o /tmp/.mem-body -w "%{http_code}" \
    -H "X-Health-Token: ${HEALTH_TOKEN}" \
    --max-time 8 \
    "${URL}/api/health/memory" 2>/dev/null || echo "000")
  end_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  elapsed=$((end_ms - start_ms))
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if [[ "$resp" == "200" ]]; then
    body=$(cat /tmp/.mem-body)
    uptime=$(echo "$body" | sed -n 's/.*"uptimeSec":\([0-9]*\).*/\1/p')
    rss=$(echo "$body" | sed -n 's/.*"rss":\([0-9.]*\).*/\1/p')
    heapTot=$(echo "$body" | sed -n 's/.*"heapTotal":\([0-9.]*\).*/\1/p')
    heapUse=$(echo "$body" | sed -n 's/.*"heapUsed":\([0-9.]*\).*/\1/p')
    ext=$(echo "$body" | sed -n 's/.*"external":\([0-9.]*\).*/\1/p')
    arr=$(echo "$body" | sed -n 's/.*"arrayBuffers":\([0-9.]*\).*/\1/p')
    printf "%-25s %-7s %-8s %8s %8s %8s %8s %8s %8s\n" \
      "$ts" "$resp" "$uptime" "$rss" "$heapTot" "$heapUse" "$ext" "$arr" "$elapsed" \
      | tee -a "$LOG_FILE"
  else
    printf "%-25s %-7s %-8s %8s %8s %8s %8s %8s %8s\n" \
      "$ts" "$resp" "-" "-" "-" "-" "-" "-" "$elapsed" \
      | tee -a "$LOG_FILE"
  fi

  sleep "$INTERVAL"
done
