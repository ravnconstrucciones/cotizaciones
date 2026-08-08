from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
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
import jobslib


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
                side_effect=self._registrar_evento,
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

    def test_segunda_corrida_con_529_firmas_no_relee_jsonl(self):
        fuentes = []
        sesiones = {}
        ahora_ns = 1_700_000_000_000_000_000
        for indice in range(529):
            fuente = self.sesiones / f"sesion-{indice}.jsonl"
            fuente.write_text("{}\n", encoding="utf-8")
            os.utime(fuente, ns=(ahora_ns, ahora_ns))
            firma = {
                "mtime_ns": fuente.stat().st_mtime_ns,
                "size": fuente.stat().st_size,
            }
            sesiones[str(fuente.resolve())] = {
                "firma": firma,
                "host": "codex",
                "thread_id": f"thread-{indice}",
                "estado": "archivada",
                "error": None,
            }
            fuentes.append(fuente)
        self.cursor.parent.mkdir(parents=True)
        self.cursor.write_text(
            json.dumps({"version": 2, "sesiones": sesiones}), encoding="utf-8"
        )

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=fuentes),
            patch.object(
                job_memoria, "leer_sesion", side_effect=AssertionError("relectura")
            ),
            patch.object(job_memoria.time, "time_ns", return_value=ahora_ns),
        ):
            resultado = job_memoria.correr({}, "token")

        self.assertEqual(resultado["procesadas"], 0)
        self.assertEqual(self.eventos, [])

    def test_fuente_desconocida_no_aborta_fuente_sana_y_no_repite_error(self):
        sana = self._copiar_fixture("codex-session.jsonl")
        invalida = self.sesiones / "desconocida.jsonl"
        shutil.copy2(FIXTURES / "workflow-journal.jsonl", invalida)

        with patch.object(
            job_memoria, "descubrir_sesiones", return_value=[invalida, sana]
        ):
            primera = job_memoria.correr({}, "token")
            segunda = job_memoria.correr({}, "token")

        crudos = list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))
        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        entrada_invalida = cursor["sesiones"][str(invalida.resolve())]
        self.assertEqual(primera["archivadas"], 1)
        self.assertEqual(primera["errores"], 1)
        self.assertEqual(primera["omitidas"], 1)
        self.assertEqual(segunda["procesadas"], 0)
        self.assertEqual(len(crudos), 1)
        self.assertEqual(len(self.eventos), 1)
        self.assertEqual(cursor["version"], 2)
        self.assertEqual(entrada_invalida["estado"], "omitida")
        self.assertIn("detectar", entrada_invalida["error"].lower())

    def test_error_de_lectura_no_impide_archivar_otra_fuente(self):
        sana = self._copiar_fixture("codex-session.jsonl")
        ilegible = self.sesiones / "ilegible.jsonl"
        ilegible.write_text("{}\n", encoding="utf-8")
        leer_real = job_memoria.leer_sesion

        def leer(path):
            if path == ilegible:
                raise OSError("sin acceso")
            return leer_real(path)

        with (
            patch.object(
                job_memoria, "descubrir_sesiones", return_value=[ilegible, sana]
            ),
            patch.object(job_memoria, "leer_sesion", side_effect=leer),
        ):
            resultado = job_memoria.correr({}, "token")

        self.assertEqual(resultado["archivadas"], 1)
        self.assertEqual(resultado["errores"], 1)
        self.assertEqual(
            len(list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))), 1
        )

    def test_error_transitorio_se_reintenta_sin_repetir_evento(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        leer_real = job_memoria.leer_sesion
        intentos = 0

        def leer(path):
            nonlocal intentos
            intentos += 1
            if intentos <= 2:
                raise OSError("bloqueo transitorio")
            return leer_real(path)

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "leer_sesion", side_effect=leer),
        ):
            primera = job_memoria.correr({}, "token")
            segunda = job_memoria.correr({}, "token")
            tercera = job_memoria.correr({}, "token")

        self.assertEqual(intentos, 3)
        self.assertEqual(primera["errores"], 1)
        self.assertEqual(segunda["errores"], 0)
        self.assertEqual(segunda["procesadas"], 0)
        self.assertEqual(tercera["archivadas"], 1)
        self.assertEqual(len(self.eventos), 2)

    def test_cursor_v1_migra_a_v2_con_metadata_de_sesion(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        stat = codex.stat()
        self.cursor.parent.mkdir(parents=True)
        self.cursor.write_text(
            json.dumps(
                {
                    "version": 1,
                    "sesiones": {
                        str(codex.resolve()): {
                            "mtime_ns": stat.st_mtime_ns,
                            "size": stat.st_size,
                        },
                        str((self.sesiones / "ausente.jsonl").resolve()): {
                            "mtime_ns": 1,
                            "size": 2,
                        },
                    },
                }
            ),
            encoding="utf-8",
        )

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            resultado = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        entrada = cursor["sesiones"][str(codex.resolve())]
        self.assertEqual(cursor["version"], 2)
        self.assertEqual(entrada["firma"]["mtime_ns"], stat.st_mtime_ns)
        self.assertEqual(entrada["host"], "codex")
        self.assertEqual(
            entrada["thread_id"], "11111111-1111-1111-1111-111111111111"
        )
        self.assertEqual(entrada["estado"], "archivada")
        self.assertTrue(
            all("firma" in entrada_v2 for entrada_v2 in cursor["sesiones"].values())
        )
        self.assertEqual(resultado["archivadas"], 1)

    def test_cursor_corrupto_se_preserva_y_reconstruye_conservadoramente(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        self.cursor.parent.mkdir(parents=True)
        self.cursor.write_text("{cursor roto", encoding="utf-8")

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            resultado = job_memoria.correr({}, "token")

        backups = list(self.cursor.parent.glob("memoria-cursor.json.corrupt-*"))
        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(resultado["archivadas"], 1)
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "{cursor roto")
        self.assertEqual(cursor["version"], 2)
        self.assertEqual(
            cursor["sesiones"][str(codex.resolve())]["estado"], "archivada"
        )

    def test_cursor_corrupto_sin_fuentes_se_recrea_vacio(self):
        self.cursor.parent.mkdir(parents=True)
        self.cursor.write_text("[]", encoding="utf-8")

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[]):
            resultado = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        backups = list(self.cursor.parent.glob("memoria-cursor.json.corrupt-*"))
        self.assertEqual(resultado["procesadas"], 0)
        self.assertEqual(cursor, {"version": 2, "sesiones": {}})
        self.assertEqual(len(backups), 1)

    def test_cierre_tardio_resuelve_solo_su_pendiente(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            job_memoria.correr({}, "token")
            pendientes_dir = (
                self.vault / "Sistema" / "Memoria" / "pendientes-escritura"
            )
            otro = pendientes_dir / "otro.json"
            otro.write_text(
                json.dumps({"operacion": "guardar_crudo", "detalle": {"x": 1}}),
                encoding="utf-8",
            )
            cierre = (
                self.vault
                / "Conversaciones"
                / "cierres"
                / "2026"
                / "08"
                / "cierre.md"
            )
            cierre.parent.mkdir(parents=True)
            cierre.write_text(
                "---\nhost: codex\n"
                "thread_id: 11111111-1111-1111-1111-111111111111\n---\n",
                encoding="utf-8",
            )
            resultado = job_memoria.correr({}, "token")

        restantes = list(pendientes_dir.glob("*.json"))
        resueltos = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-resueltos").glob("*.json")
        )
        contenido_resuelto = json.loads(resueltos[0].read_text(encoding="utf-8"))
        self.assertEqual(restantes, [otro])
        self.assertEqual(len(resueltos), 1)
        self.assertEqual(resultado["resueltas"], 1)
        self.assertIn("resuelto_at", contenido_resuelto)
        self.assertEqual(
            contenido_resuelto["detalle"]["thread_id"],
            "11111111-1111-1111-1111-111111111111",
        )

    def test_evento_de_pendiente_resuelto_sobrevive_falla_de_red(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            job_memoria.correr({}, "token")
            cierre = (
                self.vault
                / "Conversaciones"
                / "cierres"
                / "2026"
                / "08"
                / "cierre.md"
            )
            cierre.parent.mkdir(parents=True)
            cierre.write_text(
                "---\nhost: codex\n"
                "thread_id: 11111111-1111-1111-1111-111111111111\n---\n",
                encoding="utf-8",
            )
            with patch.object(
                job_memoria, "registrar_evento", side_effect=OSError("red")
            ):
                with self.assertRaises(OSError):
                    job_memoria.correr({}, "token")

            resuelto = next(
                (
                    self.vault
                    / "Sistema"
                    / "Memoria"
                    / "pendientes-resueltos"
                ).glob("*.json")
            )
            pendiente_evento = json.loads(resuelto.read_text(encoding="utf-8"))
            reintento = job_memoria.correr({}, "token")
            final = job_memoria.correr({}, "token")

        confirmado = json.loads(resuelto.read_text(encoding="utf-8"))
        self.assertFalse(pendiente_evento["evento_emitido"])
        self.assertEqual(reintento["resueltas"], 0)
        self.assertEqual(final["resueltas"], 0)
        self.assertTrue(confirmado["evento_emitido"])
        self.assertEqual(len(self.eventos), 2)

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

    def test_creacion_concurrente_de_pendiente_es_idempotente(self):
        fuente = self._copiar_fixture("codex-session.jsonl")
        almacen = job_memoria.AlmacenMemoria(self.vault)
        sesion = job_memoria.Mensaje(
            host="codex",
            thread_id="11111111-1111-1111-1111-111111111111",
            timestamp="2026-08-08T12:00:00Z",
            autor="user",
            tipo="message",
            texto="hola",
            metadata={},
        )
        firma = {"mtime_ns": fuente.stat().st_mtime_ns, "size": fuente.stat().st_size}
        buscar_real = job_memoria._buscar_pendiente

        def buscar_lento(vault, detalle):
            encontrado = buscar_real(vault, detalle)
            time.sleep(0.02)
            return encontrado

        with patch.object(
            job_memoria, "_buscar_pendiente", side_effect=buscar_lento
        ):
            with ThreadPoolExecutor(max_workers=8) as ejecutor:
                resultados = list(
                    ejecutor.map(
                        lambda _: job_memoria._marcar_cierre_faltante(
                            almacen, fuente, firma, sesion
                        ),
                        range(8),
                    )
                )

        pendientes = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob(
                "*.json"
            )
        )
        self.assertEqual(len({path for path, _ in resultados}), 1)
        self.assertEqual(len(pendientes), 1)

    def test_corridas_concurrentes_no_duplican_evento_ni_cursor(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        leer_real = job_memoria.leer_sesion

        def leer_lento(path):
            time.sleep(0.03)
            return leer_real(path)

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "leer_sesion", side_effect=leer_lento),
        ):
            with ThreadPoolExecutor(max_workers=2) as ejecutor:
                resultados = list(
                    ejecutor.map(lambda _: job_memoria.correr({}, "token"), range(2))
                )

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(
            sorted(resultado["archivadas"] for resultado in resultados), [0, 1]
        )
        self.assertEqual(len(self.eventos), 1)
        self.assertEqual(
            cursor["sesiones"][str(codex.resolve())]["estado"], "archivada"
        )

    def test_marca_de_advertencia_sigue_al_pendiente_si_fue_resuelto(self):
        fuente = self._copiar_fixture("codex-session.jsonl")
        almacen = job_memoria.AlmacenMemoria(self.vault)
        sesion = job_memoria.Mensaje(
            host="codex",
            thread_id="11111111-1111-1111-1111-111111111111",
            timestamp="2026-08-08T12:00:00Z",
            autor="user",
            tipo="message",
            texto="hola",
            metadata={},
        )
        firma = {"mtime_ns": fuente.stat().st_mtime_ns, "size": fuente.stat().st_size}
        pendiente, _ = job_memoria._marcar_cierre_faltante(
            almacen, fuente, firma, sesion
        )
        resueltos = job_memoria._resolver_pendientes_cerrados(
            self.vault,
            {("codex", "11111111-1111-1111-1111-111111111111")},
        )

        job_memoria._marcar_advertencias_emitidas(almacen, {pendiente})

        contenido = json.loads(next(iter(resueltos)).read_text(encoding="utf-8"))
        self.assertTrue(contenido["detalle"]["advertencia_emitida"])

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
        self.assertEqual(reintento["sin_cierre"], 0)
        self.assertEqual(final["procesadas"], 0)
        self.assertEqual(len(pendientes), 1)
        self.assertTrue(detalle["advertencia_emitida"])
        self.assertEqual(len(self.eventos), 2)
        self.assertEqual(self.eventos[-1]["contenido"]["nivel"], "warning")

    def test_red_caida_y_sesion_crecida_no_reincluye_la_accion_ya_en_outbox(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)
        tamano_inicial = codex.stat().st_size
        intentos: list[dict[str, object]] = []

        def registrar(cfg, token, tipo, titulo, contenido, evento_id=None):
            evento = {
                "tipo": tipo,
                "titulo": titulo,
                "contenido": contenido,
                "evento_id": evento_id,
            }
            intentos.append(evento)
            if len(intentos) == 1:
                raise OSError("red")
            self.eventos.append(evento)

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "registrar_evento", side_effect=registrar),
        ):
            with self.assertRaises(OSError):
                job_memoria.correr({}, "token")

            cursor_tras_fallo = json.loads(self.cursor.read_text(encoding="utf-8"))
            firma_inicial = cursor_tras_fallo["sesiones"][str(codex.resolve())]["firma"]
            with codex.open("a", encoding="utf-8") as archivo:
                archivo.write(
                    '{"type":"message","payload":{"role":"user",'
                    '"content":"Acción B","timestamp":"2026-08-08T12:00:05Z"}}\n'
                )
            pasado = time.time() - 901
            os.utime(codex, (pasado, pasado))

            reintento = job_memoria.correr({}, "token")
            final = job_memoria.correr({}, "token")

        exitosos_por_id = {evento["evento_id"]: evento for evento in self.eventos}
        evento_a_id = intentos[0]["evento_id"]
        evento_b = next(
            evento
            for evento_id, evento in exitosos_por_id.items()
            if evento_id != evento_a_id
        )
        cursor_final = json.loads(self.cursor.read_text(encoding="utf-8"))

        self.assertEqual(firma_inicial["size"], tamano_inicial)
        self.assertEqual(reintento["procesadas"], 1)
        self.assertEqual(reintento["archivadas"], 1)
        self.assertEqual(reintento["sin_cierre"], 0)
        self.assertEqual(final["procesadas"], 0)
        self.assertEqual(len(intentos), 3)
        self.assertEqual(len(exitosos_por_id), 2)
        self.assertIn(evento_a_id, exitosos_por_id)
        self.assertEqual(evento_b["contenido"]["procesadas"], 1)
        self.assertEqual(evento_b["contenido"]["archivadas"], 1)
        self.assertEqual(evento_b["contenido"]["sin_cierre"], 0)
        self.assertEqual(
            cursor_final["sesiones"][str(codex.resolve())]["firma"]["size"],
            codex.stat().st_size,
        )

    def test_cierre_ilegible_no_aborta_fuente_sana_y_se_reintenta_sin_spam(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)
        cierre = self.vault / "Conversaciones" / "cierres" / "cierre.md"
        cierre.parent.mkdir(parents=True)
        cierre.write_text(
            "---\nhost: codex\n"
            "thread_id: 11111111-1111-1111-1111-111111111111\n---\n",
            encoding="utf-8",
        )
        leer_real = job_memoria._leer_frontmatter
        intentos = 0

        def leer(path):
            nonlocal intentos
            if path == cierre:
                intentos += 1
                raise PermissionError("Operation not permitted")
            return leer_real(path)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            with patch.object(job_memoria, "_leer_frontmatter", side_effect=leer):
                primera = job_memoria.correr({}, "token")
                segunda = job_memoria.correr({}, "token")
            recuperada = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(intentos, 2)
        self.assertEqual(primera["archivadas"], 1)
        self.assertEqual(primera["errores"], 1)
        self.assertEqual(segunda["procesadas"], 0)
        self.assertEqual(segunda["errores"], 0)
        self.assertEqual(recuperada["procesadas"], 0)
        self.assertEqual(len(self.eventos), 1)
        self.assertEqual(self.eventos[0]["contenido"]["nivel"], "warning")
        self.assertEqual(cursor.get("errores_globales"), {})
        self.assertEqual(
            list(
                (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob(
                    "*.json"
                )
            ),
            [],
        )

    def test_movimiento_bloqueado_no_aborta_fuente_sana_y_se_reintenta_sin_spam(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            job_memoria.correr({}, "token")

        pendiente = next(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob(
                "*.json"
            )
        )
        cierre = self.vault / "Conversaciones" / "cierres" / "cierre.md"
        cierre.parent.mkdir(parents=True)
        cierre.write_text(
            "---\nhost: codex\n"
            "thread_id: 11111111-1111-1111-1111-111111111111\n---\n",
            encoding="utf-8",
        )
        claude = self._copiar_fixture("claude-session.jsonl")
        reemplazar_real = os.replace
        intentos_movimiento = 0

        def reemplazar(origen, destino):
            nonlocal intentos_movimiento
            if (
                Path(origen) == pendiente
                and Path(destino).parent.name == "pendientes-resueltos"
            ):
                intentos_movimiento += 1
                raise PermissionError("Operation not permitted")
            return reemplazar_real(origen, destino)

        with patch.object(
            job_memoria, "descubrir_sesiones", return_value=[codex, claude]
        ):
            with patch.object(job_memoria.os, "replace", side_effect=reemplazar):
                segunda = job_memoria.correr({}, "token")
                tercera = job_memoria.correr({}, "token")
            recuperada = job_memoria.correr({}, "token")
            final = job_memoria.correr({}, "token")

        resueltos = list(
            (self.vault / "Sistema" / "Memoria" / "pendientes-resueltos").glob(
                "*.json"
            )
        )
        self.assertEqual(intentos_movimiento, 2)
        self.assertEqual(segunda["archivadas"], 1)
        self.assertEqual(segunda["errores"], 1)
        self.assertEqual(tercera["procesadas"], 0)
        self.assertEqual(tercera["errores"], 0)
        self.assertEqual(recuperada["resueltas"], 1)
        self.assertEqual(final["resueltas"], 0)
        self.assertEqual(len(resueltos), 1)
        self.assertEqual(len(self.eventos), 3)

    def test_post_exitoso_y_marca_local_fallida_reusa_el_mismo_evento(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)
        filas: dict[str, dict[str, object]] = {}
        posts: list[str] = []

        def rest_falso(cfg, token, path, data=None, method="GET"):
            if method == "GET":
                evento_id = path.split("id=eq.", 1)[1].split("&", 1)[0]
                return [{"id": evento_id}] if evento_id in filas else []
            evento_id = data.get("id") or f"auto-{len(posts)}"
            filas[evento_id] = data
            posts.append(evento_id)
            return [data]

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "registrar_evento", jobslib.registrar_evento),
            patch.object(jobslib, "rest", side_effect=rest_falso),
        ):
            with patch.object(
                job_memoria,
                "_marcar_advertencias_emitidas",
                side_effect=OSError("falló la marca local"),
            ):
                with self.assertRaises(OSError):
                    job_memoria.correr({}, "token")
            reintento = job_memoria.correr({}, "token")
            final = job_memoria.correr({}, "token")

        pendiente = next(
            (self.vault / "Sistema" / "Memoria" / "pendientes-escritura").glob("*.json")
        )
        detalle = json.loads(pendiente.read_text(encoding="utf-8"))["detalle"]
        self.assertEqual(reintento["sin_cierre"], 0)
        self.assertEqual(final["procesadas"], 0)
        self.assertEqual(len(filas), 1)
        self.assertEqual(len(posts), 1)
        self.assertTrue(detalle["advertencia_emitida"])

    def test_post_exitoso_y_cursor_fallido_no_duplica_evento_al_reintentar(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)
        filas: dict[str, dict[str, object]] = {}
        posts: list[str] = []
        escribir_real = job_memoria._escribir_cursor
        fallo_cursor = False

        def rest_falso(cfg, token, path, data=None, method="GET"):
            if method == "GET":
                evento_id = path.split("id=eq.", 1)[1].split("&", 1)[0]
                return [{"id": evento_id}] if evento_id in filas else []
            evento_id = data.get("id") or f"auto-{len(posts)}"
            filas[evento_id] = data
            posts.append(evento_id)
            return [data]

        def escribir(path, cursor):
            nonlocal fallo_cursor
            if not fallo_cursor:
                fallo_cursor = True
                raise OSError("cursor bloqueado")
            return escribir_real(path, cursor)

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "registrar_evento", jobslib.registrar_evento),
            patch.object(jobslib, "rest", side_effect=rest_falso),
        ):
            with patch.object(job_memoria, "_escribir_cursor", side_effect=escribir):
                with self.assertRaises(OSError):
                    job_memoria.correr({}, "token")
            reintento = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        outbox = self.cursor.parent / "memoria-eventos-pendientes"
        self.assertEqual(reintento["archivadas"], 1)
        self.assertEqual(len(filas), 1)
        self.assertEqual(len(posts), 1)
        self.assertEqual(list(outbox.glob("*.json")), [])
        self.assertEqual(
            cursor["sesiones"][str(codex.resolve())]["estado"], "archivada"
        )

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

    def test_crecimiento_durante_lectura_no_publica_snapshot_inconsistente(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        leer_real = job_memoria.leer_sesion
        crecio = False

        def leer_y_crecer(path):
            nonlocal crecio
            mensajes = leer_real(path)
            if path == codex and not crecio:
                with path.open("a", encoding="utf-8") as archivo:
                    archivo.write(
                        '{"type":"message","payload":{"role":"user",'
                        '"content":"Mensaje concurrente",'
                        '"timestamp":"2026-08-08T12:00:05Z"}}\n'
                    )
                crecio = True
            return mensajes

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "leer_sesion", side_effect=leer_y_crecer),
        ):
            primera = job_memoria.correr({}, "token")

        crudos_primera = list(
            (self.vault / "Conversaciones" / "crudo").rglob("*.md")
        )
        self.assertEqual(primera["archivadas"], 0)
        self.assertEqual(primera["errores"], 1)
        self.assertEqual(crudos_primera, [])

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            segunda = job_memoria.correr({}, "token")

        crudo = next((self.vault / "Conversaciones" / "crudo").rglob("*.md"))
        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        entrada = cursor["sesiones"][str(codex.resolve())]
        self.assertEqual(segunda["archivadas"], 1)
        self.assertIn("Mensaje concurrente", crudo.read_text(encoding="utf-8"))
        self.assertEqual(entrada["firma"]["size"], codex.stat().st_size)

    def test_crecimiento_durante_persistencia_no_publica_firma_vieja(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        guardar_real = job_memoria._guardar_crudo_completo
        crecio = False

        def guardar_y_crecer(almacen, mensajes):
            nonlocal crecio
            destino = guardar_real(almacen, mensajes)
            if not crecio:
                with codex.open("a", encoding="utf-8") as archivo:
                    archivo.write(
                        '{"type":"message","payload":{"role":"user",'
                        '"content":"Creció al persistir",'
                        '"timestamp":"2026-08-08T12:00:06Z"}}\n'
                    )
                crecio = True
            return destino

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(
                job_memoria,
                "_guardar_crudo_completo",
                side_effect=guardar_y_crecer,
            ),
        ):
            primera = job_memoria.correr({}, "token")

        cursor_primero = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(primera["archivadas"], 0)
        self.assertEqual(primera["errores"], 1)
        self.assertEqual(
            cursor_primero["sesiones"][str(codex.resolve())]["estado"], "error"
        )
        self.assertEqual(self.eventos[-1]["contenido"]["archivadas"], 0)

        with patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]):
            segunda = job_memoria.correr({}, "token")

        crudo = next((self.vault / "Conversaciones" / "crudo").rglob("*.md"))
        self.assertEqual(segunda["archivadas"], 1)
        self.assertIn("Creció al persistir", crudo.read_text(encoding="utf-8"))

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

    def test_fallo_de_crudo_no_bloquea_otra_fuente_y_se_reintenta(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        claude = self._copiar_fixture("claude-session.jsonl")
        guardar_real = job_memoria.AlmacenMemoria.guardar_crudo

        def guardar(almacen, mensajes):
            if mensajes[0].host == "codex":
                raise OSError("disk")
            return guardar_real(almacen, mensajes)

        with (
            patch.object(
                job_memoria, "descubrir_sesiones", return_value=[codex, claude]
            ),
            patch.object(job_memoria.AlmacenMemoria, "guardar_crudo", new=guardar),
        ):
            primera = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(primera["archivadas"], 1)
        self.assertEqual(primera["errores"], 1)
        self.assertEqual(cursor["sesiones"][str(codex.resolve())]["estado"], "error")
        self.assertEqual(
            cursor["sesiones"][str(claude.resolve())]["estado"], "archivada"
        )

        with patch.object(
            job_memoria, "descubrir_sesiones", return_value=[codex, claude]
        ):
            reintento = job_memoria.correr({}, "token")

        self.assertEqual(reintento["archivadas"], 1)
        self.assertEqual(
            len(list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))), 2
        )

    def test_error_de_validacion_de_crudo_no_bloquea_otra_fuente(self):
        codex = self._copiar_fixture("codex-session.jsonl")
        claude = self._copiar_fixture("claude-session.jsonl")
        guardar_real = job_memoria._guardar_crudo_completo

        def guardar(almacen, mensajes):
            if mensajes[0].host == "codex":
                raise ValueError("timestamp inválido")
            return guardar_real(almacen, mensajes)

        with (
            patch.object(
                job_memoria, "descubrir_sesiones", return_value=[codex, claude]
            ),
            patch.object(job_memoria, "_guardar_crudo_completo", side_effect=guardar),
        ):
            resultado = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(resultado["archivadas"], 1)
        self.assertEqual(resultado["errores"], 1)
        self.assertEqual(cursor["sesiones"][str(codex.resolve())]["estado"], "error")
        self.assertEqual(
            cursor["sesiones"][str(claude.resolve())]["estado"], "archivada"
        )

    def test_fallo_de_stat_no_bloquea_otra_fuente(self):
        desaparecida = self.sesiones / "desaparecida.jsonl"
        sana = self._copiar_fixture("codex-session.jsonl")

        with patch.object(
            job_memoria, "_descubrir_todas", return_value=[desaparecida, sana]
        ):
            resultado = job_memoria.correr({}, "token")

        self.assertEqual(resultado["archivadas"], 1)
        self.assertEqual(resultado["errores"], 1)
        self.assertEqual(
            len(list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))), 1
        )

    def test_fallo_de_pendiente_no_bloquea_otra_fuente(self):
        codex = self._copiar_fixture("codex-session.jsonl", antiguedad_segundos=901)
        claude = self._copiar_fixture("claude-session.jsonl", antiguedad_segundos=901)
        marcar_real = job_memoria._marcar_cierre_faltante

        def marcar(almacen, fuente, firma, sesion):
            if sesion.host == "codex":
                raise OSError("pendiente bloqueado")
            return marcar_real(almacen, fuente, firma, sesion)

        with (
            patch.object(
                job_memoria, "descubrir_sesiones", return_value=[codex, claude]
            ),
            patch.object(job_memoria, "_marcar_cierre_faltante", side_effect=marcar),
        ):
            resultado = job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        self.assertEqual(resultado["archivadas"], 1)
        self.assertEqual(resultado["errores"], 1)
        self.assertEqual(resultado["sin_cierre"], 1)
        self.assertEqual(cursor["sesiones"][str(codex.resolve())]["estado"], "error")
        self.assertEqual(
            cursor["sesiones"][str(claude.resolve())]["estado"], "archivada"
        )

    def test_fallo_del_evento_avanza_cursor_y_reintenta_desde_outbox(self):
        codex = self._copiar_fixture("codex-session.jsonl")

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(job_memoria, "registrar_evento", side_effect=OSError("red")),
        ):
            with self.assertRaises(OSError):
                job_memoria.correr({}, "token")

        cursor = json.loads(self.cursor.read_text(encoding="utf-8"))
        outbox = self.cursor.parent / "memoria-eventos-pendientes"
        self.assertEqual(
            cursor["sesiones"][str(codex.resolve())]["estado"], "archivada"
        )
        self.assertEqual(len(list(outbox.glob("*.json"))), 1)
        self.assertEqual(
            len(list((self.vault / "Conversaciones" / "crudo").rglob("*.md"))),
            1,
        )

        with (
            patch.object(job_memoria, "descubrir_sesiones", return_value=[codex]),
            patch.object(
                job_memoria, "leer_sesion", side_effect=AssertionError("relectura")
            ),
        ):
            reintento = job_memoria.correr({}, "token")

        self.assertEqual(reintento["archivadas"], 0)
        self.assertEqual(list(outbox.glob("*.json")), [])
        self.assertEqual(len(self.eventos), 1)

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

    def _registrar_evento(
        self, cfg, token, tipo, titulo, contenido, evento_id=None
    ) -> None:
        self.eventos.append(
            {
                "tipo": tipo,
                "titulo": titulo,
                "contenido": contenido,
                "evento_id": evento_id,
            }
        )


if __name__ == "__main__":
    unittest.main()
