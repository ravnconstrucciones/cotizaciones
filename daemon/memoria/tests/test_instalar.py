from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


INICIO = "<!-- RAVN_MEMORIA_COMPARTIDA:START -->"
FIN = "<!-- RAVN_MEMORIA_COMPARTIDA:END -->"
BLOQUE = f"""{INICIO}
# Protocolo compartido de prueba
contenido nuevo
{FIN}
"""


class InstalarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporal = tempfile.TemporaryDirectory()
        self.base = Path(self.temporal.name)
        self.root = self.base / "raiz simulada"
        self.source = self.base / "fuente con espacios y 'comilla'"
        instrucciones = self.source / "daemon/memoria/instrucciones.md"
        instrucciones.parent.mkdir(parents=True)
        instrucciones.write_text(BLOQUE, encoding="utf-8")
        self.schema_texto = (
            Path(__file__).parents[1] / "cierre-conversacion.schema.json"
        ).read_text(encoding="utf-8")
        (instrucciones.parent / "cierre-conversacion.schema.json").write_text(
            self.schema_texto, encoding="utf-8"
        )

    def tearDown(self) -> None:
        self.temporal.cleanup()

    def destino(self, absoluto: str) -> Path:
        return self.root / Path(absoluto).relative_to("/")

    def ejecutar(self, *argumentos: str) -> dict[str, object]:
        proceso = self.ejecutar_proceso(*argumentos)
        self.assertEqual(proceso.returncode, 0, proceso.stderr)
        return json.loads(proceso.stdout)

    def ejecutar_proceso(self, *argumentos: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "daemon.memoria.instalar",
                "--root",
                str(self.root),
                "--source",
                str(self.source),
                *argumentos,
            ],
            cwd=Path(__file__).parents[3],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_reinstalar_reemplaza_solo_el_bloque_y_crea_directorios_privados(self) -> None:
        destinos = [
            "/Users/ezeotero/.codex/AGENTS.md",
            "/Users/ezeotero/.claude/CLAUDE.md",
            "/Users/ezeotero/Obsidian/RAVN/CLAUDE.md",
        ]
        viejo = f"{INICIO}\ncontenido viejo\n{FIN}"
        for destino in destinos:
            ruta = self.destino(destino)
            ruta.parent.mkdir(parents=True, exist_ok=True)
            ruta.write_text(f"prefijo de {destino}\n{viejo}\nsufijo intacto\n", encoding="utf-8")
            ruta.chmod(0o644)

        ignorados = self.destino("/Users/ezeotero/Obsidian/RAVN/.graphifyignore")
        ignorados.write_text("Adjuntos/\nConversaciones/crudo/\n", encoding="utf-8")
        ignorados.chmod(0o644)

        self.ejecutar()
        segunda = self.ejecutar()

        for destino in destinos:
            contenido = self.destino(destino).read_text(encoding="utf-8")
            self.assertEqual(
                contenido,
                f"prefijo de {destino}\n{BLOQUE.rstrip()}\nsufijo intacto\n",
            )
            self.assertEqual(os.stat(self.destino(destino)).st_mode & 0o777, 0o644)

        self.assertEqual(
            ignorados.read_text(encoding="utf-8"), "Adjuntos/\nConversaciones/crudo/\n"
        )
        self.assertEqual(os.stat(ignorados).st_mode & 0o777, 0o644)
        schema_instalado = self.destino(
            "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas/"
            "cierre-conversacion.schema.json"
        )
        self.assertEqual(schema_instalado.read_text(encoding="utf-8"), self.schema_texto)
        self.assertEqual(segunda["changes"], [])
        for absoluto in (
            "/Users/ezeotero/Obsidian/RAVN/Conversaciones/crudo",
            "/Users/ezeotero/Obsidian/RAVN/Conversaciones/cierres",
            "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas",
            "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/indices",
            "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/pendientes-escritura",
        ):
            self.assertTrue(self.destino(absoluto).is_dir(), absoluto)

        for absoluto in (
            "/Users/ezeotero/Obsidian/RAVN/Conversaciones/crudo",
            "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/pendientes-escritura",
        ):
            self.assertEqual(os.stat(self.destino(absoluto)).st_mode & 0o777, 0o700)

    def test_dry_run_informa_cambios_sin_crear_la_raiz(self) -> None:
        resultado = self.ejecutar("--dry-run")

        self.assertFalse(self.root.exists())
        self.assertTrue(resultado["dry_run"])
        self.assertEqual(len(resultado["managed_targets"]), 4)
        self.assertIn(
            {"action": "write", "path": resultado["schema"]}, resultado["changes"]
        )
        self.assertEqual(
            {cambio["action"] for cambio in resultado["changes"]},
            {"write", "mkdir", "chmod"},
        )
        for cambio in resultado["changes"]:
            self.assertTrue(str(cambio["path"]).startswith(str(self.root)))

    def test_marcadores_desordenados_fallan_sin_tocar_archivos(self) -> None:
        destino = self.destino("/Users/ezeotero/.codex/AGENTS.md")
        destino.parent.mkdir(parents=True)
        original = f"cabecera\n{FIN}\ncontenido ajeno\n{INICIO}\npie\n"
        destino.write_text(original, encoding="utf-8")

        proceso = self.ejecutar_proceso()

        self.assertNotEqual(proceso.returncode, 0)
        self.assertEqual(destino.read_text(encoding="utf-8"), original)
        self.assertFalse(self.destino("/Users/ezeotero/.claude/CLAUDE.md").exists())

    def test_reemplazo_conserva_bytes_ajenos_con_finales_crlf(self) -> None:
        destino = self.destino("/Users/ezeotero/.codex/AGENTS.md")
        destino.parent.mkdir(parents=True)
        viejo = f"{INICIO}\r\ncontenido viejo\r\n{FIN}".encode()
        destino.write_bytes(b"prefijo\r\n" + viejo + b"\r\nsufijo\r\n")

        self.ejecutar()

        self.assertEqual(
            destino.read_bytes(),
            b"prefijo\r\n" + BLOQUE.rstrip().encode() + b"\r\nsufijo\r\n",
        )

    def test_wrapper_usa_python_313_source_y_preserva_argumentos(self) -> None:
        paquete = self.source / "daemon"
        (paquete / "__init__.py").write_text("", encoding="utf-8")
        (paquete / "memoria/__init__.py").write_text("", encoding="utf-8")
        (paquete / "memoria/cli.py").write_text(
            "import json, os, sys\n"
            "print(json.dumps({'argv': sys.argv[1:], 'pythonpath': os.environ['PYTHONPATH']}))\n",
            encoding="utf-8",
        )
        self.ejecutar()
        wrapper = self.destino("/Users/ezeotero/.local/bin/ravn-memoria")

        proceso = subprocess.run(
            [str(wrapper), "dos palabras", "$(no-ejecutar)", "comilla'final"],
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(proceso.returncode, 0, proceso.stderr)
        salida = json.loads(proceso.stdout)
        self.assertEqual(salida["argv"], ["dos palabras", "$(no-ejecutar)", "comilla'final"])
        self.assertEqual(salida["pythonpath"], str(self.source))
        self.assertEqual(os.stat(wrapper).st_mode & 0o777, 0o755)

    def test_schema_canonico_refleja_campos_y_enums_del_modelo(self) -> None:
        schema = json.loads(self.schema_texto)

        self.assertEqual(
            set(schema["required"]),
            {
                "id",
                "host",
                "thread_id",
                "fecha_inicio",
                "fecha_cierre",
                "tema",
                "estado",
                "entidades",
                "hechos",
                "decisiones",
                "metodos",
                "cambios",
                "pendientes",
                "separaciones",
                "enlaces",
                "fuente_cruda",
                "sensibilidad",
            },
        )
        self.assertEqual(schema["properties"]["host"]["enum"], ["codex", "claude"])
        self.assertEqual(
            schema["properties"]["estado"]["enum"], ["completo", "parcial", "bloqueado"]
        )
        self.assertEqual(
            schema["properties"]["sensibilidad"]["enum"], ["normal", "restringida"]
        )
        for campo in (
            "entidades",
            "hechos",
            "decisiones",
            "metodos",
            "cambios",
            "pendientes",
            "separaciones",
            "enlaces",
        ):
            self.assertEqual(schema["properties"][campo], {"$ref": "#/$defs/listaTextos"})


if __name__ == "__main__":
    unittest.main()
