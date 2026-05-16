#!/usr/bin/env bash
# Refreshes infra/perenual-seed/perenual.sql.gz from the live Perenual
# Postgres container. Run this whenever the upstream Perenual mirror has
# been updated (via `cd ~/Desktop/perenual && python -m perenual.cli fetch all`).
#
# We never touch /home/ino/Desktop/perenual/ — only read from it via pg_dump.
set -euo pipefail

CONTAINER="${PERENUAL_CONTAINER:-perenual_pg}"
DB="${PERENUAL_DB:-perenual}"
USER_NAME="${PERENUAL_USER:-perenual}"
OUT="$(dirname "$0")/perenual.sql.gz"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "error: container '$CONTAINER' not running. Start it from ~/Desktop/perenual: docker compose up -d" >&2
  exit 1
fi

echo "dumping $DB from $CONTAINER -> $OUT"
docker exec "$CONTAINER" pg_dump -U "$USER_NAME" -d "$DB" \
  --no-owner --no-privileges --format=plain \
  | gzip > "$OUT"

du -h "$OUT"
