#!/bin/bash
# package-extension.sh — creates a clean ZIP of extension/ for Chrome Web
# Store submission. Run from the zustand-devtools/ directory.
set -euo pipefail

cd "$(dirname "$0")/extension"

VERSION=$(node -p "require('./manifest.json').version")
OUTPUT="../zustand-devtools-v${VERSION}.zip"

rm -f "$OUTPUT"

zip -r "$OUTPUT" . \
  -x ".DS_Store" \
  -x "Thumbs.db" \
  -x "*.map"

echo "Packaged: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
