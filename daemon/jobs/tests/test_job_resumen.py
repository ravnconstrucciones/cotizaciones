"""Tests unitarios de job_resumen.py (composición + envío mockeado)."""
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_resumen

# ── fixtures ──────────────────────────────────────────────────────────────────

CFG = {
    "SUPABASE_URL": "https://fake.supabase.co",
    "SUPABASE_ANON_KEY": "anon-key",
    "BOT_URL": "https://ravn-bots-production.up.railway.app",
    "BOT_SEND_TOKEN": "ravn2024dash",
    "OWNER_PHONE": "5491199999999",
}
TOKEN = "fake-token"
HOY = date(2026, 6, 12)  # viernes
AYER = date(2026, 6, 11)


def _make_rest(tabla_map: dict):
    """Devuelve un fake rest() que responde según qué tabla/path se pide."""
    def fake_rest(cfg, token, path, data=None, method="GET"):  # noqa: ARG001
        for clave, respuesta in tabla_map.items():
            if clave in path:
                return respuesta
        return []
    return fake_rest


# ── TestFechaLegible ──────────────────────────────────────────────────────────

class TestFechaLegible(unittest.TestCase):
    def test_viernes(self):
        # 2026-06-12 es viernes
        self.assertEqual(job_resumen.fecha_legible(date(2026, 6, 12)), "viernes 12 de junio")

    def test_lunes(self):
        # 2026-06-08 es lunes
        self.assertEqual(job_resumen.fecha_legible(date(2026, 6, 8)), "lunes 8 de junio")

    def test_diciembre(self):
        # 2026-12-25 es viernes
        self.assertEqual(job_resumen.fecha_legible(date(2026, 12, 25)), "viernes 25 de diciembre")


# ── TestSeccionAgenda ─────────────────────────────────────────────────────────

class TestSeccionAgenda(unittest.TestCase):
    def _run(self, cal, tareas):
        tabla_map = {
            "calendario_eventos": cal,
            "tareas": tareas,
        }
        with mock.patch.object(job_resumen, "rest", side_effect=_make_rest(tabla_map)):
            return job_resumen.seccion_agenda(CFG, TOKEN, HOY)

    def test_con_calendario_y_tareas(self):
        cal = [{"hora": "09:30:00", "titulo": "Visita obra Saavedra"}]
        tareas = [{"texto": "Llamar a Perazzo", "hora": None}]
        out = self._run(cal, tareas)
        self.assertIn("09:30", out)
        self.assertIn("Visita obra Saavedra", out)
        self.assertIn("☑", out)
        self.assertIn("Llamar a Perazzo", out)

    def test_sin_nada(self):
        out = self._run([], [])
        self.assertIn("Sin agenda fija.", out)

    def test_solo_tarea_con_hora(self):
        tareas = [{"texto": "Ir al banco", "hora": "10:00:00"}]
        out = self._run([], tareas)
        self.assertIn("10:00", out)
        self.assertIn("Ir al banco", out)


# ── TestSeccionVencidas ───────────────────────────────────────────────────────

class TestSeccionVencidas(unittest.TestCase):
    def _run(self, rows):
        with mock.patch.object(job_resumen, "rest", return_value=rows):
            return job_resumen.seccion_vencidas(CFG, TOKEN, HOY)

    def test_sin_vencidas(self):
        self.assertIsNone(self._run([]))

    def test_vencidas_cortas(self):
        rows = [{"texto": "Tarea A", "fecha": "2026-06-07"}]
        out = self._run(rows)
        self.assertIn("⚠️", out)
        self.assertIn("Tarea A", out)
        self.assertIn("2026-06-07", out)

    def test_vencidas_mas_de_cinco_muestra_extra(self):
        rows = [{"texto": f"T{i}", "fecha": "2026-06-05"} for i in range(7)]
        out = self._run(rows)
        self.assertIn("+2 más", out)
        # Solo 5 líneas de tareas (T0..T4)
        self.assertNotIn("T5", out)
        self.assertNotIn("T6", out)

    def test_exactamente_cinco_sin_extra(self):
        rows = [{"texto": f"T{i}", "fecha": "2026-06-05"} for i in range(5)]
        out = self._run(rows)
        self.assertNotIn("+", out)


