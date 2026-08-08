import json
import sys
import tempfile
import unittest
import urllib.error
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

    def test_dominical_nunca_corrio_solo_vence_en_domingo(self):
        domingo = datetime(2026, 7, 5, 8, 30)
        sabado = datetime(2026, 7, 4, 8, 30)
        self.assertTrue(jobslib.vencio_dominical(None, domingo, hora_minima=8))
        self.assertFalse(jobslib.vencio_dominical(None, sabado, hora_minima=8))

    def test_dominical_antes_de_hora_minima_no_vence(self):
        domingo = datetime(2026, 7, 5, 7, 59)
        self.assertFalse(jobslib.vencio_dominical(None, domingo, hora_minima=8))

    def test_dominical_ya_corrio_este_domingo_no_vence(self):
        ultima = datetime(2026, 7, 5, 8, 10)
        ahora = datetime(2026, 7, 5, 13, 0)
        self.assertFalse(jobslib.vencio_dominical(ultima, ahora, hora_minima=8))

    def test_dominical_domingo_siguiente_vence(self):
        ultima = datetime(2026, 7, 5, 8, 10)
        ahora = datetime(2026, 7, 12, 8, 30)
        self.assertTrue(jobslib.vencio_dominical(ultima, ahora, hora_minima=8))

    def test_dominical_entre_semana_no_vence(self):
        # corrió el domingo 05/07; el miércoles 08/07 no toca aunque cambie la semana ISO
        ultima = datetime(2026, 7, 5, 8, 10)
        ahora = datetime(2026, 7, 8, 13, 0)
        self.assertFalse(jobslib.vencio_dominical(ultima, ahora, hora_minima=8))

    def test_dominical_catchup_si_se_salteo_el_domingo(self):
        # corrió el 05/07; Mac apagada el domingo 12/07 → el lunes 13/07 recupera
        ultima = datetime(2026, 7, 5, 8, 10)
        lunes = datetime(2026, 7, 13, 8, 30)
        self.assertTrue(jobslib.vencio_dominical(ultima, lunes, hora_minima=8))

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

    def test_registrar_evento_con_identidad_no_reinserta_si_ya_existe(self):
        evento_id = "11111111-1111-5111-8111-111111111111"
        filas = {}
        llamadas = []

        def rest_falso(cfg, token, path, data=None, method="GET"):
            llamadas.append((path, method))
            if method == "GET":
                return [{"id": evento_id}] if filas else []
            filas[data["id"]] = data
            return [data]

        original = jobslib.rest
        self.addCleanup(setattr, jobslib, "rest", original)
        jobslib.rest = rest_falso

        jobslib.registrar_evento(
            {},
            "token",
            "job_memoria",
            "Advertencia",
            {"sin_cierre": 1},
            evento_id=evento_id,
        )
        jobslib.registrar_evento(
            {},
            "token",
            "job_memoria",
            "Advertencia",
            {"sin_cierre": 1},
            evento_id=evento_id,
        )

        self.assertEqual(len(filas), 1)
        self.assertEqual(
            llamadas,
            [
                (f"eventos?id=eq.{evento_id}&select=id&limit=1", "GET"),
                ("eventos", "POST"),
                (f"eventos?id=eq.{evento_id}&select=id&limit=1", "GET"),
            ],
        )

    def test_conflicto_409_del_mismo_evento_es_exito_idempotente(self):
        evento_id = "22222222-2222-5222-8222-222222222222"
        consultas = 0

        def rest_falso(cfg, token, path, data=None, method="GET"):
            nonlocal consultas
            if method == "GET":
                consultas += 1
                return [] if consultas == 1 else [{"id": evento_id}]
            raise urllib.error.HTTPError("https://x/eventos", 409, "conflict", {}, None)

        original = jobslib.rest
        self.addCleanup(setattr, jobslib, "rest", original)
        jobslib.rest = rest_falso

        resultado = jobslib.registrar_evento(
            {},
            "token",
            "job_memoria",
            "Advertencia",
            {"sin_cierre": 1},
            evento_id=evento_id,
        )

        self.assertEqual(resultado, {"id": evento_id})
        self.assertEqual(consultas, 2)

    def test_registrar_evento_idempotente_no_oculta_otro_error_http(self):
        evento_id = "33333333-3333-5333-8333-333333333333"

        def rest_falso(cfg, token, path, data=None, method="GET"):
            if method == "GET":
                return []
            raise urllib.error.HTTPError("https://x/eventos", 500, "server", {}, None)

        original = jobslib.rest
        self.addCleanup(setattr, jobslib, "rest", original)
        jobslib.rest = rest_falso

        with self.assertRaises(urllib.error.HTTPError) as error:
            jobslib.registrar_evento(
                {},
                "token",
                "job_memoria",
                "Advertencia",
                {"sin_cierre": 1},
                evento_id=evento_id,
            )

        self.assertEqual(error.exception.code, 500)


