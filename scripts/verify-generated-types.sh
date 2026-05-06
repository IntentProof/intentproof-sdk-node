#!/usr/bin/env bash
# Regenerate packages/sdk/src/generated from intentproof-spec and fail if the tree drifts.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
npm ci
bash scripts/generate-schema-types.sh
npm run format -w @intentproof/sdk
git diff --exit-code -- packages/sdk/src/generated
if [[ -n "$(git ls-files --others --exclude-standard -- packages/sdk/src/generated)" ]]; then
  echo "verify-generated-types: untracked files in packages/sdk/src/generated after generation" >&2
  git ls-files --others --exclude-standard -- packages/sdk/src/generated >&2
  exit 1
fi
echo "OK: generated TypeScript matches intentproof-spec"
