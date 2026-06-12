#!/usr/bin/env python3
"""Job diario (~7h): espejo del Calendar de macOS → calendario_eventos (SIN IA).

Lee los eventos de los próximos 7 días vía osascript (mismo AppleScript que
usaba el panel viejo de Sistema/panel, + uid para dedup) y sincroniza la tabla
del cockpit: upsert por uid_externo (fuente 'mac') + borrado de los 'mac' de
hoy en adelante que ya no existen en la ventana. Las filas pasadas quedan como
historia; las 'manual' no se tocan nunca.
"""
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import log, registrar_evento, rest

VENTANA_DIAS = 7
TIMEOUT_OSASCRIPT = 90  # Calendar.app puede tardar en despertar

# Ventana: hoy 00:00 → hoy+7 (los "próximos 7 días"). Formato de línea:
# uid||YYYY-MM-DD||HH:MM||allday||titulo  (HH:MM vacío si es de día completo).
APPLESCRIPT = r"""
tell application "Calendar"
    set allLines to {}
    set ws to current date
    set ws to ws - (time of ws)
    set we to ws + (7 * days) - 1
    repeat with cal in (every calendar)
        try
            set evs to (every event of cal whose start date >= ws and start date <= we)
            repeat with ev in evs
                try
                    set evUid to uid of ev
                    set evTitle to summary of ev
                    set evStart to start date of ev
                    set evIsAllDay to allday event of ev
                    set yr to year of evStart as integer
                    set mo to month of evStart as integer
                    set dy to day of evStart as integer
                    set hr to hours of evStart as integer
                    set mn to minutes of evStart as integer
                    set moS to mo as text
                    set dyS to dy as text
                    set hrS to hr as text
                    set mnS to mn as text
                    if mo < 10 then set moS to "0" & moS
                    if dy < 10 then set dyS to "0" & dyS
                    if hr < 10 then set hrS to "0" & hrS
                    if mn < 10 then set mnS to "0" & mnS
                    set dateStr to (yr as text) & "-" & moS & "-" & dyS
                    if evIsAllDay then
                        set timeStr to ""
                    else
                        set timeStr to hrS & ":" & mnS
                    end if
                    set evLine to evUid & "||" & dateStr & "||" & timeStr & "||" & (evIsAllDay as text) & "||" & evTitle
                    set end of allLines to evLine
                end try
            end repeat
        end try
    end repeat
    set AppleScript's text item delimiters to (ASCII character 10)
    set output to allLines as text
    set AppleScript's text item delimiters to ""
    return output
end tell
"""


def leer_calendar(timeout=TIMEOUT_OSASCRIPT):
    """Corre el AppleScript y devuelve el stdout crudo. LANZA si Calendar no responde."""
    try:
        r = subprocess.run(
            ["osascript", "-e", APPLESCRIPT],
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Calendar.app no respondió en {timeout}s")
    if r.returncode != 0:
        raise RuntimeError(f"osascript falló: {(r.stderr or '').strip()[:300] or 'sin detalle'}")
    return r.stdout


def parsear_lineas(salida):
    """stdout del AppleScript → [{uid_externo, titulo, fecha, hora}].

    hora = None para eventos de día completo. Líneas malformadas se saltean;
    uids repetidos (mismo evento en dos calendarios) se quedan con el primero.
    """
    eventos, vistos = [], set()
    for linea in (salida or "").splitlines():
        partes = linea.split("||")
        if len(partes) < 5:
            continue
        uid, fecha, hora, _allday, titulo = (p.strip() for p in partes[:5])
        if not uid or not titulo or len(fecha) != 10:
            continue
        if uid in vistos:
            continue
        vistos.add(uid)
        eventos.append({
            "uid_externo": uid,
            "titulo": titulo[:200],
            "fecha": fecha,
            "hora": hora or None,
        })
    return eventos


def planear_sync(existentes, nuevos, hoy_iso):
    """Diff puro entre las filas 'mac' de la tabla y lo que dice Calendar.

    existentes: filas de calendario_eventos fuente='mac' (id, uid_externo,
    titulo, fecha, hora) — TODAS, para que un evento movido de fecha se
    actualice en vez de chocar contra el unique de uid_externo.
    Devuelve (crear, actualizar, borrar_ids):
      - crear: payloads nuevos (uid que no está en la tabla)
      - actualizar: [(id, cambios)] cuando titulo/fecha/hora cambiaron
      - borrar_ids: filas con fecha >= hoy cuyo uid ya no existe en la ventana
        (las pasadas quedan como historia).
    """
    por_uid = {e["uid_externo"]: e for e in existentes if e.get("uid_externo")}
    uids_nuevos = {n["uid_externo"] for n in nuevos}

    crear, actualizar = [], []
    for n in nuevos:
        viejo = por_uid.get(n["uid_externo"])
        if viejo is None:
            crear.append({**n, "fuente": "mac"})
            continue
        cambios = {
            k: n[k] for k in ("titulo", "fecha", "hora") if n[k] != viejo.get(k)
        }
        if cambios:
            actualizar.append((viejo["id"], cambios))

    borrar_ids = [
        e["id"] for e in existentes
        if e.get("uid_externo") and e["uid_externo"] not in uids_nuevos
        and (e.get("fecha") or "") >= hoy_iso
    ]
    return crear, actualizar, borrar_ids


def correr(cfg, token):
    hoy = date.today()
    nuevos = parsear_lineas(leer_calendar())

    existentes = rest(
        cfg, token,
        "calendario_eventos?fuente=eq.mac&select=id,uid_externo,titulo,fecha,hora",
    ) or []
    crear, actualizar, borrar_ids = planear_sync(existentes, nuevos, hoy.isoformat())

    if crear:
        rest(cfg, token, "calendario_eventos", data=crear, method="POST")
    for ev_id, cambios in actualizar:
        rest(cfg, token, f"calendario_eventos?id=eq.{ev_id}", data=cambios, method="PATCH")
    if borrar_ids:
        rest(cfg, token, f"calendario_eventos?id=in.({','.join(borrar_ids)})", method="DELETE")

    log(f"calendario: {len(nuevos)} en ventana — +{len(crear)} / ~{len(actualizar)} / −{len(borrar_ids)}")
    registrar_evento(
        cfg, token, "job_calendario",
        f"Calendario sincronizado — {len(nuevos)} eventos en los próximos {VENTANA_DIAS} días",
        {
            "fecha": hoy.isoformat(),
            "en_ventana": len(nuevos),
            "creados": len(crear),
            "actualizados": len(actualizar),
            "borrados": len(borrar_ids),
        },
    )
