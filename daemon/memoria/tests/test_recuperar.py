"""Contrato de recuperación de memoria acotada."""

from __future__ import annotations

import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from daemon.memoria import cli
from daemon.memoria.almacen import AlmacenMemoria
from daemon.memoria.modelo import Cierre
from daemon.memoria.recuperar import ConsultaMemoria, recuperar


def _cierre(
    *,
    cierre_id: str,
    tema: str,
    entidades: list[str],
    estado: str = "completo",
    hechos: list[str] | None = None,
) -> Cierre:
    return Cierre(
        id=cierre_id,
        host="codex",
        thread_id=cierre_id,
        fecha_inicio="2026-08-08T10:00:00-03:00",
        fecha_cierre="2026-08-08T11:00:00-03:00",
        tema=tema,
        estado=estado,
        entidades=entidades,
        hechos=hechos or [],
        decisiones=[],
        metodos=[],
        cambios=[],
        pendientes=[],
        separaciones=[],
        enlaces=[],
        fuente_cruda=f"session://codex/{cierre_id}",
        sensibilidad="normal",
    )


class RecuperarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.vault = Path(self.tempdir.name)
        self.almacen = AlmacenMemoria(self.vault)

    def test_prioriza_entidad_exacta_y_respeta_presupuesto(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="glorietas",
                tema="Garage de adoquines",
                entidades=["Glorietas"],
                hechos=["El garage usa adoquines intertrabados vehiculares."],
            )
        )
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="otro",
                tema="Garage de adoquines",
                entidades=["Otra obra"],
                hechos=["Una nota con las mismas palabras pero sin la entidad."],
            )
        )

        paquete = recuperar(
            ConsultaMemoria("garage adoquines", ["Glorietas"], max_tokens=120), self.vault
        )

        self.assertEqual(paquete.notas[0].entidades["obras"], ["Glorietas"])
        self.assertLessEqual(paquete.tokens_estimados, 120)
        self.assertEqual(paquete.notas[0].ruta, paquete.procedencia[0]["ruta"])
        self.assertIn("entidad_exacta:Glorietas", paquete.notas[0].razones)

    def test_no_abre_crudo_por_defecto(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="cierre-garage",
                tema="Garage",
                entidades=["Glorietas"],
                hechos=["El cierre permitido."],
            )
        )
        crudo = self.vault / "Conversaciones/crudo/2026/08/sesion.md"
        crudo.parent.mkdir(parents=True)
        crudo.write_text("# Garage secreto que no debe recuperarse", encoding="utf-8")

        paquete = recuperar(ConsultaMemoria("garage", []), self.vault)

        self.assertFalse(any("Conversaciones/crudo" in nota.ruta for nota in paquete.notas))
        self.assertEqual(len(paquete.notas), 1)

    def test_presupuesto_detiene_la_seleccion_antes_de_una_nota_menos_relevante(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="principal",
                tema="Garage",
                entidades=["Glorietas"],
                hechos=["Detalle técnico " * 100],
            )
        )
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="secundaria",
                tema="Garage",
                entidades=["Otra obra"],
                hechos=["Una nota corta."],
            )
        )

        paquete = recuperar(ConsultaMemoria("garage", ["Glorietas"], max_tokens=50), self.vault)

        self.assertEqual(paquete.notas, [])
        self.assertEqual(paquete.tokens_estimados, 0)

    def test_recuperacion_no_reexpone_secretos_de_un_cierre_manual(self) -> None:
        ruta = self.almacen.guardar_cierre(
            _cierre(
                cierre_id="secreto",
                tema="Garage",
                entidades=["Glorietas"],
                hechos=["El cierre permitido."],
            )
        )
        ruta.write_text(
            ruta.read_text(encoding="utf-8").replace(
                "El cierre permitido.", "OPENAI_API_KEY=secreto-no-publicable"
            ),
            encoding="utf-8",
        )

        paquete = recuperar(ConsultaMemoria("garage", []), self.vault)

        self.assertNotIn("secreto-no-publicable", paquete.notas[0].contenido)
        self.assertIn("[REDACTADO]", paquete.notas[0].contenido)

    def test_suma_vecino_de_graphify_como_procedencia(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(cierre_id="vecina", tema="Patio", entidades=["Glorietas"])
        )
        grafo = self.vault / "Sistema/Graphify/grafo-app.json"
        grafo.parent.mkdir(parents=True)
        grafo.write_text(
            json.dumps(
                {
                    "nodes": [{"id": "a", "label": "Casa Central"}, {"id": "b", "label": "Glorietas"}],
                    "links": [{"source": "a", "target": "b"}],
                }
            ),
            encoding="utf-8",
        )

        paquete = recuperar(ConsultaMemoria("", ["Casa Central"]), self.vault)

        self.assertEqual(paquete.notas[0].ruta.split("/")[0:2], ["Conversaciones", "cierres"])
        self.assertIn("vecino_graphify:Glorietas", paquete.notas[0].razones)

    def test_cli_recuperar_emite_json_y_reindexar_descarta_markdown_no_validado(self) -> None:
        cierre_path = self.almacen.guardar_cierre(
            _cierre(cierre_id="reindexable", tema="Patio", entidades=["Glorietas"])
        )
        invalido = self.vault / "Conversaciones/cierres/2026/08/invalido.md"
        invalido.write_text("---\nentidades: [\"Secreto\"]\n---\n", encoding="utf-8")
        indice = self.vault / "Sistema/Memoria/indices/entidades.json"
        indice.write_text(json.dumps({"entidades": {"fantasma": [{"ruta": "x"}]}}), encoding="utf-8")

        with patch("sys.stdout", new_callable=io.StringIO) as stdout:
            codigo = cli.main(
                ["recuperar", "--vault", str(self.vault), "--query", "patio", "--entidad", "Glorietas"]
            )
        salida = json.loads(stdout.getvalue())
        self.assertEqual(codigo, 0)
        self.assertEqual(salida["notas"][0]["ruta"], cierre_path.relative_to(self.vault).as_posix())

        with patch("sys.stdout", new_callable=io.StringIO) as stdout:
            codigo = cli.main(["reindexar", "--vault", str(self.vault)])
        evidencia = json.loads(stdout.getvalue())
        reconstruido = json.loads(indice.read_text(encoding="utf-8"))
        self.assertEqual(codigo, 0)
        self.assertTrue(evidencia["ok"])
        self.assertIn("glorietas", reconstruido["entidades"])
        self.assertNotIn("fantasma", reconstruido["entidades"])
        self.assertNotIn("secreto", reconstruido["entidades"])

    def test_reindexar_ignora_cierre_con_seccion_no_canonica(self) -> None:
        ruta = self.almacen.guardar_cierre(
            _cierre(cierre_id="alterado", tema="Patio", entidades=["Glorietas"])
        )
        ruta.write_text(
            ruta.read_text(encoding="utf-8").replace(
                "## Decisiones", "## Sección inyectada\n- dato no validado\n\n## Decisiones"
            ),
            encoding="utf-8",
        )

        with patch("sys.stdout", new_callable=io.StringIO):
            codigo = cli.main(["reindexar", "--vault", str(self.vault)])

        indice = json.loads(
            (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        )
        self.assertEqual(codigo, 0)
        self.assertNotIn("glorietas", indice["entidades"])


if __name__ == "__main__":
    unittest.main()
