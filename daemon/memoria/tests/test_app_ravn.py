"""Resolución operativa read-only para la memoria compartida."""

from __future__ import annotations

import json
import unittest

from daemon.memoria.app_ravn import BackendSupabaseJobs, ResolverAppRavn


class BackendFalso:
    def __init__(self, filas=None, error: Exception | None = None):
        self.filas = filas or {}
        self.error = error
        self.llamadas: list[tuple[str, tuple[str, ...]]] = []

    def seleccionar(self, tabla: str, campos: tuple[str, ...]):
        self.llamadas.append((tabla, campos))
        if self.error:
            raise self.error
        return self.filas.get(tabla, [])


class ResolverAppRavnTests(unittest.TestCase):
    def test_obra_canonicaliza_uuid_de_obra_a_presupuesto(self) -> None:
        backend = BackendFalso(
            {
                "presupuestos": [
                    {
                        "id": "11111111-1111-4111-8111-111111111111",
                        "nombre_obra": "Garage Glorietas",
                        "nombre_cliente": "Asociación Civil",
                        "estado": "borrador",
                        "presupuesto_aprobado": False,
                        "fecha": "2026-08-08",
                        "created_at": "2026-08-08T10:00:00Z",
                    }
                ],
                "obras": [
                    {
                        "id": "22222222-2222-4222-8222-222222222222",
                        "presupuesto_id": "11111111-1111-4111-8111-111111111111",
                        "created_at": "2026-08-08T11:00:00Z",
                        "updated_at": "2026-08-08T12:00:00Z",
                        "finalizada_at": None,
                        "cobranza_cerrada_at": None,
                    }
                ],
            }
        )

        resultado = ResolverAppRavn(backend).resolver(
            {"obras": ["22222222-2222-4222-8222-222222222222"]}
        )

        self.assertEqual(resultado.estado, "ok")
        self.assertEqual(
            resultado.referencias[0].presupuesto_id,
            "11111111-1111-4111-8111-111111111111",
        )
        self.assertEqual(resultado.referencias[0].autoridad, "operativa")
        self.assertEqual(resultado.referencias[0].coincidencia, "uuid")

    def test_nombre_de_obra_ambiguo_no_elije_una_identidad(self) -> None:
        backend = BackendFalso(
            {
                "presupuestos": [
                    {"id": "p-1", "nombre_obra": "Garage", "nombre_cliente": "A"},
                    {"id": "p-2", "nombre_obra": " GÁRAGE ", "nombre_cliente": "B"},
                ],
                "obras": [],
            }
        )

        resultado = ResolverAppRavn(backend).resolver({"obras": ["garage"]})

        self.assertEqual(resultado.estado, "ambigua")
        self.assertEqual(resultado.referencias, [])
        self.assertEqual(resultado.ambiguas[0]["tipo"], "obras")
        self.assertEqual(resultado.ambiguas[0]["cantidad"], 2)

    def test_cliente_agrupa_presupuestos_y_diagnosticos_del_mismo_nombre(self) -> None:
        backend = BackendFalso(
            {
                "presupuestos": [
                    {"id": "p-1", "nombre_obra": "Garage", "nombre_cliente": "Las Glorietas"},
                    {"id": "p-2", "nombre_obra": "Puente", "nombre_cliente": "las glorietas"},
                ],
                "diagnosticos": [
                    {
                        "id": "d-1",
                        "titulo": "Diagnóstico",
                        "cliente": "Las Glorietas",
                        "presupuesto_id": "p-1",
                    }
                ],
            }
        )

        resultado = ResolverAppRavn(backend).resolver({"clientes": ["LAS GLORIETAS"]})

        self.assertEqual(resultado.estado, "ok")
        self.assertEqual(len(resultado.referencias), 1)
        self.assertEqual(resultado.referencias[0].tipo, "clientes")
        self.assertEqual(resultado.referencias[0].metadata["presupuesto_ids"], ["p-1", "p-2"])
        self.assertEqual(resultado.referencias[0].metadata["diagnostico_ids"], ["d-1"])

    def test_documentos_devuelven_solo_metadata_minima_sin_paths_ni_contenido(self) -> None:
        backend = BackendFalso(
            {
                "diagnosticos": [
                    {
                        "id": "d-1",
                        "creado_at": "2026-08-08T10:00:00Z",
                        "actualizado_at": "2026-08-08T11:00:00Z",
                        "titulo": "Diagnóstico Garage",
                        "direccion": "Nordelta",
                        "cliente": "Glorietas",
                        "estado": "borrador",
                        "presupuesto_id": "p-1",
                        "cotizacion_id": None,
                        "contenido": {"secreto": True},
                        "relevamiento": "no debe salir",
                        "foto_portada_path": "privado/x.jpg",
                    }
                ],
                "obra_archivos": [],
                "cotizacion_archivos": [],
            }
        )

        resultado = ResolverAppRavn(backend).resolver(
            {"documentos": ["Diagnostico Garage"]}
        )
        serializado = json.dumps(resultado.a_dict(), ensure_ascii=False)

        self.assertEqual(resultado.estado, "ok")
        self.assertNotIn("contenido", serializado)
        self.assertNotIn("relevamiento", serializado)
        self.assertNotIn("storage", serializado)
        self.assertNotIn("privado", serializado)
        campos_consultados = dict(backend.llamadas)["diagnosticos"]
        self.assertNotIn("contenido", campos_consultados)
        self.assertNotIn("relevamiento", campos_consultados)
        self.assertNotIn("foto_portada_path", campos_consultados)

    def test_backend_no_disponible_no_equivale_a_sin_coincidencia(self) -> None:
        resultado = ResolverAppRavn(BackendFalso(error=OSError("sin red"))).resolver(
            {"cotizaciones": ["Garage"]}
        )

        self.assertEqual(resultado.estado, "no_disponible")
        self.assertEqual(resultado.referencias, [])

    def test_input_hostil_no_controla_tabla_ni_campos(self) -> None:
        backend = BackendFalso({"cotizaciones": []})
        ResolverAppRavn(backend).resolver(
            {"cotizaciones": ["x&select=ficha;drop table cotizaciones"]}
        )

        self.assertEqual([tabla for tabla, _ in backend.llamadas], ["cotizaciones"])
        self.assertNotIn("ficha", backend.llamadas[0][1])
        self.assertNotIn("x&select", "".join(backend.llamadas[0][1]))

    def test_backend_productivo_es_lazy_y_solo_hace_get_con_select_allowlisted(self) -> None:
        llamadas: list[tuple[str, str]] = []
        cfg = {"SUPABASE_URL": "https://x", "SUPABASE_ANON_KEY": "anon"}

        def rest_falso(cfg_recibida, token, path, data=None, method="GET"):
            self.assertIs(cfg_recibida, cfg)
            self.assertEqual(token, "token-auth")
            self.assertIsNone(data)
            llamadas.append((path, method))
            return []

        backend = BackendSupabaseJobs(
            cargar_cfg=lambda: cfg,
            autenticar=lambda recibido: "token-auth",
            rest=rest_falso,
        )
        self.assertEqual(llamadas, [])

        backend.seleccionar("cotizaciones", ("id", "titulo", "estado"))

        self.assertEqual(len(llamadas), 1)
        self.assertEqual(llamadas[0][1], "GET")
        self.assertTrue(llamadas[0][0].startswith("cotizaciones?select="))
        self.assertNotIn("service_role", llamadas[0][0])


if __name__ == "__main__":
    unittest.main()
