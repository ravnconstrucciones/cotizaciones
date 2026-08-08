"""Contrato del comando común de cierre de memoria."""

from __future__ import annotations

import json
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from daemon.memoria import cli
from daemon.memoria.cerrar import FalloPersistencia


CIERRE_DICT = {
    "id": "cierre-cli-1",
    "host": "codex",
    "thread_id": "thread-cli-1",
    "fecha_inicio": "2026-08-08T10:00:00-03:00",
    "fecha_cierre": "2026-08-08T11:00:00-03:00",
    "tema": "Comando común",
    "estado": "completo",
    "entidades": ["RAVN"],
    "hechos": ["El cierre quedó persistido."],
    "decisiones": [],
    "metodos": ["TDD"],
    "cambios": ["Se agregó el comando."],
    "pendientes": [],
    "separaciones": [],
    "enlaces": [],
    "fuente_cruda": "session://codex/thread-cli-1",
    "sensibilidad": "normal",
}


class CerrarCliTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.vault = Path(self.tempdir.name) / "vault"

    def _ejecutar(self, datos: dict, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "daemon.memoria.cli",
                "cerrar",
                "--vault",
                str(self.vault),
                *args,
            ],
            input=json.dumps(datos),
            text=True,
            capture_output=True,
        )

    def test_cli_escribe_cierre_y_devuelve_evidencia(self):
        result = self._ejecutar(CIERRE_DICT)

        self.assertEqual(result.returncode, 0, result.stderr)
        evidencia = json.loads(result.stdout)
        self.assertTrue(evidencia["ok"])
        self.assertTrue(evidencia["indexado"])
        self.assertTrue((self.vault / evidencia["cierre"]).is_file())
        self.assertEqual(evidencia["crudo"], "")

    def test_cli_archiva_crudo_al_recibir_session_path(self):
        sesion = self.vault.parent / "sesion.jsonl"
        sesion.write_text(
            '{"type":"session_meta","payload":{"id":"thread-cli-1"}}\n'
            '{"type":"message","payload":{"role":"user","content":"Cerrar sesión"}}\n',
            encoding="utf-8",
        )

        result = self._ejecutar(CIERRE_DICT, "--session-path", str(sesion))

        self.assertEqual(result.returncode, 0, result.stderr)
        evidencia = json.loads(result.stdout)
        self.assertTrue((self.vault / evidencia["crudo"]).is_file())

    def test_stdin_tiene_precedencia_sobre_metadata_inferida(self):
        result = self._ejecutar(CIERRE_DICT, "--host", "claude", "--thread-id", "otro-thread")

        self.assertEqual(result.returncode, 0, result.stderr)
        cierre = (self.vault / json.loads(result.stdout)["cierre"]).read_text(encoding="utf-8")
        self.assertIn("host: codex", cierre)
        self.assertIn("thread_id: thread-cli-1", cierre)

    def test_datos_invalidos_salen_con_codigo_dos(self):
        result = self._ejecutar({"host": "codex"})

        self.assertEqual(result.returncode, 2)
        self.assertFalse(json.loads(result.stderr)["ok"])

    def test_fallo_de_persistencia_sale_con_codigo_tres(self):
        with (
            patch("daemon.memoria.cli.cerrar", side_effect=FalloPersistencia("disco")),
            patch("sys.stdin", io.StringIO(json.dumps(CIERRE_DICT))),
            patch("sys.stderr", new_callable=io.StringIO) as stderr,
        ):
            codigo = cli.main(["cerrar", "--vault", str(self.vault)])

        self.assertEqual(codigo, 3)
        self.assertEqual(json.loads(stderr.getvalue())["codigo"], 3)


if __name__ == "__main__":
    unittest.main()
