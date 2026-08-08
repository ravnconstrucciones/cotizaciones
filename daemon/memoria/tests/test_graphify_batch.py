from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from daemon.memoria.cerrar import FalloPersistencia, cerrar
from daemon.memoria.graphify_batch import (
    actualizar_incremental,
    debe_actualizar,
    marcar_cierre,
)


CIERRE = {
    "id": "cierre-graphify-1",
    "host": "codex",
    "thread_id": "thread-graphify-1",
    "fecha_inicio": "2026-08-08T10:00:00-03:00",
    "fecha_cierre": "2026-08-08T11:00:00-03:00",
    "tema": "Graphify incremental",
    "estado": "completo",
    "entidades": ["Graphify"],
    "hechos": ["El cierre quedó persistido."],
    "decisiones": [],
    "metodos": ["TDD"],
    "cambios": ["Se agregó el marcador."],
    "pendientes": [],
    "separaciones": [],
    "enlaces": [],
    "fuente_cruda": "session://codex/thread-graphify-1",
    "sensibilidad": "normal",
}


class GraphifyBatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.root = Path(self.tempdir.name)
        self.vault = self.root / "vault"
        self.state = self.root / "estado" / "graphify-memoria.json"
        self.marker = self.vault / "Sistema" / "Memoria" / ".graphify-pendiente"
        self.ahora = datetime(2026, 8, 8, 12, 0, tzinfo=timezone.utc)

    def test_primer_marcador_debe_actualizar(self) -> None:
        marcar_cierre(self.vault)

        self.assertTrue(debe_actualizar(self.marker, self.state, self.ahora))

    def test_segundo_marcador_antes_de_quince_minutos_espera(self) -> None:
        marcar_cierre(self.vault)
        self._guardar_estado(self.ahora)

        self.assertFalse(
            debe_actualizar(
                self.marker,
                self.state,
                self.ahora + timedelta(minutes=14, seconds=59),
            )
        )

    def test_marcador_despues_de_quince_minutos_actualiza(self) -> None:
        marcar_cierre(self.vault)
        self._guardar_estado(self.ahora)

        self.assertTrue(
            debe_actualizar(
                self.marker,
                self.state,
                self.ahora + timedelta(minutes=15),
            )
        )

    def test_actualizacion_exitosa_corre_una_vez_y_limpia_el_marcador(self) -> None:
        graphify = self._graphify_falso(exito=True)
        marcar_cierre(self.vault)

        with patch("daemon.memoria.graphify_batch.STATE", self.state):
            self.assertTrue(actualizar_incremental(self.vault, graphify))
            self.assertFalse(actualizar_incremental(self.vault, graphify))

        self.assertEqual((self.root / "ejecuciones.txt").read_text(), "1")
        self.assertFalse(self.marker.exists())
        self.assertTrue(self.state.exists())

    def test_fallo_de_graphify_deja_el_marcador_para_reintento(self) -> None:
        graphify = self._graphify_falso(exito=False)
        marcar_cierre(self.vault)

        with patch("daemon.memoria.graphify_batch.STATE", self.state):
            with self.assertRaises(RuntimeError):
                actualizar_incremental(self.vault, graphify)

        self.assertTrue(self.marker.exists())
        self.assertFalse(self.state.exists())

    def test_json_invalido_deja_el_marcador_para_reintento(self) -> None:
        graphify = self._graphify_falso(exito=True, json_valido=False)
        marcar_cierre(self.vault)

        with patch("daemon.memoria.graphify_batch.STATE", self.state):
            with self.assertRaises(ValueError):
                actualizar_incremental(self.vault, graphify)

        self.assertTrue(self.marker.exists())
        self.assertFalse(self.state.exists())

    def test_cierre_verificado_crea_el_marcador(self) -> None:
        resultado = cerrar(self.vault, CIERRE)

        self.assertTrue(resultado["ok"])
        self.assertTrue(self.marker.is_file())

    def test_cierre_no_verificado_no_crea_el_marcador(self) -> None:
        with patch(
            "daemon.memoria.cerrar._verificar_indice",
            side_effect=ValueError("índice inválido"),
        ):
            with self.assertRaises(FalloPersistencia):
                cerrar(self.vault, CIERRE)

        self.assertFalse(self.marker.exists())

    def _guardar_estado(self, instante: datetime) -> None:
        self.state.parent.mkdir(parents=True)
        self.state.write_text(
            json.dumps({"ultima_actualizacion": instante.isoformat()}),
            encoding="utf-8",
        )

    def _graphify_falso(self, *, exito: bool, json_valido: bool = True) -> Path:
        script = self.root / ("graphify-ok" if exito else "graphify-error")
        contenido_json = "{}" if json_valido else "{invalido"
        script.write_text(
            "#!/bin/sh\n"
            "if [ \"$1\" != update ] || [ \"$3\" != --no-viz ]; then exit 9; fi\n"
            f"count=0\nif [ -f '{self.root / 'ejecuciones.txt'}' ]; then "
            f"read count < '{self.root / 'ejecuciones.txt'}'; fi\n"
            f"count=$((count + 1))\nprintf '%s' \"$count\" > "
            f"'{self.root / 'ejecuciones.txt'}'\n"
            + (
                f"mkdir -p \"$2/graphify-out\"\nprintf '%s' '{contenido_json}' "
                "> \"$2/graphify-out/graph.json\"\nexit 0\n"
                if exito
                else "exit 7\n"
            ),
            encoding="utf-8",
        )
        os.chmod(script, 0o755)
        return script


if __name__ == "__main__":
    unittest.main()
