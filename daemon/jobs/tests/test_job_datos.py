import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_datos


class TestFiltroCursor(unittest.TestCase):
    def test_sin_cursor_no_filtra(self):
        self.assertEqual(job_datos.filtro_cursor(""), "")

    def test_encodea_el_mas_del_timestamp(self):
        """El '+' de '+00:00' crudo en la URL llega como espacio a PostgREST → 400.
        (Caso real: job datos falló con 400 en toda corrida del 04/07 al 21/07.)"""
        filtro = job_datos.filtro_cursor("2026-07-04T11:54:06.60327+00:00")
        self.assertNotIn("+", filtro)
        self.assertIn("%2B00%3A00", filtro)
        self.assertTrue(filtro.startswith("&creado_at=gt."))


class TestFormatearLinea(unittest.TestCase):
    def test_linea_con_etiquetas_y_marca_ref(self):
        fila = {"id": "abc", "creado_at": "2026-07-04T11:54:06+00:00",
                "texto": "Altura container 2,79", "etiquetas": ["medida"]}
        linea = job_datos.formatear_linea(fila)
        self.assertIn("**2026-07-04**", linea)
        self.assertIn("Altura container 2,79", linea)
        self.assertIn("<!-- ref:abc -->", linea)


if __name__ == "__main__":
    unittest.main()
