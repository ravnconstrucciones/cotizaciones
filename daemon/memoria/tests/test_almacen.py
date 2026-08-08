"""Comportamiento persistente del almacén local de memoria."""

from __future__ import annotations

import json
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
