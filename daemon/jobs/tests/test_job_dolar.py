import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_dolar

BLUELYTICS = {
    "oficial": {"value_buy": 1010.0, "value_sell": 1050.0},
    "blue": {"value_buy": 1400.0, "value_sell": 1450.0},
    "last_update": "2026-06-12T09:00:00-03:00",
}

DOLARAPI = [
    {"casa": "oficial", "compra": 1010.0, "venta": 1050.0},
    {"casa": "blue", "compra": 1400.0, "venta": 1450.0},
    {"casa": "bolsa", "compra": 1300.0, "venta": 1320.0},
]

MD_EJEMPLO = """# Base de Precios — Materiales de Construcción

> **REGLA:** Los valores de precio son siempre del día.

---

## Adhesivos y pegamentos

| Material | Unidad | Último precio | Fecha | Fuente | Query de actualización |
|---|---|---|---|---|---|
| Weber Superflex | bolsa 25kg | $24.990 | 2026-06-08 | Store409 | `query` |
"""


class TestParseo(unittest.TestCase):
    def test_parsear_bluelytics(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        self.assertEqual(c["fuente"], "bluelytics")
        self.assertEqual(c["oficial"], {"compra": 1010.0, "venta": 1050.0})
        self.assertEqual(c["blue"], {"compra": 1400.0, "venta": 1450.0})

    def test_parsear_dolarapi(self):
        c = job_dolar.parsear_dolarapi(DOLARAPI)
        self.assertEqual(c["fuente"], "dolarapi")
        self.assertEqual(c["blue"], {"compra": 1400.0, "venta": 1450.0})
        self.assertNotIn("bolsa", c)


class TestBloqueMd(unittest.TestCase):
    def test_formatear_bloque_tiene_marcadores_y_valores(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        b = job_dolar.formatear_bloque(c, "2026-06-12")
        self.assertIn("<!-- DOLAR:START -->", b)
        self.assertIn("<!-- DOLAR:END -->", b)
        self.assertIn("2026-06-12", b)
        self.assertIn("1,450", b)

    def test_insertar_primera_vez_despues_del_header(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        bloque = job_dolar.formatear_bloque(c, "2026-06-12")
        nuevo = job_dolar.insertar_bloque(MD_EJEMPLO, bloque)
        self.assertEqual(nuevo.count("<!-- DOLAR:START -->"), 1)
        # el bloque queda antes de la primera sección de materiales
        self.assertLess(nuevo.index("DOLAR:START"), nuevo.index("## Adhesivos"))
        # no rompe el contenido existente
        self.assertIn("Weber Superflex", nuevo)

    def test_insertar_segunda_vez_reemplaza_no_duplica(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        b1 = job_dolar.formatear_bloque(c, "2026-06-12")
        b2 = job_dolar.formatear_bloque(c, "2026-06-13")
        md1 = job_dolar.insertar_bloque(MD_EJEMPLO, b1)
        md2 = job_dolar.insertar_bloque(md1, b2)
        self.assertEqual(md2.count("<!-- DOLAR:START -->"), 1)
        self.assertIn("2026-06-13", md2)
        self.assertNotIn("2026-06-12**", md2)


if __name__ == "__main__":
    unittest.main()
