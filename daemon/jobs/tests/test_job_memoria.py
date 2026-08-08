from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_memoria


FIXTURES = Path(__file__).resolve().parents[2] / "memoria" / "tests" / "fixtures"


class JobMemoriaTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.root = Path(self.tempdir.name)
        self.vault = self.root / "vault"
        self.cursor = self.root / "estado" / "memoria-cursor.json"
        self.sesiones = self.root / "sesiones"
        self.sesiones.mkdir()
        self.eventos: list[dict[str, object]] = []

        self.patches = (
            patch.object(job_memoria, "VAULT", self.vault),
            patch.object(job_memoria, "CURSOR", self.cursor),
            patch.object(job_memoria, "ARCHIVED_CODEX", self.root / "archived_sessions"),
            patch.object(
                job_memoria,
                "registrar_evento",
                side_effect=lambda cfg, token, tipo, titulo, contenido: self.eventos.append(
                    {"tipo": tipo, "titulo": titulo, "contenido": contenido}
                ),
            ),
        )
        for parche in self.patches:
            parche.start()
            self.addCleanup(parche.stop)

    def test_archiva_codex_y_claude_una_vez_y_segunda_corrida_no_escribe(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        claude = self._copiar_fixture("claude-session.jsonl")

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex, claude]):
            primera = job_memoria.correr({}, "token")
            cursor_inicial = self.cursor.read_bytes()
            segunda = job_memoria.correr({}, "token")

        crudos = list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))
        pendientes = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob("*.json")
        ) if (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").exists() else []

        self.assertEqual(primera["procesadas"], 2)
        self.assertEqual(primera["hosts"], {"codex": 1, "claude": 1})
        self.assertEqual(segunda["procesadas"], 0)
        self.assertEqual(len(crudos), 2)
        self.assertEqual(pendientes, [])
        self.assertEqual(self.cursor.read_bytes(), cursor_inicial)
        self.assertEqual(len(self.eventos), 1)

    def test_sesion_inactiva_sin_cierre_deja_un_pendiente_y_una_advertencia(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            resultado = job_memoria.correr({}, "token")

        pendientes = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob("*.json")
        )
        detalle = json.loads(pendientes[0].read_text(encoding="utf-8"))

        self.assertEqual(resultado["sin_cierre"], 1)
        self.assertEqual(len(pendientes), 1)
        self.assertEqual(detalle["operacion"], "cierre_estructurado_faltante")
        self.assertEqual(detalle["detalle"]["host"], "codex")
        self.assertEqual(len(self.eventos), 1)
        self.assertEqual(self.eventos[0]["tipo"], "job_memoria")
        self.assertEqual(self.eventos[0]["contenido"]["nivel"], "warning")
        self.assertEqual(self.eventos[0]["contenido"]["sin_cierre"], 1)

    def test_firma_igual_se_reevalua_al_superar_quince_minutos_una_sola_vez(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        mtime_ns = 1_700_000_000_000_000_000
        os.utime(codex, ns=(mtime_ns, mtime_ns))

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            with patch.object(
                job_memoria.time, "time_ns", return_value=mtime_ns + 300_000_000_000
            ):
                primera = job_memoria.correr({}, "token")
            cursor_inicial = self.cursor.read_bytes()
            crudo = next((self.vault / "Conversaciones" / "crudo").rglob("*.md"))
            mtime_crudo = crudo.stat().st_mtime_ns

            with patch.object(
                job_memoria.time, "time_ns", return_value=mtime_ns + 901_000_000_000
            ):
                segunda = job_memoria.correr({}, "token")
                tercera = job_memoria.correr({}, "token")

        pendientes = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob("*.json")
        )
        self.assertEqual(primera["archivadas"], 1)
        self.assertEqual(primera["sin_cierre"], 0)
        self.assertEqual(segunda["archivadas"], 0)
        self.assertEqual(segunda["sin_cierre"], 1)
        self.assertEqual(tercera["procesadas"], 0)
        self.assertEqual(len(pendientes), 1)
        self.assertEqual(len(self.eventos), 2)
        self.assertEqual(self.eventos[-1]["contenido"]["nivel"], "warning")
        self.assertEqual(self.cursor.read_bytes(), cursor_inicial)
        self.assertEqual(crudo.stat().st_mtime_ns, mtime_crudo)

    def test_advertencia_fallida_se_reintenta_sin_duplicar_el_pendiente(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        mtime_ns = 1_700_000_000_000_000_000
        os.utime(codex, ns=(mtime_ns, mtime_ns))

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            with patch.object(
                job_memoria.time, "time_ns", return_value=mtime_ns + 300_000_000_000
            ):
                job_memoria.correr({}, "token")
            with (
                patch.object(
                    job_memoria.time, "time_ns", return_value=mtime_ns + 901_000_000_000
                ),
                patch.object(job_memoria, "registrar_evento", side_effect=OSError("red")),
            ):
                with self.assertRaises(OSError):
                    job_memoria.correr({}, "token")
            with patch.object(
                job_memoria.time, "time_ns", return_value=mtime_ns + 901_000_000_000
            ):
                reintento = job_memoria.correr({}, "token")
                final = job_memoria.correr({}, "token")

        pendientes = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob("*.json")
        )
        detalle = json.loads(pendientes[0].read_text(encoding="utf-8"))["detalle"]
        self.assertEqual(reintento["sin_cierre"], 1)
        self.assertEqual(final["procesadas"], 0)
        self.assertEqual(len(pendientes), 1)
        self.assertTrue(detalle["advertencia_emitida"])
        self.assertEqual(len(self.eventos), 2)
        self.assertEqual(self.eventos[-1]["contenido"]["nivel"], "warning")

    def test_sesion_sin_cierre_modificada_no_duplica_el_pendiente(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            job_memoria.correr({}, "token")
            codex.write_text(codex.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            pasado = time.time() - 901
            os.utime(codex, (pasado, pasado))
            job_memoria.correr({}, "token")

        pendientes = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob("*.json")
        )
        self.assertEqual(len(pendientes), 1)

    def test_sesion_modificada_actualiza_el_respaldo_crudo(self):
        codex = self._copiar_fixture("codex-session.jsonl")

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            job_memoria.correr({}, "token")
            with codex.open("a", encoding="utf-8") as archivo:
                archivo.write(
                    '{"type":"message","payload":{"role":"user","content":"Segundo mensaje",'
                    '"timestamp":"2026-08-08T12:00:04Z"}}\n'
                )
            job_memoria.correr({}, "token")

        crudo = next((self.vault / "Conversaciones" / "crudo").rglob("*.md"))
        self.assertIn("Segundo mensaje", crudo.read_text(encoding="utf-8"))

    def test_sesion_inactiva_con_cierre_estructurado_no_genera_pendiente(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)
        cierre = self.vault / "Conversaciones" / "cierres" / "2026" / "08" / "cierre.md"
        cierre.parent.mkdir(parents=True)
        cierre.write_text(
            "---\nhost: codex\nthread_id: 11111111-1111-1111-1111-111111111111\n---\n",
            encoding="utf-8",
        )

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            resultado = job_memoria.correr({}, "token")

        self.assertEqual(resultado["sin_cierre"], 0)
        self.assertFalse(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").exists()
        )
        self.assertEqual(self.eventos[0]["contenido"]["nivel"], "info")

    def test_fallo_de_persistencia_no_avanza_el_cursor_y_se_puede_reintentar(self):
        codex = self._copiar_fixture("codex-session.jsonl")

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria.AlmacenMemoria, "guardar_crudo", side_effect=OSError("disk")),
        ):
            with self.assertRaises(OSError):
                job_memoria.correr({}, "token")

        self.assertFalse(self.cursor.exists())
        self.assertEqual(self.eventos, [])

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            resultado = job_memoria.correr({}, "token")

        self.assertEqual(resultado["procesadas"], 1)
        self.assertTrue(self.cursor.exists())

    def test_fallo_del_evento_resumido_tampoco_avanza_el_cursor(self):
        codex = self._copiar_fixture("codex-session.jsonl")

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "registrar_evento", side_effect=OSError("red")),
        ):
            with self.assertRaises(OSError):
                job_memoria.correr({}, "token")

        self.assertFalse(self.cursor.exists())
        self.assertEqual(
            len(list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))),
            1,
        )

    def test_descubre_tambien_sesiones_archivadas_de_codex(self):
        archivada = self.root / "archived_sessions" / "sesion.jsonl"
        archivada.parent.mkdir()
        shutil.copy2(FIXTURES / "codex-session.jsonl", archivada)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[]):
            self.assertEqual(job_memoria._descubrir_todas(), [archivada])

    def _copiar_fixture(self, nombre: str, *, antiguedad_segundos: int = 0) -> Path:
        destino = self.sesiones / nombre
        shutil.copy2(FIXTURES / nombre, destino)
        ahora = time.time()
        os.utime(destino, (ahora - antiguedad_segundos, ahora - antiguedad_segundos))
        return destino


if __name__ == "__main__":
    unittest.main()
