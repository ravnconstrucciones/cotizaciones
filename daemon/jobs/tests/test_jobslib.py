import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import jobslib


class TestParseEnv(unittest.TestCase):
    def test_parsea_claves_y_valores(self):
        texto = 'A=1\nB="dos"\n# comentario\n\nC = tres '
        cfg = jobslib.parse_env(texto)
        self.assertEqual(cfg, {"A": "1", "B": "dos", "C": "tres"})

    def test_ignora_lineas_sin_igual(self):
        self.assertEqual(jobslib.parse_env("solo texto\n"), {})


class TestVencimientos(unittest.TestCase):
    def test_diario_nunca_corrio_despues_de_hora(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        self.assertTrue(jobslib.vencio_diario(None, ahora, hora_minima=8))

    def test_diario_antes_de_hora_minima_no_vence(self):
        ahora = datetime(2026, 6, 12, 7, 59)
        self.assertFalse(jobslib.vencio_diario(None, ahora, hora_minima=8))

    def test_diario_ya_corrio_hoy_no_vence(self):
        ultima = datetime(2026, 6, 12, 2, 10)
        ahora = datetime(2026, 6, 12, 14, 0)
        self.assertFalse(jobslib.vencio_diario(ultima, ahora, hora_minima=2))

    def test_diario_corrio_ayer_vence(self):
        ultima = datetime(2026, 6, 11, 2, 10)
        ahora = datetime(2026, 6, 12, 2, 30)
        self.assertTrue(jobslib.vencio_diario(ultima, ahora, hora_minima=2))

    def test_semanal_misma_semana_iso_no_vence(self):
        # 2026-06-08 (lunes) y 2026-06-12 (viernes) son la misma semana ISO
        ultima = datetime(2026, 6, 8, 9, 0)
        ahora = datetime(2026, 6, 12, 9, 0)
        self.assertFalse(jobslib.vencio_semanal(ultima, ahora, hora_minima=8))

    def test_semanal_semana_anterior_vence(self):
        ultima = datetime(2026, 6, 5, 9, 0)   # semana ISO anterior
        ahora = datetime(2026, 6, 8, 9, 0)    # lunes siguiente
        self.assertTrue(jobslib.vencio_semanal(ultima, ahora, hora_minima=8))

    def test_semanal_cruce_de_anio_misma_semana(self):
        # 2025-12-29 (lunes) pertenece a la semana ISO 1 de 2026
        ultima = datetime(2025, 12, 29, 9, 0)
        ahora = datetime(2026, 1, 2, 9, 0)
        self.assertFalse(jobslib.vencio_semanal(ultima, ahora, hora_minima=8))

    def test_mensual_mismo_mes_no_vence(self):
        ultima = datetime(2026, 6, 2, 9, 0)
        ahora = datetime(2026, 6, 20, 9, 0)
        self.assertFalse(jobslib.vencio_mensual(ultima, ahora, dia_minimo=2, hora_minima=8))

    def test_mensual_mes_anterior_pero_dia_1_no_vence(self):
        ultima = datetime(2026, 5, 2, 9, 0)
        ahora = datetime(2026, 6, 1, 9, 0)
        self.assertFalse(jobslib.vencio_mensual(ultima, ahora, dia_minimo=2, hora_minima=8))

    def test_mensual_mes_anterior_dia_2_vence(self):
        ultima = datetime(2026, 5, 2, 9, 0)
        ahora = datetime(2026, 6, 2, 9, 0)
        self.assertTrue(jobslib.vencio_mensual(ultima, ahora, dia_minimo=2, hora_minima=8))

    def test_mensual_nunca_corrio_vence(self):
        ahora = datetime(2026, 6, 2, 9, 0)
        self.assertTrue(jobslib.vencio_mensual(None, ahora, dia_minimo=2, hora_minima=8))


class TestEstado(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "state.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_cargar_inexistente_devuelve_vacio(self):
        self.assertEqual(jobslib.cargar_estado(self.path), {})

    def test_marcar_ok_y_leer_ultima_ok(self):
        ahora = datetime(2026, 6, 12, 2, 30)
        jobslib.marcar_ok(self.path, "inbox", ahora)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.ultima_ok(estado, "inbox"), ahora)
        self.assertEqual(jobslib.errores_hoy(estado, "inbox", ahora), 0)

    def test_marcar_error_acumula_en_el_dia(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        jobslib.marcar_error(self.path, "dolar", ahora)
        jobslib.marcar_error(self.path, "dolar", ahora)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.errores_hoy(estado, "dolar", ahora), 2)

    def test_errores_de_ayer_no_cuentan_hoy(self):
        ayer = datetime(2026, 6, 11, 9, 0)
        hoy = datetime(2026, 6, 12, 9, 0)
        jobslib.marcar_error(self.path, "dolar", ayer)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.errores_hoy(estado, "dolar", hoy), 0)

    def test_marcar_ok_resetea_errores(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        jobslib.marcar_error(self.path, "dolar", ahora)
        jobslib.marcar_ok(self.path, "dolar", ahora)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.errores_hoy(estado, "dolar", ahora), 0)


class TestEventoPayload(unittest.TestCase):
    def test_forma_canonica(self):
        p = jobslib.evento_payload("job_dolar", "Dólar actualizado", {"blue": 1450})
        self.assertEqual(p["origen"], "daemon")
        self.assertEqual(p["tipo"], "job_dolar")
        self.assertEqual(p["estado"], "procesado")
        self.assertEqual(p["titulo"], "Dólar actualizado")
        self.assertEqual(p["contenido"], {"blue": 1450})

    def test_estado_archivado_y_titulo_truncado(self):
        p = jobslib.evento_payload("job_inbox", "x" * 300, {}, estado="archivado")
        self.assertEqual(p["estado"], "archivado")
        self.assertEqual(len(p["titulo"]), 200)


if __name__ == "__main__":
    unittest.main()
