import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
import plistlib
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import jobslib
import runner
from daemon.memoria.graphify_batch import marcar_cierre

SIEMPRE = lambda u, a: True
NUNCA = lambda u, a: False


class TestJobsVencidos(unittest.TestCase):
    def test_devuelve_los_vencidos_en_orden(self):
        jobs = [("a", None, SIEMPRE), ("b", None, NUNCA), ("c", None, SIEMPRE)]
        self.assertEqual(runner.jobs_vencidos({}, datetime(2026, 6, 12, 9, 0), jobs), ["a", "c"])

    def test_respeta_ultima_ok_del_estado(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        estado = {"a": {"ultima_ok": "2026-06-12T08:00:00"}}
        jobs = [("a", None, lambda u, a: u is None)]
        self.assertEqual(runner.jobs_vencidos(estado, ahora, jobs), [])

    def test_tope_de_errores_diarios_excluye(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        estado = {"a": {"fecha_error": "2026-06-12", "errores": 3}}
        jobs = [("a", None, SIEMPRE)]
        self.assertEqual(runner.jobs_vencidos(estado, ahora, jobs), [])

    def test_memoria_siempre_vence_y_corre_antes_de_cerebro(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        estado = {"memoria": {"ultima_ok": "2026-06-12T08:59:59"}}

        vencidos = runner.jobs_vencidos(estado, ahora)

        self.assertIn("memoria", vencidos)
        self.assertIn("graphify_memoria", vencidos)
        self.assertLess(vencidos.index("memoria"), vencidos.index("cerebro"))
        nombres = [nombre for nombre, _, _ in runner.JOBS]
        self.assertEqual(nombres[nombres.index("memoria") + 1], "graphify_memoria")
        self.assertEqual(nombres[nombres.index("inbox") - 1], "graphify_memoria")

    def test_graphify_incremental_sin_marcador_es_un_noop(self):
        with tempfile.TemporaryDirectory() as tempdir:
            vault = Path(tempdir) / "vault"
            with (
                patch.object(runner.job_cerebro, "VAULT", str(vault)),
                patch.object(runner.job_cerebro, "GRAPHIFY", Path(tempdir) / "graphify"),
                patch(
                    "daemon.memoria.graphify_batch.STATE",
                    Path(tempdir) / "graphify-state.json",
                ),
            ):
                resultado = runner.job_cerebro.correr_incremental({}, "token")

        self.assertFalse(resultado)

    def test_launchd_dispara_el_runner_cada_quince_minutos(self):
        plist = (
            Path(__file__).resolve().parents[2] / "launchd" / "com.ravn.jobs.plist"
        )
        with plist.open("rb") as archivo:
            configuracion = plistlib.load(archivo)

        self.assertEqual(configuracion["StartInterval"], 900)

    def test_cerebro_full_exitoso_limpia_marcador_incremental(self):
        with tempfile.TemporaryDirectory() as tempdir:
            vault = Path(tempdir) / "vault"
            marker = vault / "Sistema" / "Memoria" / ".graphify-pendiente"
            marker.parent.mkdir(parents=True)
            marker.touch()
            organismo = Path(tempdir) / "organismo"
            salidas = ["", "", '{"pregunta": null}']

            with (
                patch.object(runner.job_cerebro, "VAULT", str(vault)),
                patch.object(runner.job_cerebro, "GRAPHIFY_OUT", vault / "graphify-out"),
                patch.object(runner.job_cerebro, "ORGANISMO", organismo),
                patch.object(runner.job_cerebro.subprocess, "run"),
                patch.object(runner.job_cerebro, "_run", side_effect=salidas),
                patch.object(runner.job_cerebro.shutil, "copy2"),
                patch.object(runner.job_cerebro, "push_vault"),
                patch.object(runner.job_cerebro, "registrar_evento"),
                patch.object(runner.job_cerebro, "log"),
                patch(
                    "daemon.memoria.graphify_batch.STATE",
                    Path(tempdir) / "graphify-state.json",
                ),
            ):
                runner.job_cerebro.correr({}, "token")

            self.assertFalse(marker.exists())

    def test_cerebro_full_no_borra_cierre_creado_justo_antes_de_limpiar(self):
        with tempfile.TemporaryDirectory() as tempdir:
            vault = Path(tempdir) / "vault"
            marker = vault / "Sistema" / "Memoria" / ".graphify-pendiente"
            snapshot = marker.with_name(".graphify-en-proceso")
            marker.parent.mkdir(parents=True)
            marker.touch()
            unlink_real = Path.unlink

            def unlink_con_cierre(path: Path, *args, **kwargs):
                if path in {marker, snapshot}:
                    marcar_cierre(vault)
                return unlink_real(path, *args, **kwargs)

            with (
                patch.object(runner.job_cerebro, "VAULT", str(vault)),
                patch.object(runner.job_cerebro, "GRAPHIFY_OUT", vault / "graphify-out"),
                patch.object(runner.job_cerebro, "ORGANISMO", Path(tempdir) / "organismo"),
                patch.object(runner.job_cerebro.subprocess, "run"),
                patch.object(
                    runner.job_cerebro,
                    "_run",
                    side_effect=["", "", '{"pregunta": null}'],
                ),
                patch.object(runner.job_cerebro.shutil, "copy2"),
                patch.object(runner.job_cerebro, "push_vault"),
                patch.object(runner.job_cerebro, "registrar_evento"),
                patch.object(runner.job_cerebro, "log"),
                patch(
                    "daemon.memoria.graphify_batch.STATE",
                    Path(tempdir) / "graphify-state.json",
                ),
                patch.object(Path, "unlink", autospec=True, side_effect=unlink_con_cierre),
            ):
                runner.job_cerebro.correr({}, "token")

            self.assertTrue(marker.exists())


class TestCorrerVencidos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / "state.json"
        self.eventos = []
        runner.registrar_evento = lambda cfg, token, tipo, titulo, contenido, estado="procesado": \
            self.eventos.append((tipo, estado))

    def tearDown(self):
        self.tmp.cleanup()

    def test_corre_y_marca_ok(self):
        corridos = []
        jobs = [("a", lambda cfg, token: corridos.append("a"), SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        self.assertEqual(corridos, ["a"])
        estado = jobslib.cargar_estado(self.state)
        self.assertIsNotNone(jobslib.ultima_ok(estado, "a"))

    def test_error_marca_error_y_registra_evento_procesado(self):
        # marcar_error estampa datetime.now() real, así que errores_hoy se
        # consulta con now(); el evento va a Actividad (procesado), no a Archivados.
        def explota(cfg, token):
            raise RuntimeError("se rompió")
        jobs = [("a", explota, SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        estado = jobslib.cargar_estado(self.state)
        self.assertIsNone(jobslib.ultima_ok(estado, "a"))
        self.assertEqual(jobslib.errores_hoy(estado, "a", datetime.now()), 1)
        self.assertEqual(self.eventos, [("job_a", "procesado")])

    def test_un_error_no_frena_a_los_demas(self):
        corridos = []
        def explota(cfg, token):
            raise RuntimeError("x")
        jobs = [("a", explota, SIEMPRE), ("b", lambda cfg, token: corridos.append("b"), SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        self.assertEqual(corridos, ["b"])


if __name__ == "__main__":
    unittest.main()
