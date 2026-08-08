from __future__ import annotations

from pathlib import Path
import json
import shutil
import tempfile
import unittest
from unittest.mock import patch

import daemon.memoria.colectores as colectores
from daemon.memoria.colectores import (
    descubrir_sesiones,
    detectar_host,
    leer_claude,
    leer_codex,
    leer_sesion,
)
from daemon.memoria.modelo import Mensaje


FIXTURES = Path(__file__).parent / "fixtures"


class ColectoresTest(unittest.TestCase):
    def test_descubrimiento_excluye_journal_conocido_y_preserva_sesiones_anidadas(self):
        with tempfile.TemporaryDirectory() as directorio:
            home = Path(directorio)
            proyecto = home / ".claude" / "projects" / "proyecto"
            proyecto.mkdir(parents=True)
            sesion = proyecto / "sesion.jsonl"
            shutil.copy2(FIXTURES / "claude-session.jsonl", sesion)
            journal = proyecto / "workflow-journal.jsonl"
            shutil.copy2(FIXTURES / "workflow-journal.jsonl", journal)
            subagente = proyecto / "subagents" / "agent.jsonl"
            subagente.parent.mkdir()
            shutil.copy2(FIXTURES / "claude-session.jsonl", subagente)
            workflow = proyecto / "workflows" / "workflow.jsonl"
            workflow.parent.mkdir()
            shutil.copy2(FIXTURES / "claude-session.jsonl", workflow)
            sesion_en_journals = proyecto / "journals" / "sesion-real.jsonl"
            sesion_en_journals.parent.mkdir()
            shutil.copy2(FIXTURES / "claude-session.jsonl", sesion_en_journals)

            with patch.object(colectores.Path, "home", return_value=home):
                encontradas = descubrir_sesiones()

        self.assertEqual(
            encontradas,
            sorted([sesion, subagente, workflow, sesion_en_journals]),
        )

    def test_leer_sesion_carga_el_jsonl_una_sola_vez(self):
        original = colectores._cargar_registros
        llamadas = 0

        def contar(path):
            nonlocal llamadas
            llamadas += 1
            return original(path)

        with patch.object(colectores, "_cargar_registros", side_effect=contar):
            mensajes = leer_sesion(FIXTURES / "claude-session.jsonl")

        self.assertTrue(mensajes)
        self.assertEqual(llamadas, 1)

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

    def test_claude_omite_thinking_y_acota_tool_use_con_metadata_segura(self):
        entrada_grande = "API_KEY=secreto-" + "x" * 8_000
        resultado_grande = "resultado-" + "y" * 8_000
        registros = [
            {
                "type": "assistant",
                "uuid": "66666666-6666-6666-6666-666666666666",
                "timestamp": "2026-08-08T12:00:02Z",
                "message": {
                    "content": [
                        {"type": "text", "text": "Respuesta visible"},
                        {"type": "thinking", "thinking": "razonamiento secreto"},
                        {
                            "type": "tool_use",
                            "id": "toolu_123",
                            "name": "Bash",
                            "input": {"command": entrada_grande},
                        },
                        {"type": "tool_result", "content": resultado_grande},
                    ]
                },
            }
        ]
        path = self._crear_fixture_temporal(
            "\n".join(json.dumps(registro) for registro in registros) + "\n"
        )
        self.addCleanup(path.unlink)

        mensajes = leer_claude(path)

        self.assertEqual(
            [mensaje.autor for mensaje in mensajes], ["assistant", "tool", "tool"]
        )
        self.assertEqual(mensajes[0].texto, "Respuesta visible")
        self.assertEqual(mensajes[1].tipo, "tool_use")
        self.assertEqual(mensajes[1].metadata["tool_name"], "Bash")
        self.assertRegex(mensajes[1].metadata["sha256"], r"^[0-9a-f]{64}$")
        self.assertLessEqual(len(mensajes[1].texto), 256)
        self.assertNotIn("secreto", mensajes[1].texto)
        self.assertNotIn(
            "razonamiento", "\n".join(mensaje.texto for mensaje in mensajes)
        )
        self.assertLess(len(mensajes[2].texto), 2_000)

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
