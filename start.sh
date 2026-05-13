#!/bin/bash
set -e

# 100 Journeys — One-click local startup
# Usage: ./start.sh [port]

PORT="${1:-8080}"

echo "============================================"
echo "  100种不可思议的旅行 — 本地启动脚本"
echo "============================================"

# Check Go
echo "[1/4] 检查 Go 环境..."
if ! command -v go &> /dev/null; then
    echo "❌ 未找到 Go，请先安装: https://golang.org/dl/"
    exit 1
fi
go version

# Check dependencies
echo "[2/4] 检查依赖..."
cd "$(dirname "$0")"
if [ ! -d "vendor" ] && [ ! -f "go.sum" ]; then
    go mod tidy
fi

# Ensure data dir exists
mkdir -p data

# Start server
echo "[3/4] 启动服务器..."
echo "    URL: http://localhost:${PORT}"
echo "    按 Ctrl+C 停止"
echo ""

# Open browser (macOS)
if command -v open &> /dev/null; then
    sleep 1 && open "http://localhost:${PORT}" &
fi

# Run server
PORT="${PORT}" go run cmd/server/main.go
