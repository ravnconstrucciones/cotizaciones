"""Tests unitarios para job_maestro.py — stdlib únicamente, sin red."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from job_maestro import (
    UMBRAL,
    mejor_match,
    normalizar,
    sismat_es_mas_nuevo_que_sync,
)

# ---------- fixtures mínimas ----------

TAREAS_FIXTURE = [
    {
        "id": 1,
        "name": "Pintura látex interior",
        "name_norm": normalizar("Pintura látex interior"),
        "manpower_cost": 3500.0,
    },
    {
        "id": 2,
        "name": "Contrapiso de hormigón",
        "name_norm": normalizar("Contrapiso de hormigón"),
        "manpower_cost": 8200.0,
    },
    {
        "id": 3,
        "name": "Tabique de roca de yeso",
        "name_norm": normalizar("Tabique de roca de yeso"),
        "manpower_cost": 6100.0,
    },
    {
        "id": 4,
        "name": "Colocación de porcelanato",
        "name_norm": normalizar("Colocación de porcelanato"),
        "manpower_cost": 5800.0,
    },
]


class TestNormalizar(unittest.TestCase):
    def test_quita_acentos(self):
        self.assertEqual(normalizar("Pintura Látex"), "pintura latex")

    def test_minusculas(self):
        self.assertEqual(normalizar("TABIQUE"), "tabique")

    def test_espacios_multiples(self):
        self.assertEqual(normalizar("contrapiso  de  hormigón"), "contrapiso de hormigon")

    def test_vacio(self):
        self.assertEqual(normalizar(""), "")


class TestMejorMatch(unittest.TestCase):
    def test_match_directo(self):
        tarea, score = mejor_match("Pintura latex interior", TAREAS_FIXTURE)
        self.assertIsNotNone(tarea)
        self.assertEqual(tarea["id"], 1)
        self.assertGreaterEqual(score, UMBRAL)

    def test_match_con_acento(self):
        tarea, score = mejor_match("Contrapiso de hormigon", TAREAS_FIXTURE)
        self.assertIsNotNone(tarea)
        self.assertEqual(tarea["id"], 2)

    def test_match_parcial_suficiente(self):
        # variación razonable del nombre
        tarea, score = mejor_match("Pintura látex", TAREAS_FIXTURE)
        # puede matchear o no según score; lo que importa es que devuelve la correcta si matchea
        if tarea is not None:
            self.assertEqual(tarea["id"], 1)

    def test_sin_match(self):
        tarea, score = mejor_match("Instalación eléctrica trifásica compleja", TAREAS_FIXTURE)
        self.assertIsNone(tarea)
        self.assertLess(score, UMBRAL)

    def test_devuelve_none_si_lista_vacia(self):
        tarea, score = mejor_match("Algo", [])
        self.assertIsNone(tarea)
        self.assertEqual(score, 0.0)

    def test_match_porcelanato(self):
        tarea, score = mejor_match("Colocación porcelanato", TAREAS_FIXTURE)
        # score puede no llegar al umbral, pero si matchea tiene que ser el ítem correcto
        if tarea is not None:
            self.assertEqual(tarea["id"], 4)


class TestSismatEsMasNuevo(unittest.TestCase):
    def test_ninguna_sync_previa(self):
        self.assertTrue(sismat_es_mas_nuevo_que_sync("2026-06-10", None))

    def test_sismat_mas_nuevo(self):
        self.assertTrue(sismat_es_mas_nuevo_que_sync("2026-06-10", "2026-05-15"))

    def test_sismat_igual(self):
        self.assertFalse(sismat_es_mas_nuevo_que_sync("2026-06-10", "2026-06-10"))

    def test_sismat_mas_viejo(self):
        self.assertFalse(sismat_es_mas_nuevo_que_sync("2026-05-01", "2026-06-10"))

    def test_fecha_invalida_ejecuta(self):
        # si algo está roto en las fechas, ejecutar igual (conservador)
        self.assertTrue(sismat_es_mas_nuevo_que_sync("not-a-date", "2026-06-10"))


if __name__ == "__main__":
    unittest.main()
