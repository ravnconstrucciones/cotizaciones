import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_calendario

SALIDA = (
    "uid-1||2026-06-15||09:30||false||Visita obra Saavedra\n"
    "uid-2||2026-06-16||||true||Cierre tarjeta\n"
    "linea-rota-sin-pipes\n"
    "uid-3||2026-06-17||14:00||false||Reunión Bralar||con basura extra\n"
    "uid-1||2026-06-15||09:30||false||Visita obra Saavedra (duplicado)\n"
)


class TestParsearLineas(unittest.TestCase):
    def test_parsea_eventos_validos(self):
        evs = job_calendario.parsear_lineas(SALIDA)
        self.assertEqual([e["uid_externo"] for e in evs], ["uid-1", "uid-2", "uid-3"])
        self.assertEqual(evs[0]["titulo"], "Visita obra Saavedra")
        self.assertEqual(evs[0]["fecha"], "2026-06-15")
        self.assertEqual(evs[0]["hora"], "09:30")

    def test_allday_queda_sin_hora(self):
        evs = job_calendario.parsear_lineas(SALIDA)
        self.assertIsNone(evs[1]["hora"])

    def test_saltea_malformadas_y_dedup_por_uid(self):
        evs = job_calendario.parsear_lineas(SALIDA)
        self.assertEqual(len(evs), 3)  # rota afuera, uid-1 una sola vez
        self.assertEqual(evs[0]["titulo"], "Visita obra Saavedra")  # gana el primero

    def test_salida_vacia(self):
        self.assertEqual(job_calendario.parsear_lineas(""), [])
        self.assertEqual(job_calendario.parsear_lineas(None), [])


class TestPlanearSync(unittest.TestCase):
    HOY = "2026-06-15"

    def test_crea_los_uid_nuevos_con_fuente_mac(self):
        nuevos = [{"uid_externo": "u-1", "titulo": "A", "fecha": "2026-06-15", "hora": None}]
        crear, actualizar, borrar = job_calendario.planear_sync([], nuevos, self.HOY)
        self.assertEqual(len(crear), 1)
        self.assertEqual(crear[0]["fuente"], "mac")
        self.assertEqual(actualizar, [])
        self.assertEqual(borrar, [])

    def test_actualiza_si_cambio_titulo_fecha_u_hora(self):
        existentes = [{"id": "id-1", "uid_externo": "u-1", "titulo": "A",
                       "fecha": "2026-06-15", "hora": "09:00"}]
        nuevos = [{"uid_externo": "u-1", "titulo": "A", "fecha": "2026-06-16", "hora": "10:00"}]
        crear, actualizar, borrar = job_calendario.planear_sync(existentes, nuevos, self.HOY)
        self.assertEqual(crear, [])
        self.assertEqual(actualizar, [("id-1", {"fecha": "2026-06-16", "hora": "10:00"})])
        self.assertEqual(borrar, [])

    def test_sin_cambios_no_toca_nada(self):
        existentes = [{"id": "id-1", "uid_externo": "u-1", "titulo": "A",
                       "fecha": "2026-06-15", "hora": None}]
        nuevos = [{"uid_externo": "u-1", "titulo": "A", "fecha": "2026-06-15", "hora": None}]
        crear, actualizar, borrar = job_calendario.planear_sync(existentes, nuevos, self.HOY)
        self.assertEqual((crear, actualizar, borrar), ([], [], []))

    def test_borra_los_mac_futuros_que_salieron_de_la_ventana(self):
        existentes = [
            {"id": "id-pasado", "uid_externo": "u-p", "titulo": "Viejo",
             "fecha": "2026-06-10", "hora": None},
            {"id": "id-futuro", "uid_externo": "u-f", "titulo": "Borrado en la Mac",
             "fecha": "2026-06-17", "hora": None},
        ]
        crear, actualizar, borrar = job_calendario.planear_sync(existentes, [], self.HOY)
        # El pasado queda como historia; el futuro que ya no existe se borra.
        self.assertEqual(borrar, ["id-futuro"])

    def test_evento_movido_fuera_de_hoy_se_actualiza_no_choca_unique(self):
        # Caso real: evento de ayer movido a mañana. La fila vieja (fecha pasada)
        # tiene el mismo uid → tiene que ser UPDATE, nunca INSERT (unique uid).
        existentes = [{"id": "id-1", "uid_externo": "u-1", "titulo": "A",
                       "fecha": "2026-06-10", "hora": "09:00"}]
        nuevos = [{"uid_externo": "u-1", "titulo": "A", "fecha": "2026-06-16", "hora": "09:00"}]
        crear, actualizar, borrar = job_calendario.planear_sync(existentes, nuevos, self.HOY)
        self.assertEqual(crear, [])
        self.assertEqual(actualizar, [("id-1", {"fecha": "2026-06-16"})])


