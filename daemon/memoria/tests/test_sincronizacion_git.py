"""Sincronización segura del Vault mediante git-dir externo."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from daemon.memoria.sincronizacion_git import SincronizadorGitVault


class SincronizacionGitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = Path(self.tmp.name)
        self.remoto = self.raiz / "remoto.git"
        self.semilla = self.raiz / "semilla"
        self.vault = self.raiz / "vault"
        self.git_dir = self.raiz / "vault.git"
        self.lock = self.raiz / "estado" / "vault-git.lock"
        subprocess.run(["git", "init", "--bare", str(self.remoto)], check=True, capture_output=True)
        subprocess.run(["git", "init", "-b", "main", str(self.semilla)], check=True, capture_output=True)
        self._git(self.semilla, "config", "user.name", "RAVN Tests")
        self._git(self.semilla, "config", "user.email", "tests@ravn.invalid")
        (self.semilla / "README.md").write_text("base\n", encoding="utf-8")
        self._git(self.semilla, "add", "README.md")
        self._git(self.semilla, "commit", "-m", "base")
        self._git(self.semilla, "remote", "add", "origin", str(self.remoto))
        self._git(self.semilla, "push", "-u", "origin", "main")
        subprocess.run(
            ["git", "clone", "-b", "main", "--separate-git-dir", str(self.git_dir), str(self.remoto), str(self.vault)],
            check=True,
            capture_output=True,
        )
        (self.vault / ".git").unlink()
        self._git_externo("config", "user.name", "RAVN Tests")
        self._git_externo("config", "user.email", "tests@ravn.invalid")
        self.sync = SincronizadorGitVault(
            vault=self.vault,
            git_dir=self.git_dir,
            lock_path=self.lock,
        )

    def _git(self, cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *args], cwd=cwd, text=True, capture_output=True, check=True
        )

    def _git_externo(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "--git-dir", str(self.git_dir), "--work-tree", str(self.vault), *args],
            text=True,
            capture_output=True,
            check=check,
        )

    def test_transaccion_hace_pull_antes_de_escribir_y_stagea_solo_allowlist(self) -> None:
        orden: list[str] = []
        cierre = self.vault / "Conversaciones/cierres/2026/08/cierre.md"
        indice = self.vault / "Sistema/Memoria/indices/entidades.json"

        def persistir() -> tuple[Path, Path]:
            orden.append("write")
            cierre.parent.mkdir(parents=True)
            indice.parent.mkdir(parents=True)
            cierre.write_text("cierre\n", encoding="utf-8")
            indice.write_text("{}\n", encoding="utf-8")
            (self.vault / "ajeno.txt").write_text("no stagear\n", encoding="utf-8")
            return cierre, indice

        resultado, git = self.sync.transaccion(
            persistir,
            rutas=lambda valor: valor,
            mensaje="memoria: cierre test",
            registrar_pendiente=lambda *_: None,
            observar_paso=orden.append,
        )

        self.assertEqual(resultado, (cierre, indice))
        self.assertTrue(git.sincronizado, git.detalle)
        self.assertLess(orden.index("pull"), orden.index("write"))
        archivos_commit = self._git_externo("show", "--pretty=", "--name-only", "HEAD").stdout.splitlines()
        self.assertEqual(
            set(archivos_commit),
            {
                "Conversaciones/cierres/2026/08/cierre.md",
                "Sistema/Memoria/indices/entidades.json",
            },
        )
        self.assertIn("?? ajeno.txt", self._git_externo("status", "--short").stdout)
        self.assertFalse((self.vault / ".git").exists())
        self.assertEqual(os.stat(self.lock).st_mode & 0o777, 0o600)

    def test_acepta_puntero_git_regular_si_apunta_al_git_dir_externo_configurado(self) -> None:
        puntero = self.vault / ".git"
        puntero.write_text(f"gitdir: {self.git_dir}\n", encoding="utf-8")
        cierre = self.vault / "Conversaciones/cierres/2026/08/con-puntero.md"

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("cierre\n", encoding="utf-8")
            return cierre

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: puntero externo",
            registrar_pendiente=lambda *_: None,
        )

        self.assertTrue(resultado.sincronizado, resultado.detalle)
        self.assertEqual(puntero.read_text(), f"gitdir: {self.git_dir}\n")

    def test_fallo_de_pull_conserva_persistencia_y_deja_pendiente_sanitizado(self) -> None:
        cierre = self.vault / "Conversaciones/cierres/2026/08/local.md"
        pendientes: list[tuple[str, dict[str, object]]] = []
        self._git_externo("remote", "set-url", "origin", str(self.raiz / "no-existe.git"))

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("Authorization: Bearer secreto\n", encoding="utf-8")
            return cierre

        resultado, git = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: cierre parcial",
            registrar_pendiente=lambda operacion, detalle: pendientes.append((operacion, detalle)),
        )

        self.assertEqual(resultado, cierre)
        self.assertTrue(cierre.is_file())
        self.assertFalse(git.sincronizado)
        self.assertEqual(git.paso, "pull")
        self.assertEqual(len(pendientes), 1)
        serializado = json.dumps(pendientes, ensure_ascii=False)
        self.assertNotIn("secreto", serializado)
        self.assertNotIn(str(self.raiz), serializado)

    def test_pull_fallido_deja_cambio_tracked_reintentable_y_segundo_intento_sincroniza(self) -> None:
        remoto_real = self.remoto
        self._git_externo(
            "remote", "set-url", "origin", str(self.raiz / "remoto-ausente.git")
        )

        def persistir() -> Path:
            readme = self.vault / "README.md"
            readme.write_text("cierre durable\n", encoding="utf-8")
            return readme

        _, primero = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: pull parcial reintentable",
            registrar_pendiente=lambda *_: None,
        )
        self._git_externo("remote", "set-url", "origin", str(remoto_real))
        _, segundo = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: pull parcial reintentable",
            registrar_pendiente=lambda *_: None,
        )

        self.assertFalse(primero.sincronizado)
        self.assertTrue(segundo.sincronizado, segundo.detalle)
        self.assertEqual(self._git_externo("status", "--short").stdout, "")
        verificacion = self.raiz / "verificacion-pull-parcial"
        subprocess.run(
            ["git", "clone", "-b", "main", str(self.remoto), str(verificacion)],
            check=True,
            capture_output=True,
        )
        self.assertEqual((verificacion / "README.md").read_text(), "cierre durable\n")

    def test_commit_fallido_no_deja_stage_y_segundo_intento_sincroniza(self) -> None:
        ejecutar_real = self.sync._ejecutar
        fallo_commit = True

        def ejecutar(cmd, **kwargs):
            nonlocal fallo_commit
            if "commit" in cmd and fallo_commit:
                fallo_commit = False
                return subprocess.CompletedProcess(cmd, 1, "", "hook falló")
            return ejecutar_real(cmd, **kwargs)

        self.sync._ejecutar = ejecutar

        def persistir() -> Path:
            readme = self.vault / "README.md"
            readme.write_text("cambio reintentable\n", encoding="utf-8")
            return readme

        _, primero = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: commit reintentable",
            registrar_pendiente=lambda *_: None,
        )
        staged_tras_fallo = self._git_externo(
            "diff", "--cached", "--name-only"
        ).stdout
        _, segundo = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: commit reintentable",
            registrar_pendiente=lambda *_: None,
        )

        self.assertFalse(primero.sincronizado)
        self.assertEqual(primero.paso, "commit")
        self.assertEqual(staged_tras_fallo, "")
        self.assertTrue(segundo.sincronizado, segundo.detalle)
        self.assertEqual(self._git_externo("status", "--short").stdout, "")

    def test_reintento_de_mismo_contenido_no_duplica_commit(self) -> None:
        cierre = self.vault / "Conversaciones/cierres/2026/08/idempotente.md"

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True, exist_ok=True)
            cierre.write_text("igual\n", encoding="utf-8")
            return cierre

        _, primero = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: cierre idempotente",
            registrar_pendiente=lambda *_: None,
        )
        sha_primero = self._git_externo("rev-parse", "HEAD").stdout.strip()
        _, segundo = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: cierre idempotente",
            registrar_pendiente=lambda *_: None,
        )

        self.assertTrue(primero.sincronizado)
        self.assertTrue(segundo.sincronizado)
        self.assertEqual(self._git_externo("rev-parse", "HEAD").stdout.strip(), sha_primero)

    def test_non_fast_forward_hace_un_pull_rebase_y_un_solo_retry(self) -> None:
        cierre = self.vault / "Conversaciones/cierres/2026/08/retry.md"
        remoto_movido = False

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("local\n", encoding="utf-8")
            return cierre

        def observar(paso: str) -> None:
            nonlocal remoto_movido
            if paso != "push" or remoto_movido:
                return
            remoto_movido = True
            (self.semilla / "remoto.md").write_text("remoto\n", encoding="utf-8")
            self._git(self.semilla, "add", "remoto.md")
            self._git(self.semilla, "commit", "-m", "avance remoto")
            self._git(self.semilla, "push", "origin", "main")

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: retry",
            registrar_pendiente=lambda *_: None,
            observar_paso=observar,
        )

        self.assertTrue(resultado.sincronizado, resultado.detalle)
        verificacion = self.raiz / "verificacion"
        subprocess.run(
            ["git", "clone", "-b", "main", str(self.remoto), str(verificacion)],
            check=True,
            capture_output=True,
        )
        self.assertEqual((verificacion / cierre.relative_to(self.vault)).read_text(), "local\n")
        self.assertEqual((verificacion / "remoto.md").read_text(), "remoto\n")

    def test_conflicto_de_rebase_preserva_version_local_y_remota_sin_markers(self) -> None:
        compartido_semilla = self.semilla / "Conversaciones/cierres/2026/08/conflicto.md"
        compartido_semilla.parent.mkdir(parents=True)
        compartido_semilla.write_text("base\n", encoding="utf-8")
        self._git(self.semilla, "add", compartido_semilla.relative_to(self.semilla).as_posix())
        self._git(self.semilla, "commit", "-m", "archivo base")
        self._git(self.semilla, "push", "origin", "main")
        self.assertTrue(self.sync.pull_solo().sincronizado)
        compartido = self.vault / compartido_semilla.relative_to(self.semilla)
        pendientes: list[dict[str, object]] = []
        remoto_movido = False
        sha_local_original = ""
        sha_remoto_esperado = ""

        def persistir() -> Path:
            compartido.write_text("version local\n", encoding="utf-8")
            return compartido

        def observar(paso: str) -> None:
            nonlocal remoto_movido, sha_local_original, sha_remoto_esperado
            if paso != "push" or remoto_movido:
                return
            remoto_movido = True
            sha_local_original = self._git_externo("rev-parse", "HEAD").stdout.strip()
            compartido_semilla.write_text("version remota\n", encoding="utf-8")
            self._git(self.semilla, "add", compartido_semilla.relative_to(self.semilla).as_posix())
            self._git(self.semilla, "commit", "-m", "conflicto remoto")
            sha_remoto_esperado = self._git(self.semilla, "rev-parse", "HEAD").stdout.strip()
            self._git(self.semilla, "push", "origin", "main")

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: conflicto",
            registrar_pendiente=lambda _op, detalle: pendientes.append(detalle),
            observar_paso=observar,
        )

        self.assertFalse(resultado.sincronizado)
        self.assertEqual(resultado.paso, "conflicto")
        self.assertEqual(compartido.read_text(), "version local\n")
        self.assertEqual(compartido_semilla.read_text(), "version remota\n")
        self.assertNotIn("<<<<<<<", compartido.read_text())
        self.assertEqual(len(pendientes), 1)
        self.assertEqual(pendientes[0]["sha_local"], sha_local_original)
        self.assertEqual(pendientes[0]["sha_remoto"], sha_remoto_esperado)
        self.assertEqual(
            pendientes[0]["rutas_conflicto"],
            [compartido.relative_to(self.vault).as_posix()],
        )

    def test_preflight_no_aborta_un_rebase_que_no_inicio_esta_instancia(self) -> None:
        (self.git_dir / "rebase-merge").mkdir()
        comandos: list[list[str]] = []
        ejecutar_real = self.sync._ejecutar

        def ejecutar(cmd, **kwargs):
            comandos.append(cmd)
            if cmd[-2:] == ["rebase", "--abort"]:
                return subprocess.CompletedProcess(cmd, 0, "", "")
            return ejecutar_real(cmd, **kwargs)

        self.sync._ejecutar = ejecutar
        cierre = self.vault / "Conversaciones/cierres/2026/08/rebase-ajeno.md"

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("durable\n", encoding="utf-8")
            return cierre

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: rebase ajeno",
            registrar_pendiente=lambda *_: None,
        )

        self.assertFalse(resultado.sincronizado)
        self.assertEqual(resultado.paso, "preflight")
        self.assertTrue((self.git_dir / "rebase-merge").is_dir())
        self.assertNotIn(["rebase", "--abort"], [cmd[-2:] for cmd in comandos])

    def test_indice_git_preexistente_bloquea_sync_sin_stagear_el_cierre(self) -> None:
        (self.vault / "README.md").write_text("cambio ajeno\n", encoding="utf-8")
        self._git_externo("add", "README.md")
        cierre = self.vault / "Conversaciones/cierres/2026/08/no-stage.md"

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("local durable\n", encoding="utf-8")
            return cierre

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: no stage",
            registrar_pendiente=lambda *_: None,
        )

        self.assertFalse(resultado.sincronizado)
        self.assertEqual(resultado.paso, "preflight")
        staged = self._git_externo("diff", "--cached", "--name-only").stdout.splitlines()
        self.assertEqual(staged, ["README.md"])
        self.assertIn("?? Conversaciones/", self._git_externo("status", "--short").stdout)

    def test_timeout_de_pull_tambien_conserva_la_persistencia_local(self) -> None:
        cierre = self.vault / "Conversaciones/cierres/2026/08/timeout.md"
        ejecutar_real = self.sync._ejecutar

        def ejecutar(cmd, **kwargs):
            if "pull" in cmd:
                raise subprocess.TimeoutExpired(cmd, kwargs.get("timeout", 120))
            return ejecutar_real(cmd, **kwargs)

        self.sync._ejecutar = ejecutar

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("durable\n", encoding="utf-8")
            return cierre

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: timeout",
            registrar_pendiente=lambda *_: None,
        )

        self.assertTrue(cierre.is_file())
        self.assertFalse(resultado.sincronizado)
        self.assertEqual(resultado.paso, "pull")

    def test_fallo_al_registrar_pendiente_no_oculta_el_cierre_local(self) -> None:
        cierre = self.vault / "Conversaciones/cierres/2026/08/sin-pendiente.md"
        self._git_externo("remote", "set-url", "origin", str(self.raiz / "ausente.git"))

        def persistir() -> Path:
            cierre.parent.mkdir(parents=True)
            cierre.write_text("durable\n", encoding="utf-8")
            return cierre

        _, resultado = self.sync.transaccion(
            persistir,
            rutas=lambda valor: [valor],
            mensaje="memoria: pendiente falla",
            registrar_pendiente=lambda *_: (_ for _ in ()).throw(OSError("disco")),
        )

        self.assertTrue(cierre.is_file())
        self.assertFalse(resultado.sincronizado)
        self.assertEqual(resultado.pendiente, "no_registrado")
        self.assertFalse(resultado.detalle["pendiente_registrado"])


if __name__ == "__main__":
    unittest.main()
