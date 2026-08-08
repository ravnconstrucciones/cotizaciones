"""Contrato de recuperación de memoria acotada."""

from __future__ import annotations

from dataclasses import replace
import io
import json
import multiprocessing
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from daemon.memoria import cli
from daemon.memoria.almacen import AlmacenMemoria
from daemon.memoria.modelo import Cierre
from daemon.memoria.recuperar import ConsultaMemoria, recuperar


def _reindexar_despues_de_escanear(
    vault: str,
    escaneo_listo: multiprocessing.synchronize.Event,
    continuar: multiprocessing.synchronize.Event,
) -> None:
    """Congela un reindexado tras leer para ejercer el orden de locks real."""
    import daemon.memoria.recuperar as modulo

    original = modulo._cierres_validados

    def escanear_y_esperar(ruta: Path):
        resultado = original(ruta)
        escaneo_listo.set()
        continuar.wait(timeout=5)
        return resultado

    with patch.object(modulo, "_cierres_validados", side_effect=escanear_y_esperar):
        modulo.reindexar(Path(vault))


def _guardar_cierre_en_proceso(
    vault: str,
    cierre: Cierre,
    iniciado: multiprocessing.synchronize.Event,
    terminado: multiprocessing.synchronize.Event,
) -> None:
    iniciado.set()
    AlmacenMemoria(Path(vault)).guardar_cierre(cierre)
    terminado.set()


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
        self.assertEqual(paquete.procedencia, ["cierre"])
        self.assertIn("entidad:Glorietas", paquete.notas[0].razones)

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

        paquete = recuperar(ConsultaMemoria("garage", ["Glorietas"], max_tokens=300), self.vault)

        self.assertEqual(paquete.notas[0].entidades["obras"], ["Otra obra"])
        self.assertLessEqual(paquete.tokens_estimados, 300)

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

    def test_recuperacion_no_reexpone_secretos_de_entidades_o_razones(self) -> None:
        ruta = self.almacen.guardar_cierre(
            _cierre(cierre_id="entidad-secreta", tema="Garage", entidades=["Glorietas"])
        )
        ruta.write_text(
            ruta.read_text(encoding="utf-8").replace(
                '["Glorietas"]', '["OPENAI_API_KEY=secreto-entidad"]'
            ),
            encoding="utf-8",
        )

        paquete = recuperar(
            ConsultaMemoria("garage", ["OPENAI_API_KEY=secreto-entidad"]), self.vault
        )
        serializado = json.dumps(paquete.a_dict(), ensure_ascii=False)

        self.assertEqual(paquete.notas[0].entidades["obras"], ["OPENAI_API_KEY=[REDACTADO]"])
        self.assertNotIn("secreto-entidad", serializado)

    def test_presupuesto_cuenta_el_json_final_con_metadata_extensa(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="metadata-extensa",
                tema="Garage",
                entidades=["Entidad de metadata " * 30],
                hechos=["Corta."],
            )
        )

        paquete = recuperar(ConsultaMemoria("garage", [], max_tokens=100), self.vault)
        serializado = json.dumps(paquete.a_dict(), ensure_ascii=False)

        self.assertEqual(paquete.tokens_estimados, (len(serializado) + 3) // 4)
        self.assertLessEqual(paquete.tokens_estimados, 100)
        self.assertEqual(paquete.notas, [])

    def test_round_trip_admite_item_multilinea_emitido_por_cierre_a_markdown(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="multilinea",
                tema="Garage",
                entidades=["Glorietas"],
                hechos=["Primera línea.\n# Segunda línea emitida por el cierre."],
            )
        )

        paquete = recuperar(ConsultaMemoria("garage", []), self.vault)

        self.assertIn("# Segunda línea emitida por el cierre.", paquete.notas[0].contenido)

    def test_contexto_conserva_los_encabezados_y_listas_canonicas(self) -> None:
        cierre = replace(
            _cierre(
                cierre_id="secciones",
                tema="Garage",
                entidades=["Glorietas"],
                hechos=["Hecho confirmado."],
            ),
            decisiones=["Decisión tomada."],
            pendientes=["Pendiente abierto."],
        )
        self.almacen.guardar_cierre(cierre)

        paquete = recuperar(ConsultaMemoria("garage", [], max_tokens=300), self.vault)

        self.assertIn("## Hechos confirmados\n- Hecho confirmado.", paquete.notas[0].contenido)
        self.assertIn("## Decisiones\n- Decisión tomada.", paquete.notas[0].contenido)
        self.assertIn("## Pendientes\n- Pendiente abierto.", paquete.notas[0].contenido)

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
        self.assertIn("vecino:Glorietas", paquete.notas[0].razones)

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

    def test_reindexar_no_pisa_un_cierre_guardado_durante_su_reconstruccion(self) -> None:
        contexto = multiprocessing.get_context("fork")
        escaneo_listo = contexto.Event()
        continuar = contexto.Event()
        escritor_iniciado = contexto.Event()
        escritor_terminado = contexto.Event()
        cierre = _cierre(cierre_id="concurrente", tema="Garage", entidades=["Glorietas"])
        reindexado = contexto.Process(
            target=_reindexar_despues_de_escanear,
            args=(str(self.vault), escaneo_listo, continuar),
        )
        escritor = contexto.Process(
            target=_guardar_cierre_en_proceso,
            args=(str(self.vault), cierre, escritor_iniciado, escritor_terminado),
        )
        reindexado.start()
        self.assertTrue(escaneo_listo.wait(timeout=5))
        escritor.start()
        self.assertTrue(escritor_iniciado.wait(timeout=5))
        self.assertFalse(escritor_terminado.wait(timeout=0.2))
        continuar.set()
        reindexado.join(timeout=10)
        escritor.join(timeout=10)
        self.assertEqual(reindexado.exitcode, 0)
        self.assertEqual(escritor.exitcode, 0)

        indice = json.loads(
            (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        )
        self.assertIn("glorietas", indice["entidades"])


if __name__ == "__main__":
    unittest.main()
