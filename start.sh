#!/bin/bash
set -euo pipefail

# =============================================================
# 100 Journeys — 完整终端启动脚本
# Usage: ./start.sh [选项] [端口]
# =============================================================

# ── 颜色定义 ──
R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
B='\033[0;34m'
C='\033[0;36m'
NC='\033[0m'

# ── 默认值 ──
PORT="8080"
DB_PATH="${DB_PATH:-./data/app.db}"
CDN_BASE_URL="${CDN_BASE_URL:-}"
RUN_MODE="dev"
RESET_DB=false
BUILD_DIR="./bin"
BINARY="$BUILD_DIR/server"

# ── 帮助 ──
show_help() {
    cat << 'EOF'
100种不可思议的旅行 — 启动脚本

用法:
  ./start.sh [选项] [端口]

参数:
  端口              服务器端口 (默认: 8080)

选项:
  -b, --build       先编译二进制文件，再启动 (启动更快，适合频繁重启)
  -r, --reset-db    删除现有数据库，重新执行 schema + seed
  -d, --dev         直接用 go run 启动 (默认)
  -h, --help        显示此帮助

环境变量:
  PORT              服务器端口
  DB_PATH           数据库文件路径 (默认: ./data/app.db)
  CDN_BASE_URL      CDN 基础 URL (留空则使用本地静态资源)

示例:
  ./start.sh                    # 默认 8080 端口，dev 模式
  ./start.sh 8090               # 指定 8090 端口
  ./start.sh -b                 # 编译后运行
  ./start.sh -r                 # 重置数据库并启动
  ./start.sh -b -r 8090         # 重置数据库 + 编译 + 8090 端口

测试:
  go test ./...                 # 运行全部 Go 测试
  cd e2e && npx playwright test # 运行 E2E 测试
EOF
}

# ── 参数解析 ──
while [[ $# -gt 0 ]]; do
    case "$1" in
        -b|--build)   RUN_MODE="build"; shift ;;
        -r|--reset-db) RESET_DB=true; shift ;;
        -d|--dev)     RUN_MODE="dev"; shift ;;
        -h|--help)    show_help; exit 0 ;;
        -*)
            echo -e "${R}未知选项: $1${NC}"
            echo "使用 -h 查看帮助"
            exit 1
            ;;
        *) PORT="$1"; shift ;;
    esac
done

# ── 项目根目录 ──
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# ── 横幅 ──
echo -e "${C}"
echo "╔══════════════════════════════════════════════╗"
echo "║     100种不可思议的旅行 — 本地启动脚本        ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 检查 Go ──
echo -e "${B}[1/5]${NC} 检查 Go 环境..."
if ! command -v go &> /dev/null; then
    echo -e "${R}错误: 未找到 Go${NC}"
    echo "请安装 Go 1.26+: https://golang.org/dl/"
    exit 1
fi

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
MIN_VERSION="1.26.0"
# 简单版本比较
if [[ "$(printf '%s\n' "$MIN_VERSION" "$GO_VERSION" | sort -V | head -n1)" != "$MIN_VERSION" ]]; then
    echo -e "${R}错误: Go 版本过低 ($GO_VERSION)，需要 >= $MIN_VERSION${NC}"
    exit 1
fi
echo -e "${G}  Go $GO_VERSION${NC}"

# ── 依赖管理 ──
echo -e "${B}[2/5]${NC} 检查依赖..."
if [[ ! -f "go.sum" ]] || [[ "go.mod" -nt "go.sum" ]]; then
    echo "  go mod tidy..."
    go mod tidy
fi
# 预下载依赖，避免首次启动慢
if [[ ! -d "$GOPATH/pkg/mod" ]] 2>/dev/null; then
    go mod download 2>/dev/null || true
fi
echo -e "${G}  依赖就绪${NC}"

# ── 数据库处理 ──
echo -e "${B}[3/5]${NC} 数据库准备..."
mkdir -p "$(dirname "$DB_PATH")"

if [[ "$RESET_DB" == true ]]; then
    if [[ -f "$DB_PATH" ]]; then
        echo -e "${Y}  删除旧数据库: $DB_PATH${NC}"
        rm -f "$DB_PATH"
    fi
    echo -e "${G}  数据库已重置，将重新执行 schema + seed${NC}"
else
    echo -e "${G}  数据库路径: $DB_PATH${NC}"
fi

# ── 编译 (build 模式) ──
if [[ "$RUN_MODE" == "build" ]]; then
    echo -e "${B}[4/5]${NC} 编译二进制..."
    mkdir -p "$BUILD_DIR"

    BUILD_FLAGS="-ldflags=-s -w"
    go build $BUILD_FLAGS -o "$BINARY" ./cmd/server/main.go

    echo -e "${G}  编译完成: $BINARY${NC}"
fi

# ── 启动 ──
echo -e "${B}[5/5]${NC} 启动服务器..."
echo ""
echo -e "  ${C}本地地址:${NC}   http://localhost:$PORT"
echo -e "  ${C}数据库:${NC}     $DB_PATH"
if [[ -n "$CDN_BASE_URL" ]]; then
    echo -e "  ${C}CDN:${NC}        $CDN_BASE_URL"
else
    echo -e "  ${C}图片模式:${NC}   本地静态资源"
fi
echo -e "  ${C}运行模式:${NC}   $RUN_MODE"
echo ""
echo -e "  ${Y}按 Ctrl+C 停止服务${NC}"
echo ""

# ── 自动打开浏览器 ──
open_browser() {
    local url="$1"
    sleep 1.5
    if command -v open &> /dev/null; then
        open "$url" 2>/dev/null || true
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$url" 2>/dev/null || true
    fi
}
open_browser "http://localhost:$PORT" &

# ── 运行 ──
export PORT="$PORT"
export DB_PATH="$DB_PATH"
[[ -n "$CDN_BASE_URL" ]] && export CDN_BASE_URL="$CDN_BASE_URL"

if [[ "$RUN_MODE" == "build" ]]; then
    exec "$BINARY"
else
    exec go run ./cmd/server/main.go
fi
