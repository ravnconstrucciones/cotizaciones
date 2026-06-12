import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_sismat


class TestMetaEsDeHoy(unittest.TestCase):
    def test_meta_con_fecha_de_hoy(self):
        meta = {"descargado": "2026-06-12", "tareas": 472, "materiales": 1384}
        self.assertTrue(job_sismat.meta_es_de_hoy(meta, date(2026, 6, 12)))

    def test_meta_vieja_no_pasa(self):
        meta = {"descargado": "2026-05-02"}
        self.assertFalse(job_sismat.meta_es_de_hoy(meta, date(2026, 6, 12)))

    def test_meta_sin_fecha_no_pasa(self):
        self.assertFalse(job_sismat.meta_es_de_hoy({}, date(2026, 6, 12)))


if __name__ == "__main__":
    unittest.main()
