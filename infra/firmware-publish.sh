#!/usr/bin/env bash
# Publish a freshly-built firmware binary so OTA-enabled devices can pick it up.
#
# Run from the repo root. Builds the firmware with the version set via
# CONFIG_APP_PROJECT_VER (already baked in at build time — change it in
# firmware/sdkconfig.defaults and rebuild before running this script), copies
# the resulting .bin into infra/firmware-releases/, and updates manifest.json
# to point at the new build.
#
# Usage:
#   infra/firmware-publish.sh                  # versions itself from
#                                              # sdkconfig.defaults
#   infra/firmware-publish.sh 0.1.2            # override version
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/firmware/build"
DEST="$ROOT/infra/firmware-releases"

[ -f "$BUILD/zelenka_firmware.bin" ] || {
  echo "error: $BUILD/zelenka_firmware.bin not found. Run idf.py build first." >&2
  exit 1
}

if [ -n "${1:-}" ]; then
  VERSION="$1"
else
  VERSION=$(grep -E '^CONFIG_APP_PROJECT_VER=' "$ROOT/firmware/sdkconfig.defaults" \
    | sed -E 's/.*"([^"]+)".*/\1/')
fi
[ -n "$VERSION" ] || { echo "error: could not determine version" >&2; exit 1; }

mkdir -p "$DEST"
ART="zelenka-$VERSION.bin"
cp "$BUILD/zelenka_firmware.bin" "$DEST/$ART"
SHA=$(sha256sum "$DEST/$ART" | awk '{print $1}')
SIZE=$(stat -c %s "$DEST/$ART")

cat > "$DEST/manifest.json" <<EOF
{
  "version": "$VERSION",
  "url": "/api/firmware/$ART",
  "sha256": "$SHA",
  "size": $SIZE
}
EOF

echo "published v$VERSION ($SIZE bytes, sha256 ${SHA:0:12}…)"
echo "files in $DEST:"
ls -l "$DEST"
echo
echo "to deploy to production: rsync infra/firmware-releases/ <server>:/srv/zelenka/infra/firmware-releases/"
