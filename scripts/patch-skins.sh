#!/usr/bin/env bash
# dsh-plugin-installer patch-skins: 检测先于打补丁的皮肤修复脚本（版本条件化、幂等可重跑）。
#
# 背景：@linxin666/dsh-client-ui-skin-center 有上游 bug（SKINS_DIR 按源码仓库相对路径
# 解析，npm 安装下找不到皮肤）。早期 junction 方案失败（Windows junction 固化解析目标，
# pnpm 重链接后失效），现用 walk-up 补丁。
#
# 上游可能修 bug、插件升级/重装可能还原补丁——所以本脚本【重跑即重检】，三态收敛：
#   已打补丁（WINDOWS PATCH 标记在） → 跳过
#   上游已修（SKINS_DIR 已是稳健写法） → 不打，提示更新版本映射表
#   仍是旧写法（v≤0.1.1 的上游 bug） → 才打
#
# 用法:
#   bash patch-skins.sh [profile]          # 自动检测 + 打补丁（幂等）
#   bash patch-skins.sh --check [profile]  # 只检测报告，不打
# profile 默认 ${DSH_PROFILE:-web}
set -u

MODE=auto
if [ "${1:-}" = "--check" ]; then MODE=check; shift; fi
PROFILE="${1:-${DSH_PROFILE:-web}}"
PROFILE_DIR="${HOME}/.dsh/profiles/${PROFILE}"

MARKER="WINDOWS PATCH"
OLD_LINE='const SKINS_DIR = fileURLToPath(new URL("../../../skins/", import.meta.url));'
# walk-up 补丁块：向上查找真实 @linxin666（含 skin.json 的位置），优先顶层（跳过 .pnpm hoist 滞后位置）。
export PATCH_BLOCK='/** WINDOWS PATCH: npm installs put skins at node_modules/@linxin666, not relative to this module. Walk up to find it; prefer the top-level location (skip pnpm'"'"'.pnpm hoist scope, which can lag newly installed skins). */
const SKINS_DIR = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  let best = null;
  for (let i = 0; i < 14; i++) {
    dir = dirname(dir);
    const candidate = join(dir, "node_modules", "@linxin666");
    if (statSync(join(candidate, "dsh-client-ui-skin-qq98", "skin.json"), { throwIfNoEntry: false })) {
      if (!candidate.includes(".pnpm")) return candidate;
      best = candidate;
    }
  }
  return best ?? fileURLToPath(new URL("../../../skins/", import.meta.url));
})();'

echo "===== patch-skins (profile: ${PROFILE}, mode: ${MODE}) ====="

# 1. 定位已装 skin-center 的 lib/index.js（.pnpm 真实路径或顶层 symlink/junction）
SKIN_INDEX=$(find "${PROFILE_DIR}/node_modules" -path "*/@linxin666/dsh-client-ui-skin-center/lib/index.js" 2>/dev/null | head -1)
if [ -z "$SKIN_INDEX" ]; then
  echo "⚠️ 没找到 dsh-client-ui-skin-center——它可能未安装。先装："
  echo "   dsh plugin --profile ${PROFILE} add @linxin666/dsh-client-ui-skin-center"
  echo "   （若装的是别的皮肤包/聚合包，跳过本脚本即可；bundle 修复只对 skin-center 生效）"
  exit 1
