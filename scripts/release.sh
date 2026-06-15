#!/usr/bin/env bash
#
# Forge 发版脚本
#
# 用法：
#   ./scripts/release.sh 0.1.1
#       生成 0.1.1 版本的所有发版产物，并在 dist/release/ 下整理出待上传的文件。
#
#   ./scripts/release.sh 0.1.1 --intel
#       同时打 Intel Mac 版本（aarch64 + x86_64 两份）。默认只打 aarch64。
#
# 前置：
#   1. FORGE_UPDATER_ENDPOINTS 指向真实 HTTPS 更新元数据 URL。
#   2. FORGE_UPDATER_PUBKEY 或 FORGE_UPDATER_PUBKEY_PATH 指向匹配的 Tauri 公钥。
#   3. TAURI_SIGNING_PRIVATE_KEY 或 TAURI_SIGNING_PRIVATE_KEY_PATH 提供 updater 私钥。
#   4. APPLE_SIGNING_IDENTITY / FORGE_MACOS_SIGNING_IDENTITY / APPLE_CERTIFICATE
#      提供 macOS 正式签名；本地候选包可显式设置 FORGE_RELEASE_ALLOW_ADHOC_SIGNING=1。
#   （旧的 HICODEX_* 环境变量名仍作为兼容别名被接受，FORGE_* 优先。）
#
# 输出：
#   dist/release/<version>/
#     ├── Forge_<ver>_aarch64.app.tar.gz
#     ├── Forge_<ver>_aarch64.app.tar.gz.sig
#     ├── Forge_<ver>_aarch64.dmg
#     └── latest.json                          ← 这个文件覆盖到托管 root
#
#   把这 4 个文件上传到你的托管（具体路径见 latest.json 里的 url）。

set -euo pipefail

VERSION="${1:?usage: $0 <version> [--intel]}"
# Validate before touching anything: VERSION is sed-substituted into
# tauri.conf.json / Cargo.toml and `npm pkg set`, so a malformed value would
# corrupt 4 files (or inject via sed) before failing minutes into the build.
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "✗ VERSION must be semver (e.g. 0.1.1), got: $VERSION" >&2
  exit 1
fi
WITH_INTEL=false
[[ "${2:-}" == "--intel" ]] && WITH_INTEL=true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RESTORE_CODEX_SIDECAR=false
restore_local_sidecar() {
  if [[ "$RESTORE_CODEX_SIDECAR" != true ]]; then
    return 0
  fi
  echo "▸ Restoring local Codex sidecar..."
  if npm run sidecar:prepare; then
    RESTORE_CODEX_SIDECAR=false
  else
    echo "⚠ Failed to restore local Codex sidecar; run npm run sidecar:prepare before local development." >&2
  fi
  return 0
}
trap restore_local_sidecar EXIT

without_release_secrets() {
  env \
    -u TAURI_SIGNING_PRIVATE_KEY \
    -u TAURI_SIGNING_PRIVATE_KEY_PATH \
    -u TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
    -u APPLE_CERTIFICATE \
    -u APPLE_CERTIFICATE_PASSWORD \
    -u APPLE_ID \
    -u APPLE_PASSWORD \
    -u APPLE_API_KEY \
    -u APPLE_API_KEY_PATH \
    "$@"
}

can_smoke_sidecar_target() {
  local target="$1"
  local host_arch
  host_arch="$(uname -m)"
  [[ "$target" == "aarch64-apple-darwin" && "$host_arch" == "arm64" ]] \
    || [[ "$target" == "x86_64-apple-darwin" && "$host_arch" == "x86_64" ]]
}

