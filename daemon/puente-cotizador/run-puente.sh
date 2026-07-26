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
# tsx local del repo directo, sin npx: bajo launchd `npx` se colgaba resolviendo
# contra el cache de npm (E2E 2026-07-26) — el binario de node_modules es
# determinístico y arranca al toque.
exec ./node_modules/.bin/tsx daemon/puente-cotizador/puente.ts
