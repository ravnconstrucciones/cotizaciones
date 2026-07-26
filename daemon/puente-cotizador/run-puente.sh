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
# node directo con el loader de tsx, sin npx ni shims (E2E 2026-07-26):
# bajo launchd, `npx` se colgaba contra el cache de npm y el shim
# node_modules/.bin/tsx moría con "Operation not permitted" (TCC de macOS
# sobre ~/Documents — mismo patrón que com.ravn.jobs, que ejecuta el binario
# de Python directo). El permiso de Documents se le da al binario `node` una
# sola vez y listo.
exec /opt/homebrew/bin/node --import ./node_modules/tsx/dist/loader.mjs \
  daemon/puente-cotizador/puente.ts
