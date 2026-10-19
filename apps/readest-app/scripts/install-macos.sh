#!/usr/bin/env bash
# Build this fork's macOS .app (ad-hoc signed) and install it for local use.
# Always copies the result to /Applications so Spotlight / Dock open the
# build you just made (not a stale temp CARGO_TARGET_DIR bundle).
#
# Optional env:
#   KEEP_SOURCEMAPS=1     — keep .js.map in the bundle (devtools)
#   TAURI_FEATURES=devtools — cargo features passed to `tauri build --features`
#   OPEN_AFTER_INSTALL=1  — `open` /Applications/Readest.app when done
set -euo pipefail

APP_NAME="Readest"
BUNDLE_ID="com.bilingify.readest"
EPUB_UTI="org.idpf.epub-container"
INSTALL_DIR="/Applications/${APP_NAME}.app"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${APP_DIR}/../.." && pwd)"
# Always use the repo target dir for installs (ignore sandbox/cache CARGO_TARGET_DIR).
export CARGO_TARGET_DIR="${REPO_ROOT}/target"
BUILT_APP="${CARGO_TARGET_DIR}/release/bundle/macos/${APP_NAME}.app"

cd "${APP_DIR}"

# Local installs don't need updater artifact signing (TAURI_SIGNING_PRIVATE_KEY).
LOCAL_CONFIG="$(mktemp -t readest-install-macos.XXXXXX.json)"
trap 'rm -f "${LOCAL_CONFIG}"' EXIT
cat >"${LOCAL_CONFIG}" <<'EOF'
{
  "bundle": {
    "createUpdaterArtifacts": false
  }
}
EOF

BUILD_ARGS=(build --bundles app --config "${LOCAL_CONFIG}")
if [[ -n "${TAURI_FEATURES:-}" ]]; then
  BUILD_ARGS+=(--features "${TAURI_FEATURES}")
fi

echo "==> Building ${APP_NAME}.app (ad-hoc signed, local install)"
echo "    CARGO_TARGET_DIR=${CARGO_TARGET_DIR}"
if [[ -n "${KEEP_SOURCEMAPS:-}" ]]; then
  echo "    KEEP_SOURCEMAPS=${KEEP_SOURCEMAPS}"
fi
if [[ -n "${TAURI_FEATURES:-}" ]]; then
  echo "    TAURI_FEATURES=${TAURI_FEATURES}"
fi

# dotenv forwards KEEP_SOURCEMAPS from the environment when set.
pnpm exec dotenv -e .env.tauri -- pnpm tauri "${BUILD_ARGS[@]}"

if [[ ! -d "${BUILT_APP}" ]]; then
  echo "error: expected build output missing: ${BUILT_APP}" >&2
  exit 1
fi

if pgrep -xq "${APP_NAME}" 2>/dev/null || pgrep -xf ".*${APP_NAME}\\.app/Contents/MacOS/.*" >/dev/null 2>&1; then
  echo "==> Quitting running ${APP_NAME}"
  osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
  sleep 1
fi

echo "==> Installing to ${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}"
ditto "${BUILT_APP}" "${INSTALL_DIR}"
xattr -cr "${INSTALL_DIR}"

echo "==> Registering with Launch Services"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"${LSREGISTER}" -f "${INSTALL_DIR}"

if command -v duti >/dev/null 2>&1; then
  echo "==> Setting ${APP_NAME} as default for .epub"
  duti -s "${BUNDLE_ID}" "${EPUB_UTI}" all
else
  echo "warning: duti not found; skip setting .epub default (brew install duti)" >&2
fi

echo "==> Done: ${INSTALL_DIR}"
if [[ "${OPEN_AFTER_INSTALL:-}" == "1" ]]; then
  echo "    Opening ${INSTALL_DIR}"
  open -n "${INSTALL_DIR}"
else
  echo "    Open with: open -a ${APP_NAME}"
fi
