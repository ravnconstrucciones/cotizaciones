#!/bin/zsh
# Instala (o reinstala) com.ravn.puente-cotizador.
set -euo pipefail
mkdir -p /Users/ezeotero/.ravn-puente/logs
if [ ! -f /Users/ezeotero/.ravn-puente/env ]; then
  echo "FALTA /Users/ezeotero/.ravn-puente/env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAVN_APP_URL, RAVN_AGENTE_SECRET)"; exit 1
fi
cp /Users/ezeotero/Documents/ravn/daemon/puente-cotizador/run-puente.sh /Users/ezeotero/.ravn-puente/run-puente.sh
chmod +x /Users/ezeotero/.ravn-puente/run-puente.sh
cp /Users/ezeotero/Documents/ravn/daemon/launchd/com.ravn.puente-cotizador.plist /Users/ezeotero/Library/LaunchAgents/
launchctl bootout "gui/$(id -u)/com.ravn.puente-cotizador" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" /Users/ezeotero/Library/LaunchAgents/com.ravn.puente-cotizador.plist
launchctl list | grep com.ravn.puente-cotizador
echo "OK com.ravn.puente-cotizador instalado"
