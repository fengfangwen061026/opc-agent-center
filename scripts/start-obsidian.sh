#!/usr/bin/env bash
# OPC 超级中枢 — Obsidian 启动脚本
# 自动诊断并启动 Obsidian，开放 Local REST API (port 27123)
# 用法：bash scripts/start-obsidian.sh

set -u

VAULT_PATH="${OBSIDIAN_VAULT:-$HOME/obsidian-vault}"
TOKEN_FILE="$HOME/.openclaw/obsidian-api-token.txt"
LOG_FILE="${OBSIDIAN_LOG:-/tmp/opc-obsidian.log}"
EXTRACT_DIR="${OBSIDIAN_EXTRACT_DIR:-$HOME/apps/obsidian/squashfs-root}"

info() {
  echo "[INFO] $*"
}

warn() {
  echo "[WARN] $*"
}

error() {
  echo "[ERROR] $*"
}

find_obsidian() {
  local candidate

  for candidate in "$HOME"/Applications/Obsidian*.AppImage /opt/Obsidian*.AppImage "$HOME"/obsidian.AppImage; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if command -v obsidian >/dev/null 2>&1; then
    command -v obsidian
    return 0
  fi

  candidate="$(find "$HOME" -maxdepth 4 \( -name 'Obsidian*.AppImage' -o -name 'obsidian*.AppImage' \) 2>/dev/null | head -1)"
  if [ -n "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

rest_ready() {
  local token
  token="$(cat "$TOKEN_FILE" 2>/dev/null || true)"

  if [ -n "$token" ]; then
    curl -sf -H "Authorization: Bearer $token" http://localhost:27123/ >/dev/null 2>&1
    return $?
  fi

  curl -sf http://localhost:27123/ >/dev/null 2>&1
}

wait_for_rest() {
  local attempts="$1"
  local sleep_seconds="$2"
  local i

  for i in $(seq 1 "$attempts"); do
    sleep "$sleep_seconds"
    if rest_ready; then
      echo "[OK] Obsidian REST API 已就绪：http://localhost:27123"
      echo "[OK] 现在可以使用 OBSIDIAN_MODE=real 启动 Bridge"
      return 0
    fi
    echo "等待 Obsidian 启动... ($((i * sleep_seconds))s)"
  done

  return 1
}

try_start() {
  local label="$1"
  shift

  info "尝试启动 Obsidian：$label"
  : >"$LOG_FILE"
  "$@" >"$LOG_FILE" 2>&1 &
  local pid=$!
  info "PID: $pid，日志：$LOG_FILE"

  if wait_for_rest 1 5; then
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    warn "$label 5 秒内未就绪，停止本次尝试并切换下一种启动方式"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
  else
    warn "$label 启动进程已退出，最近日志："
    tail -20 "$LOG_FILE" 2>/dev/null || true
  fi

  return 1
}

print_status() {
  local token_prefix
  token_prefix="$(cat "$TOKEN_FILE" 2>/dev/null | head -c 8 || true)"

  echo ""
  echo "=== Obsidian 启动状态 ==="
  echo "Vault:    $VAULT_PATH"
  echo "REST API: http://localhost:27123"
  if [ -n "$token_prefix" ]; then
    echo "Token:    ${token_prefix}..."
  else
    echo "Token:    not found"
  fi
  echo ""
  echo "Bridge 启动命令："
  echo "  OPENCLAW_MODE=live LANCEDB_MODE=real OBSIDIAN_MODE=real pnpm dev"
}

OBSIDIAN_BIN="$(find_obsidian || true)"
if [ -z "$OBSIDIAN_BIN" ]; then
  error "找不到 Obsidian AppImage，请下载后放到 ~/Applications/ 目录"
  echo "        下载地址：https://obsidian.md/download"
  exit 1
fi

info "Obsidian 可执行文件：$OBSIDIAN_BIN"

if ! ldconfig -p 2>/dev/null | grep -q libfuse.so.2; then
  warn "libfuse2 未安装，尝试自动安装..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y libfuse2 2>/dev/null || warn "自动安装失败，请手动执行：sudo apt-get install libfuse2"
  else
    warn "当前系统没有 apt-get，请按发行版安装 libfuse2"
  fi
fi

if [ ! -d "$VAULT_PATH" ]; then
  warn "vault 目录不存在：$VAULT_PATH"
  echo "       如需创建：mkdir -p $VAULT_PATH"
fi

if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  warn "未检测到 DISPLAY/WAYLAND_DISPLAY；Obsidian 桌面端需要图形桌面环境"
fi

if [ -f "$OBSIDIAN_BIN" ]; then
  chmod +x "$OBSIDIAN_BIN" 2>/dev/null || warn "无法修改执行权限，请检查文件权限：$OBSIDIAN_BIN"
fi

if rest_ready; then
  echo "[OK] Obsidian REST API 已经在运行：http://localhost:27123"
  print_status
  exit 0
fi

if try_start "正常启动" "$OBSIDIAN_BIN" --vault "$VAULT_PATH"; then
  print_status
  exit 0
fi

if try_start "--no-sandbox 启动" "$OBSIDIAN_BIN" --no-sandbox --vault "$VAULT_PATH"; then
  print_status
  exit 0
fi

if [ -f "$OBSIDIAN_BIN" ]; then
  info "尝试 AppImage extract 模式"
  mkdir -p "$(dirname "$EXTRACT_DIR")"
  if [ ! -x "$EXTRACT_DIR/AppRun" ]; then
    TMP_EXTRACT="$(mktemp -d)"
    (
      cd "$TMP_EXTRACT" || exit 1
      "$OBSIDIAN_BIN" --appimage-extract >/dev/null 2>&1
    )
    if [ -d "$TMP_EXTRACT/squashfs-root" ]; then
      rm -rf "$EXTRACT_DIR"
      mv "$TMP_EXTRACT/squashfs-root" "$EXTRACT_DIR"
    fi
    rm -rf "$TMP_EXTRACT"
  fi

  if [ -x "$EXTRACT_DIR/AppRun" ] && try_start "解压目录启动" "$EXTRACT_DIR/AppRun" --no-sandbox --vault "$VAULT_PATH"; then
    print_status
    exit 0
  fi

  if [ -x "$EXTRACT_DIR/AppRun" ]; then
    info "解压目录启动后仍未就绪，保留最终进程并等待 60 秒"
    : >"$LOG_FILE"
    "$EXTRACT_DIR/AppRun" --no-sandbox --vault "$VAULT_PATH" >"$LOG_FILE" 2>&1 &
    info "PID: $!，日志：$LOG_FILE"
    if wait_for_rest 12 5; then
      print_status
      exit 0
    fi
  fi
fi

warn "Obsidian 已启动但 REST API 未响应（60s 超时）"
echo "       请在 Obsidian 设置中确认 Local REST API 插件已开启"
echo "       最近日志：$LOG_FILE"
tail -40 "$LOG_FILE" 2>/dev/null || true
print_status
