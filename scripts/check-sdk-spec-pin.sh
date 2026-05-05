#!/usr/bin/env bash
# Fail if this SDK's declared IntentProof spec version does not match spec.json from the checkout.
# Usage: check-sdk-spec-pin.sh /absolute/or/relative/path/to/intentproof-spec
set -euo pipefail

spec_root="$(cd "$1" && pwd)"
sdk_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "${spec_root}/spec.json" ]]; then
  echo "check-sdk-spec-pin: not a spec checkout (missing spec.json): ${spec_root}" >&2
  exit 2
fi

spec_version="$(python3 -c "import json, pathlib, sys; print(json.loads(pathlib.Path(sys.argv[1]).read_text())['version'])" "${spec_root}/spec.json")"

root_ver="$(node -p "JSON.parse(require('node:fs').readFileSync('${sdk_root}/package.json','utf8')).intentproofSpecVersion")"
pkg_ver="$(node -p "JSON.parse(require('node:fs').readFileSync('${sdk_root}/packages/sdk/package.json','utf8')).intentproofSpecVersion")"

if [[ "$root_ver" != "$spec_version" ]]; then
  echo "check-sdk-spec-pin: root package.json intentproofSpecVersion=${root_ver} but spec.json version=${spec_version}" >&2
  exit 1
fi
if [[ "$pkg_ver" != "$spec_version" ]]; then
  echo "check-sdk-spec-pin: packages/sdk/package.json intentproofSpecVersion=${pkg_ver} but spec.json version=${spec_version}" >&2
  exit 1
fi

echo "SDK spec pin OK (${spec_version})"
