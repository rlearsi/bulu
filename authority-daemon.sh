#!/usr/bin/env bash
# ==============================================================================
# authority-daemon.sh - Nó Confiável Headless da Blockchain BitCrack
# Roda em segundo plano no PC sem precisar de aba visível aberta no navegador.
# Mantém o nó autoridade conectado à rede P2P (WebRTC), selando blocos a cada 10 min
# e liquidando transferências automaticamente para todos os jogadores online.
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_DIR/.android-panel/authority-daemon.pid"
LOG_FILE="$PROJECT_DIR/.android-panel/authority-daemon.log"
DAEMON_PROFILE="$HOME/.config/bitcrack-daemon-profile"
mkdir -p "$PROJECT_DIR/.android-panel"
mkdir -p "$DAEMON_PROFILE/Default"

sync_profile_keys() {
  if [ -d "$HOME/.config/google-chrome/Default/Local Storage/leveldb" ]; then
    mkdir -p "$DAEMON_PROFILE/Default/Local Storage/leveldb"
    cp -r "$HOME/.config/google-chrome/Default/Local Storage/leveldb/"* "$DAEMON_PROFILE/Default/Local Storage/leveldb/" 2>/dev/null || true
    rm -f "$DAEMON_PROFILE/Default/Local Storage/leveldb/LOCK" 2>/dev/null || true
  fi
  if [ -d "$HOME/.config/google-chrome/Default/IndexedDB/http_localhost_3000.indexeddb.leveldb" ]; then
    mkdir -p "$DAEMON_PROFILE/Default/IndexedDB/http_localhost_3000.indexeddb.leveldb"
    cp -r "$HOME/.config/google-chrome/Default/IndexedDB/http_localhost_3000.indexeddb.leveldb/"* "$DAEMON_PROFILE/Default/IndexedDB/http_localhost_3000.indexeddb.leveldb/" 2>/dev/null || true
    rm -f "$DAEMON_PROFILE/Default/IndexedDB/http_localhost_3000.indexeddb.leveldb/LOCK" 2>/dev/null || true
  fi
}

start_daemon() {
  if pgrep -f "bitcrack-daemon-profile.*localhost:3000" > /dev/null 2>&1; then
    PID=$(pgrep -f "bitcrack-daemon-profile.*localhost:3000" | head -n 1)
    echo "👑 Nó Confiável (Autoridade) já está rodando em segundo plano (PID: $PID)."
    return 0
  fi

  sync_profile_keys
  echo "👑 Iniciando Nó Confiável Headless em segundo plano..."

  ( /opt/google/chrome/chrome \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --disable-dev-shm-usage \
    --user-data-dir="$DAEMON_PROFILE" \
    "http://localhost:3000?wallet=1&daemon=1" > "$LOG_FILE" 2>&1 ) &

  disown
  sleep 2
  PID=$(pgrep -f "bitcrack-daemon-profile.*localhost:3000" | head -n 1)
  if [ -n "$PID" ]; then
    echo "$PID" > "$PID_FILE"
    echo "✔ Nó Confiável ativo em background (PID: $PID)."
    echo "  Logs disponíveis em: $LOG_FILE"
  else
    echo "⚠️ Falha ao detectar processo do daemon. Verifique $LOG_FILE"
  fi
}

stop_daemon() {
  pkill -f "bitcrack-daemon-profile" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "✔ Nó Confiável finalizado."
}

status_daemon() {
  if pgrep -f "bitcrack-daemon-profile.*localhost:3000" > /dev/null 2>&1; then
    PID=$(pgrep -f "bitcrack-daemon-profile.*localhost:3000" | head -n 1)
    echo "🟢 Nó Confiável (Autoridade) ATIVO em segundo plano (PID: $PID)."
    return 0
  fi
  echo "⚪ Nó Confiável está parado."
}

case "$1" in
  start)
    start_daemon
    ;;
  stop)
    stop_daemon
    ;;
  restart)
    stop_daemon
    sleep 1
    start_daemon
    ;;
  status)
    status_daemon
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
