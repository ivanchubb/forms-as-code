#!/bin/sh
set -eu

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [config.json]" >&2
  exit 2
fi

config=${1:-"$(dirname "$0")/app/site.config.json"}
exec python3 "$(dirname "$0")/scripts/serve.py" "$config" --port "${PORT:-8000}"
