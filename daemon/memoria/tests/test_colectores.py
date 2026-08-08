from __future__ import annotations

from pathlib import Path
import unittest

from daemon.memoria.colectores import (
    detectar_host,
    leer_claude,
    leer_codex,
    leer_sesion,
)
from daemon.memoria.modelo import Mensaje


FIXTURES = Path(__file__).parent / "fixtures"


class ColectoresTest(unittest.TestCase):
    def test_codex_conserva_mensajes_y_resume_tool_output(self):
        mensajes = leer_codex(FIXTURES / "codex-session.jsonl")

        self.assertEqual([mensaje.autor for mensaje in mensajes], ["user", "assistant", "tool"])
        self.assertEqual(mensajes[0].texto, "Necesito revisar API_KEY=[REDACTADO]")
        self.assertLess(len(mensajes[-1].texto), 2000)
        self.assertEqual(mensajes[0].thread_id, "11111111-1111-1111-1111-111111111111")

    def test_claude_y_codex_producen_el_mismo_modelo(self):
        for path in (
            FIXTURES / "codex-session.jsonl",
            FIXTURES / "claude-session.jsonl",
        ):
            self.assertTrue(all(isinstance(mensaje, Mensaje) for mensaje in leer_sesion(path)))

    def test_codex_acepta_los_tres_tipos_de_tool_output(self):
        path = self._crear_fixture_temporal(
            '{"type":"session_meta","payload":{"id":"55555555-5555-5555-5555-555555555555"}}\n'
            '{"type":"response_item","payload":{"type":"custom_tool_call_output","output":"custom"}}\n'
            '{"type":"response_item","payload":{"type":"tool_search_output","output":"search"}}\n'
            '{"type":"response_item","payload":{"type":"function_call_output","output":"function"}}\n'
        )
        self.addCleanup(path.unlink)

        mensajes = leer_codex(path)

        self.assertEqual([mensaje.autor for mensaje in mensajes], ["tool", "tool", "tool"])
        self.assertEqual([mensaje.texto for mensaje in mensajes], ["custom", "search", "function"])

    def test_claude_separa_tool_result_anidado_y_conserva_texto_de_usuario(self):
        mensajes = leer_claude(FIXTURES / "claude-session.jsonl")

        self.assertEqual([mensaje.autor for mensaje in mensajes], ["user", "tool", "assistant"])
        self.assertEqual(
            mensajes[0].texto,
            "Necesito revisar API_KEY=[REDACTADO]\nConservar este texto de usuario.",
        )
        self.assertEqual(mensajes[1].texto, "Salida de herramienta anidada")

    def test_claude_resume_tool_result_anidado_extenso(self):
        texto_largo = "y" * 2_001
        path = self._crear_fixture_temporal(
            '{"type":"user","message":{"content":[{"type":"tool_result","content":"'
            + texto_largo
            + '"}]}}\n'
        )
        self.addCleanup(path.unlink)

        mensajes = leer_claude(path)

        self.assertEqual(mensajes[0].autor, "tool")
        self.assertEqual(mensajes[0].texto[:1_500], "y" * 1_500)
        self.assertRegex(mensajes[0].texto, r"\[TRUNCADO sha256=[0-9a-f]{64}\]$")

    def test_detectar_host_reconoce_los_dos_formatos(self):
        self.assertEqual(detectar_host(FIXTURES / "codex-session.jsonl"), "codex")
        self.assertEqual(detectar_host(FIXTURES / "claude-session.jsonl"), "claude")

    def test_lineas_malformadas_se_cuentan_en_metadata(self):
        path = self._crear_fixture_temporal(
            '{"type":"session_meta","payload":{"id":"33333333-3333-3333-3333-333333333333"}}\n'
            'no-es-json\n'
            '{"type":"message","payload":{"role":"user","content":"hola"}}\n'
        )
        self.addCleanup(path.unlink)

        mensajes = leer_codex(path)

        self.assertEqual(mensajes[0].metadata["errores_parseo"], 1)

    def test_payload_de_herramienta_extenso_conserva_prefijo_y_hash(self):
        texto_largo = "x" * 2_001
        path = self._crear_fixture_temporal(
            '{"type":"session_meta","payload":{"id":"44444444-4444-4444-4444-444444444444"}}\n'
            '{"type":"function_call_output","payload":{"output":"'
            + texto_largo
            + '"}}\n'
        )
        self.addCleanup(path.unlink)

        mensajes = leer_codex(path)

        self.assertEqual(mensajes[0].texto[:1_500], "x" * 1_500)
        self.assertRegex(mensajes[0].texto, r"\[TRUNCADO sha256=[0-9a-f]{64}\]$")

    def _crear_fixture_temporal(self, contenido: str) -> Path:
        path = FIXTURES / f"temporal-{self.id().rsplit('.', 1)[-1]}.jsonl"
        path.write_text(contenido, encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
