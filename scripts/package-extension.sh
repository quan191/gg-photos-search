#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/manifest.json').version")"
DIST_DIR="${ROOT_DIR}/dist/gg-photos-search"
ARCHIVE="${ROOT_DIR}/dist/gg-photos-search-v${VERSION}.zip"

rm -rf "${ROOT_DIR}/dist"
mkdir -p "${DIST_DIR}/icons" "${DIST_DIR}/src/popup" "${DIST_DIR}/src/content" "${DIST_DIR}/src/utils"
cp "${ROOT_DIR}/manifest.json" "${DIST_DIR}/"
cp -R "${ROOT_DIR}/icons/." "${DIST_DIR}/icons/"
cp -R "${ROOT_DIR}/src/popup/popup.html" "${ROOT_DIR}/src/popup/popup.css" "${ROOT_DIR}/src/popup/popup.js" "${ROOT_DIR}/src/popup/batch-mode.js" "${DIST_DIR}/src/popup/"
cp -R "${ROOT_DIR}/src/content/content.js" "${ROOT_DIR}/src/content/google-photos-api.js" "${ROOT_DIR}/src/content/google-photos-auth.js" "${ROOT_DIR}/src/content/main-world.js" "${ROOT_DIR}/src/content/photo-index.js" "${DIST_DIR}/src/content/"
cp -R "${ROOT_DIR}/src/utils/filename-parser.js" "${DIST_DIR}/src/utils/"

(cd "${DIST_DIR}" && zip -qr "${ARCHIVE}" .)
echo "Created ${ARCHIVE}"
