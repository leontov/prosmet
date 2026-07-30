#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${HOME}/.prosmet"
BIN_DIR="${ROOT}/bin"
TARGET="${BIN_DIR}/prosmet-engine-cli"
STAGING="${TARGET}.staging-$$"

cargo test -p prosmet-engine
cargo build --release -p prosmet-engine
mkdir -p "${BIN_DIR}"
install -m 0755 target/release/prosmet-engine-cli "${STAGING}"
"${STAGING}" --health
mv -f "${STAGING}" "${TARGET}"
"${TARGET}" --health > "${ROOT}/rust-engine-status.json"
echo "Installed ${TARGET}"
