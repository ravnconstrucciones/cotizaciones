from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
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

    def test_cierre_justo_antes_de_limpiar_no_se_pierde(self) -> None:
        graphify = self._graphify_falso(exito=True)
        snapshot = self.marker.with_name(".graphify-en-proceso")
        marcar_cierre(self.vault)
        unlink_real = Path.unlink

        def unlink_con_cierre(path: Path, *args, **kwargs):
            if path in {self.marker, snapshot}:
                marcar_cierre(self.vault)
            return unlink_real(path, *args, **kwargs)

        with (
            patch("daemon.memoria.graphify_batch.STATE", self.state),
            patch.object(Path, "unlink", autospec=True, side_effect=unlink_con_cierre),
        ):
            self.assertTrue(actualizar_incremental(self.vault, graphify))

        self.assertTrue(self.marker.exists())

    def test_dos_procesos_comparten_la_exclusion(self) -> None:
        marcar_cierre(self.vault)
        graphify = self.root / "graphify-bloqueante"
        iniciada = self.root / "graphify-iniciada"
        liberar = self.root / "liberar-graphify"
        ejecuciones = self.root / "ejecuciones-procesos.txt"
        graphify.write_text(
            "#!/bin/sh\n"
            f"printf x >> '{ejecuciones}'\n"
            f": > '{iniciada}'\n"
            f"while [ ! -f '{liberar}' ]; do sleep 0.01; done\n"
            "mkdir -p \"$2/graphify-out\"\n"
            "printf '{}' > \"$2/graphify-out/graph.json\"\n",
            encoding="utf-8",
        )
        os.chmod(graphify, 0o755)
        codigo = (
            "import sys\n"
            "from pathlib import Path\n"
            "import daemon.memoria.graphify_batch as batch\n"
            "batch.STATE = Path(sys.argv[3])\n"
            "Path(sys.argv[4]).touch()\n"
            "tomar_lock_real = batch._tomar_lock\n"
            "def tomar_lock_instrumentado(lock):\n"
            "    Path(sys.argv[5]).touch()\n"
            "    return tomar_lock_real(lock)\n"
            "batch._tomar_lock = tomar_lock_instrumentado\n"
            "print(batch.actualizar_incremental(Path(sys.argv[1]), Path(sys.argv[2])))\n"
        )
        estado = self.root / "estado-procesos.json"
        listo_1 = self.root / "consumidor-1-listo"
        listo_2 = self.root / "consumidor-2-listo"
        intento_1 = self.root / "consumidor-1-intento-lock"
        intento_2 = self.root / "consumidor-2-intento-lock"

        primero = subprocess.Popen(
            [
                sys.executable,
                "-c",
                codigo,
                str(self.vault),
                str(graphify),
                str(estado),
                str(listo_1),
                str(intento_1),
            ],
            cwd=Path(__file__).resolve().parents[3],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        segundo: subprocess.Popen[str] | None = None
        try:
            self._esperar(iniciada)
            marcar_cierre(self.vault)
            segundo = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    codigo,
                    str(self.vault),
                    str(graphify),
                    str(estado),
                    str(listo_2),
                    str(intento_2),
                ],
                cwd=Path(__file__).resolve().parents[3],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self._esperar(listo_2)
            self._esperar(intento_2)
            self.assertIsNone(segundo.poll())
            self.assertEqual(ejecuciones.read_text(encoding="utf-8"), "x")
            liberar.touch()
            salida_1, error_1 = primero.communicate(timeout=5)
            salida_2, error_2 = segundo.communicate(timeout=5)
        finally:
            liberar.touch()
            if primero.poll() is None:
                primero.kill()
                primero.wait()
            if segundo is not None and segundo.poll() is None:
                segundo.kill()
                segundo.wait()

        self.assertEqual(primero.returncode, 0, error_1)
        self.assertIsNotNone(segundo)
        self.assertEqual(segundo.returncode, 0, error_2)
        self.assertEqual(ejecuciones.read_text(encoding="utf-8"), "x")
        self.assertCountEqual([salida_1.strip(), salida_2.strip()], ["True", "False"])
        self.assertTrue(self.marker.exists())

    def test_snapshot_huerfano_se_recupera_despues_de_un_crash(self) -> None:
        snapshot = self.marker.with_name(".graphify-en-proceso")
        snapshot.parent.mkdir(parents=True)
        snapshot.touch()
        graphify = self._graphify_falso(exito=True)

        with patch("daemon.memoria.graphify_batch.STATE", self.state):
            self.assertTrue(actualizar_incremental(self.vault, graphify))

        self.assertFalse(snapshot.exists())
        self.assertFalse(self.marker.exists())
        self.assertEqual((self.root / "ejecuciones.txt").read_text(), "1")

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

    def _esperar(self, path: Path, timeout: float = 2) -> None:
        limite = time.monotonic() + timeout
        while not path.exists():
            if time.monotonic() >= limite:
                self.fail(f"No apareció {path}")
            time.sleep(0.01)

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
