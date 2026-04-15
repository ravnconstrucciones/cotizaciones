#!/usr/bin/env bash
# Arranque de desarrollo: libera :3000 si quedó un next-server colgado, mejora el
# watcher bajo Documents/iCloud. Por defecto Webpack; Turbopack: RAVN_TURBOPACK=1 npm run dev

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

PORT="${PORT:-3000}"
NEXT_BIN="$ROOT/node_modules/.bin/next"
if [ ! -x "$NEXT_BIN" ]; then
  echo "Falta node_modules. Corré: npm install"
  exit 1
fi

_should_free_pid() {
  local lc
  lc=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  [[ "$lc" == *node* ]] || [[ "$lc" == *next* ]]
}

cleanup_port() {
  local pids pid args
  pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "${pids:-}" ] && return 0
  for pid in $pids; do
    args=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if _should_free_pid "$args"; then
      echo "[ravn dev] Puerto $PORT ocupado (PID $pid) — cierro el proceso Node/Next anterior."
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.8
  pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  for pid in $pids; do
    args=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if _should_free_pid "$args"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

cleanup_port

# iCloud / ~/Documents: el watcher por eventos se atrasa o “congela” el dev server.
if [ -z "${RAVN_NO_POLLING:-}" ]; then
  case "$ROOT" in
    */Documents/*|*/Library/Mobile\ Documents/*|*com~apple~CloudDocs*)
      export WATCHPACK_POLLING=true
      echo "[ravn dev] WATCHPACK_POLLING=true (ruta sincronizada / Documents — watcher estable)."
      ;;
  esac
fi

# Por defecto Webpack: Turbopack (--turbopack) a veces rompe con 500 y
# MODULE_NOT_FOUND en chunks/ssr/[turbopack]_runtime.js al tocar rutas API.
# Para forzar Turbopack: RAVN_TURBOPACK=1 npm run dev
if [ "${RAVN_TURBOPACK:-0}" = "1" ]; then
  exec "$NEXT_BIN" dev --turbopack -p "$PORT"
else
  exec "$NEXT_BIN" dev -p "$PORT"
fi
