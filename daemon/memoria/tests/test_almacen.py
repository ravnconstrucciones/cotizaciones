"""Comportamiento persistente del almacén local de memoria."""

from __future__ import annotations

from dataclasses import replace
import hashlib
import json
import multiprocessing
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from daemon.memoria.almacen import AlmacenMemoria
from daemon.memoria.modelo import Cierre, Mensaje


CIERRE = Cierre(
    id="cierre-1",
    host="codex",
    thread_id="t-1",
    fecha_inicio="2026-08-08T10:00:00-03:00",
    fecha_cierre="2026-08-08T11:00:00-03:00",
    tema="Memoria compartida",
    estado="completo",
    entidades={
        "obras": ["Las Glorietas"],
        "clientes": ["RAVN"],
        "cotizaciones": [],
        "documentos": [],
    },
    hechos=["El cierre se guardó."],
    decisiones=[],
    metodos=[],
    cambios=[],
    pendientes=[],
    separaciones=[],
    enlaces=[],
    fuente_cruda="Conversaciones/crudo/2026/08/2026-08-08-codex-t-1.md",
    sensibilidad="normal",
)


def _guardar_cierre_en_proceso(
    vault: str, cierre: Cierre, inicio: multiprocessing.synchronize.Event, listo: multiprocessing.queues.Queue
) -> None:
    """Sincroniza dos escritores reales para ejercer el lock entre procesos."""
    listo.put(True)
    inicio.wait(timeout=5)
    AlmacenMemoria(Path(vault)).guardar_cierre(cierre)


def _guardar_cierre_conflictivo_en_proceso(
    vault: str,
    cierre: Cierre,
    inicio: multiprocessing.synchronize.Event,
    resultados: multiprocessing.queues.Queue,
) -> None:
    inicio.wait(timeout=5)
    try:
        AlmacenMemoria(Path(vault)).guardar_cierre(cierre)
    except ValueError:
        resultados.put("conflicto")
    else:
        resultados.put("ok")


class AlmacenMemoriaTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.vault = Path(self.tempdir.name)
        self.store = AlmacenMemoria(self.vault)

    def test_guardar_cierre_es_idempotente(self):
        """Un reintento no duplica la nota estructurada del mismo cierre."""
        a = self.store.guardar_cierre(CIERRE)
        b = self.store.guardar_cierre(CIERRE)

        self.assertEqual(a, b)
        self.assertEqual(len(list((self.vault / "Conversaciones/cierres").rglob("*.md"))), 1)

    def test_clave_de_cierre_usa_host_thread_y_timestamp_completo(self):
        """Dos horas no comparten archivo y otro contenido en la misma clave es conflicto."""
        original = self.store.guardar_cierre(CIERRE)
        with self.assertRaises(ValueError):
            self.store.guardar_cierre(replace(CIERRE, tema="Tema corregido"))
        otra_hora = self.store.guardar_cierre(
            replace(CIERRE, fecha_cierre="2026-08-08T12:00:00-03:00")
        )

        self.assertNotEqual(original, otra_hora)
        self.assertEqual(len(list((self.vault / "Conversaciones/cierres").rglob("*.md"))), 2)

    def test_conflicto_preserva_original_candidato_y_no_contamina_indice(self):
        original = self.store.guardar_cierre(CIERRE)
        bytes_originales = original.read_bytes()
        conflictivo = replace(
            CIERRE,
            entidades={
                "obras": ["Otra obra"],
                "clientes": [],
                "cotizaciones": [],
                "documentos": [],
            },
        )

        with self.assertRaisesRegex(ValueError, "conflicto"):
            self.store.guardar_cierre(conflictivo)

        self.assertEqual(original.read_bytes(), bytes_originales)
        conflictos = self.vault / "Sistema/Memoria/conflictos-cierre"
        candidatos = list(conflictos.rglob("*.conflict"))
        self.assertEqual(len(candidatos), 1)
        self.assertEqual(list(conflictos.rglob("*.md")), [])
        self.assertIn("Otra obra", candidatos[0].read_text(encoding="utf-8"))
        pendientes = list((self.vault / "Sistema/Memoria/pendientes-escritura").glob("*.json"))
        detalle = json.loads(pendientes[0].read_text(encoding="utf-8"))
        self.assertEqual(detalle["operacion"], "conflicto_cierre")
        indice = json.loads(
            (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        )
        self.assertIn("las glorietas", indice["entidades"])
        self.assertNotIn("otra obra", indice["entidades"])

    def test_lock_por_ruta_serializa_dos_contenidos_para_la_misma_clave(self):
        contexto = multiprocessing.get_context("fork")
        inicio = contexto.Event()
        resultados = contexto.Queue()
        segundo = replace(CIERRE, tema="Contenido concurrente distinto")
        procesos = [
            contexto.Process(
                target=_guardar_cierre_conflictivo_en_proceso,
                args=(str(self.vault), cierre, inicio, resultados),
            )
            for cierre in (CIERRE, segundo)
        ]
        for proceso in procesos:
            proceso.start()
        inicio.set()
        for proceso in procesos:
            proceso.join(timeout=10)
            self.assertEqual(proceso.exitcode, 0)

        self.assertEqual(sorted(resultados.get(timeout=5) for _ in procesos), ["conflicto", "ok"])
        self.assertEqual(
            len(
                list(
                    (self.vault / "Sistema/Memoria/conflictos-cierre").rglob("*.conflict")
                )
            ),
            1,
        )

    def test_fallo_de_replace_conserva_pendiente(self):
        """Una falla antes de publicar deja una recuperación visible."""
        with patch("daemon.memoria.almacen.os.replace", side_effect=OSError("disk")):
            with self.assertRaises(OSError):
                self.store.guardar_cierre(CIERRE)

        pendientes = list((self.vault / "Sistema/Memoria/pendientes-escritura").iterdir())
        self.assertTrue(pendientes)
        self.assertEqual(json.loads(pendientes[0].read_text(encoding="utf-8"))["operacion"], "guardar_cierre")

    def test_guardar_cierre_actualiza_indice_por_entidad_normalizada(self):
        """Una entidad nueva queda recuperable sin esperar a Graphify."""
        cierre_path = self.store.guardar_cierre(CIERRE)

        indice_path = self.vault / "Sistema/Memoria/indices/entidades.json"
        indice = json.loads(indice_path.read_text(encoding="utf-8"))
        entrada = indice["entidades"]["las glorietas"][0]

        self.assertEqual(entrada["ruta"], str(cierre_path.relative_to(self.vault)))
        self.assertEqual(entrada["host"], "codex")
        self.assertEqual(entrada["thread_id"], "t-1")
        self.assertEqual(entrada["tema"], "Memoria compartida")
        self.assertEqual(entrada["estado"], "completo")
        self.assertEqual(entrada["updated_at"], "2026-08-08T11:00:00-03:00")

    def test_indice_concurrente_conserva_ambas_entradas(self):
        """Dos procesos que comienzan juntos no pierden entidades en el merge."""
        contexto = multiprocessing.get_context("fork")
        inicio = contexto.Event()
        listo = contexto.Queue()
        cierres = (
            replace(
                CIERRE,
                id="cierre-a",
                thread_id="thread-a",
                entidades={**CIERRE.entidades, "obras": ["Entidad A"]},
            ),
            replace(
                CIERRE,
                id="cierre-b",
                thread_id="thread-b",
                entidades={**CIERRE.entidades, "obras": ["Entidad B"]},
            ),
        )
        procesos = [
            contexto.Process(
                target=_guardar_cierre_en_proceso,
                args=(str(self.vault), cierre, inicio, listo),
            )
            for cierre in cierres
        ]
        for proceso in procesos:
            proceso.start()
        self.assertTrue(listo.get(timeout=5))
        self.assertTrue(listo.get(timeout=5))
        inicio.set()
        for proceso in procesos:
            proceso.join(timeout=10)
            self.assertEqual(proceso.exitcode, 0)

        indice = json.loads(
            (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        )
        self.assertIn("entidad a", indice["entidades"])
        self.assertIn("entidad b", indice["entidades"])

    def test_indice_redacta_strings_de_cierre_sin_validar(self):
        """El índice no filtra secretos aunque quien llama cree Cierre directo."""
        cierre = replace(
            CIERRE,
            tema="Tema OPENAI_API_KEY=secreto-tema",
            entidades={
                **CIERRE.entidades,
                "documentos": ["OPENAI_API_KEY=secreto-entidad"],
            },
        )

        self.store.guardar_cierre(cierre)

        indice = (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        self.assertNotIn("secreto-tema", indice)
        self.assertNotIn("secreto-entidad", indice)
        self.assertIn("[REDACTADO]", indice)

    def test_actualizar_indice_elimina_la_ruta_de_claves_anteriores(self):
        ruta = self.store.guardar_cierre(CIERRE)
        indice_path = self.vault / "Sistema/Memoria/indices/entidades.json"
        indice = json.loads(indice_path.read_text(encoding="utf-8"))
        indice["entidades"]["entidad obsoleta"] = [
            {"ruta": ruta.relative_to(self.vault).as_posix(), "origen": "obras"}
        ]
        indice_path.write_text(json.dumps(indice), encoding="utf-8")

        self.store.actualizar_indice(CIERRE, ruta)

        actualizado = json.loads(indice_path.read_text(encoding="utf-8"))
        self.assertNotIn("entidad obsoleta", actualizado["entidades"])
        self.assertEqual(
            actualizado["entidades"]["las glorietas"][0]["origen"], "obras"
        )

    def test_guardar_crudo_archiva_mensajes_en_una_ruta_por_sesion(self):
        """La transcripción normalizada conserva un respaldo fuera del índice diario."""
        mensajes = [
            Mensaje("codex", "t-1", "2026-08-08T10:00:00-03:00", "user", "message", "Hola", {}),
            Mensaje("codex", "t-1", "2026-08-08T10:01:00-03:00", "assistant", "message", "Listo", {}),
        ]

        path = self.store.guardar_crudo(mensajes)
        identidad = "\0".join(("codex", "t-1")).encode("utf-8")

        self.assertEqual(
            path.relative_to(self.vault),
            Path(
                "Conversaciones/crudo/2026/08/"
                f"2026-08-08-codex-{hashlib.sha256(identidad).hexdigest()}.md"
            ),
        )
        self.assertIn("Hola", path.read_text(encoding="utf-8"))

    def test_ruta_cruda_hashea_identidad_y_nunca_expone_host_o_thread_malicioso(self):
        host = "codex-OPENAI_API_KEY=secreto-host"
        thread_id = "thread-COOKIE=secreto-thread"
        mensajes = [
            Mensaje(
                host,
                thread_id,
                "2026-08-08T10:00:00Z",
                "user",
                "message",
                "Hola",
                {},
            )
        ]

        primera = self.store.guardar_crudo(mensajes)
        segunda = self.store.guardar_crudo(mensajes)
        relativa = primera.relative_to(self.vault).as_posix()

        self.assertEqual(primera, segunda)
        self.assertRegex(relativa, r"/2026-08-08-host-[0-9a-f]{64}\.md$")
        self.assertNotIn("secreto-host", relativa)
        self.assertNotIn("secreto-thread", relativa)
        self.assertNotIn("OPENAI", relativa)
        self.assertNotIn("COOKIE", relativa)

    def test_pendiente_redacta_strings_anidados_antes_de_persistir(self):
        pendiente = self.store.marcar_pendiente(
            "prueba",
            {
                "thread_id": "OPENAI_API_KEY=secreto-thread",
                "anidado": ["Cookie: secreto-cookie", {"token": "TOKEN=secreto-token"}],
            },
        )

        contenido = pendiente.read_text(encoding="utf-8")

        self.assertNotIn("secreto-thread", contenido)
        self.assertNotIn("secreto-cookie", contenido)
        self.assertNotIn("secreto-token", contenido)
        self.assertEqual(contenido.count("[REDACTADO]"), 3)

    def test_crudo_incluye_frontmatter_restringido_y_hash_integral_del_cuerpo(self):
        mensajes = [
            Mensaje(
                "codex",
                "t-1",
                "2026-08-08T10:00:00-03:00",
                "user",
                "message",
                "Hola\r\nCookie: secreto",
                {},
            )
        ]

        path = self.store.guardar_crudo(mensajes)
        contenido = path.read_text(encoding="utf-8")
        frontmatter, cuerpo = contenido.split("---\n", 2)[1:]
        campos = dict(linea.split(": ", 1) for linea in frontmatter.strip().splitlines())

        self.assertEqual(campos["sensibilidad"], "restringida")
        self.assertEqual(campos["host"], "codex")
        self.assertEqual(json.loads(campos["thread_id"]), "t-1")
        self.assertEqual(json.loads(campos["fuente"]), "session://codex/t-1")
        self.assertEqual(campos["sha256"], hashlib.sha256(cuerpo.encode("utf-8")).hexdigest())
        self.assertNotIn("\r", cuerpo)
        self.assertNotIn("secreto", cuerpo)

    def test_guardar_crudo_rechaza_timestamp_iso_invalido(self):
        mensajes = [Mensaje("codex", "t-1", "2026-02-30T10:00:00Z", "user", "message", "Hola", {})]

        with self.assertRaises(ValueError):
            self.store.guardar_crudo(mensajes)


if __name__ == "__main__":
    unittest.main()
