#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
: > "$LOG_DIR/pids.txt"

start() {
  local name="$1"
  shift
  echo "Starting $name..."
  nohup bash -lc "cd '$ROOT' && $*" >>"$LOG_DIR/$name.log" 2>&1 &
  echo "$!" >> "$LOG_DIR/pids.txt"
  disown
  sleep 0.5
}

# Vite-only sibling apps
start erp      "cd stockpharmaerp && npm run dev -- --port 8080 --host 0.0.0.0 --strictPort"
start hub      "cd digi-swasthya-hub && npm run dev -- --port 8081 --host 0.0.0.0 --strictPort"
start med      "cd greetings-pal-git && npm run dev -- --port 8082 --host 0.0.0.0 --strictPort"
start mr       "cd stockistpayments && npm run dev -- --port 8083 --host 0.0.0.0 --strictPort"
start mvp      "cd digimvplaunch && npm run dev -- --port 8084 --host 0.0.0.0 --strictPort"
start dsw      "cd digiswasthya && npm run dev -- --port 8085 --host 0.0.0.0 --strictPort"
start dmvp     "cd digiswasthyamvp && npm run dev -- --port 8086 --host 0.0.0.0 --strictPort"

# Full-stack apps
start sp       "cd STOCKIST-PHARMACY && npm run dev"
start platform "cd digiswasthya-platform/app && PORT=4010 PUBLIC_APP_URL=http://localhost:3010 npm run dev -w @stockist/server & cd digiswasthya-platform/app/client && CLIENT_PORT=3010 API_PORT=4010 npx vite --port 3010 --host 0.0.0.0 --strictPort; wait"
start unified  "cd stockpharma-unified/app && PORT=4020 PUBLIC_APP_URL=http://localhost:3020 npm run dev -w @stockist/server & cd stockpharma-unified/app/client && CLIENT_PORT=3020 API_PORT=4020 npx vite --port 3020 --host 0.0.0.0 --strictPort; wait"

echo "All dev servers launched. Logs: $LOG_DIR"
echo ""
echo "URLs:"
echo "  ERP (stockpharmaerp)       http://localhost:8080"
echo "  HUB (digi-swasthya-hub)    http://localhost:8081"
echo "  MED (greetings-pal-git)    http://localhost:8082"
echo "  MR (stockistpayments)      http://localhost:8083"
echo "  MVP (digimvplaunch)        http://localhost:8084"
echo "  DSW (digiswasthya)         http://localhost:8085"
echo "  DMVP (digiswasthyamvp)     http://localhost:8086"
echo "  SP (STOCKIST-PHARMACY)     http://localhost:3000  (API :4000)"
echo "  Platform (digiswasthya)    http://localhost:3010  (API :4010)"
echo "  Unified (stockpharma)      http://localhost:3020  (API :4020)"
