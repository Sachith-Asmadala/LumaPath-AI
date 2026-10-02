#!/bin/bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "Usage: ./run.sh"
  echo "Installs missing dependencies, then starts the web app, API, and notification worker."
  echo "Web: http://localhost:3000 | API: http://127.0.0.1:8000/docs"
  echo "Press Ctrl+C to stop all three services. Run ./setup.sh to refresh dependencies."
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "Unknown argument. Use ./run.sh --help." >&2
  exit 1
fi

if [ ! -f node_modules/next/dist/bin/next ] || [ ! -f .env ] || \
   ! .venv/bin/python -c 'import uvicorn, fastapi, dotenv' >/dev/null 2>&1; then
  bash ./setup.sh
fi

# Fail early instead of allowing Next.js to silently choose a different port.
.venv/bin/python - <<'PY'
import socket
import sys
for port in (3000, 8000):
    with socket.socket() as sock:
        try:
            sock.bind(("0.0.0.0", port))
        except OSError:
            sys.exit(f"Port {port} is unavailable. Stop the service using it, then rerun ./run.sh.")
PY

pids=()
cleanup() {
  trap - EXIT INT TERM
  echo "Stopping LumaPath..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

.venv/bin/python -m uvicorn apps.api.app.main:app --reload --port 8000 --env-file .env &
pids+=("$!")
.venv/bin/python -c 'from dotenv import load_dotenv; import runpy; load_dotenv(".env"); runpy.run_module("apps.worker.jobs.notifications.loop", run_name="__main__")' &
pids+=("$!")
node node_modules/next/dist/bin/next dev --turbopack --hostname 127.0.0.1 --port 3000 &
pids+=("$!")

echo "Starting LumaPath: http://localhost:3000"
echo "API docs: http://127.0.0.1:8000/docs"
echo "Press Ctrl+C to stop all services."

# macOS ships Bash 3.2, which does not support wait -n.
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      status=0
      wait "$pid" || status=$?
      echo "A service exited (status $status); stopping the remaining services." >&2
      if [ "$status" -eq 0 ]; then status=1; fi
      exit "$status"
    fi
  done
  sleep 1
done
