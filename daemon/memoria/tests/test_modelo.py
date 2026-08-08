"""Contrato público del modelo canónico de cierres."""

from __future__ import annotations

import unittest

from daemon.memoria.modelo import (
    Cierre,
    Mensaje,
    cierre_a_markdown,
    redactar_secretos,
    validar_cierre,
)


def cierre_valido() -> dict:
    return {
        "id": "cierre-1",
        "host": "codex",
        "thread_id": "t-1",
        "fecha_inicio": "2026-08-08T10:00:00-03:00",
        "fecha_cierre": "2026-08-08T11:00:00-03:00",
        "tema": "Memoria compartida",
        "estado": "completo",
        "entidades": ["RAVN"],
        "hechos": ["El modelo tiene contrato."],
        "decisiones": ["Usar formato Markdown."],
        "metodos": ["TDD"],
        "cambios": ["Se creó el modelo."],
        "pendientes": ["Integrar colector."],
        "separaciones": ["No tocar el almacén."],
        "enlaces": ["https://example.test/memoria"],
        "fuente_cruda": "session://codex/t-1",
        "sensibilidad": "normal",
    }


class ModeloCanonicoTests(unittest.TestCase):
    def test_redacta_secretos_sin_borrar_contenido_util(self):
        texto = "obra Glorietas SUPABASE_SERVICE_ROLE_KEY=secreto precio 100"
        self.assertEqual(
            redactar_secretos(texto),
            "obra Glorietas SUPABASE_SERVICE_ROLE_KEY=[REDACTADO] precio 100",
        )

    def test_redacta_todas_las_credenciales_soportadas(self):
        texto = (
            "ANTHROPIC_API_KEY=anthropic-secret OPENAI_API_KEY=openai-secret "
            "Authorization: Bearer token_123"
        )
        self.assertEqual(
            redactar_secretos(texto),
            "ANTHROPIC_API_KEY=[REDACTADO] OPENAI_API_KEY=[REDACTADO] "
            "Authorization: Bearer [REDACTADO]",
        )

    def test_cierre_exige_fuente_y_estado_valido(self):
        with self.assertRaises(ValueError):
            validar_cierre({"host": "codex", "thread_id": "t-1", "estado": "inventado"})

    def test_validar_cierre_devuelve_dataclass_con_listas_independientes(self):
        data = cierre_valido()

        cierre = validar_cierre(data)

        self.assertIsInstance(cierre, Cierre)
        self.assertEqual(cierre.host, "codex")
        self.assertEqual(cierre.hechos, ["El modelo tiene contrato."])
        data["hechos"].append("No debe filtrarse.")
        self.assertEqual(cierre.hechos, ["El modelo tiene contrato."])

    def test_mensaje_conserva_el_contrato_de_sesion(self):
        mensaje = Mensaje(
            host="claude",
            thread_id="t-2",
            timestamp="2026-08-08T10:00:00-03:00",
            autor="asistente",
            tipo="texto",
            texto="Consulta terminada.",
            metadata={"origen": "host"},
        )

        self.assertEqual(mensaje.metadata, {"origen": "host"})

    def test_markdown_estable_ordena_frontmatter_y_secciones(self):
        markdown = cierre_a_markdown(validar_cierre(cierre_valido()))

        self.assertTrue(markdown.startswith("---\nid: cierre-1\nhost: codex\n"))
        orden = [
            "## Hechos confirmados",
            "## Decisiones",
            "## Métodos reutilizables",
            "## Cambios realizados",
            "## Pendientes",
            "## Separaciones de alcance",
            "## Enlaces",
        ]
        posiciones = [markdown.index(seccion) for seccion in orden]
        self.assertEqual(posiciones, sorted(posiciones))
        self.assertIn("- El modelo tiene contrato.", markdown)

    def test_markdown_redacta_secretos_tambien_en_entidades_del_frontmatter(self):
        cierre = Cierre(**{**cierre_valido(), "entidades": ["OPENAI_API_KEY=secreto"]})

        markdown = cierre_a_markdown(cierre)

        self.assertNotIn("secreto", markdown)
        self.assertIn("OPENAI_API_KEY=[REDACTADO]", markdown)


if __name__ == "__main__":
    unittest.main()
