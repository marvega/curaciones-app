#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND="../backend"
test -d "$BACKEND" || { echo "backend dir not found: $BACKEND"; exit 1; }

echo "Exporting OpenAPI from backend..."
(cd "$BACKEND" && KMS_BACKEND="${KMS_BACKEND:-memory}" EMAIL_BACKEND="${EMAIL_BACKEND:-noop}" DATABASE_URL="${DATABASE_URL:-postgresql://curaciones:curaciones@localhost:5433/curaciones_test}" npm run openapi:export)

echo "Generating TypeScript types..."
mkdir -p src/api-types
npx openapi-typescript "$BACKEND/openapi.json" -o src/api-types/index.ts

echo "Done. src/api-types/index.ts updated."
