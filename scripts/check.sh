#!/usr/bin/env bash
# dsh-plugin-installer: 脚本语法检查（bash -n，零依赖，Windows Git Bash 可用）。
# CI（ubuntu runner）会额外跑 shellcheck scripts/*.sh。
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

for f in "${ROOT}"/scripts/*.sh; do
  if bash -n "$f"; then
    echo "✓ syntax ok  $(basename "$f")"
  else
    echo "✗ syntax ERR $(basename "$f")"
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "check.sh: all scripts pass"
else
  echo "check.sh: FAILED"
fi
exit "$fail"
