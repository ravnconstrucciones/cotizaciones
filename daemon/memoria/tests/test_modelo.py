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

    def test_redacta_bearer_completo_incluso_con_caracteres_base64(self):
        texto = "Authorization: Bearer abc+/== obra Glorietas"

        self.assertEqual(
            redactar_secretos(texto),
            "Authorization: Bearer [REDACTADO] obra Glorietas",
        )

    def test_redacta_encabezados_de_cookie(self):
        texto = "Cookie: session=abc; theme=dark\nSet-Cookie: refresh=def; HttpOnly"

        self.assertEqual(
            redactar_secretos(texto),
            "Cookie: [REDACTADO]\nSet-Cookie: [REDACTADO]",
        )

    def test_redacta_claves_genericas_sensibles_habituales(self):
        texto = (
            "JWT_SECRET=jwt-123 STRIPE_SECRET_KEY=stripe-123 "
            "password: clave-obra X-API-Key: api-123"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "JWT_SECRET=[REDACTADO] STRIPE_SECRET_KEY=[REDACTADO] "
            "password: [REDACTADO] X-API-Key: [REDACTADO]",
        )

    def test_redacta_volcado_de_entorno_y_conserva_texto_de_obra(self):
        texto = (
            "OBRA=Glorietas\n"
            "DATABASE_URL=postgres://usuario:clave@db.example/ravn\n"
            "SERVICE_TOKEN=abc+/==\n"
            "precio estimado 100"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "OBRA=Glorietas\n"
            "DATABASE_URL=[REDACTADO]\n"
            "SERVICE_TOKEN=[REDACTADO]\n"
            "precio estimado 100",
        )

    def test_redacta_clave_y_valor_quoted_en_json_sin_ocultar_campos_ordinarios(self):
        texto = '{"OPENAI_API_KEY":"secreto-json","obra":"Glorietas","precio":100}'

        self.assertEqual(
            redactar_secretos(texto),
            '{"OPENAI_API_KEY":"[REDACTADO]","obra":"Glorietas","precio":100}',
        )

    def test_redacta_valor_json_quoted_con_comillas_escapadas_completo(self):
        texto = r'{"OPENAI_API_KEY":"se\"creto","obra":"Glorietas"}'

        self.assertEqual(
            redactar_secretos(texto),
            '{"OPENAI_API_KEY":"[REDACTADO]","obra":"Glorietas"}',
        )

    def test_redacta_valor_yaml_quoted_con_comillas_escapadas_completo(self):
        texto = 'OPENAI_API_KEY: "se\\"creto"\nobra: Glorietas'

        self.assertEqual(
            redactar_secretos(texto),
            'OPENAI_API_KEY: "[REDACTADO]"\nobra: Glorietas',
        )

    def test_redacta_familias_sensibles_en_yaml_y_conserva_texto_ordinario(self):
        texto = (
            "AWS_SECRET_ACCESS_KEY: aws-secret+/==\n"
            "PRIVATE_KEY: clave-privada\n"
            "obra: Glorietas\n"
            "precio: 100"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "AWS_SECRET_ACCESS_KEY: [REDACTADO]\n"
            "PRIVATE_KEY: [REDACTADO]\n"
            "obra: Glorietas\n"
            "precio: 100",
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

    def test_markdown_indenta_cada_continuacion_multilinea(self):
        datos = cierre_valido()
        datos["hechos"] = [
            "Primera línea.\n# Continuación.\n## Decisiones\n## Sección inyectada"
        ]

        markdown = cierre_a_markdown(validar_cierre(datos))

        self.assertIn(
            "- Primera línea.\n  # Continuación.\n  ## Decisiones\n  ## Sección inyectada",
            markdown,
        )


if __name__ == "__main__":
    unittest.main()