bundle_dir_for_target() {
  local target="$1"
  local workspace_bundle_dir="target/$target/release/bundle"
  local package_bundle_dir="apps/desktop/src-tauri/target/$target/release/bundle"
  if [[ -d "$workspace_bundle_dir" ]]; then
    printf '%s\n' "$workspace_bundle_dir"
    return 0
  fi
  if [[ -d "$package_bundle_dir" ]]; then
    printf '%s\n' "$package_bundle_dir"
    return 0
  fi
  echo "✗ Tauri bundle directory not found for $target" >&2
  echo "  Checked:" >&2
  echo "    $workspace_bundle_dir" >&2
  echo "    $package_bundle_dir" >&2
  return 1
}

single_file_match() {
  local description="$1"
  local pattern="$2"
  local matches=()
  # shellcheck disable=SC2206
  matches=($pattern)
  if [[ "${#matches[@]}" -ne 1 || ! -f "${matches[0]}" ]]; then
    echo "✗ Expected exactly one $description, found ${#matches[@]} for pattern:" >&2
    echo "  $pattern" >&2
    if [[ "${#matches[@]}" -gt 0 ]]; then
      printf '  - %s\n' "${matches[@]}" >&2
    fi
    return 1
  fi
  printf '%s\n' "${matches[0]}"
}

