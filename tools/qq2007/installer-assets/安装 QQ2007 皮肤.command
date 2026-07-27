#!/bin/zsh
set -eu

PACKAGE_DIR="${0:A:h}"
ENGINE_ROOT="${DREAM_SKIN_ROOT:-$HOME/.codex/codex-dream-skin-studio}"
CODEX_APP="${CODEX_APP_PATH:-/Applications/Codex.app}"
DESKTOP_ROOT="${DESKTOP_DIR:-$HOME/Desktop}"
THEME_SOURCE="$PACKAGE_DIR/theme"
THEME_TARGET="$ENGINE_ROOT/themes/retro-qq-2007"
PATCHER="$PACKAGE_DIR/tools/install-extension.mjs"

fail() { print -u2 "安装失败：$1"; exit 1; }
[[ "$(uname -s)" == "Darwin" || "${ALLOW_NON_MACOS_FOR_TESTS:-}" == "1" ]] || fail "此安装包仅支持 macOS。"
command -v node >/dev/null 2>&1 || fail "未找到 Node.js。"
[[ -d "$ENGINE_ROOT/assets" && -x "$ENGINE_ROOT/scripts/switch-theme-macos.sh" && -x "$ENGINE_ROOT/scripts/start-dream-skin-macos.sh" ]] || fail "未找到完整的 Codex Dream Skin：$ENGINE_ROOT"
[[ -d "$CODEX_APP" ]] || fail "未找到 Codex 应用：$CODEX_APP"
for file in theme.json background.jpg qq2007-chrome.html qq2007-extension.css profile-codex.png profile-avatar.png profile-penguin.png; do
  [[ -f "$THEME_SOURCE/$file" ]] || fail "安装包缺少 theme/$file"
done
[[ -f "$PATCHER" ]] || fail "安装包缺少扩展安装工具。"
mkdir -p "$ENGINE_ROOT/themes" "$DESKTOP_ROOT"
rm -rf "$THEME_TARGET.new"
mkdir "$THEME_TARGET.new"
cp -p "$THEME_SOURCE"/* "$THEME_TARGET.new/"
rm -rf "$THEME_TARGET"
mv "$THEME_TARGET.new" "$THEME_TARGET"
node "$PATCHER" install --engine "$ENGINE_ROOT" --source "$THEME_TARGET"
"$ENGINE_ROOT/scripts/switch-theme-macos.sh" --id retro-qq-2007
cat > "$DESKTOP_ROOT/Codex QQ2007.command" <<EOF
#!/bin/zsh
set -eu
exec "$ENGINE_ROOT/scripts/start-dream-skin-macos.sh" --port 9341 --prompt-restart
EOF
chmod 755 "$DESKTOP_ROOT/Codex QQ2007.command"
print "安装完成。请手动退出 Codex，再双击桌面的“Codex QQ2007.command”。"
