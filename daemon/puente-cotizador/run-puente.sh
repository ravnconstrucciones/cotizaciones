#!/bin/zsh
# Wrapper del puente-cotizador: carga el env local y corre el proceso.
# El archivo de env son asignaciones planas (SIN "export"): `set -a` hace que
# TODO lo que `source` defina quede exportado al proceso hijo (tsx). Sin esto,
# `source` sin `-a` deja las variables como locales del shell del wrapper y
# nunca llegan al proceso — el secret queda vacío en silencio (fix ronda
# final finding 6).
set -euo pipefail
set -a
source /Users/ezeotero/.ravn-puente/env
set +a
cd /Users/ezeotero/Documents/ravn
exec npx tsx daemon/puente-cotizador/puente.ts