class TestRest401(unittest.TestCase):
    """El runner pasa UN token a toda la corrida; si vence a mitad de camino,
    rest() debe renovar UNA vez y que el resto de la corrida use el token vivo
    (nada de sesión nueva por cada request)."""

    CFG = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_ANON_KEY": "anon"}

    def setUp(self):
        jobslib._TOKEN_VIVO["token"] = None

    def tearDown(self):
        jobslib._TOKEN_VIVO["token"] = None

    def _http_401_luego_ok(self, respuestas):
        import urllib.error
        def fake(url, data=None, headers=None, method=None, **kw):
            auth = (headers or {}).get("Authorization", "")
            if auth == "Bearer viejo":
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, None)
            respuestas.append(auth)
            return {"ok": True}
        return fake

    def test_401_renueva_desde_cache_sin_sesion_nueva(self):
        from unittest.mock import patch
        usados = []
        with patch.object(jobslib, "http_json", self._http_401_luego_ok(usados)), \
             patch.object(jobslib, "supabase_auth", return_value="fresco") as auth, \
             patch.object(jobslib, "invalidar_cache_jobs") as inval:
            r = jobslib.rest(self.CFG, "viejo", "tabla?select=id")
        self.assertEqual(r, {"ok": True})
        self.assertEqual(usados, ["Bearer fresco"])
        auth.assert_called_once()          # una sola renovación
        inval.assert_not_called()          # el cache de disco tenía token fresco: no se toca
        self.assertEqual(jobslib._TOKEN_VIVO["token"], "fresco")

    def test_llamadas_siguientes_usan_token_vivo_sin_401(self):
        from unittest.mock import patch
        usados = []
        jobslib._TOKEN_VIVO["token"] = "fresco"
        with patch.object(jobslib, "http_json", self._http_401_luego_ok(usados)), \
             patch.object(jobslib, "supabase_auth") as auth:
            r = jobslib.rest(self.CFG, "viejo", "tabla?select=id")
        self.assertEqual(r, {"ok": True})
        self.assertEqual(usados, ["Bearer fresco"])
        auth.assert_not_called()           # ni un 401, ni renovación

    def test_401_con_cache_igual_al_rechazado_invalida_y_reloguea(self):
        from unittest.mock import patch
        usados = []
        with patch.object(jobslib, "http_json", self._http_401_luego_ok(usados)), \
             patch.object(jobslib, "supabase_auth", side_effect=["viejo", "fresco"]) as auth, \
             patch.object(jobslib, "invalidar_cache_jobs") as inval, \
             patch.object(jobslib, "cargar_cfg", return_value=self.CFG):
            r = jobslib.rest(self.CFG, "viejo", "tabla?select=id")
        self.assertEqual(r, {"ok": True})
        self.assertEqual(usados, ["Bearer fresco"])
        self.assertEqual(auth.call_count, 2)
        inval.assert_called_once()         # el cacheado ERA el muerto: recién ahí se invalida


class TestCorrerClaudeError(unittest.TestCase):
    def test_error_incluye_stdout_si_stderr_vacio(self):
        from unittest.mock import patch
        class R:
            returncode = 1
            stderr = ""
            stdout = '{"is_error":true,"result":"limite de uso alcanzado"}'
        with patch.object(jobslib.subprocess, "run", return_value=R()):
            with self.assertRaises(RuntimeError) as ctx:
                jobslib.correr_claude("hola")
        self.assertIn("limite de uso alcanzado", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
