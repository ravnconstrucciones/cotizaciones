"""Contrato público del modelo canónico de cierres."""

from __future__ import annotations

import json
from pathlib import Path
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
        "entidades": {
            "obras": ["Las Glorietas"],
            "clientes": ["RAVN"],
            "cotizaciones": [],
            "documentos": [],
        },
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

    def test_redacta_encabezados_sensibles_como_claves_json_y_yaml(self):
        texto = (
            '{"Authorization":"Basic abc==","Proxy-Authorization":"Token xyz",'
            '"Cookie":"sesion=abc","Set-Cookie":"refresh=def"}\n'
            "Authorization: Bearer token-123\n"
            "'Proxy-Authorization': 'Basic cHJveHk='\n"
            '"Cookie": session=ghi\n'
            "Set-Cookie: refresh=jkl; HttpOnly"
        )

        redactado = redactar_secretos(texto)

        for secreto in ("abc==", "xyz", "sesion=abc", "refresh=def", "token-123", "cHJveHk=", "session=ghi", "refresh=jkl"):
            self.assertNotIn(secreto, redactado)
        self.assertEqual(redactado.count("[REDACTADO]"), 8)

    def test_redacta_encabezados_en_secuencias_yaml_sin_consumir_otros_items(self):
        texto = (
            "headers:\n"
            "  - Cookie: session=abc; theme=dark\n"
            '  - "Authorization": Basic dXNlcjpwYXNz\n'
            "  - 'Proxy-Authorization': 'Digest secreto-proxy'\n"
            "  - Set-Cookie: refresh=def; HttpOnly\n"
            "  - obra: Las Glorietas"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "headers:\n"
            "  - Cookie: [REDACTADO]\n"
            '  - "Authorization": [REDACTADO]\n'
            "  - 'Proxy-Authorization': '[REDACTADO]'\n"
            "  - Set-Cookie: [REDACTADO]\n"
            "  - obra: Las Glorietas",
        )

    def test_redacta_encabezados_en_mapping_inline_sin_consumir_campos_vecinos(self):
        texto = (
            "headers: {Authorization: Bearer token-a, "
            '"Proxy-Authorization": "Basic token-b", '
            "Cookie: session=token-c,theme=dark, Set-Cookie: refresh=token-d, "
            "obra: Las Glorietas}"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "headers: {Authorization: [REDACTADO], "
            '"Proxy-Authorization": "[REDACTADO]", '
            "Cookie: [REDACTADO], Set-Cookie: [REDACTADO], "
            "obra: Las Glorietas}",
        )

    def test_redacta_los_cuatro_encabezados_en_flow_sequence_con_comas_internas(self):
        texto = (
            "headers: [Authorization: Basic token-a, "
            'Proxy-Authorization: "Digest token-b", '
            "Cookie: sid=token-c,theme=dark, "
            "Set-Cookie: refresh=token-d,part=2, obra: Las Glorietas]"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "headers: [Authorization: [REDACTADO], "
            'Proxy-Authorization: "[REDACTADO]", '
            "Cookie: [REDACTADO], "
            "Set-Cookie: [REDACTADO], obra: Las Glorietas]",
        )

    def test_matriz_adversarial_de_encabezados_preserva_forma_y_vecinos(self):
        casos = (
            ("Authorization: Token a", "Authorization: [REDACTADO]"),
            ('"Proxy-Authorization": "Basic b"', '"Proxy-Authorization": "[REDACTADO]"'),
            ("Cookie: sid=a,b", "Cookie: [REDACTADO]"),
            ("'Set-Cookie': 'sid=c,d'", "'Set-Cookie': '[REDACTADO]'"),
            (
                "- Authorization: Basic a\n- obra: Glorietas",
                "- Authorization: [REDACTADO]\n- obra: Glorietas",
            ),
            (
                '- "Cookie": "sid=a,b"\n- cliente: RAVN',
                '- "Cookie": "[REDACTADO]"\n- cliente: RAVN',
            ),
            (
                "{Set-Cookie: sid=a,b, documento: REM-0004}",
                "{Set-Cookie: [REDACTADO], documento: REM-0004}",
            ),
            (
                "['Authorization': 'Digest a,b', cotizacion: COT-0042]",
                "['Authorization': '[REDACTADO]', cotizacion: COT-0042]",
            ),
        )

        for original, esperado in casos:
            with self.subTest(original=original):
                self.assertEqual(redactar_secretos(original), esperado)

    def test_redaccion_de_encabezados_flow_es_idempotente(self):
        texto = (
            "headers: [Authorization: Basic token-a, Cookie: sid=a,b, "
            "obra: Las Glorietas]"
        )

        primera = redactar_secretos(texto)

        self.assertEqual(redactar_secretos(primera), primera)

    def test_redacta_claves_json_escapadas_sin_reescribir_el_documento(self):
        texto = (
            r'{"\u0041uthorization":"Bearer secret-auth",'
            r'"\u0050roxy-Authorization":"Basic secret-proxy",'
            r'"\u0043\u006F\u006F\u006B\u0069\u0065":"sid=secret-cookie",'
            r'"\u0053et-Cookie":"refresh=secret-set",'
            r'"obra-\uD83D\uDEE0":"Glorietas"}'
        )

        resultado = redactar_secretos(texto)

        self.assertEqual(
            resultado,
            r'{"\u0041uthorization":"[REDACTADO]",'
            r'"\u0050roxy-Authorization":"[REDACTADO]",'
            r'"\u0043\u006F\u006F\u006B\u0069\u0065":"[REDACTADO]",'
            r'"\u0053et-Cookie":"[REDACTADO]",'
            r'"obra-\uD83D\uDEE0":"Glorietas"}',
        )
        for secreto in ("secret-auth", "secret-proxy", "secret-cookie", "secret-set"):
            self.assertNotIn(secreto, resultado)

    def test_matriz_json_preserva_bytes_parseabilidad_y_semantica_de_vecinos(self):
        casos = (
            (
                r'{"\u0041uthorization":"Bearer secret-auth","salto":"linea\u000Afin"}',
                r'{"\u0041uthorization":"[REDACTADO]","salto":"linea\u000Afin"}',
                "Authorization",
            ),
            (
                r'{"\u0050roxy-Authorization":"Basic secret-proxy","comillas":"inicio\u0022fin\u0022"}',
                r'{"\u0050roxy-Authorization":"[REDACTADO]","comillas":"inicio\u0022fin\u0022"}',
                "Proxy-Authorization",
            ),
            (
                r'{"\u0043ookie":"sid=secret-cookie","ruta":"C:\\RAVN\\obra","literal":"\\u0041"}',
                r'{"\u0043ookie":"[REDACTADO]","ruta":"C:\\RAVN\\obra","literal":"\\u0041"}',
                "Cookie",
            ),
            (
                r'{"\u0053et-Cookie":"refresh=secret-set","vecino":{"barra":"\\\\servidor\\obra","lista":["uno","dos"]}}',
                r'{"\u0053et-Cookie":"[REDACTADO]","vecino":{"barra":"\\\\servidor\\obra","lista":["uno","dos"]}}',
                "Set-Cookie",
            ),
        )

        for original, esperado, clave_sensible in casos:
            with self.subTest(clave_sensible=clave_sensible):
                resultado = redactar_secretos(original)

                self.assertEqual(resultado, esperado)
                original_json = json.loads(original)
                resultado_json = json.loads(resultado)
                self.assertEqual(resultado_json[clave_sensible], "[REDACTADO]")
                self.assertEqual(
                    {
                        clave: valor
                        for clave, valor in resultado_json.items()
                        if clave != clave_sensible
                    },
                    {
                        clave: valor
                        for clave, valor in original_json.items()
                        if clave != clave_sensible
                    },
                )

    def test_redacta_claves_yaml_escapadas_hex_y_unicode_upper(self):
        texto = (
            "headers:\n"
            r'  "\x61UTHORIZATION": "Bearer secret-hex"' "\n"
            r'  "\U00000050roxy-Authorization": "Basic secret-upper"' "\n"
            r'  "\x43ookie": sid=secret-cookie' "\n"
            r'  "\U00000053et-Cookie": refresh=secret-set' "\n"
            "  'obra''detalle': 'Las Glorietas'"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "headers:\n"
            r'  "\x61UTHORIZATION": "[REDACTADO]"' "\n"
            r'  "\U00000050roxy-Authorization": "[REDACTADO]"' "\n"
            r'  "\x43ookie": [REDACTADO]' "\n"
            r'  "\U00000053et-Cookie": [REDACTADO]' "\n"
            "  'obra''detalle': 'Las Glorietas'",
        )

    def test_redacta_claves_escapadas_en_flow_arrays_y_objects(self):
        texto = (
            r'headers: [{"\u0041uthorization": "Bearer secret-object", obra: Glorietas}, '
            r'["\x50roxy-Authorization": "Basic secret-array", cliente: RAVN], '
            r'{"\U00000043ookie": sid=secret-cookie,theme=dark, estado: listo}, '
            r'{"\u0053et-Cookie": "refresh=secret-set", documento: REM-0004}]'
        )

        self.assertEqual(
            redactar_secretos(texto),
            r'headers: [{"\u0041uthorization": "[REDACTADO]", obra: Glorietas}, '
            r'["\x50roxy-Authorization": "[REDACTADO]", cliente: RAVN], '
            r'{"\U00000043ookie": [REDACTADO], estado: listo}, '
            r'{"\u0053et-Cookie": "[REDACTADO]", documento: REM-0004}]',
        )

    def test_redacta_claves_escapadas_con_valores_yaml_multilinea_y_block(self):
        texto = (
            "headers:\n"
            r'  "\u0041uthorization": |2-' "\n"
            "    Bearer secret-block\n"
            "    segunda-secret-block\n"
            r'  "\x50roxy-Authorization": "Digest secret-double\"quoted' "\n"
            '    segunda-secret-double"\n'
            r'  "\U00000053et-Cookie": >+2' "\n"
            "    sid=secret-folded\n"
            "    Path=/, HttpOnly\n"
            "  obra: Las Glorietas"
        )

        self.assertEqual(
            redactar_secretos(texto),
            "headers:\n"
            r'  "\u0041uthorization": [REDACTADO]' "\n"
            r'  "\x50roxy-Authorization": "[REDACTADO]"' "\n"
            r'  "\U00000053et-Cookie": [REDACTADO]' "\n"
            "  obra: Las Glorietas",
        )

    def test_candidatos_quoted_ordinarios_preservan_escapes_y_doblez_yaml(self):
        texto = (
            r'"Authoriza\"tion": "dato-quote"' "\n"
            r'"Authoriza\\tion": "dato-backslash"' "\n"
            "'Authoriza''tion': dato-single\n"
            r'"\u0041uthorization": "Bearer secret"'
        )

        self.assertEqual(
            redactar_secretos(texto),
            r'"Authoriza\"tion": "dato-quote"' "\n"
            r'"Authoriza\\tion": "dato-backslash"' "\n"
            "'Authoriza''tion': dato-single\n"
            r'"\u0041uthorization": "[REDACTADO]"',
        )

    def test_fail_close_para_claves_explicitas_yaml_block_y_flow(self):
        casos = (
            (
                "headers:\n"
                "  ? Authorization\n"
                "  : Basic secreto-explicito-bloque-r5\n"
                "  obra: Las Glorietas",
                "secreto-explicito-bloque-r5",
            ),
            (
                "headers: {? Proxy-Authorization: "
                "Digest secreto-explicito-flow-r5, obra: Las Glorietas}",
                "secreto-explicito-flow-r5",
            ),
        )

        for original, secreto in casos:
            with self.subTest(original=original):
                resultado = redactar_secretos(original)

                self.assertEqual(resultado, "[CONTENIDO SENSIBLE REDACTADO]")
                self.assertNotIn(secreto, resultado)

    def test_fail_close_para_claves_explicitas_escapadas(self):
        casos = (
            (
                "headers:\n"
                r'  ? "\u0041uthorization"' "\n"
                "  : Basic secreto-explicito-u-r5\n"
                "  obra: Las Glorietas",
                "secreto-explicito-u-r5",
            ),
            (
                r'headers: {? "\x43ookie": sid=secreto-explicito-x-r5, '
                "obra: Las Glorietas}",
                "secreto-explicito-x-r5",
            ),
            (
                "headers:\n"
                r'  ? "\U00000053et-Cookie"' "\n"
                "  : refresh=secreto-explicito-upper-r5\n"
                "  obra: Las Glorietas",
                "secreto-explicito-upper-r5",
            ),
        )

        for original, secreto in casos:
            with self.subTest(original=original):
                resultado = redactar_secretos(original)

                self.assertEqual(resultado, "[CONTENIDO SENSIBLE REDACTADO]")
                self.assertNotIn(secreto, resultado)

    def test_fail_close_para_headers_decorados_con_anchor_alias_o_tag(self):
        casos = (
            (
                "headers:\n"
                "  &header Authorization: Basic secreto-anchor-r5\n"
                "  obra: Las Glorietas",
                "secreto-anchor-r5",
            ),
            (
                "headers: {*Cookie: secreto-alias-r5, obra: Las Glorietas}",
                "secreto-alias-r5",
            ),
            (
                "headers:\n"
                "  !vault Set-Cookie: refresh=secreto-tag-r5\n"
                "  obra: Las Glorietas",
                "secreto-tag-r5",
            ),
        )

        for original, secreto in casos:
            with self.subTest(original=original):
                resultado = redactar_secretos(original)

                self.assertEqual(resultado, "[CONTENIDO SENSIBLE REDACTADO]")
                self.assertNotIn(secreto, resultado)

    def test_postcondicion_falla_cerrado_si_una_ocurrencia_queda_sin_mapear(self):
        texto = (
            "Authorization: Basic secreto-mapeado-r5\n"
            "nota: Cookie aparece fuera de un mapping con secreto-postcondicion-r5"
        )

        resultado = redactar_secretos(texto)

        self.assertEqual(resultado, "[CONTENIDO SENSIBLE REDACTADO]")
        self.assertNotIn("secreto-mapeado-r5", resultado)
        self.assertNotIn("secreto-postcondicion-r5", resultado)

    def test_postcondicion_escanea_menciones_dentro_de_tokens_quoted(self):
        casos = (
            (
                'nota: "se menciona Authorization junto a secreto-quoted-r5"',
                "secreto-quoted-r5",
            ),
            (
                r'nota: "se menciona \x43ookie junto a secreto-escaped-r5"',
                "secreto-escaped-r5",
            ),
        )

        for original, secreto in casos:
            with self.subTest(original=original):
                resultado = redactar_secretos(original)

                self.assertEqual(resultado, "[CONTENIDO SENSIBLE REDACTADO]")
                self.assertNotIn(secreto, resultado)

    def test_postcondicion_no_sobrerredacta_mappings_comunes(self):
        casos = (
            (
                "Authorization: Basic secreto-bloque-r5\nobra: Las Glorietas",
                "Authorization: [REDACTADO]\nobra: Las Glorietas",
            ),
            (
                "headers: {Cookie: sid=secreto-flow-r5, "
                "obra: Las Glorietas}",
                "headers: {Cookie: [REDACTADO], obra: Las Glorietas}",
            ),
            (
                r'{"\u0050roxy-Authorization":"Basic secreto-json-r5",'
                r'"vecino":"linea\u000Afin","ruta":"C:\\RAVN\\obra"}',
                r'{"\u0050roxy-Authorization":"[REDACTADO]",'
                r'"vecino":"linea\u000Afin","ruta":"C:\\RAVN\\obra"}',
            ),
        )

        for original, esperado in casos:
            with self.subTest(original=original):
                resultado = redactar_secretos(original)

                self.assertEqual(resultado, esperado)
                self.assertNotEqual(resultado, "[CONTENIDO SENSIBLE REDACTADO]")

    def test_redacta_headers_en_escalares_yaml_block_y_folded_completos(self):
        texto = (
            "headers:\n"
            "  Authorization: |2-\n"
            "    Bearer secret-block\n"
            "    segunda-secret-block\n"
            "  obra: Las Glorietas\n"
            "  Set-Cookie: >+2\n"
            "    sid=secret-folded\n"
            "    Path=/, HttpOnly\n"
            "  cliente: RAVN\n"
            "lista:\n"
            "  - Cookie: |-2\n"
            "      sid=secret-lista\n"
            "    obra.detalle: Piso\n"
            "  - cliente: RAVN"
        )

        resultado = redactar_secretos(texto)

        self.assertEqual(
            resultado,
            "headers:\n"
            "  Authorization: [REDACTADO]\n"
            "  obra: Las Glorietas\n"
            "  Set-Cookie: [REDACTADO]\n"
            "  cliente: RAVN\n"
            "lista:\n"
            "  - Cookie: [REDACTADO]\n"
            "    obra.detalle: Piso\n"
            "  - cliente: RAVN",
        )
        self.assertNotIn("secret-block", resultado)
        self.assertNotIn("secret-folded", resultado)
        self.assertNotIn("secret-lista", resultado)

    def test_redacta_headers_quoted_multiline_hasta_la_comilla_de_cierre(self):
        texto = (
            'Proxy-Authorization: "Digest secret-double\\"quoted\n'
            '  segunda-secret-double"\n'
            "obra: Las Glorietas\n"
            "Cookie: 'sid=secret-single\n"
            "  theme=segunda-secret-single'\n"
            "cliente: RAVN"
        )

        resultado = redactar_secretos(texto)

        self.assertEqual(
            resultado,
            'Proxy-Authorization: "[REDACTADO]"\n'
            "obra: Las Glorietas\n"
            "Cookie: '[REDACTADO]'\n"
            "cliente: RAVN",
        )
        for secreto in ("secret-double", "segunda-secret-double", "secret-single"):
            self.assertNotIn(secreto, resultado)

    def test_flow_anidado_preserva_claves_dotted_unicode_y_quoted_escapadas(self):
        texto = (
            r'documento: {headers: [Cookie: sid=secret-cookie,a=b:c, '
            r'"obra\u002Edetalle": Piso, Set-Cookie: refresh=secret-set,x=y:z, '
            r'🛠.estado: listo], área.obra: Cocina, cliente: RAVN}'
        )

        resultado = redactar_secretos(texto)

        self.assertEqual(
            resultado,
            'documento: {headers: [Cookie: [REDACTADO], '
            r'"obra\u002Edetalle": Piso, Set-Cookie: [REDACTADO], '
            '🛠.estado: listo], área.obra: Cocina, cliente: RAVN}',
        )
        self.assertNotIn("secret-cookie", resultado)
        self.assertNotIn("secret-set", resultado)

    def test_flow_ambiguo_redacta_hasta_el_cierre_sin_filtrar_fragmentos(self):
        texto = "headers: {Cookie: sid=secret-cookie, fragmento, secreto-restante}"

        resultado = redactar_secretos(texto)

        self.assertEqual(resultado, "headers: {Cookie: [REDACTADO]}")
        self.assertNotIn("secret", resultado)

    def test_quote_block_sin_cierre_falla_cerrado_hasta_el_siguiente_sibling(self):
        texto = (
            'Authorization: "Bearer secret-abierto\n'
            "  continuacion-secret-abierto\n"
            "obra: Las Glorietas"
        )

        resultado = redactar_secretos(texto)

        self.assertEqual(
            resultado,
            "Authorization: [REDACTADO]\nobra: Las Glorietas",
        )
        self.assertNotIn("secret-abierto", resultado)

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
        data["entidades"]["clientes"].append("No debe filtrarse.")
        self.assertEqual(cierre.entidades["clientes"], ["RAVN"])

    def test_entidades_exige_las_cuatro_claves_tipadas_exactas(self):
        for entidades in (
            ["RAVN"],
            {"obras": [], "clientes": [], "cotizaciones": []},
            {
                "obras": [],
                "clientes": [],
                "cotizaciones": [],
                "documentos": [],
                "proveedores": [],
            },
            {
                "obras": [1],
                "clientes": [],
                "cotizaciones": [],
                "documentos": [],
            },
        ):
            with self.subTest(entidades=entidades), self.assertRaises(ValueError):
                validar_cierre({**cierre_valido(), "entidades": entidades})

    def test_fechas_de_cierre_deben_ser_timestamps_iso_8601_reales(self):
        for campo, valor in (
            ("fecha_inicio", "2026-02-30T10:00:00-03:00"),
            ("fecha_cierre", "08/08/2026 11:00"),
            ("fecha_cierre", "2026-08-08"),
        ):
            with self.subTest(campo=campo, valor=valor), self.assertRaises(ValueError):
                validar_cierre({**cierre_valido(), campo: valor})

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
        entidades = cierre_valido()["entidades"]
        cierre = Cierre(
            **{
                **cierre_valido(),
                "entidades": {**entidades, "documentos": ["OPENAI_API_KEY=secreto"]},
            }
        )

        markdown = cierre_a_markdown(cierre)

        self.assertNotIn("secreto", markdown)
        self.assertIn("OPENAI_API_KEY=[REDACTADO]", markdown)

    def test_schema_y_markdown_conservan_el_tipo_de_cada_entidad(self):
        cierre = validar_cierre(cierre_valido())

        markdown = cierre_a_markdown(cierre)
        entidades_linea = next(
            linea.removeprefix("entidades: ")
            for linea in markdown.splitlines()
            if linea.startswith("entidades: ")
        )
        schema = json.loads(
            (Path(__file__).parents[1] / "cierre-conversacion.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(json.loads(entidades_linea), cierre_valido()["entidades"])
        contrato = schema["properties"]["entidades"]
        self.assertEqual(contrato["required"], ["obras", "clientes", "cotizaciones", "documentos"])
        self.assertFalse(contrato["additionalProperties"])

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
