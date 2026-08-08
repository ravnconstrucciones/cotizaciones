#!/usr/bin/env python3
"""Job cada tick: sincroniza referencias tipo 'dato' → vault (SIN IA).

Los "datos" son conocimiento de obra reutilizable que Eze clasifica desde la
bandeja de Archivados (ej: "Altura container 2,79"). Este job los baja a
Conocimiento/Datos-de-obra.md, la fuente N°1 del cotizador (dato medido en
obra real > Seia > internet).

El daemon se loguea como el usuario bot y las RLS de `referencias` le
prohíben UPDATE — por eso el "ya sincronizado" se lleva con un cursor local
(~/.ravn-jobs/datos-vault-cursor.json) + dedupe por id dentro del .md.

También corre standalone (lo invocan los skills cotizadores antes de cotizar
para no trabajar con el vault desactualizado):
    python3 daemon/jobs/job_datos.py
"""
import json
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import DIR_JOBS, VAULT, log, registrar_evento, rest, transaccion_vault

MD_DATOS = Path(VAULT) / "Conocimiento" / "Datos-de-obra.md"
CURSOR = DIR_JOBS / "datos-vault-cursor.json"

ENCABEZADO = """# Datos de obra — medidos/verificados por Eze

Conocimiento reutilizable capturado desde la bandeja de Archivados (App RAVN).
Para el cotizador esta es la fuente N°1: dato medido en obra real, arriba de
Seia y de internet. Borrar una línea acá = borrar el dato (el sync solo agrega).

<!-- Sincroniza job_datos (daemon com.ravn.jobs). No tocar las marcas ref:… -->
"""


def _leer_cursor():
    try:
        return json.loads(CURSOR.read_text()).get("ultimo_creado_at", "")
    except Exception:
        return ""


def _escribir_cursor(creado_at):
    CURSOR.write_text(json.dumps({"ultimo_creado_at": creado_at}))


def formatear_linea(fila):
    fecha = (fila.get("creado_at") or "")[:10]
    texto = (fila.get("texto") or "").strip().replace("\n", " ")
    etiquetas = [e for e in (fila.get("etiquetas") or []) if e]
    tags = f" _({', '.join(etiquetas)})_" if etiquetas else ""
    return f"- **{fecha}** — {texto}{tags} <!-- ref:{fila['id']} -->"


def filtro_cursor(cursor):
    """Filtro PostgREST para el cursor. El timestamp trae '+00:00' y un '+' crudo
    en la URL llega como espacio → 400; por eso va URL-encodeado."""
    return f"&creado_at=gt.{quote(cursor)}" if cursor else ""


def correr(cfg, token):
    cursor = _leer_cursor()
    filtro = filtro_cursor(cursor)
    filas = rest(
        cfg, token,
        "referencias?select=id,creado_at,texto,etiquetas"
        f"&tipo=eq.dato&order=creado_at.asc{filtro}",
    ) or []
    if not filas:
        return

    def persistir():
        md = MD_DATOS.read_text() if MD_DATOS.exists() else ENCABEZADO
        nuevas_locales = [
            formatear_linea(f) for f in filas if f"ref:{f['id']}" not in md
        ]
        if nuevas_locales:
            MD_DATOS.parent.mkdir(parents=True, exist_ok=True)
            MD_DATOS.write_text(
                md.rstrip("\n") + "\n" + "\n".join(nuevas_locales) + "\n"
            )
        return nuevas_locales

    nuevas = transaccion_vault(
        persistir,
        rutas=lambda _resultado: [MD_DATOS],
        mensaje=f"datos: referencias de obra desde Archivados",
    )
    if nuevas:
        log(f"job datos: {len(nuevas)} dato(s) nuevos → {MD_DATOS.name}")
        registrar_evento(cfg, token, "job_datos",
                         f"{len(nuevas)} dato(s) de obra sincronizados al vault",
                         {"datos": [f["texto"] for f in filas][:20]})
    # El cursor avanza aunque todas fueran duplicadas (ya estaban en el .md).
    _escribir_cursor(filas[-1]["creado_at"])


if __name__ == "__main__":
    from jobslib import cargar_cfg, supabase_auth
    cfg = cargar_cfg()
    correr(cfg, supabase_auth(cfg))
    print("job datos: sync OK")
