#!/usr/bin/env python3
"""Runner de los jobs programados de Ravn (com.ravn.jobs, cada 30 min).

Catch-up: los vencimientos comparan PERÍODOS (día/semana ISO/mes), no horarios
exactos — si la Mac estuvo apagada, el primer tick después del arranque corre
todo lo vencido. Reintentos: un job que falla no marca ultima_ok (el próximo
tick lo reintenta), con tope de 3 errores por día.
"""
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import (DIR_JOBS, LOCK, STATE, cargar_cfg, cargar_estado, errores_hoy,
                     log, marcar_error, marcar_ok, registrar_evento, supabase_auth,
                     ultima_ok, vencio_diario, vencio_mensual, vencio_semanal)
import job_calendario
import job_dolar
import job_inbox
import job_maestro
import job_noticias
import job_resumen
import job_sismat
import job_top30

MAX_ERRORES_DIA = 3
# Peor caso real de UN tick que corre todo lo vencido: inbox (1800s) + top30 (1500s)
# + sismat (300s) + dolar ≈ 62 min. 90 min deja margen antes de declarar muerta
# una corrida viva (un lock "vivo" robado = doble Claude headless + doble push).
LOCK_VIEJO = 5400

JOBS = [
    ("calendario", job_calendario.correr, lambda u, a: vencio_diario(u, a, hora_minima=7)),
    ("resumen",  job_resumen.correr,  lambda u, a: vencio_diario(u, a, hora_minima=7)),
    ("noticias", job_noticias.correr, lambda u, a: vencio_diario(u, a, hora_minima=7)),
    ("dolar",   job_dolar.correr,   lambda u, a: vencio_diario(u, a, hora_minima=8)),
    ("sismat",  job_sismat.correr,  lambda u, a: vencio_mensual(u, a, dia_minimo=2, hora_minima=8)),
    ("maestro", job_maestro.correr, lambda u, a: vencio_mensual(u, a, dia_minimo=2, hora_minima=9)),
    ("top30",   job_top30.correr,   lambda u, a: vencio_semanal(u, a, hora_minima=8)),
    ("inbox",   job_inbox.correr,   lambda u, a: vencio_diario(u, a, hora_minima=2)),
]


def jobs_vencidos(estado, ahora, jobs=JOBS):
    out = []
    for nombre, _, vencio in jobs:
        if errores_hoy(estado, nombre, ahora) >= MAX_ERRORES_DIA:
            continue
        if vencio(ultima_ok(estado, nombre), ahora):
            out.append(nombre)
    return out


def correr_vencidos(cfg, token, ahora, jobs=JOBS, state_path=STATE):
    estado = cargar_estado(state_path)
    pendientes = jobs_vencidos(estado, ahora, jobs)
    por_nombre = {n: fn for n, fn, _ in jobs}
    for nombre in pendientes:
        log(f"corriendo job {nombre}…")
        try:
            por_nombre[nombre](cfg, token)
            marcar_ok(state_path, nombre, datetime.now())
            log(f"job {nombre} OK")
        except Exception as e:
            marcar_error(state_path, nombre, datetime.now())
            log(f"job {nombre} ERROR: {e}")
            try:
                # Los errores de jobs de SISTEMA van a Actividad (estado procesado),
                # NO a Archivados — ese feed es para mensajes de Eze que el bot no
                # pudo clasificar, no para ruido técnico de los jobs internos.
                registrar_evento(cfg, token, f"job_{nombre}",
                                 f"job {nombre} falló: {str(e)[:150]}",
                                 {"error": str(e)[:1000], "nivel": "error"}, estado="procesado")
            except Exception as e2:
                log(f"no pude registrar el evento de error: {e2}")
    return pendientes


def main():
    DIR_JOBS.mkdir(exist_ok=True)
    (DIR_JOBS / "logs").mkdir(exist_ok=True)
    if LOCK.exists() and (datetime.now().timestamp() - LOCK.stat().st_mtime) > LOCK_VIEJO:
        LOCK.unlink(missing_ok=True)
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
    except FileExistsError:
        return
    try:
        cfg = cargar_cfg()
        token = supabase_auth(cfg)
        if not correr_vencidos(cfg, token, datetime.now()):
            log("sin jobs vencidos")
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