# ── TestSeccionObras ──────────────────────────────────────────────────────────

class TestSeccionObras(unittest.TestCase):
    def _run(self, presups, avances_por_id=None):
        avances_por_id = avances_por_id or {}

        def fake_rest(cfg, token, path, data=None, method="GET"):  # noqa: ARG001
            if "presupuestos?" in path and "presupuesto_aprobado" in path:
                return presups
            for pid, avance in avances_por_id.items():
                if pid in path:
                    return [avance] if avance else []
            return []

        with mock.patch.object(job_resumen, "rest", side_effect=fake_rest):
            return job_resumen.seccion_obras(CFG, TOKEN)

    def test_sin_obras(self):
        self.assertIsNone(self._run([]))

    def test_obras_sin_avances(self):
        presups = [{"id": "aaa-111", "nombre_obra": "Reforma baño Martínez"}]
        out = self._run(presups)
        self.assertIn("🏗", out)
        self.assertIn("Reforma baño Martínez", out)
        self.assertNotIn("🟢", out)

    def test_obras_con_avance(self):
        presups = [{"id": "bbb-222", "nombre_obra": "Cerámicos Las Glorietas"}]
        avances = {"bbb-222": {"texto": "Se colocó el 80% del piso", "instancia": "colocación"}}
        out = self._run(presups, avances)
        self.assertIn("🟢", out)
        self.assertIn("Se colocó el 80%", out)
        self.assertIn("colocación", out)

    def test_avance_sin_instancia(self):
        presups = [{"id": "ccc-333", "nombre_obra": "Obra X"}]
        avances = {"ccc-333": {"texto": "Avanzó bien", "instancia": None}}
        out = self._run(presups, avances)
        self.assertIn("Avanzó bien", out)
        # sin instancia no debe haber paréntesis vacíos
        self.assertNotIn("()", out)


# ── TestSeccionGastosAyer ─────────────────────────────────────────────────────

class TestSeccionGastosAyer(unittest.TestCase):
    def _run(self, gastos_obra, gastos_pers):
        tabla_map = {
            "presupuestos_gastos": gastos_obra,
            "gastos_personales": gastos_pers,
        }
        with mock.patch.object(job_resumen, "rest", side_effect=_make_rest(tabla_map)):
            return job_resumen.seccion_gastos_ayer(CFG, TOKEN, HOY)

    def test_sin_gastos(self):
        self.assertIsNone(self._run([], []))

    def test_solo_obra(self):
        out = self._run([{"importe": "50000.00"}, {"importe": "25000.00"}], [])
        self.assertIn("💸", out)
        self.assertIn("Obra: $75,000", out)
        self.assertNotIn("Personal", out)

    def test_solo_personal(self):
        out = self._run([], [{"monto": "12000.00"}])
        self.assertIn("Personal: $12,000", out)
        self.assertNotIn("Obra", out)

    def test_ambos(self):
        out = self._run([{"importe": "100000"}], [{"monto": "5000"}])
        self.assertIn("Obra:", out)
        self.assertIn("Personal:", out)
        self.assertIn("|", out)


# ── TestComponerResumen ───────────────────────────────────────────────────────

