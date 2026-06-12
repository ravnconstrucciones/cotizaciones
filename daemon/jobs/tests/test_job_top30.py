import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_top30

MD = """# Base de Precios

---

## Adhesivos y pegamentos

| Material | Unidad | Último precio | Fecha | Fuente | Query de actualización |
|---|---|---|---|---|---|
| Weber Superflex | bolsa 25kg | $24.990 | 2026-06-08 | Store409 | `query 1` |

## Pinturas

| Material | Unidad | Último precio | Fecha | Fuente | Query de actualización |
|---|---|---|---|---|---|
| Fijador Alba | 1 litro | $11.874 | 2026-06-08 | Sagitario | `query 2` |
| Látex interior | 4 litros | $19.999 | 2026-06-08 | ML | `query 3` |
"""


class TestFilasMateriales(unittest.TestCase):
    def test_cuenta_solo_filas_de_datos(self):
        filas = job_top30.filas_materiales(MD)
        self.assertEqual(len(filas), 3)
        self.assertTrue(filas[0].startswith("| Weber Superflex"))

    def test_md_sin_tablas_da_cero(self):
        self.assertEqual(job_top30.filas_materiales("# Nada\ntexto"), [])


class TestFilasConFecha(unittest.TestCase):
    def test_cuenta_filas_con_la_fecha_en_la_columna_fecha(self):
        md = MD.replace(
            "| Fijador Alba | 1 litro | $11.874 | 2026-06-08 | Sagitario | `query 2` |",
            "| Fijador Alba | 1 litro | $12.500 | 2026-06-12 | Sagitario | `query 2` |",
        )
        self.assertEqual(job_top30.filas_con_fecha(md, "2026-06-12"), 1)
        self.assertEqual(job_top30.filas_con_fecha(MD, "2026-06-12"), 0)

    def test_fecha_fuera_de_la_columna_no_cuenta(self):
        # job_dolar escribe la fecha de hoy en el MISMO archivo (bloque DOLAR);
        # eso NO debe contar como "fila de material actualizada".
        md = (
            "<!-- DOLAR:START -->\n**Dólar del día — 2026-06-12** (fuente: bluelytics)\n\n"
            "| Tipo | Compra | Venta |\n|---|---|---|\n"
            "| Blue | $1,400 | $1,450 |\n<!-- DOLAR:END -->\n" + MD
        )
        self.assertEqual(job_top30.filas_con_fecha(md, "2026-06-12"), 0)


class TestPrompt(unittest.TestCase):
    def test_prompt_contiene_fecha_ruta_y_reglas(self):
        p = job_top30.armar_prompt("2026-06-12", "/ruta/al/archivo.md", 3)
        self.assertIn("2026-06-12", p)
        self.assertIn("/ruta/al/archivo.md", p)
        self.assertIn("3 filas", p)
        self.assertIn("nunca inventes", p)


if __name__ == "__main__":
    unittest.main()
