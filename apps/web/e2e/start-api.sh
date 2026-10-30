#!/usr/bin/env bash
# Starts a fresh seeded API for the browser tests. Runs the API through tsx, the same way
# `npm run dev` does, so a dev-only startup failure shows up here too.
set -euo pipefail
cd "$(dirname "$0")/../../api"
ADMIN_URL=${E2E_ADMIN_URL:-postgres://postgres:postgres@localhost:5432/postgres}
DB=${E2E_DB:-ngb_e2e}
psql "$ADMIN_URL" -qc "drop database if exists $DB with (force)" -c "create database $DB"
BASE=${ADMIN_URL%/*}
export DATABASE_URL="$BASE/$DB"
export APP_DATABASE_URL="postgres://ngb_app:ngb_app@${BASE#*@}/$DB"
export JWT_SECRET=e2e-only-secret-not-for-use PORT=${E2E_API_PORT:-3100} FILE_STORAGE_DIR=$(mktemp -d)
npx tsx src/db/seed.ts
exec npx tsx src/main.ts
