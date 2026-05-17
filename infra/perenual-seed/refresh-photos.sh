#!/usr/bin/env bash
# Sync per-species `medium.jpg` from the upstream Perenual mirror to prod's
# /srv/zelenka/infra/perenual-photos/.
#
# Source:  ~/Desktop/perenual/images/species/<id>/{small,medium,regular,...}
# Target:  prod:/srv/zelenka/infra/perenual-photos/<id>/medium.jpg
# Filter:  only the medium variant ships (the API picks it for plant cards;
#          we don't need thumbnail or original on prod).
#
# Incremental: rsync skips files whose size+mtime haven't changed. Adds in
# newly fetched species, refreshes any that the upstream re-downloaded.
#
# Usage:
#   PROD_PASS=... infra/perenual-seed/refresh-photos.sh
#   PROD_PASS=... PROD_HOST=root@1.2.3.4 infra/perenual-seed/refresh-photos.sh
set -euo pipefail

SRC="${PERENUAL_IMAGES_SRC:-$HOME/Desktop/perenual/images/species}"
HOST="${PROD_HOST:-root@217.114.43.241}"
DST="${PROD_PHOTOS_PATH:-/srv/zelenka/infra/perenual-photos/}"

[ -d "$SRC" ] || { echo "error: $SRC not found — is the Perenual mirror on this box?" >&2; exit 1; }
[ -n "${PROD_PASS:-}" ] || { echo "error: set PROD_PASS to the root password from ssh.txt" >&2; exit 1; }

# Tally first — for visibility.
COUNT=$(find "$SRC" -name medium.jpg | wc -l)
SIZE=$(find "$SRC" -name medium.jpg -printf '%s\n' | awk '{s+=$1} END {printf "%.0f MB\n", s/1024/1024}')
echo "syncing $COUNT medium.jpg files (~$SIZE) from $SRC to $HOST:$DST"

# --include order matters: dirs first so rsync descends, then the only file
# we keep, then exclude-everything-else. --prune-empty-dirs drops species
# subdirectories that don't yet have a medium.jpg.
sshpass -p "$PROD_PASS" rsync -az --info=stats2 \
  -e 'ssh -o StrictHostKeyChecking=no' \
  --include='*/' \
  --include='*/medium.jpg' \
  --exclude='*' \
  --prune-empty-dirs \
  "$SRC/" "$HOST:$DST"
