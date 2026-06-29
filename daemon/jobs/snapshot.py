#!/usr/bin/env python3
"""Imprime el snapshot del estado real del negocio (App RAVN) por stdout.

Lo consume `morning.sh` (generador de "Tu Día") para que el 1% diario se calcule
sobre datos vivos y no solo sobre el texto de Operación/*.md. El job nocturno
`job_inbox.py` usa `snapshot_negocio` directo por import; este wrapper existe para
el mundo bash. Degrada suave: si algo falla, imprime un marcador y sale 0, así el
panel de Tu Día se reconstruye igual (nunca lo rompe).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from jobslib import cargar_cfg, supabase_auth, snapshot_negocio
    cfg = cargar_cfg()
    token = supabase_auth(cfg)
    print(snapshot_negocio(cfg, token))
except Exception as e:  # nunca tumbar al generador del panel por esto
    print(f"(estado real del negocio no disponible esta corrida: {e})")

sys.exit(0)
