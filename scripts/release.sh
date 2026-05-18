#!/usr/bin/env bash
#
# HiCodex 发版脚本
#
# 用法：
#   ./scripts/release.sh 0.1.1
#       生成 0.1.1 版本的所有发版产物，并在 dist/release/ 下整理出待上传的文件。
#
#   ./scripts/release.sh 0.1.1 --intel
#       同时打 Intel Mac 版本（aarch64 + x86_64 两份）。默认只打 aarch64。
#
# 前置：
#   1. HICODEX_UPDATER_ENDPOINTS 指向真实 HTTPS 更新元数据 URL。
#   2. HICODEX_UPDATER_PUBKEY 或 HICODEX_UPDATER_PUBKEY_PATH 指向匹配的 Tauri 公钥。
#   3. TAURI_SIGNING_PRIVATE_KEY 或 TAURI_SIGNING_PRIVATE_KEY_PATH 提供 updater 私钥。
#   4. APPLE_SIGNING_IDENTITY / HICODEX_MACOS_SIGNING_IDENTITY / APPLE_CERTIFICATE
#      提供 macOS 正式签名；本地候选包可显式设置 HICODEX_RELEASE_ALLOW_ADHOC_SIGNING=1。
#
# 输出：
#   dist/release/<version>/
#     ├── HiCodex_<ver>_aarch64.app.tar.gz
#     ├── HiCodex_<ver>_aarch64.app.tar.gz.sig
#     ├── HiCodex_<ver>_aarch64.dmg
#     └── latest.json                          ← 这个文件覆盖到托管 root
#
#   把这 4 个文件上传到你的托管（具体路径见 latest.json 里的 url）。

set -euo pipefail

VERSION="${1:?usage: $0 <version> [--intel]}"
WITH_INTEL=false
[[ "${2:-}" == "--intel" ]] && WITH_INTEL=true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-${HOME}/.tauri/hicodex.key}"
  if [[ ! -f "$KEY_PATH" ]]; then
    echo "✗ updater 私钥未配置"
    echo "  设置 TAURI_SIGNING_PRIVATE_KEY，或设置 TAURI_SIGNING_PRIVATE_KEY_PATH 指向私钥文件。"
    echo "  本机默认也会尝试读取：${HOME}/.tauri/hicodex.key"
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

for TARGET in "${TARGETS[@]}"; do
  ARCH="${TARGET%-apple-darwin}"
  echo "▸ Building $TARGET..."
  ( cd apps/desktop && npm run tauri:build -- --target "$TARGET" --config "$RELEASE_CONFIG" )
  BUNDLE_DIR="apps/desktop/src-tauri/target/$TARGET/release/bundle"
  cp "$BUNDLE_DIR/macos/HiCodex.app.tar.gz"     "$OUT_DIR/HiCodex_${VERSION}_${ARCH}.app.tar.gz"
  cp "$BUNDLE_DIR/macos/HiCodex.app.tar.gz.sig" "$OUT_DIR/HiCodex_${VERSION}_${ARCH}.app.tar.gz.sig"
  cp "$BUNDLE_DIR/dmg/"HiCodex_*.dmg            "$OUT_DIR/HiCodex_${VERSION}_${ARCH}.dmg"
done

# 4) 生成 latest.json（从 release merge config 解析 endpoint base）
ENDPOINT=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8')).plugins.updater.endpoints[0]" "$RELEASE_CONFIG")
# 把 .json 文件名替换掉，留下 base URL
URL_BASE=$(echo "$ENDPOINT" | sed -E 's|/latest\.json.*$||; s|/\{\{.*\}\}.*$||')
URL_BASE="${URL_BASE%/}"

NOTES_RAW="$(git log -1 --pretty=%s)"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 拼 platforms 块
PLATFORMS=""
for TARGET in "${TARGETS[@]}"; do
  ARCH="${TARGET%-apple-darwin}"
  SIG=$(cat "$OUT_DIR/HiCodex_${VERSION}_${ARCH}.app.tar.gz.sig" | tr -d '\n')
  URL="${URL_BASE}/HiCodex_${VERSION}_${ARCH}.app.tar.gz"
  [[ -n "$PLATFORMS" ]] && PLATFORMS="$PLATFORMS,"
  PLATFORMS="$PLATFORMS
    \"darwin-$ARCH\": {
      \"signature\": \"$SIG\",
      \"url\": \"$URL\"
    }"
done

cat > "$OUT_DIR/latest.json" <<EOF
{
  "version": "$VERSION",
  "notes": $(node -p "JSON.stringify('$NOTES_RAW')"),
  "pub_date": "$PUB_DATE",
  "platforms": {$PLATFORMS
  }
}
EOF

echo
echo "✓ Release $VERSION built. Upload these files:"
echo
for FILE in "$OUT_DIR"/*; do
  [[ "$(basename "$FILE")" == "tauri.release.conf.json" ]] && continue
  basename "$FILE"
done
echo
echo "Upload destinations:"
for TARGET in "${TARGETS[@]}"; do
  ARCH="${TARGET%-apple-darwin}"
  echo "  $OUT_DIR/HiCodex_${VERSION}_${ARCH}.app.tar.gz"
  echo "    → ${URL_BASE}/HiCodex_${VERSION}_${ARCH}.app.tar.gz"
done
echo "  $OUT_DIR/latest.json"
echo "    → ${URL_BASE}/latest.json    (上传顺序：先 .app.tar.gz，最后 latest.json)"
echo
echo "⚠ 别忘记 commit + tag：git tag v$VERSION && git push --tags"
