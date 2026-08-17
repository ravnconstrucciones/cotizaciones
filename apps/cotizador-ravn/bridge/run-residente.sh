#!/bin/zsh
# Wrapper RESIDENTE del cotizador-bridge (spec 2026-08-17 motor-encendido-apagado).
# Bajo launchd el proceso queda siempre; lo que se prende/apaga es la voluntad
# de procesar (`deseado` en puente_latidos, manejada desde el chip del visor).
# node directo (sin npx ni shims): bajo launchd los shims mueren con el TCC de
# macOS sobre ~/Documents — el permiso se le da al binario `node` una sola vez
# (mismo patrón que el puente legacy y com.ravn.jobs).
set -euo pipefail
cd /Users/ezeotero/Documents/ravn/apps/cotizador-ravn
export COTIZADOR_BRIDGE_RESIDENTE=1
exec /opt/homebrew/bin/node --env-file-if-exists=.env.local bridge/server.mjs
