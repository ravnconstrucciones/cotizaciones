import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_inbox

REFS = [
    {"tipo": "estetica", "etiquetas": ["tipografia", "serifa"], "texto": "cartel art deco", "creado_at": "2026-06-10"},
    {"tipo": "estetica", "etiquetas": ["tipografia"], "texto": "menú restaurante", "creado_at": "2026-06-09"},
    {"tipo": "estetica", "etiquetas": ["tipografia", "material"], "texto": "placa bronce", "creado_at": "2026-06-08"},
    {"tipo": "filosofia", "etiquetas": [], "texto": "la disciplina es libertad", "creado_at": "2026-06-08"},
]


class TestDetectarPatrones(unittest.TestCase):
    def test_etiqueta_repetida_3_veces_es_patron(self):
        self.assertEqual(job_inbox.detectar_patrones(REFS, umbral=3), ["tipografia: 3 capturas"])

    def test_bajo_el_umbral_no_hay_patron(self):
        self.assertEqual(job_inbox.detectar_patrones(REFS[:2], umbral=3), [])

    def test_filosofia_no_cuenta_para_etiquetas(self):
        filas = [{"tipo": "filosofia", "etiquetas": ["x"], "texto": "a", "creado_at": "1"}] * 5
        self.assertEqual(job_inbox.detectar_patrones(filas, umbral=3), [])


class TestResumenReferencias(unittest.TestCase):
    def test_formatea_una_linea_por_referencia(self):
        r = job_inbox.resumen_referencias(REFS)
        self.assertEqual(len(r.splitlines()), 4)
        self.assertIn("[estetica] cartel art deco (etiquetas: tipografia, serifa)", r)
        self.assertIn("[filosofia] la disciplina es libertad", r)

    def test_vacio_devuelve_marcador(self):
        self.assertEqual(job_inbox.resumen_referencias([]), "(sin referencias nuevas esta semana)")


class TestPrompt(unittest.TestCase):
    def test_prompt_contiene_flujo_fecha_refs_y_patrones(self):
        p = job_inbox.armar_prompt("2026-06-12", "- [estetica] cartel", ["tipografia: 3 capturas"])
        self.assertIn("procesá mi inbox", p)
        self.assertIn("/Users/ezeotero/Obsidian/RAVN/CLAUDE.md", p)
        self.assertIn("Orientación/2026-06-12.md", p)
        self.assertIn("EXACTO", p)  # refuerzo: nombre canónico sin título agregado
        self.assertIn("- [estetica] cartel", p)
        self.assertIn("tipografia: 3 capturas", p)
        self.assertIn("NO hagas git", p)


if __name__ == "__main__":
    unittest.main()
