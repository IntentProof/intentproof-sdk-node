#!/usr/bin/env bash
# Generate TypeScript from intentproof-spec JSON Schemas (paths declared in spec.json).
# Run compilers from the spec schema/ directory so relative $ref (e.g. intentproof_config → wrap_options) resolve.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
spec_root="${INTENTPROOF_SPEC_ROOT:-}"

if [[ -z "$spec_root" ]]; then
  sibling="${repo_root}/../intentproof-spec"
  if [[ -f "${sibling}/spec.json" ]]; then
    spec_root="$(cd "$sibling" && pwd)"
  fi
fi

if [[ -z "$spec_root" || ! -f "${spec_root}/spec.json" ]]; then
  echo "generate-schema-types: intentproof-spec checkout not found. Clone ../intentproof-spec or set INTENTPROOF_SPEC_ROOT." >&2
  exit 1
fi

out_dir="${repo_root}/packages/sdk/src/generated"
mkdir -p "$out_dir"

ver="${JSON_SCHEMA_TO_TYPESCRIPT_VERSION:-15.0.4}"
schema_dir="${spec_root}/schema"

(
  cd "$schema_dir"
  npx "json-schema-to-typescript@${ver}" ./execution_event.v1.schema.json -o "${out_dir}/execution-event.ts"
  npx "json-schema-to-typescript@${ver}" ./wrap_options.v1.schema.json -o "${out_dir}/wrap-options.ts"
  npx "json-schema-to-typescript@${ver}" ./intentproof_config.v1.schema.json -o "${out_dir}/intentproof-config.ts"
)

(cd "${repo_root}/packages/sdk" && npx prettier --write "src/generated/execution-event.ts" "src/generated/wrap-options.ts" "src/generated/intentproof-config.ts")

node "${repo_root}/scripts/embed-spec-schemas.mjs"

(cd "${repo_root}/packages/sdk" && npx prettier --write "src/generated/embed/*.ts")

node - <<'EOF' "${spec_root}" "${out_dir}" "${ver}"
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const [specRoot, outDir, generatorVersion] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(path.join(specRoot, "spec.json"), "utf8"));
const schemas = Object.values(spec.schemas).sort();
const files = {};
const lines = [];
for (const rel of schemas) {
  const raw = fs.readFileSync(path.join(specRoot, rel), "utf8");
  const hash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
  files[rel] = hash;
  lines.push(`${rel}:${hash}`);
}
const payload = {
  specVersion: spec.version,
  algorithm: "sha256",
  generator: { name: "json-schema-to-typescript", version: generatorVersion },
  files,
  aggregate: crypto.createHash("sha256").update(lines.join("\n"), "utf8").digest("hex"),
};
fs.writeFileSync(path.join(outDir, "spec_fingerprint.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
EOF

echo "Generated TypeScript models and schema embeds in ${out_dir} and ${out_dir}/embed"