class TestComponerResumen(unittest.TestCase):
    def _patch_secciones(self, agenda="📅 *HOY:* Sin agenda fija.", vencidas=None,
                          obras=None, gastos=None):
        patches = [
            mock.patch.object(job_resumen, "seccion_agenda", return_value=agenda),
            mock.patch.object(job_resumen, "seccion_vencidas", return_value=vencidas),
            mock.patch.object(job_resumen, "seccion_obras", return_value=obras),
            mock.patch.object(job_resumen, "seccion_gastos_ayer", return_value=gastos),
            mock.patch.object(job_resumen, "cargar_cfg_jobs", return_value=CFG),
        ]
        return patches

    def _run(self, **kw):
        patches = self._patch_secciones(**kw)
        for p in patches:
            p.start()
        try:
            return job_resumen.componer_resumen(CFG, TOKEN, HOY)
        finally:
            for p in patches:
                p.stop()

    def test_encabezado(self):
        out = self._run()
        self.assertIn("*RAVN — viernes 12 de junio*", out)

    def test_sin_secciones_opcionales(self):
        out = self._run()
        self.assertIn("Sin agenda fija.", out)
        self.assertIn(job_resumen.COCKPIT_URL, out)
        self.assertNotIn("⚠️", out)
        self.assertNotIn("🏗", out)
        self.assertNotIn("💸", out)

    def test_con_vencidas_y_obras(self):
        out = self._run(
            vencidas="⚠️ *VENCIDAS:*\n  • T1 (2026-06-08)",
            obras="🏗 *OBRAS:*\n  *Reforma*",
        )
        self.assertIn("⚠️", out)
        self.assertIn("🏗", out)

    def test_primera_corrida_agrega_linea(self):
        patches = self._patch_secciones()
        for p in patches:
            p.start()
        try:
            out = job_resumen.componer_resumen(CFG, TOKEN, HOY, primera_corrida=True)
        finally:
            for p in patches:
                p.stop()
        self.assertTrue(out.startswith("🚀 Resumen mañanero 2.0"))

    def test_pie_tiene_cockpit_url(self):
        out = self._run()
        self.assertIn("https://ravn-app-one-five.vercel.app", out)


# ── TestEnviarWhatsapp ────────────────────────────────────────────────────────

class TestEnviarWhatsapp(unittest.TestCase):
    def test_envio_ok(self):
        import json
        from io import BytesIO
        from unittest.mock import MagicMock

        fake_resp = MagicMock()
        fake_resp.read.return_value = json.dumps({"ok": True, "msgId": "wamid.123"}).encode()
        fake_resp.__enter__ = lambda s: s
        fake_resp.__exit__ = MagicMock(return_value=False)

        with mock.patch("urllib.request.urlopen", return_value=fake_resp) as m:
            msg_id = job_resumen.enviar_whatsapp(CFG, "Hola Eze")
        self.assertEqual(msg_id, "wamid.123")
        # verifica que se llamó con la URL correcta
        req = m.call_args.args[0]
        self.assertIn("/send", req.full_url)
        body = json.loads(req.data.decode())
        self.assertEqual(body["to"], CFG["OWNER_PHONE"])
        self.assertEqual(body["token"], CFG["BOT_SEND_TOKEN"])
        self.assertEqual(body["message"], "Hola Eze")

    def test_falla_si_ok_false(self):
        import json
        from unittest.mock import MagicMock

        fake_resp = MagicMock()
        fake_resp.read.return_value = json.dumps({"ok": False, "error": "Error al enviar"}).encode()
        fake_resp.__enter__ = lambda s: s
        fake_resp.__exit__ = MagicMock(return_value=False)

        with mock.patch("urllib.request.urlopen", return_value=fake_resp):
            with self.assertRaises(RuntimeError):
                job_resumen.enviar_whatsapp(CFG, "Hola")

    def test_falla_si_faltan_vars(self):
        cfg_incompleto = {"BOT_URL": "", "BOT_SEND_TOKEN": "", "OWNER_PHONE": ""}
        with self.assertRaises(RuntimeError):
            job_resumen.enviar_whatsapp(cfg_incompleto, "Hola")

    def test_lanza_si_http_error(self):
        import urllib.error
        with mock.patch("urllib.request.urlopen",
                        side_effect=urllib.error.HTTPError(
                            url="https://x/send", code=401, msg="Unauthorized",
                            hdrs=None, fp=None)):  # type: ignore[arg-type]
            with self.assertRaises(RuntimeError) as ctx:
                job_resumen.enviar_whatsapp(CFG, "Hola")
        self.assertIn("401", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
