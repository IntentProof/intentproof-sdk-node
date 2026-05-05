#!/usr/bin/env bash
# SDK repos must not ship duplicate JSON Schema artifacts; intentproof-spec is canonical.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

mapfile -t schema_paths < <(find . \
  \( -path ./node_modules -o -path ./packages/sdk/dist -o -path ./.git \) -prune \
  -o -name '*.schema.json' -print)

bad=0
for p in "${schema_paths[@]}"; do
  case "$p" in
    ./intentproof-spec/schema/*.schema.json) ;;
    *)
      if [[ $bad -eq 0 ]]; then
        echo "check-no-bundled-schema: only ./intentproof-spec/schema/*.schema.json is allowed." >&2
      fi
      echo "$p"
      bad=1
      ;;
  esac
done

if [[ $bad -ne 0 ]]; then
  exit 1
fi

echo "OK: no bundled *.schema.json"
