#!/bin/zsh
# Wrapper del puente-cotizador: carga el env local y corre el proceso.
set -euo pipefail
source /Users/ezeotero/.ravn-puente/env
cd /Users/ezeotero/Documents/ravn
exec npx tsx daemon/puente-cotizador/puente.ts
