#!/bin/bash
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it, then run this script again."
  exit 1
fi

exec node scripts/start-server.mjs
