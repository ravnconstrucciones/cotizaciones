#!/usr/bin/env python3
"""Gate de verificación: imprime el último evento de un tipo dado.

Uso: python3 chequear_evento.py job_inbox
Sale con código 1 (y mensaje GATE FALLÓ) si no hay ningún evento de ese tipo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import cargar_cfg, supabase_auth, rest

if len(sys.argv) != 2:
    sys.exit("Uso: chequear_evento.py <tipo>  (ej: job_inbox)")

tipo = sys.argv[1]
cfg = cargar_cfg()
token = supabase_auth(cfg)
filas = rest(cfg, token, f"eventos?tipo=eq.{tipo}&order=creado_at.desc&limit=1")
if not filas:
    sys.exit(f"GATE FALLÓ: no hay eventos tipo {tipo} en la tabla eventos")
f = filas[0]
print(f"OK — último evento {tipo}: {f['creado_at']} · estado={f['estado']} · {f['titulo']}")
