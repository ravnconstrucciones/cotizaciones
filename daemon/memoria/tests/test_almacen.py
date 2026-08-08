"""Comportamiento persistente del almacén local de memoria."""

from __future__ import annotations

from dataclasses import replace
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
    entidades=["RAVN", "Las Glorietas"],
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
        """El tema no cambia un reintento y dos horas no comparten archivo."""
        original = self.store.guardar_cierre(CIERRE)
        reintento_con_otro_tema = self.store.guardar_cierre(
            replace(CIERRE, tema="Tema corregido")
        )
        otra_hora = self.store.guardar_cierre(
            replace(CIERRE, fecha_cierre="2026-08-08T12:00:00-03:00")
        )

        self.assertEqual(original, reintento_con_otro_tema)
        self.assertNotEqual(original, otra_hora)
        self.assertEqual(len(list((self.vault / "Conversaciones/cierres").rglob("*.md"))), 2)

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
            replace(CIERRE, id="cierre-a", thread_id="thread-a", entidades=["Entidad A"]),
            replace(CIERRE, id="cierre-b", thread_id="thread-b", entidades=["Entidad B"]),
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
            entidades=["OPENAI_API_KEY=secreto-entidad"],
        )

        self.store.guardar_cierre(cierre)

        indice = (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        self.assertNotIn("secreto-tema", indice)
        self.assertNotIn("secreto-entidad", indice)
        self.assertIn("[REDACTADO]", indice)

    def test_guardar_crudo_archiva_mensajes_en_una_ruta_por_sesion(self):
        """La transcripción normalizada conserva un respaldo fuera del índice diario."""
        mensajes = [
            Mensaje("codex", "t-1", "2026-08-08T10:00:00-03:00", "user", "message", "Hola", {}),
            Mensaje("codex", "t-1", "2026-08-08T10:01:00-03:00", "assistant", "message", "Listo", {}),
        ]

        path = self.store.guardar_crudo(mensajes)

        self.assertEqual(
            path.relative_to(self.vault),
            Path("Conversaciones/crudo/2026/08/2026-08-08-codex-t-1.md"),
        )
        self.assertIn("Hola", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