fi
PKG_DIR="$(dirname "$(dirname "$SKIN_INDEX")")"
# 用 grep 读版本（避免 node 在 Git Bash 路径 /c/... 下 require 失败）
VER=$(grep -m1 '"version"' "${PKG_DIR}/package.json" 2>/dev/null | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/' || echo "?")
echo "找到 skin-center v${VER}: ${SKIN_INDEX}"

# 2. 三态检测
HAS_MARKER=$(grep -cF "$MARKER" "$SKIN_INDEX" 2>/dev/null || true)
HAS_WALKUP=$(grep -cE 'SKINS_DIR = \(\(\) =>|node_modules", "@linxin666"|i < 14' "$SKIN_INDEX" 2>/dev/null || true)
HAS_OLD=$(grep -cF "$OLD_LINE" "$SKIN_INDEX" 2>/dev/null || true)

STATE="unknown"
if [ "$HAS_MARKER" -gt 0 ]; then STATE="already-patched";
elif [ "$HAS_OLD" -gt 0 ]; then STATE="needs-patch";
elif [ "$HAS_WALKUP" -gt 0 ]; then STATE="upstream-fixed"; fi

case "$STATE" in
  already-patched)
    echo "✅ 已打补丁（WINDOWS PATCH 标记在）——无需重打。"
    ;;
  upstream-fixed)
    echo "✅ 上游已修复（SKINS_DIR 已是稳健写法）——不打补丁。edge-cases 版本映射表可删掉 ≤0.1.1 条目。"
    ;;
  needs-patch)
    echo "⚠️ 仍是旧写法（v${VER} 有上游 bug）——需要补丁。"
    if [ "$MODE" = "check" ]; then
      echo "   [check 模式] 未打。运行: bash $0 ${PROFILE}"
    elif command -v perl >/dev/null 2>&1; then
      perl -0pi -e 's#const SKINS_DIR = fileURLToPath\(new URL\("\.\./\.\./\.\./skins/", import\.meta\.url\)\);#$ENV{PATCH_BLOCK}#g' "$SKIN_INDEX"
      if grep -qF "$MARKER" "$SKIN_INDEX"; then
        echo "   ✅ walk-up 补丁已打（重跑本脚本可验证）"
      else
        echo "   ❌ 补丁应用后校验失败——文件可能已被改过，人工检查 ${SKIN_INDEX}"
      fi
    else
      echo "   ❌ 没有 perl（Git Bash 自带，Windows 一般都有）。手动替换见 references/edge-cases.md 坑 10。"
    fi
    ;;
  *)
    echo "⚠️ 无法识别 SKINS_DIR 写法——不自动改（防覆盖新代码）。人工检查 ${SKIN_INDEX}"
    ;;
esac

# 3. shell:true 补丁检测（修 GUI apply：execFile 走 shell 解析 .cmd shim）
HAS_SHELL=$(grep -cF "shell: true" "$SKIN_INDEX" 2>/dev/null || true)
if [ "$HAS_SHELL" -gt 0 ]; then
  echo "✅ shell:true 补丁在（apply 正常）"
else
  echo "⚠️ shell:true 补丁缺失——GUI 切肤 apply 可能失败。"
  if [ "$MODE" = "check" ]; then
    echo "   [check 模式] 未补。运行: bash $0 ${PROFILE}"
  elif command -v perl >/dev/null 2>&1; then
    perl -0pi -e 's#\{ timeout: DSH_SKIN_TIMEOUT_MS \}#{ timeout: DSH_SKIN_TIMEOUT_MS, shell: true }#g' "$SKIN_INDEX"
    grep -qF "shell: true" "$SKIN_INDEX" && echo "   ✅ 已补 shell:true" || echo "   ❌ 补 shell:true 失败，人工改：见 edge-cases.md"
  else
    echo "   无 perl——手动改：execFile('dsh-skin', args, { timeout: ..., shell: true }, ...)"
  fi
fi

# 4. dsh-skin CLI shim 检测（GUI 切肤依赖，一次性）
# Git Bash 的 PATH 可能不含 Windows npm 全局 bin，直接查常见位置兜底
if command -v dsh-skin >/dev/null 2>&1 || [ -f "${APPDATA:-/c/Users/$USER/AppData/Roaming}/npm/dsh-skin.cmd" ] || [ -f "/c/Users/$(whoami 2>/dev/null)/AppData/Roaming/npm/dsh-skin.cmd" ]; then
  echo "✅ dsh-skin CLI 在 PATH（GUI 切肤可用）"
else
  echo "ℹ️ dsh-skin CLI 不在 PATH——GUI 切肤按钮会报错；shim 装法见 edge-cases.md 坑 10。"
fi

# 5. 验证建议
if [ "$MODE" = "auto" ] && [ "$STATE" = "needs-patch" ]; then
  echo
  echo "验证: curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/api/skin-center/bundle/qq98  → 期望 200"
  echo "升级/重装皮肤插件后，重跑本脚本即自动收敛。"
fi
