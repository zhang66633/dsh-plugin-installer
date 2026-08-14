#!/usr/bin/env bash
# dsh-plugin-installer 诊断脚本：一键检查插件装没装对。
# 用法: bash diagnose.sh <插件名或目录> [profile]
# 例:   bash diagnose.sh dsh-vision-toolkit
set -u

PLUGIN="${1:-}"
PROFILE="${2:-${DSH_PROFILE:-web}}"
PLUGINS_DIR="${DSH_PLUGINS_DIR:-$HOME/.dsh/plugins}"
PROFILE_DIR="${HOME}/.dsh/profiles/${PROFILE}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PORT=3080

if [ -z "$PLUGIN" ]; then
  echo "用法: bash diagnose.sh <插件名或目录> [profile]"; exit 1
fi

echo "===== 1. 插件目录结构 ====="
if [ -d "${PLUGINS_DIR}/${PLUGIN}" ]; then
  D="${PLUGINS_DIR}/${PLUGIN}"
  echo "目录存在: ${D}"
  [ -f "$D/package.json" ] && echo "  package.json: ✓"
  [ -f "$D/cordis.patch.yml" ] && echo "  cordis.patch.yml: ✓" || echo "  cordis.patch.yml: ✗ 缺"
  [ -f "$D/lib/index.js" ] && echo "  lib/index.js: ✓ 已构建" || echo "  lib/index.js: ✗ 未构建"
  if [ -f "$D/package.json" ]; then
    node -e "const p=require('$D/package.json'); console.log('  name:', p.name); console.log('  dsh.bundle:', p.dsh?.bundle ? '有' : '无'); console.log('  deps:', Object.keys(p.dependencies||{}).join(', ') || '(无)')"
  fi
else
  echo "目录不存在: ${PLUGINS_DIR}/${PLUGIN}"
fi

echo
echo "===== 2. 共享依赖层（_plugins/node_modules）====="
NMOD="${PLUGINS_DIR}/node_modules"
if [ -d "$NMOD" ]; then
  echo "  node_modules 存在（包数: $(find "$NMOD" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)）"
else
  echo "  ✗ _plugins/node_modules 不存在——先跑: cd $PLUGINS_DIR && npm install"
fi

echo
echo "===== 3. profile 组合树 ====="
cd "$PROFILE_DIR" 2>/dev/null || cd ~ || exit 1
DUMP_OUT=$(dsh --profile "$PROFILE" --dump-config 2>&1)
echo "$DUMP_OUT" | grep -q "patch.*not found" && echo "  ⚠️ patch 警告（多为无害的 disabled 目标缺失）:" && echo "$DUMP_OUT" | grep "patch.*not found" | head -3 || echo "  无 patch 警告"
if echo "$DUMP_OUT" | grep -qiE "^# == .*${PLUGIN}|^- id: .*${PLUGIN}"; then
  echo "  插件在组合树里: ✓"
else
  echo "  插件不在组合树里: ✗ 未注册或 patch 没生效"
fi

echo
echo "===== 4. 运行中的 dsh web（若在跑）====="
if curl -s -o /dev/null --max-time 3 "http://127.0.0.1:${PORT}/_api/plugins" 2>/dev/null; then
  FOUND=$(curl -s "http://127.0.0.1:${PORT}/_api/plugins" | grep -o "\"id\":\"[^\"]*${PLUGIN}[^\"]*\"" | head -1)
  [ -n "$FOUND" ] && echo "  客户端已注册: ✓ ($FOUND)" || echo "  客户端未注册（可能纯服务端插件）"
else
  echo "  dsh web 未运行（跳过）"
fi

echo
echo "===== 建议 ====="
echo "  完整流程见: ${SKILL_DIR}/references/install-flow.md"
echo "  坑的配方见: ${SKILL_DIR}/references/edge-cases.md"
