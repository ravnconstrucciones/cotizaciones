#!/usr/bin/env python3
"""Lib común de los jobs programados de Ravn (com.ravn.jobs).

Parte 1 (pura, testeada): parse de .env, vencimientos, estado local, payload de eventos.
Parte 2 (red/procesos, Tarea 2): Supabase REST, git del vault, Claude Code headless.
"""
import json
from datetime import datetime
from pathlib import Path

# ---------- parsing de .env ----------

def parse_env(texto):
    """Parsea KEY=VALOR por línea; ignora comentarios y líneas sin '='. Saca comillas dobles."""
    cfg = {}
    for linea in texto.splitlines():
        linea = linea.strip()
        if "=" in linea and not linea.startswith("#"):
            k, _, v = linea.partition("=")
            cfg[k.strip()] = v.strip().strip('"')
    return cfg

# ---------- vencimientos (catch-up friendly: comparan PERÍODOS, no horarios exactos) ----------

def vencio_diario(ultima_ok, ahora, hora_minima):
    """True si hoy todavía no corrió y ya pasó la hora mínima."""
    if ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return True
    return ultima_ok.date() < ahora.date()


def vencio_semanal(ultima_ok, ahora, hora_minima):
    """True si la última corrida OK fue en una semana ISO anterior."""
    if ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return True
    return ultima_ok.isocalendar()[:2] < ahora.isocalendar()[:2]


def vencio_mensual(ultima_ok, ahora, dia_minimo, hora_minima):
    """True si la última corrida OK fue en un mes anterior y ya es día >= dia_minimo."""
    if ahora.day < dia_minimo or ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return True
    return (ultima_ok.year, ultima_ok.month) < (ahora.year, ahora.month)

# ---------- estado local (~/.ravn-jobs/state.json) ----------

def cargar_estado(path):
    try:
        return json.loads(Path(path).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _guardar_estado(path, estado):
    Path(path).write_text(json.dumps(estado, indent=2, ensure_ascii=False))


def marcar_ok(path, job, ahora):
    estado = cargar_estado(path)
    estado[job] = {"ultima_ok": ahora.isoformat()}
    _guardar_estado(path, estado)


def marcar_error(path, job, ahora):
    estado = cargar_estado(path)
    reg = estado.setdefault(job, {})
    hoy = ahora.date().isoformat()
    if reg.get("fecha_error") == hoy:
        reg["errores"] = reg.get("errores", 0) + 1
    else:
        reg["fecha_error"] = hoy
        reg["errores"] = 1
    _guardar_estado(path, estado)


def ultima_ok(estado, job):
    iso = estado.get(job, {}).get("ultima_ok")
    return datetime.fromisoformat(iso) if iso else None


def errores_hoy(estado, job, ahora):
    reg = estado.get(job, {})
    if reg.get("fecha_error") == ahora.date().isoformat():
        return reg.get("errores", 0)
    return 0

# ---------- payload de eventos (contrato canónico) ----------

def evento_payload(tipo, titulo, contenido, estado="procesado"):
    """Fila para la tabla `eventos` del contrato. origen='daemon' siempre acá."""
    return {
        "origen": "daemon",
        "tipo": tipo,
        "estado": estado,
        "titulo": titulo[:200],
        "contenido": contenido,
    }
