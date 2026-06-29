#!/usr/bin/env python3
"""Job nocturno: "procesá mi inbox" con Claude Code headless + patrones ADN.

Flujo del vault CLAUDE.md (rutear Inbox, FODA, Patrones, Orientación) + detección
determinística de patrones en las referencias de la semana (spec §7.2). El código
verifica que la Orientación del día exista, pushea el vault y registra el evento.
"""
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, correr_claude, log, push_vault, registrar_evento, rest

TIMEOUT = 1800  # 30 min: lee el vault entero y rutea


def detectar_patrones(filas, umbral=3):
    """Etiquetas de referencias ESTÉTICAS repetidas >= umbral en la semana."""
    conteo = {}
    for f in filas:
        if f.get("tipo") != "estetica":
            continue
        for e in f.get("etiquetas") or []:
            conteo[e] = conteo.get(e, 0) + 1
    return [f"{e}: {n} capturas" for e, n in sorted(conteo.items(), key=lambda x: (-x[1], x[0])) if n >= umbral]


def resumen_referencias(filas):
    if not filas:
        return "(sin referencias nuevas esta semana)"
    lineas = []
    for f in filas[:30]:
        etiquetas = ", ".join(f.get("etiquetas") or [])
        texto = (f.get("texto") or "(sin texto)")[:120]
        sufijo = f" (etiquetas: {etiquetas})" if etiquetas else ""
        lineas.append(f"- [{f.get('tipo')}] {texto}{sufijo}")
    return "\n".join(lineas)


def armar_prompt(fecha, refs, patrones, pipeline):
    if patrones:
        bloque_patrones = (
            "PATRONES ADN DETECTADOS POR CÓDIGO (incluilos como observación en la sección "
            "'Patrones detectados esta sesión' de la Orientación — son señal para Ravn/Posicionamiento.md):\n"
            + "\n".join(f"- {p}" for p in patrones)
        )
    else:
        bloque_patrones = "(sin patrón ADN nuevo esta semana — no inventes uno)"
    return f"""Sos el segundo cerebro de Ezequiel corriendo headless en su Mac (job nocturno del Centro de Mando).

INSTRUCCIONES MAESTRAS: leé /Users/ezeotero/Obsidian/RAVN/CLAUDE.md y ejecutá el comando "procesá mi inbox" siguiendo su flujo EXACTO:
1. Leé el contexto completo (Yo/, FODA/, Ravn/, última Orientación/).
2. Procesá cada entrada nueva de Inbox/ (ruteo a nodos, links [[]]).
3. Actualizá los archivos de FODA/ si corresponde.
4. Detectá patrones en todo el vault.
5. Generá /Users/ezeotero/Obsidian/RAVN/Orientación/{fecha}.md con el formato exacto que define ese CLAUDE.md. OJO: el nombre del archivo es EXACTO — "{fecha}.md", sin título agregado. Vas a ver Orientaciones viejas llamadas "AAAA-MM-DD - Título.md": NO copies esa convención, el nombre canónico es solo la fecha.

ADN DE RAVN — referencias capturadas esta semana por el bot (vienen de la base, NO del vault):
{refs}

{bloque_patrones}

ESTADO REAL DEL PIPELINE — App RAVN / Supabase (ESTO ES FUENTE DE VERDAD, le gana al texto del vault):
{pipeline}

REGLA DE PRECEDENCIA (CRÍTICA, leela dos veces): el bloque de arriba es el estado real de las obras según el sistema de gestión. El vault es texto que puede quedar viejo y retroalimentarse a sí mismo de una Orientación a la siguiente. Si el vault, una Orientación anterior o tu intuición dicen algo que contradice el ESTADO REAL DEL PIPELINE, GANA App RAVN, siempre. En particular: NUNCA recomiendes "pedir/esperar la señal", "perseguir el anticipo", "romper el silencio" ni "hacer follow-up de cierre" de una obra que acá figura con presupuesto Aprobado o con obra ya creada — esa obra YA ESTÁ CERRADA. Para una obra cerrada el único seguimiento válido es de EJECUCIÓN o de COBRANZA del saldo, jamás de venta. Antes de escribir el "Siguiente paso recomendado", chequealo contra este bloque: si menciona una obra, su estado tiene que coincidir con lo que dice App RAVN.

REGLAS:
- Si el Inbox no tiene entradas nuevas, igual generá la Orientación del día anotando "0 entradas procesadas" (las secciones de patrones y siguiente paso siguen valiendo).
- NO hagas git (ni add ni commit ni push): el commit del vault lo hace el job después de tu corrida.
- No toques nada fuera del vault.
- Tu última línea de respuesta: un resumen de UNA línea (entradas procesadas, cambios FODA, si hubo observación ADN)."""


