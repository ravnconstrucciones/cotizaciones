#!/bin/zsh
# Instala (o reinstala) com.ravn.bridge-cotizador — el bridge residente.
set -euo pipefail
if ! grep -q '^COTIZADOR_BRIDGE_TOKEN=' /Users/ezeotero/Documents/ravn/apps/cotizador-ravn/.env.local; then
  echo "FALTA COTIZADOR_BRIDGE_TOKEN en apps/cotizador-ravn/.env.local"
  exit 1
fi
mkdir -p /Users/ezeotero/.ravn-bridge/logs
cp /Users/ezeotero/Documents/ravn/apps/cotizador-ravn/bridge/run-residente.sh /Users/ezeotero/.ravn-bridge/run-residente.sh
chmod +x /Users/ezeotero/.ravn-bridge/run-residente.sh
cp /Users/ezeotero/Documents/ravn/daemon/launchd/com.ravn.bridge-cotizador.plist /Users/ezeotero/Library/LaunchAgents/
launchctl bootout "gui/$(id -u)/com.ravn.bridge-cotizador" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" /Users/ezeotero/Library/LaunchAgents/com.ravn.bridge-cotizador.plist
launchctl list | grep com.ravn.bridge-cotizador
echo "OK com.ravn.bridge-cotizador instalado"
