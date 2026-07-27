#!/bin/zsh
set -eu

PACKAGE_DIR="${0:A:h}"
ENGINE_ROOT="${DREAM_SKIN_ROOT:-$HOME/.codex/codex-dream-skin-studio}"
PATCHER="$PACKAGE_DIR/tools/install-extension.mjs"
fail() { print -u2 "恢复失败：$1"; exit 1; }
command -v node >/dev/null 2>&1 || fail "未找到 Node.js。"
[[ -f "$ENGINE_ROOT/assets/renderer-inject.js.qq2007-base" && -f "$ENGINE_ROOT/assets/dream-skin.css.qq2007-base" ]] || fail "未找到本安装包创建的备份。"
[[ -f "$PATCHER" ]] || fail "安装包缺少扩展恢复工具。"
node "$PATCHER" restore --engine "$ENGINE_ROOT"
print "恢复完成。没有删除其他主题，也没有自动重启 Codex。"
