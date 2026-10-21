#!/bin/bash
# Moves the live backend from the demo SQLite file to a permanent Postgres
# database. Run once, from anywhere:
#
#   backend/scripts/go-postgres.sh 'postgresql://USER:PASS@HOST:PORT/DB'
#
# What it does:
#   1. Creates the tables and seeds the shows, demo posts, and owner account.
#      A strong owner password is generated and appended to .owner-credentials
#      at the repo root (git-ignored). Set OWNER_PASSWORD to choose your own.
#   2. Sets DATABASE_URL for the subcurrent-backend Vercel project (production).
#   3. Pushes an empty commit so Vercel rebuilds the backend in Postgres mode.
set -euo pipefail
URL="${1:-}"
if [[ ! "$URL" =~ ^postgres(ql)?:// ]]; then
  echo "Usage: $0 'postgresql://USER:PASS@HOST:PORT/DB'" >&2
  exit 1
fi
# Serverless functions open a pool per instance; keep each one small.
if [[ "$URL" != *connection_limit=* ]]; then
  if [[ "$URL" == *\?* ]]; then URL="$URL&connection_limit=5"; else URL="$URL?connection_limit=5"; fi
fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

echo "1/3 Creating tables and seeding..."
DATABASE_URL="$URL" SEED_LABEL="production postgres" npm run --silent db:setup
node scripts/prisma.js generate >/dev/null   # back to the SQLite client for local work

echo "2/3 Setting DATABASE_URL on Vercel (subcurrent-backend, production)..."
[ -d .vercel ] || vercel link --project subcurrent-backend --yes >/dev/null
vercel env rm DATABASE_URL production --yes >/dev/null 2>&1 || true
printf '%s' "$URL" | vercel env add DATABASE_URL production >/dev/null

echo "3/3 Triggering a rebuild..."
cd "$HERE/.."
git commit --allow-empty -q -m "Switch backend to Postgres"
git push -q origin main

echo "Done. In a minute or two, https://subcurrent-backend.vercel.app/health will be served from Postgres."
echo "Owner sign-in: see .owner-credentials at the repo root."