verify_signed_app() {
  local bundle_dir="$1"
  local target="$2"
  local app_path="$bundle_dir/macos/${APP_PRODUCT_NAME}.app"
  if [[ ! -d "$app_path" ]]; then
    echo "✗ Expected signed app bundle at $app_path" >&2
    return 1
  fi
  echo "▸ Verifying code signature ($target)..."
  codesign --verify --deep --strict --verbose=2 "$app_path"
  if [[ "${FORGE_RELEASE_ALLOW_ADHOC_SIGNING:-${HICODEX_RELEASE_ALLOW_ADHOC_SIGNING:-}}" == "1" ]]; then
    echo "▸ Ad-hoc signing allowed; skipping Gatekeeper/notarization verification"
    return 0
  fi
  if [[ -n "${APPLE_API_KEY:-}${APPLE_API_KEY_PATH:-}${APPLE_ID:-}" ]]; then
    echo "▸ Verifying notarization staple ($target)..."
    xcrun stapler validate "$app_path"
    echo "▸ Verifying Gatekeeper assessment ($target)..."
    spctl --assess --type exec --verbose=2 "$app_path"
  else
    echo "▸ No notarization credentials in env; skipping staple/Gatekeeper verification"
  fi
}

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-${HOME}/.tauri/forge.key}"
  # 故意保留的 legacy 兜底：老安装机器上的 updater 私钥仍叫 hicodex.key，
  # forge.key 优先、hicodex.key 兜底，勿在品牌迁移中删除。
  if [[ ! -f "$KEY_PATH" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" && -f "${HOME}/.tauri/hicodex.key" ]]; then
    KEY_PATH="${HOME}/.tauri/hicodex.key"
  fi
  if [[ ! -f "$KEY_PATH" ]]; then
    echo "✗ updater 私钥未配置"
    echo "  设置 TAURI_SIGNING_PRIVATE_KEY，或设置 TAURI_SIGNING_PRIVATE_KEY_PATH 指向私钥文件。"
    echo "  本机默认也会尝试读取：${HOME}/.tauri/forge.key"
    exit 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
fi
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

echo "▸ Checking release updater config..."
node apps/desktop/scripts/tauri-release-config.mjs --check >/dev/null

# 2) bump 版本号（4 处同步）
echo "▸ Bumping version to $VERSION..."
sed -i '' -E "s/\"version\": \"[^\"]+\"/\"version\": \"$VERSION\"/" apps/desktop/src-tauri/tauri.conf.json
sed -i '' -E "s/^version = \"[0-9.]+\"/version = \"$VERSION\"/" Cargo.toml
npm pkg set version="$VERSION" >/dev/null
( cd apps/desktop && npm pkg set version="$VERSION" >/dev/null )

# 3) 构建（arm64 + 可选 intel）
TARGETS=("aarch64-apple-darwin")
$WITH_INTEL && TARGETS+=("x86_64-apple-darwin")

OUT_DIR="$REPO_ROOT/dist/release/$VERSION"
mkdir -p "$OUT_DIR"
RELEASE_CONFIG="$OUT_DIR/tauri.release.conf.json"
node apps/desktop/scripts/tauri-release-config.mjs --write "$RELEASE_CONFIG"
APP_PRODUCT_NAME="$(
  node -e 'const fs = require("fs"); const base = JSON.parse(fs.readFileSync("apps/desktop/src-tauri/tauri.conf.json", "utf8")); const release = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(release.productName || base.productName || "Forge");' "$RELEASE_CONFIG"
)"
PUBLIC_PRODUCT_NAME="${FORGE_RELEASE_ARTIFACT_NAME:-${HICODEX_RELEASE_ARTIFACT_NAME:-Forge}}"

for TARGET in "${TARGETS[@]}"; do
  ARCH="${TARGET%-apple-darwin}"
  echo "▸ Preparing Codex sidecar for $TARGET..."
  RESTORE_CODEX_SIDECAR=true
  FORGE_CODEX_TARGET="$TARGET" without_release_secrets npm run sidecar:prepare
  if can_smoke_sidecar_target "$TARGET"; then
    echo "▸ Smoke-testing Codex sidecar for $TARGET..."
    without_release_secrets npm run sidecar:smoke
  else
    echo "▸ Skipping Codex sidecar smoke for $TARGET on host $(uname -m)"
  fi
  echo "▸ Building $TARGET..."
  ( cd apps/desktop && npm run tauri:build -- --target "$TARGET" --config "$RELEASE_CONFIG" )
  BUNDLE_DIR="$(bundle_dir_for_target "$TARGET")"
  verify_signed_app "$BUNDLE_DIR" "$TARGET"
  cp "$BUNDLE_DIR/macos/${APP_PRODUCT_NAME}.app.tar.gz"     "$OUT_DIR/${PUBLIC_PRODUCT_NAME}_${VERSION}_${ARCH}.app.tar.gz"
  cp "$BUNDLE_DIR/macos/${APP_PRODUCT_NAME}.app.tar.gz.sig" "$OUT_DIR/${PUBLIC_PRODUCT_NAME}_${VERSION}_${ARCH}.app.tar.gz.sig"
  DMG_FILE="$(single_file_match "DMG artifact for $TARGET" "$BUNDLE_DIR/dmg/${APP_PRODUCT_NAME}_"'*.dmg')"
  cp "$DMG_FILE" "$OUT_DIR/${PUBLIC_PRODUCT_NAME}_${VERSION}_${ARCH}.dmg"
done

restore_local_sidecar

# 4) 生成 updater metadata。脚本会保留真实 updater endpoint；如果 endpoint
# 使用 Tauri 模板变量，不再错误提示上传到 root/latest.json。
NOTES_RAW="$(git log -1 --pretty=%s)"
METADATA_ARGS=()
for TARGET in "${TARGETS[@]}"; do
  METADATA_ARGS+=(--target "$TARGET")
done
FORGE_RELEASE_NOTES="$NOTES_RAW" node scripts/generate-tauri-update-metadata.mjs \
  --config "$RELEASE_CONFIG" \
  --out-dir "$OUT_DIR" \
  --version "$VERSION" \
  --product "$APP_PRODUCT_NAME" \
  --artifact-name "$PUBLIC_PRODUCT_NAME" \
  --skip-copy \
  "${METADATA_ARGS[@]}"

echo
echo "✓ Release $VERSION built. Upload these files:"
echo
for FILE in "$OUT_DIR"/*; do
  [[ "$(basename "$FILE")" == "tauri.release.conf.json" ]] && continue
  [[ "$(basename "$FILE")" == "upload-destinations.txt" ]] && continue
  basename "$FILE"
done
echo
cat "$OUT_DIR/upload-destinations.txt"
echo
echo "⚠ 别忘记 commit + tag：git tag v$VERSION && git push --tags"
