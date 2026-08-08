"""Lectura operativa mínima de App RAVN para la recuperación de memoria."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Callable, Protocol
from urllib.parse import urlencode
from uuid import UUID

from .modelo import TIPOS_ENTIDAD, redactar_secretos


ESTADOS_RESOLUCION = {"ok", "sin_coincidencia", "ambigua", "no_disponible"}

_CAMPOS: dict[str, tuple[str, ...]] = {
    "presupuestos": (
        "id",
        "nombre_obra",
        "nombre_cliente",
        "estado",
        "presupuesto_aprobado",
        "fecha",
        "created_at",
    ),
    "obras": (
        "id",
        "presupuesto_id",
        "created_at",
        "updated_at",
        "finalizada_at",
        "cobranza_cerrada_at",
    ),
    "cotizaciones": (
        "id",
        "creado_at",
        "titulo",
        "zona",
        "estado",
        "presupuesto_id",
        "trabajo_id",
        "receta_id",
    ),
    "diagnosticos": (
        "id",
        "creado_at",
        "actualizado_at",
        "titulo",
        "direccion",
        "cliente",
        "estado",
        "presupuesto_id",
        "cotizacion_id",
    ),
    "obra_archivos": (
        "id",
        "presupuesto_id",
        "tipo",
        "titulo",
        "creado_at",
    ),
    "cotizacion_archivos": (
        "id",
        "cotizacion_id",
        "tipo",
        "titulo",
        "creado_at",
    ),
}


class BackendLecturaApp(Protocol):
    def seleccionar(self, tabla: str, campos: tuple[str, ...]) -> list[dict[str, object]]:
        """Ejecuta un SELECT read-only sobre tabla y campos allowlisted."""


@dataclass(frozen=True)
class ReferenciaApp:
    tipo: str
    id: str
    tabla: str
    nombre: str
    estado: str
    fecha: str
    presupuesto_id: str
    coincidencia: str
    autoridad: str = "operativa"
    razones: list[str] = field(default_factory=list)
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ResultadoApp:
    estado: str
    referencias: list[ReferenciaApp]
    ambiguas: list[dict[str, object]] = field(default_factory=list)
    fuente: str = "app_ravn"
    autoridad: str = "operativa"

    def a_dict(self) -> dict[str, object]:
        return asdict(self)


class BackendSupabaseJobs:
    """Adaptador perezoso sobre la sesión authenticated de jobs."""

    def __init__(
        self,
        *,
        cargar_cfg: Callable[[], dict[str, str]],
        autenticar: Callable[[dict[str, str]], str],
        rest: Callable[..., object],
        page_size: int = 200,
        max_rows: int = 5_000,
    ) -> None:
        if page_size <= 0 or max_rows <= 0:
            raise ValueError("Los límites de lectura de App RAVN deben ser positivos.")
        self._cargar_cfg = cargar_cfg
        self._autenticar = autenticar
        self._rest = rest
        self._page_size = page_size
        self._max_rows = max_rows
        self._cfg: dict[str, str] | None = None
        self._token: str | None = None

    @classmethod
    def desde_jobslib(cls) -> "BackendSupabaseJobs":
        from daemon.jobs import jobslib

        return cls(
            cargar_cfg=jobslib.cargar_cfg,
            autenticar=jobslib.supabase_auth,
            rest=jobslib.rest,
        )

    def seleccionar(self, tabla: str, campos: tuple[str, ...]) -> list[dict[str, object]]:
        permitidos = _CAMPOS.get(tabla)
        if permitidos is None or not campos or any(campo not in permitidos for campo in campos):
            raise ValueError("Tabla o campos fuera del contrato read-only de memoria.")
        if self._cfg is None:
            self._cfg = self._cargar_cfg()
            self._token = self._autenticar(self._cfg)
        acumuladas: list[dict[str, object]] = []
        offset = 0
        while True:
            # Se pide una fila testigo por encima del tope. Así un conjunto de
            # exactamente max_rows se distingue de una respuesta truncada.
            limite = min(self._page_size, self._max_rows - len(acumuladas) + 1)
            consulta = urlencode(
                {
                    "select": ",".join(campos),
                    "order": "id.asc",
                    "limit": str(limite),
                    "offset": str(offset),
                }
            )
            filas = self._rest(
                self._cfg,
                self._token,
                f"{tabla}?{consulta}",
                method="GET",
            )
            if filas is None:
                filas = []
            if not isinstance(filas, list) or not all(
                isinstance(fila, dict) for fila in filas
            ):
                raise ValueError("App RAVN devolvió una respuesta inesperada.")
            acumuladas.extend(filas)
            if len(acumuladas) > self._max_rows:
                raise RuntimeError(
                    "Lectura de App RAVN incompleta: excedió el límite seguro."
                )
            if len(filas) < limite:
                return acumuladas
            offset += len(filas)


class ResolverAppRavn:
    def __init__(self, backend: BackendLecturaApp) -> None:
        self.backend = backend
        self._cache: dict[str, list[dict[str, object]]] = {}

    def resolver(self, entidades: dict[str, list[str]]) -> ResultadoApp:
        try:
            consultas = _validar_entidades(entidades)
            referencias: list[ReferenciaApp] = []
            ambiguas: list[dict[str, object]] = []
            for tipo in TIPOS_ENTIDAD:
                for consulta in consultas[tipo]:
                    coincidencias = self._resolver_una(tipo, consulta)
                    if len(coincidencias) > 1 and tipo != "clientes":
                        ambiguas.append(
                            {
                                "tipo": tipo,
                                "consulta": redactar_secretos(consulta),
                                "cantidad": len(coincidencias),
                            }
                        )
                        continue
                    referencias.extend(coincidencias)
        except (KeyError, OSError, RuntimeError, ValueError):
            return ResultadoApp("no_disponible", [])

        referencias = _deduplicar_referencias(referencias)
        if ambiguas:
            return ResultadoApp("ambigua", referencias, ambiguas)
        if referencias:
            return ResultadoApp("ok", referencias)
        return ResultadoApp("sin_coincidencia", [])

    def _resolver_una(self, tipo: str, consulta: str) -> list[ReferenciaApp]:
        if tipo == "obras":
            return self._obras(consulta)
        if tipo == "clientes":
            return self._clientes(consulta)
        if tipo == "cotizaciones":
            return self._cotizaciones(consulta)
        return self._documentos(consulta)

    def _obras(self, consulta: str) -> list[ReferenciaApp]:
        presupuestos = self._filas("presupuestos")
        obras = self._filas("obras")
        uuid = _uuid(consulta)
        por_id = {_texto(fila.get("id")): fila for fila in presupuestos}
        obra_por_id = {_texto(fila.get("id")): fila for fila in obras}
        candidatas: list[tuple[dict[str, object], dict[str, object] | None, str]] = []

        if uuid and uuid in por_id:
            presupuesto = por_id[uuid]
            obra = next(
                (fila for fila in obras if _texto(fila.get("presupuesto_id")) == uuid), None
            )
            candidatas.append((presupuesto, obra, "uuid"))
        if uuid and uuid in obra_por_id:
            obra = obra_por_id[uuid]
            presupuesto = por_id.get(_texto(obra.get("presupuesto_id")))
            if presupuesto is not None:
                candidatas.append((presupuesto, obra, "uuid"))
        if not uuid:
            normalizada = _normalizar(consulta)
            for presupuesto in presupuestos:
                nombres = (
                    _texto(presupuesto.get("nombre_obra")),
                    _texto(presupuesto.get("nombre_cliente")),
                )
                if normalizada not in {_normalizar(nombre) for nombre in nombres if nombre}:
                    continue
                pid = _texto(presupuesto.get("id"))
                obra = next(
                    (fila for fila in obras if _texto(fila.get("presupuesto_id")) == pid), None
                )
                candidatas.append((presupuesto, obra, "nombre_exacto"))

        unicas: dict[str, tuple[dict[str, object], dict[str, object] | None, str]] = {}
        for candidata in candidatas:
            unicas[_texto(candidata[0].get("id"))] = candidata
        return [self._referencia_obra(*valor, consulta) for valor in unicas.values()]

    def _referencia_obra(
        self,
        presupuesto: dict[str, object],
        obra: dict[str, object] | None,
        coincidencia: str,
        consulta: str,
    ) -> ReferenciaApp:
        pid = _texto(presupuesto.get("id"))
        nombre = _texto(presupuesto.get("nombre_obra")) or _texto(
            presupuesto.get("nombre_cliente")
        )
        metadata: dict[str, object] = {
            "presupuesto_aprobado": bool(presupuesto.get("presupuesto_aprobado")),
        }
        if obra is not None:
            metadata.update(
                {
                    "obra_id": _texto(obra.get("id")),
                    "finalizada_at": _texto(obra.get("finalizada_at")),
                    "cobranza_cerrada_at": _texto(obra.get("cobranza_cerrada_at")),
                }
            )
        return ReferenciaApp(
            tipo="obras",
            id=_texto(obra.get("id")) if obra is not None else pid,
            tabla="presupuestos",
            nombre=redactar_secretos(nombre),
            estado=redactar_secretos(_texto(presupuesto.get("estado"))),
            fecha=_fecha(presupuesto),
            presupuesto_id=pid,
            coincidencia=coincidencia,
            razones=[f"obras:{redactar_secretos(consulta)}"],
            metadata=metadata,
        )

    def _clientes(self, consulta: str) -> list[ReferenciaApp]:
        normalizada = _normalizar(consulta)
        presupuestos = [
            fila
            for fila in self._filas("presupuestos")
            if _normalizar(_texto(fila.get("nombre_cliente"))) == normalizada
        ]
        diagnosticos = [
            fila
            for fila in self._filas("diagnosticos")
            if _normalizar(_texto(fila.get("cliente"))) == normalizada
        ]
        if not presupuestos and not diagnosticos:
            return []
        pids = sorted(
            {
                _texto(fila.get("id"))
                for fila in presupuestos
                if _texto(fila.get("id"))
            }
            | {
                _texto(fila.get("presupuesto_id"))
                for fila in diagnosticos
                if _texto(fila.get("presupuesto_id"))
            }
        )
        dids = sorted(
            _texto(fila.get("id"))
            for fila in diagnosticos
            if _texto(fila.get("id"))
        )
        nombre = next(
            (
                _texto(fila.get("nombre_cliente"))
                for fila in presupuestos
                if _texto(fila.get("nombre_cliente"))
            ),
            _texto(diagnosticos[0].get("cliente")) if diagnosticos else consulta,
        )
        return [
            ReferenciaApp(
                tipo="clientes",
                id=f"cliente:{normalizada}",
                tabla="presupuestos+diagnosticos",
                nombre=redactar_secretos(nombre),
                estado="",
                fecha=max((_fecha(fila) for fila in [*presupuestos, *diagnosticos]), default=""),
                presupuesto_id=pids[0] if len(pids) == 1 else "",
                coincidencia="nombre_exacto",
                razones=[f"clientes:{redactar_secretos(consulta)}"],
                metadata={"presupuesto_ids": pids, "diagnostico_ids": dids},
            )
        ]

    def _cotizaciones(self, consulta: str) -> list[ReferenciaApp]:
        return self._referencias_tabla(
            "cotizaciones", "cotizaciones", consulta, nombre_campo="titulo"
        )

    def _documentos(self, consulta: str) -> list[ReferenciaApp]:
        referencias: list[ReferenciaApp] = []
        for tabla in ("diagnosticos", "obra_archivos", "cotizacion_archivos"):
            referencias.extend(
                self._referencias_tabla(
                    tabla, "documentos", consulta, nombre_campo="titulo"
                )
            )
        return referencias

    def _referencias_tabla(
        self, tabla: str, tipo: str, consulta: str, *, nombre_campo: str
    ) -> list[ReferenciaApp]:
        uuid = _uuid(consulta)
        normalizada = _normalizar(consulta)
        candidatas = []
        for fila in self._filas(tabla):
            if uuid and _texto(fila.get("id")) == uuid:
                candidatas.append((fila, "uuid"))
            elif not uuid and _normalizar(_texto(fila.get(nombre_campo))) == normalizada:
                candidatas.append((fila, "nombre_exacto"))
        return [
            ReferenciaApp(
                tipo=tipo,
                id=_texto(fila.get("id")),
                tabla=tabla,
                nombre=redactar_secretos(_texto(fila.get(nombre_campo))),
                estado=redactar_secretos(_texto(fila.get("estado"))),
                fecha=_fecha(fila),
                presupuesto_id=_texto(fila.get("presupuesto_id")),
                coincidencia=coincidencia,
                razones=[f"{tipo}:{redactar_secretos(consulta)}"],
                metadata=_metadata_minima(tabla, fila),
            )
            for fila, coincidencia in candidatas
        ]

    def _filas(self, tabla: str) -> list[dict[str, object]]:
        if tabla not in self._cache:
            self._cache[tabla] = self.backend.seleccionar(tabla, _CAMPOS[tabla])
        return self._cache[tabla]


def _metadata_minima(tabla: str, fila: dict[str, object]) -> dict[str, object]:
    if tabla == "diagnosticos":
        return {
            "direccion": redactar_secretos(_texto(fila.get("direccion"))),
            "cliente": redactar_secretos(_texto(fila.get("cliente"))),
            "cotizacion_id": _texto(fila.get("cotizacion_id")),
        }
    if tabla == "cotizaciones":
        return {
            "zona": redactar_secretos(_texto(fila.get("zona"))),
            "trabajo_id": _texto(fila.get("trabajo_id")),
            "receta_id": _texto(fila.get("receta_id")),
        }
    if tabla == "cotizacion_archivos":
        return {
            "tipo": redactar_secretos(_texto(fila.get("tipo"))),
            "cotizacion_id": _texto(fila.get("cotizacion_id")),
        }
    return {"tipo": redactar_secretos(_texto(fila.get("tipo")))}


def _validar_entidades(entidades: dict[str, list[str]]) -> dict[str, list[str]]:
    if not isinstance(entidades, dict) or any(tipo not in TIPOS_ENTIDAD for tipo in entidades):
        raise ValueError("Tipos de entidad App inválidos.")
    resultado = {tipo: [] for tipo in TIPOS_ENTIDAD}
    for tipo, valores in entidades.items():
        if not isinstance(valores, list) or not all(
            isinstance(valor, str) and valor.strip() for valor in valores
        ):
            raise ValueError("Entidades App inválidas.")
        resultado[tipo] = list(valores)
    return resultado


def _deduplicar_referencias(referencias: list[ReferenciaApp]) -> list[ReferenciaApp]:
    unicas: dict[tuple[str, str], ReferenciaApp] = {}
    for referencia in referencias:
        unicas[(referencia.tipo, referencia.id)] = referencia
    return list(unicas.values())


def _uuid(valor: str) -> str:
    try:
        return str(UUID(valor.strip()))
    except (ValueError, AttributeError):
        return ""


def _texto(valor: object) -> str:
    return valor.strip() if isinstance(valor, str) else ""


def _fecha(fila: dict[str, object]) -> str:
    for campo in ("actualizado_at", "updated_at", "creado_at", "created_at", "fecha"):
        valor = _texto(fila.get(campo))
        if valor:
            return valor
    return ""


def _normalizar(texto: str) -> str:
    import unicodedata

    return " ".join(
        "".join(
            caracter
            for caracter in unicodedata.normalize("NFKD", texto)
            if not unicodedata.combining(caracter)
        )
        .casefold()
        .split()
    )
