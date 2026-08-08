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
from daemon.memoria.sincronizacion_git import ResultadoGit


CIERRE_DICT = {
    "id": "cierre-cli-1",
    "host": "codex",
    "thread_id": "thread-cli-1",
    "fecha_inicio": "2026-08-08T10:00:00-03:00",
    "fecha_cierre": "2026-08-08T11:00:00-03:00",
    "tema": "Comando común",
    "estado": "completo",
    "entidades": {
        "obras": [],
        "clientes": ["RAVN"],
        "cotizaciones": [],
        "documentos": [],
    },
    "hechos": ["El cierre quedó persistido."],
    "decisiones": [],
    "metodos": ["TDD"],
    "cambios": ["Se agregó el comando."],
    "pendientes": [],
    "separaciones": [],
    "enlaces": [],
    "fuente_cruda": "Conversaciones/crudo/2026/08/fuente-existente.md",
    "sensibilidad": "normal",
}


class CerrarCliTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.vault = Path(self.tempdir.name) / "vault"
        fuente = self.vault / CIERRE_DICT["fuente_cruda"]
        fuente.parent.mkdir(parents=True)
        fuente.write_text("crudo ya archivado", encoding="utf-8")

    def _ejecutar(self, datos: dict, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "daemon.memoria.cli",
                "cerrar",
                "--vault",
                str(self.vault),
                "--sin-sincronizacion",
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
        self.assertTrue(evidencia["persistido_local"])
        self.assertTrue(evidencia["indexado"])
        self.assertIsNone(evidencia["sincronizado"])
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
        cierre = (self.vault / evidencia["cierre"]).read_text(encoding="utf-8")
        self.assertIn(f"fuente_cruda: {evidencia['crudo']}", cierre)

    def test_stdin_tiene_precedencia_sobre_metadata_inferida(self):
        result = self._ejecutar(CIERRE_DICT, "--host", "claude", "--thread-id", "otro-thread")

        self.assertEqual(result.returncode, 0, result.stderr)
        cierre = (self.vault / json.loads(result.stdout)["cierre"]).read_text(encoding="utf-8")
        self.assertIn("host: codex", cierre)
        self.assertIn("thread_id: thread-cli-1", cierre)

    def test_cli_indexa_cierre_general_por_tema(self):
        cierre_general = {
            **CIERRE_DICT,
            "entidades": {clave: [] for clave in CIERRE_DICT["entidades"]},
        }

        result = self._ejecutar(cierre_general)

        self.assertEqual(result.returncode, 0, result.stderr)
        evidencia = json.loads(result.stdout)
        indice = json.loads(
            (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        )
        entrada = indice["entidades"]["comando comun"][0]
        self.assertTrue(evidencia["indexado"])
        self.assertEqual(entrada["origen"], "tema")
        self.assertEqual(entrada["ruta"], evidencia["cierre"])

    def test_cli_sin_session_path_falla_y_deja_pendiente_si_fuente_no_existe(self):
        datos = {
            **CIERRE_DICT,
            "fuente_cruda": "Conversaciones/crudo/2026/08/inexistente.md",
        }

        result = self._ejecutar(datos)

        self.assertEqual(result.returncode, 3, result.stderr)
        self.assertFalse(json.loads(result.stderr)["ok"])
        pendientes = list(
            (self.vault / "Sistema/Memoria/pendientes-escritura").glob("*.json")
        )
        self.assertEqual(len(pendientes), 1)
        self.assertEqual(
            json.loads(pendientes[0].read_text(encoding="utf-8"))["operacion"],
            "fuente_cruda_inexistente",
        )

    def test_cli_rechaza_fecha_invalida_sin_publicar_cierre(self):
        result = self._ejecutar({**CIERRE_DICT, "fecha_cierre": "2026-02-30T11:00:00Z"})

        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertFalse((self.vault / "Conversaciones/cierres").exists())

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
            codigo = cli.main(
                ["cerrar", "--vault", str(self.vault), "--sin-sincronizacion"]
            )

        self.assertEqual(codigo, 3)
        self.assertEqual(json.loads(stderr.getvalue())["codigo"], 3)

    def test_cli_sale_con_codigo_cuatro_si_persiste_pero_no_sincroniza(self):
        class SyncParcial:
            def transaccion(self, persistir, **_kwargs):
                return persistir(), ResultadoGit(
                    sincronizado=False,
                    paso="push",
                    pendiente="Sistema/Memoria/pendientes-escritura/p.json",
                    detalle={"codigo": 1},
                )

        with (
            patch("daemon.memoria.cli._crear_sincronizador", return_value=SyncParcial()),
            patch("sys.stdin", io.StringIO(json.dumps(CIERRE_DICT))),
            patch("sys.stdout", new_callable=io.StringIO) as stdout,
        ):
            codigo = cli.main(["cerrar", "--vault", str(self.vault)])

        evidencia = json.loads(stdout.getvalue())
        self.assertEqual(codigo, 4)
        self.assertFalse(evidencia["ok"])
        self.assertTrue(evidencia["persistido_local"])
        self.assertTrue(evidencia["indexado"])
        self.assertFalse(evidencia["sincronizado"])
        self.assertEqual(evidencia["paso"], "push")
        self.assertNotIn("error", evidencia)


if __name__ == "__main__":
    unittest.main()