class TestLeerCalendar(unittest.TestCase):
    def test_devuelve_stdout_si_ok(self):
        fake = mock.Mock(returncode=0, stdout=SALIDA, stderr="")
        with mock.patch.object(job_calendario.subprocess, "run", return_value=fake) as m:
            self.assertEqual(job_calendario.leer_calendar(), SALIDA)
        self.assertEqual(m.call_args.args[0][0], "osascript")

    def test_lanza_si_osascript_falla(self):
        fake = mock.Mock(returncode=1, stdout="", stderr="Calendar got an error")
        with mock.patch.object(job_calendario.subprocess, "run", return_value=fake):
            with self.assertRaisesRegex(RuntimeError, "Calendar got an error"):
                job_calendario.leer_calendar()

    def test_lanza_si_calendar_no_responde(self):
        with mock.patch.object(
            job_calendario.subprocess, "run",
            side_effect=subprocess.TimeoutExpired(cmd="osascript", timeout=90),
        ):
            with self.assertRaisesRegex(RuntimeError, "no respondió"):
                job_calendario.leer_calendar()


class TestCorrer(unittest.TestCase):
    def setUp(self):
        self.calls = []

        def fake_rest(cfg, token, path, data=None, method="GET"):
            self.calls.append((method, path, data))
            if method == "GET":
                return [
                    {"id": "id-keep", "uid_externo": "uid-1",
                     "titulo": "Visita obra Saavedra", "fecha": "2026-06-15", "hora": "09:30"},
                    {"id": "id-del", "uid_externo": "uid-gone",
                     "titulo": "Cancelado", "fecha": "2099-01-01", "hora": None},
                ]
            return None

        self.eventos = []
        self.p_rest = mock.patch.object(job_calendario, "rest", side_effect=fake_rest)
        self.p_leer = mock.patch.object(job_calendario, "leer_calendar", return_value=SALIDA)
        self.p_reg = mock.patch.object(
            job_calendario, "registrar_evento",
            side_effect=lambda cfg, token, tipo, titulo, contenido: self.eventos.append((tipo, contenido)),
        )
        self.p_rest.start(); self.p_leer.start(); self.p_reg.start()
        self.addCleanup(self.p_rest.stop)
        self.addCleanup(self.p_leer.stop)
        self.addCleanup(self.p_reg.stop)

    def test_sincroniza_crea_borra_y_registra_evento(self):
        job_calendario.correr({}, "tok")
        metodos = [c[0] for c in self.calls]
        self.assertEqual(metodos[0], "GET")
        # uid-2 y uid-3 son nuevos → un POST batch con fuente mac
        post = next(c for c in self.calls if c[0] == "POST")
        self.assertEqual([f["uid_externo"] for f in post[2]], ["uid-2", "uid-3"])
        self.assertTrue(all(f["fuente"] == "mac" for f in post[2]))
        # uid-gone (futuro) ya no está en la ventana → DELETE por id
        delete = next(c for c in self.calls if c[0] == "DELETE")
        self.assertIn("id-del", delete[1])
        # evento de cierre con los contadores
        self.assertEqual(self.eventos[0][0], "job_calendario")
        self.assertEqual(self.eventos[0][1]["creados"], 2)
        self.assertEqual(self.eventos[0][1]["borrados"], 1)
        self.assertEqual(self.eventos[0][1]["en_ventana"], 3)


if __name__ == "__main__":
    unittest.main()
