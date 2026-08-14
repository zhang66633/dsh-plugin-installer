#!/usr/bin/env bash
# dsh-plugin-installer bootstrap: scaffold the shared _plugins/ dependency layer
# from scratch, so GitHub-cloned plugins resolve their @deepseek-ai/* deps.
#
# Usage: bash bootstrap.sh [插件目录]
#   插件目录默认 ${DSH_PLUGINS_DIR:-$HOME/.dsh/plugins}（可用 DSH_PLUGINS_DIR 覆盖）
#   profile 默认 ${DSH_PROFILE:-web}
#
# 做什么:
#   1. 建 _plugins/ 目录（已存在则跳过）
#   2. 写入 package.json 模板（验证过的完整依赖集）
#   3. npm install 产出共享 node_modules
#   4. 提示下一步（clone 插件 + 注册进 profile）
set -u

PLUGINS_DIR="${1:-${DSH_PLUGINS_DIR:-$HOME/.dsh/plugins}}"
PROFILE="${DSH_PROFILE:-web}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/../templates/_plugins.package.json"

echo "===== dsh-plugin-installer bootstrap ====="
echo "目标目录: ${PLUGINS_DIR}"

mkdir -p "${PLUGINS_DIR}"
echo "[1/3] 目录就绪: ${PLUGINS_DIR}"

if [ ! -f "${PLUGINS_DIR}/package.json" ]; then
  cp "${TEMPLATE}" "${PLUGINS_DIR}/package.json"
  echo "[2/3] 已写入 package.json 模板（验证过的 @deepseek-ai/* 依赖集）"
else
  echo "[2/3] package.json 已存在，跳过写入（如需重置请手动替换）"
fi

echo "[3/3] npm install（首次约 1-2 分钟）..."
cd "${PLUGINS_DIR}" && npm install --no-audit --no-fund
if [ $? -eq 0 ]; then
  echo
  echo "✅ bootstrap 完成。_plugins/node_modules 已就绪。"
  echo
  echo "下一步（按 SKILL.md / references/install-flow.md）："
  echo "  1. 下载插件:  git clone --depth 1 <repo-url> ${PLUGINS_DIR}/<插件名>"
  echo "  2. 注册进 profile: 编辑 ~/.dsh/profiles/${PROFILE}/package.json"
  echo "     - dependencies 加 \"<name>\": \"link:${PLUGINS_DIR}/<插件名>\""
  echo "     - dsh.profile.bundles 加 \"<name>\""
  echo "  3. cd ~/.dsh/profiles/${PROFILE} && pnpm install"
  echo "  4. 验证: bash ${SCRIPT_DIR}/diagnose.sh <插件名>"
else
  echo "❌ npm install 失败。检查网络/registry（npmmirror）或 peer 冲突。"
  exit 1
fi
