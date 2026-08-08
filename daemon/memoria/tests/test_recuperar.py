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
from daemon.memoria.app_ravn import ResolverAppRavn
from daemon.memoria.app_ravn import ResultadoApp


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
        entidades={
            "obras": entidades,
            "clientes": [],
            "cotizaciones": [],
            "documentos": [],
        },
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
            ConsultaMemoria("garage adoquines", ["Glorietas"], max_tokens=420), self.vault
        )

        self.assertEqual(paquete.notas[0].entidades["obras"], ["Glorietas"])
        self.assertLessEqual(paquete.tokens_estimados, 420)
        self.assertEqual(paquete.procedencia[0]["fuente"], "indice_vault")
        self.assertIn("obras:Glorietas", paquete.notas[0].razones)

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

    def test_referencias_app_no_exponen_paths_locales(self) -> None:
        cierre = replace(
            _cierre(
                cierre_id="refs-seguras",
                tema="Garage",
                entidades=["Glorietas"],
            ),
            enlaces=[
                "/Users/ezeotero/privado/video.mov",
                "/cotizaciones/cot-1",
                "app://obra/obra-1",
            ],
        )
        self.almacen.guardar_cierre(cierre)

        paquete = recuperar(ConsultaMemoria("garage", ["Glorietas"]), self.vault)

        self.assertNotIn("/Users/ezeotero/privado/video.mov", paquete.app_refs)
        self.assertIn("/cotizaciones/cot-1", paquete.app_refs)
        self.assertIn("app://obra/obra-1", paquete.app_refs)

    def test_presupuesto_no_rellena_con_una_entidad_ajena(self) -> None:
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

        paquete = recuperar(ConsultaMemoria("garage", ["Glorietas"], max_tokens=560), self.vault)

        self.assertEqual(paquete.notas, [])
        self.assertLessEqual(paquete.tokens_estimados, 560)

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
                '"obras": ["Glorietas"]',
                '"obras": ["OPENAI_API_KEY=secreto-entidad"]',
            ),
            encoding="utf-8",
        )

        paquete = recuperar(ConsultaMemoria("garage", []), self.vault)
        serializado = json.dumps(paquete.a_dict(), ensure_ascii=False)

        self.assertEqual(paquete.notas[0].entidades["obras"], ["OPENAI_API_KEY=[REDACTADO]"])
        self.assertNotIn("secreto-entidad", serializado)

    def test_recuperacion_conserva_tipos_en_entidades_y_razones(self) -> None:
        cierre = replace(
            _cierre(cierre_id="tipado", tema="Documento de obra", entidades=["Glorietas"]),
            entidades={
                "obras": ["Glorietas"],
                "clientes": ["Asociación Civil"],
                "cotizaciones": ["COT-0042"],
                "documentos": ["REM-0004"],
            },
        )
        self.almacen.guardar_cierre(cierre)

        paquete = recuperar(ConsultaMemoria("", ["REM-0004"]), self.vault)

        self.assertEqual(paquete.notas[0].entidades, cierre.entidades)
        self.assertIn("documentos:REM-0004", paquete.notas[0].razones)
        indice = json.loads(
            (self.vault / "Sistema/Memoria/indices/entidades.json").read_text(encoding="utf-8")
        )
        self.assertEqual(indice["entidades"]["rem-0004"][0]["origen"], "documentos")

    def test_confianza_nunca_es_negativa_por_antiguedad(self) -> None:
        cierre = replace(
            _cierre(
                cierre_id="antiguo",
                tema="Sin coincidencia",
                entidades=[],
                hechos=["palabraunica"],
            ),
            fecha_inicio="1900-01-01T10:00:00Z",
            fecha_cierre="1900-01-01T11:00:00Z",
        )
        self.almacen.guardar_cierre(cierre)

        paquete = recuperar(ConsultaMemoria("palabraunica", []), self.vault)

        self.assertEqual(paquete.confianza, 0.0)

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

    def test_contexto_indenta_item_multilinea_y_respeta_presupuesto_json(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="multilinea",
                tema="Garage",
                entidades=["Glorietas"],
                hechos=["Primera\n## Decisiones\n## Sección inyectada"],
            )
        )

        max_tokens = 300
        paquete = recuperar(
            ConsultaMemoria("garage", [], max_tokens=max_tokens), self.vault
        )
        serializado = json.dumps(paquete.a_dict(), ensure_ascii=False)

        self.assertIn(
            "## Hechos confirmados\n- Primera\n  ## Decisiones\n  ## Sección inyectada\n",
            paquete.notas[0].contenido,
        )
        self.assertEqual(paquete.tokens_estimados, (len(serializado) + 3) // 4)
        self.assertLessEqual(paquete.tokens_estimados, max_tokens)

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
        self.assertIn("vecino_obras:Glorietas", paquete.notas[0].razones)

    def test_cli_recuperar_emite_json_y_reindexar_descarta_markdown_no_validado(self) -> None:
        cierre_path = self.almacen.guardar_cierre(
            _cierre(cierre_id="reindexable", tema="Patio", entidades=["Glorietas"])
        )
        invalido = self.vault / "Conversaciones/cierres/2026/08/invalido.md"
        invalido.write_text("---\nentidades: [\"Secreto\"]\n---\n", encoding="utf-8")
        indice = self.vault / "Sistema/Memoria/indices/entidades.json"
        with patch("sys.stdout", new_callable=io.StringIO) as stdout:
            codigo = cli.main(
                [
                    "recuperar",
                    "--vault",
                    str(self.vault),
                    "--query",
                    "patio",
                    "--entidad",
                    "Glorietas",
                    "--sin-app",
                ]
            )
        salida = json.loads(stdout.getvalue())
        self.assertEqual(codigo, 0)
        self.assertEqual(salida["notas"][0]["ruta"], cierre_path.relative_to(self.vault).as_posix())

        indice.write_text(
            json.dumps({"entidades": {"fantasma": [{"ruta": "x"}]}}),
            encoding="utf-8",
        )

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

    def test_reindexar_rechaza_heading_inyectado_sin_indentacion_dentro_de_bullet(self) -> None:
        ruta = self.almacen.guardar_cierre(
            _cierre(
                cierre_id="alterado-con-bullet",
                tema="Patio",
                entidades=["Glorietas"],
                hechos=["Hecho real."],
            )
        )
        ruta.write_text(
            ruta.read_text(encoding="utf-8").replace(
                "\n\n## Decisiones", "\n## Sección inyectada\n- dato malicioso\n\n## Decisiones"
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

    def test_indice_ausente_degrada_explicito_sin_escanear_corpus(self) -> None:
        cierre = self.vault / "Conversaciones/cierres/2026/08/no-indexado.md"
        cierre.parent.mkdir(parents=True)
        cierre.write_text("garage que no debe abrirse", encoding="utf-8")

        with patch(
            "daemon.memoria.recuperar._leer_cierre_validado",
            side_effect=AssertionError("no debe abrir cierres sin índice"),
        ):
            paquete = recuperar(ConsultaMemoria("garage", []), self.vault)

        self.assertEqual(paquete.indice_estado, "no_disponible")
        self.assertEqual(paquete.notas, [])

    def test_recuperacion_abre_solo_rutas_sembradas_por_indice(self) -> None:
        indexada = self.almacen.guardar_cierre(
            _cierre(cierre_id="indexada", tema="Garage", entidades=["Glorietas"])
        )
        no_indexada = self.vault / "Conversaciones/cierres/2026/08/fuera.md"
        no_indexada.write_text(indexada.read_text(encoding="utf-8"), encoding="utf-8")
        import daemon.memoria.recuperar as modulo

        original = modulo._leer_cierre_validado
        abiertas: list[Path] = []

        def registrar(vault: Path, ruta: Path):
            abiertas.append(ruta)
            return original(vault, ruta)

        with patch.object(modulo, "_leer_cierre_validado", side_effect=registrar):
            paquete = recuperar(ConsultaMemoria("garage", []), self.vault)

        self.assertEqual([ruta.resolve() for ruta in abiertas], [indexada.resolve()])
        self.assertEqual(len(paquete.notas), 1)

    def test_app_operativa_aparece_primero_y_vault_queda_historico(self) -> None:
        self.almacen.guardar_cierre(
            _cierre(
                cierre_id="estado-viejo",
                tema="Garage Glorietas",
                entidades=["Garage Glorietas"],
                hechos=["La cotización seguía en borrador."],
            )
        )

        class Backend:
            def seleccionar(self, tabla, _campos):
                if tabla == "presupuestos":
                    return [
                        {
                            "id": "11111111-1111-4111-8111-111111111111",
                            "nombre_obra": "Garage Glorietas",
                            "nombre_cliente": "Asociación Civil",
                            "estado": "aprobado",
                            "presupuesto_aprobado": True,
                            "fecha": "2026-08-08",
                        }
                    ]
                if tabla == "obras":
                    return []
                return []

        consulta = ConsultaMemoria(
            "estado garage",
            [],
            max_tokens=800,
            entidades_tipadas={"obras": ["Garage Glorietas"]},
        )
        paquete = recuperar(consulta, self.vault, resolver_app=ResolverAppRavn(Backend()))

        self.assertEqual(paquete.app["estado"], "ok")
        self.assertEqual(paquete.procedencia[0]["fuente"], "app_ravn")
        self.assertEqual(paquete.notas[0].autoridad, "historica")
        self.assertEqual(paquete.notas[0].coincidencia, "entidad_exacta")
        self.assertLessEqual(paquete.tokens_estimados, 800)

    def test_cli_acepta_entidades_tipadas_y_construye_resolver_lazy(self) -> None:
        class ResolverFalso:
            def resolver(self, entidades):
                self.entidades = entidades
                return ResultadoApp("sin_coincidencia", [])

        resolver = ResolverFalso()
        with (
            patch("daemon.memoria.cli._crear_resolver_app", return_value=resolver),
            patch("sys.stdout", new_callable=io.StringIO) as stdout,
        ):
            codigo = cli.main(
                [
                    "recuperar",
                    "--vault",
                    str(self.vault),
                    "--query",
                    "garage",
                    "--obra",
                    "Garage Glorietas",
                    "--cliente",
                    "Asociación Civil",
                ]
            )

        salida = json.loads(stdout.getvalue())
        self.assertEqual(codigo, 0)
        self.assertEqual(
            resolver.entidades,
            {
                "obras": ["Garage Glorietas"],
                "clientes": ["Asociación Civil"],
                "cotizaciones": [],
                "documentos": [],
            },
        )
        self.assertEqual(salida["app"]["estado"], "sin_coincidencia")

    def test_limites_no_permiten_superar_ocho_notas_o_tres_mil_tokens(self) -> None:
        with self.assertRaises(ValueError):
            ConsultaMemoria("x", [], max_notas=9)
        with self.assertRaises(ValueError):
            ConsultaMemoria("x", [], max_tokens=3001)


if __name__ == "__main__":
    unittest.main()
