from __future__ import annotations

from dataclasses import fields
import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from daemon.memoria.modelo import Cierre, ESTADOS, HOSTS, SENSIBILIDADES


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
        self.base = Path(self.temporal.name).resolve()
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

    def ejecutar(self, *argumentos: str, root: Path | None = None) -> dict[str, object]:
        proceso = self.ejecutar_proceso(*argumentos, root=root)
        self.assertEqual(proceso.returncode, 0, proceso.stderr)
        return json.loads(proceso.stdout)

    def ejecutar_proceso(
        self, *argumentos: str, root: Path | None = None
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "daemon.memoria.instalar",
                "--root",
                str(self.root if root is None else root),
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

    def test_bloques_duplicados_fallan_sin_eliminar_ninguno(self) -> None:
        destino = self.destino("/Users/ezeotero/.codex/AGENTS.md")
        destino.parent.mkdir(parents=True)
        original = f"cabecera\n{BLOQUE}contenido ajeno\n{BLOQUE}pie\n"
        destino.write_text(original, encoding="utf-8")

        proceso = self.ejecutar_proceso()

        self.assertNotEqual(proceso.returncode, 0)
        self.assertEqual(destino.read_text(encoding="utf-8"), original)
        self.assertFalse(self.destino("/Users/ezeotero/.claude/CLAUDE.md").exists())

    def test_root_con_dotdot_no_puede_tocar_sentinel_fuera_del_limite(self) -> None:
        limite = self.base / "limite"
        root_con_escape = limite / "raiz" / ".." / "afuera"
        sentinel = self.base / "limite/afuera/Users/ezeotero/.codex/AGENTS.md"
        sentinel.parent.mkdir(parents=True)
        original = f"sentinel\n{INICIO}\nviejo\n{FIN}\n".encode()
        sentinel.write_bytes(original)

        proceso = self.ejecutar_proceso(root=root_con_escape)

        self.assertNotEqual(proceso.returncode, 0)
        self.assertEqual(sentinel.read_bytes(), original)

    def test_symlink_intermedio_no_puede_tocar_sentinel_fuera_del_root(self) -> None:
        self.root.mkdir()
        afuera = self.base / "afuera"
        sentinel = afuera / "Users/ezeotero/.codex/AGENTS.md"
        sentinel.parent.mkdir(parents=True)
        original = f"sentinel\n{INICIO}\nviejo\n{FIN}\n".encode()
        sentinel.write_bytes(original)
        (self.root / "Users").symlink_to(afuera / "Users", target_is_directory=True)

        proceso = self.ejecutar_proceso()

        self.assertNotEqual(proceso.returncode, 0)
        self.assertEqual(sentinel.read_bytes(), original)

    def test_root_vivo_mapea_destino_canonico_sin_rechazar_symlink_del_vault(self) -> None:
        modulo = importlib.import_module("daemon.memoria.instalar")
        canonico = Path("/Users/ezeotero/Obsidian/RAVN/CLAUDE.md")

        mapeado = modulo._bajo_root(Path("/"), canonico)
        modulo._validar_ruta_destino(Path("/"), mapeado)

        self.assertEqual(mapeado, canonico)

    def test_schema_divergente_falla_antes_de_crear_destinos(self) -> None:
        ruta_schema = self.source / "daemon/memoria/cierre-conversacion.schema.json"
        schema = json.loads(ruta_schema.read_text(encoding="utf-8"))
        schema["required"].remove("tema")
        ruta_schema.write_text(json.dumps(schema), encoding="utf-8")

        proceso = self.ejecutar_proceso()

        self.assertNotEqual(proceso.returncode, 0)
        self.assertFalse(self.root.exists())

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

        campos_modelo = {campo.name for campo in fields(Cierre)}
        self.assertEqual(set(schema["required"]), campos_modelo)
        self.assertEqual(set(schema["properties"]), campos_modelo)
        self.assertEqual(set(schema["properties"]["host"]["enum"]), HOSTS)
        self.assertEqual(set(schema["properties"]["estado"]["enum"]), ESTADOS)
        self.assertEqual(
            set(schema["properties"]["sensibilidad"]["enum"]), SENSIBILIDADES
        )

    def test_fallo_a_mitad_del_commit_restaurar_todo_el_arbol(self) -> None:
        modulo = importlib.import_module("daemon.memoria.instalar")
        archivos = {
            "/Users/ezeotero/.codex/AGENTS.md": ("codex previo\n", 0o640),
            "/Users/ezeotero/.claude/CLAUDE.md": ("claude previo\n", 0o600),
            "/Users/ezeotero/Obsidian/RAVN/CLAUDE.md": ("vault previo\n", 0o644),
            "/Users/ezeotero/Obsidian/RAVN/.graphifyignore": ("Adjuntos/\n", 0o640),
            (
                "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas/"
                "cierre-conversacion.schema.json"
            ): ('{"anterior":true}\n', 0o600),
            "/Users/ezeotero/.local/bin/ravn-memoria": ("#!/bin/sh\nexit 9\n", 0o700),
        }
        for absoluto, (contenido, modo) in archivos.items():
            ruta = self.destino(absoluto)
            ruta.parent.mkdir(parents=True, exist_ok=True)
            ruta.write_text(contenido, encoding="utf-8")
            ruta.chmod(modo)
        estado_inicial = self.snapshot_arbol(self.root)
        wrapper = self.destino("/Users/ezeotero/.local/bin/ravn-memoria")
        fallo_inyectado = False

        def publicar_con_fallo(
            origen: str | os.PathLike[str], destino: str | os.PathLike[str]
        ) -> None:
            nonlocal fallo_inyectado
            if Path(destino) == wrapper and not fallo_inyectado:
                fallo_inyectado = True
                raise OSError("fallo inyectado al publicar wrapper")
            os.replace(origen, destino)

        with patch(
            "daemon.memoria.instalar._publicar_archivo", side_effect=publicar_con_fallo
        ):
            with self.assertRaises(OSError):
                modulo.instalar(root=self.root, source=self.source)

        self.assertTrue(fallo_inyectado)
        self.assertEqual(self.snapshot_arbol(self.root), estado_inicial)

    @staticmethod
    def snapshot_arbol(root: Path) -> dict[str, tuple[object, ...]]:
        snapshot: dict[str, tuple[object, ...]] = {}
        if not root.exists():
            return snapshot
        for ruta in (root, *sorted(root.rglob("*"))):
            relativo = "." if ruta == root else ruta.relative_to(root).as_posix()
            modo = ruta.lstat().st_mode & 0o777
            if ruta.is_symlink():
                snapshot[relativo] = ("symlink", os.readlink(ruta), modo)
            elif ruta.is_dir():
                snapshot[relativo] = ("dir", modo)
            else:
                snapshot[relativo] = ("file", ruta.read_bytes(), modo)
        return snapshot


if __name__ == "__main__":
    unittest.main()
