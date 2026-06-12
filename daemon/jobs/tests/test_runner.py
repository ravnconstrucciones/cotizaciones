import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import jobslib
import runner

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

    def test_error_marca_error_y_registra_evento_archivado(self):
        def explota(cfg, token):
            raise RuntimeError("se rompió")
        jobs = [("a", explota, SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        estado = jobslib.cargar_estado(self.state)
        self.assertIsNone(jobslib.ultima_ok(estado, "a"))
        self.assertEqual(jobslib.errores_hoy(estado, "a", datetime(2026, 6, 12, 9, 0)), 1)
        self.assertEqual(self.eventos, [("job_a", "archivado")])

    def test_un_error_no_frena_a_los_demas(self):
        corridos = []
        def explota(cfg, token):
            raise RuntimeError("x")
        jobs = [("a", explota, SIEMPRE), ("b", lambda cfg, token: corridos.append("b"), SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        self.assertEqual(corridos, ["b"])


if __name__ == "__main__":
    unittest.main()
