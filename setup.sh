#!/bin/bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for command in node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing $command. Install Node.js 20+ and npm, then run ./setup.sh again." >&2
    exit 1
  fi
done
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

python_bin=""
for candidate in .venv/bin/python python3.13 python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 14) else 1)' 2>/dev/null; then
    python_bin="$candidate"
    break
  fi
done
if [ -z "$python_bin" ]; then
  echo "Python 3.11–3.13 is required. On macOS, you can install it with: brew install python@3.12" >&2
  exit 1
fi
if [ ! -d .venv ]; then
  "$python_bin" -m venv .venv
fi
if ! .venv/bin/python -c 'import sys; sys.exit(0 if (3, 11) <= sys.version_info < (3, 14) else 1)' 2>/dev/null; then
  echo "The existing .venv needs Python 3.11–3.13. Rename it and run ./setup.sh to create a new one." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
fi

echo "Installing frontend dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
echo "Installing API and development dependencies..."
.venv/bin/python -m pip install -e './apps/api[test]'
echo "Setup complete. Start LumaPath with ./run.sh"