def referencias_semana(cfg, token):
    corte = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00")
    try:
        filas = rest(cfg, token, f"referencias?select=tipo,etiquetas,texto,creado_at&creado_at=gte.{corte}&order=creado_at.desc")
        return filas or []
    except Exception as e:  # tabla aún no creada (Frente A sin correr) → degradar
        log(f"referencias no disponibles, sigo sin ADN: {e}")
        return []


def estado_pipeline(cfg, token):
    """Estado REAL de las obras/presupuestos recientes desde App RAVN.

    Es la fuente de verdad sobre el pipeline: el vault es texto y puede quedar
    congelado en un ciclo viejo (caso Pueyrredón, 6 Orientaciones recomendando
    'pedí la señal' de una obra que ya estaba aprobada y abierta). Cruzar el
    estado real evita que el cerebro persiga señales de obras ya cerradas.
    """
    corte = (date.today() - timedelta(days=90)).isoformat()
    try:
        presus = rest(cfg, token,
            "presupuestos?select=id,nombre_obra,nombre_cliente,estado,presupuesto_aprobado,fecha,moneda"
            f"&fecha=gte.{corte}&order=fecha.desc") or []
        obras = rest(cfg, token,
            "obras?select=presupuesto_id,created_at,finalizada_at,cobranza_cerrada_at") or []
    except Exception as e:
        log(f"pipeline no disponible, sigo sin estado real de obras: {e}")
        return "(estado real de obras NO disponible esta corrida — NO afirmes nada sobre el pipeline; orientá con cautela)"

    obra_por_presu = {o.get("presupuesto_id"): o for o in obras if o.get("presupuesto_id")}
    if not presus:
        return "(sin presupuestos en los últimos 90 días)"

    lineas = []
    for p in presus:
        nombre = p.get("nombre_obra") or p.get("nombre_cliente") or "(sin nombre)"
        estado = p.get("estado") or "?"
        moneda = p.get("moneda") or "ARS"
        o = obra_por_presu.get(p.get("id"))
        cerrada = bool(p.get("presupuesto_aprobado")) or o is not None
        if cerrada:
            partes = [f"presupuesto {estado}"]
            if o:
                desde = (o.get("created_at") or "")[:10]
                partes.append(f"OBRA ABIERTA{(' desde ' + desde) if desde else ''}")
                partes.append("FINALIZADA" if o.get("finalizada_at") else "en ejecución")
                partes.append("cobranza CERRADA" if o.get("cobranza_cerrada_at") else "cobranza abierta (saldo pendiente)")
            else:
                partes.append("sin obra creada todavía")
            lineas.append(f"- {nombre} [{moneda}]: " + ", ".join(partes)
                          + " → YA CERRADA: solo seguimiento de obra/cobranza, NUNCA de venta/señal.")
        else:
            lineas.append(f"- {nombre} [{moneda}]: presupuesto '{estado}', sin obra creada"
                          " → EN PIPELINE DE VENTA: acá sí vale follow-up comercial.")
    return "\n".join(lineas)


def correr(cfg, token):
    fecha = date.today().isoformat()
    filas = referencias_semana(cfg, token)
    patrones = detectar_patrones(filas)
    pipeline = estado_pipeline(cfg, token)
    resumen = correr_claude(armar_prompt(fecha, resumen_referencias(filas), patrones, pipeline), timeout=TIMEOUT)
    # Gate tolerante: el nombre canónico es {fecha}.md (el prompt lo exige EXACTO),
    # pero las Orientaciones históricas se llaman "AAAA-MM-DD - Título.md" y un
    # Claude que copie esa convención NO debe quemar los 3 reintentos del día.
    dir_orientacion = Path(VAULT) / "Orientación"
    candidatas = sorted(dir_orientacion.glob(f"{fecha}*.md"))
    if not candidatas:
        raise RuntimeError(f"no se generó la Orientación de {fecha} en {dir_orientacion} — resumen de claude: {resumen[:300]}")
    push_vault(f"daemon: inbox nocturno {fecha}")
    registrar_evento(
        cfg, token, "job_inbox",
        f"Inbox procesado — {resumen.strip().splitlines()[-1][:150] if resumen.strip() else fecha}",
        {"fecha": fecha, "orientacion": candidatas[0].name, "referencias_semana": len(filas),
         "patrones_adn": patrones, "resumen": resumen[:1000]},
    )
