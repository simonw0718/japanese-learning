#!/usr/bin/env bash
# 啟用 repo 內的 git hooks（.githooks/pre-commit）：用法 bash tools/install_hooks.sh
set -e
cd "$(git rev-parse --show-toplevel)"
chmod +x .githooks/*
git config core.hooksPath .githooks
echo "已設定 core.hooksPath=.githooks（之後每次 commit 會跑 bump_sw --check、validate、node --test）"
