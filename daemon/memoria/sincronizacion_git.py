"""Sincronización serializada del Vault mediante un git-dir externo."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import os
from pathlib import Path
import subprocess
from typing import Callable, Generic, Iterable, TypeVar

from .modelo import redactar_secretos


T = TypeVar("T")


@dataclass(frozen=True)
class ResultadoGit:
    sincronizado: bool
    paso: str
    pendiente: str = ""
    detalle: dict[str, object] | None = None


class FalloSincronizacion(RuntimeError):
    def __init__(self, paso: str, detalle: dict[str, object]):
        super().__init__(paso)
        self.paso = paso
        self.detalle = detalle


class SincronizadorGitVault:
    """Coordina pull, escritura, stage acotado, commit y push bajo un lock."""

    def __init__(
        self,
        *,
        vault: Path,
        git_dir: Path,
        remote: str = "origin",
        branch: str = "main",
        lock_path: Path | None = None,
        ejecutar: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    ) -> None:
        self.vault = Path(vault)
        self.git_dir = Path(git_dir)
        self.remote = remote
        self.branch = branch
        self.lock_path = lock_path or Path.home() / ".ravn-jobs" / "vault-git.lock"
        self._ejecutar = ejecutar

    @contextmanager
    def bloqueo(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            os.fchmod(descriptor, 0o600)
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

    def transaccion(
        self,
        persistir: Callable[[], T],
        *,
        rutas: Callable[[T], Iterable[Path]],
        mensaje: str,
        registrar_pendiente: Callable[[str, dict[str, object]], object],
        observar_paso: Callable[[str], None] | None = None,
    ) -> tuple[T, ResultadoGit]:
        observar = observar_paso or (lambda _paso: None)
        with self.bloqueo():
            try:
                observar("preflight")
                self._preflight()
            except FalloSincronizacion as error:
                observar("write")
                resultado = persistir()
                return resultado, self._resultado_parcial(error, registrar_pendiente)

            cambios_previos = self._rutas_sucias_trackeadas()
            fallo_pull: FalloSincronizacion | None = None
            if not cambios_previos:
                try:
                    observar("pull")
                    self._pull()
                except FalloSincronizacion as error:
                    fallo_pull = error

            observar("write")
            resultado = persistir()
            try:
                allowlist = self._allowlist(rutas(resultado))
            except FalloSincronizacion as error:
                return resultado, self._resultado_parcial(error, registrar_pendiente)

            cambios_ajenos = self._rutas_no_cubiertas(cambios_previos, allowlist)
            if cambios_previos and cambios_ajenos:
                return resultado, self._resultado_parcial(
                    FalloSincronizacion(
                        "preflight",
                        {
                            "motivo": "cambios_trackeados_ajenos",
                            "rutas": sorted(cambios_ajenos)[:20],
                        },
                    ),
                    registrar_pendiente,
                )

            try:
                observar("stage")
                observar("commit")
                self._commit_si_hay_cambios(allowlist, mensaje)
                if fallo_pull is not None:
                    if not cambios_previos:
                        return resultado, self._resultado_parcial(
                            fallo_pull, registrar_pendiente
                        )
                    observar("pull")
                    self._pull()
                elif cambios_previos:
                    observar("pull")
                    self._pull()
                observar("push")
                self._push_con_un_reintento()
            except FalloSincronizacion as error:
                return resultado, self._resultado_parcial(error, registrar_pendiente)

            return resultado, ResultadoGit(
                sincronizado=True,
                paso="completado",
                detalle={"rama": self.branch, "remote": self.remote},
            )

    def pull_solo(self) -> ResultadoGit:
        """Actualiza el work-tree bajo el mismo lock usado por cierres y jobs."""
        with self.bloqueo():
            try:
                self._preflight()
                self._pull()
            except FalloSincronizacion as error:
                return ResultadoGit(False, error.paso, detalle=error.detalle)
        return ResultadoGit(True, "pull", detalle={"rama": self.branch, "remote": self.remote})

    def _preflight(self) -> None:
        if not self.vault.is_dir() or not self.git_dir.is_dir():
            raise FalloSincronizacion("preflight", {"motivo": "repositorio_no_disponible"})
        self._validar_puntero_git()
        if self._rebase_en_curso():
            raise FalloSincronizacion(
                "preflight", {"motivo": "rebase_ajeno_en_curso"}
            )
        self._git("rev-parse", "--verify", "HEAD", paso="preflight")
        rutas_staged = sorted(self._rutas_staged())
        if rutas_staged:
            raise FalloSincronizacion(
                "preflight",
                {
                    "motivo": "indice_git_no_vacio",
                    "rutas": rutas_staged[:20],
                },
            )

    def _pull(self, *, paso_fallo: str = "pull") -> None:
        sha_local_original = self._sha("HEAD")
        rebase_antes = self._rebase_en_curso()
        resultado = self._git(
            "pull", "--rebase", self.remote, self.branch, paso=paso_fallo, check=False
        )
        if resultado.returncode == 0:
            return
        rebase_despues = self._rebase_en_curso()
        rutas_conflicto = self._rutas_conflicto(paso_fallo)
        inicio_rebase = rebase_despues and not rebase_antes
        es_conflicto = bool(rutas_conflicto) or inicio_rebase
        detalle = self._detalle_pull(
            resultado.returncode,
            sha_local=sha_local_original,
            rutas_conflicto=rutas_conflicto,
        )
        if inicio_rebase:
            self._git("rebase", "--abort", paso=f"{paso_fallo}_abort", check=False)
        raise FalloSincronizacion("conflicto" if es_conflicto else paso_fallo, detalle)

    def _commit_si_hay_cambios(self, rutas: list[str], mensaje: str) -> None:
        if not rutas:
            raise FalloSincronizacion("stage", {"motivo": "allowlist_vacia"})
        staged_ajenos = sorted(self._rutas_no_cubiertas(self._rutas_staged(), rutas))
        if staged_ajenos:
            raise FalloSincronizacion(
                "stage",
                {"motivo": "indice_contiene_rutas_ajenas", "rutas": staged_ajenos[:20]},
            )
        # Intent-to-add vuelve visibles los archivos nuevos para `commit --only`
        # sin dejarlos staged. Si el commit falla, el índice real sigue limpio y
        # el work-tree conserva intacta la evidencia para el siguiente intento.
        self._git("add", "-N", "--", *rutas, paso="stage")
        diff = self._git(
            "diff", "--quiet", "--", *rutas, paso="commit", check=False
        )
        if diff.returncode == 0:
            return
        if diff.returncode != 1:
            raise FalloSincronizacion("commit", {"codigo": diff.returncode})
        commit = self._git(
            "commit",
            "-m",
            redactar_secretos(mensaje),
            "--only",
            "--",
            *rutas,
            paso="commit",
            check=False,
        )
        if commit.returncode != 0:
            raise FalloSincronizacion("commit", {"codigo": commit.returncode})

    def _push_con_un_reintento(self) -> None:
        primero = self._git(
            "push", self.remote, self.branch, paso="push", check=False
        )
        if primero.returncode == 0:
            return

        self._pull(paso_fallo="push_retry_pull")

        segundo = self._git(
            "push", self.remote, self.branch, paso="push_retry", check=False
        )
        if segundo.returncode != 0:
            raise FalloSincronizacion(
                "push", {"codigo": segundo.returncode, "reintento": 1}
            )

    def _detalle_pull(
        self,
        codigo: int,
        *,
        sha_local: str,
        rutas_conflicto: list[str],
    ) -> dict[str, object]:
        return {
            "codigo": codigo,
            "sha_local": sha_local,
            "sha_remoto": self._sha(f"{self.remote}/{self.branch}"),
            "rutas_conflicto": [
                redactar_secretos(ruta) for ruta in rutas_conflicto[:20]
            ],
        }

    def _rutas_conflicto(self, paso: str) -> list[str]:
        return self._git(
            "diff", "--name-only", "--diff-filter=U", paso=paso, check=False
        ).stdout.splitlines()

    def _rutas_staged(self) -> set[str]:
        return {
            ruta
            for ruta in self._git(
                "diff", "--cached", "--name-only", "-z", paso="preflight"
            ).stdout.split("\0")
            if ruta
        }

    def _rutas_sucias_trackeadas(self) -> set[str]:
        return {
            ruta
            for ruta in self._git(
                "diff", "--name-only", "-z", paso="preflight"
            ).stdout.split("\0")
            if ruta
        }

    def rutas_modificadas(self, *, incluir_no_trackeadas: bool = False) -> list[str]:
        """Lista determinística para ownership dinámico; quien llama ya posee el lock."""
        rutas = self._rutas_sucias_trackeadas() | self._rutas_staged()
        if incluir_no_trackeadas:
            rutas.update(
                ruta
                for ruta in self._git(
                    "ls-files",
                    "--others",
                    "--exclude-standard",
                    "-z",
                    paso="preflight",
                ).stdout.split("\0")
                if ruta
            )
        return sorted(rutas)

    @staticmethod
    def _rutas_no_cubiertas(
        cambios: Iterable[str], allowlist: Iterable[str]
    ) -> set[str]:
        prefijos = tuple(ruta.rstrip("/") + "/" for ruta in allowlist)
        exactas = set(allowlist)
        return {
            cambio
            for cambio in cambios
            if cambio not in exactas and not cambio.startswith(prefijos)
        }

    def _rebase_en_curso(self) -> bool:
        return any(
            (self.git_dir / nombre).exists()
            for nombre in ("rebase-merge", "rebase-apply")
        )

    def _validar_puntero_git(self) -> None:
        puntero = self.vault / ".git"
        if not puntero.exists() and not puntero.is_symlink():
            return
        if puntero.is_symlink() or not puntero.is_file():
            raise FalloSincronizacion(
                "preflight", {"motivo": "git_embebido_en_vault"}
            )
        try:
            contenido = puntero.read_text(encoding="utf-8").strip()
            prefijo, separador, destino = contenido.partition(":")
            if prefijo.casefold() != "gitdir" or not separador or not destino.strip():
                raise ValueError
            ruta = Path(destino.strip())
            if not ruta.is_absolute():
                ruta = puntero.parent / ruta
            coincide = ruta.resolve() == self.git_dir.resolve()
        except (OSError, ValueError):
            coincide = False
        if not coincide:
            raise FalloSincronizacion(
                "preflight", {"motivo": "puntero_git_no_coincide"}
            )

    def _sha(self, referencia: str) -> str:
        resultado = self._git(
            "rev-parse", "--verify", referencia, paso="sha", check=False
        )
        return resultado.stdout.strip() if resultado.returncode == 0 else ""

    def _allowlist(self, rutas: Iterable[Path]) -> list[str]:
        resultado: list[str] = []
        vault_resuelto = self.vault.resolve()
        for ruta in rutas:
            candidata = Path(ruta)
            absoluta = candidata if candidata.is_absolute() else self.vault / candidata
            try:
                relativa = absoluta.resolve().relative_to(vault_resuelto).as_posix()
            except (OSError, ValueError) as error:
                raise FalloSincronizacion(
                    "stage", {"motivo": "ruta_fuera_del_vault"}
                ) from error
            if not relativa or relativa == ".git" or relativa.startswith(".git/"):
                raise FalloSincronizacion("stage", {"motivo": "ruta_git_no_permitida"})
            if relativa not in resultado:
                resultado.append(relativa)
        return resultado

    def _resultado_parcial(
        self,
        error: FalloSincronizacion,
        registrar_pendiente: Callable[[str, dict[str, object]], object],
    ) -> ResultadoGit:
        detalle = _sanitizar_detalle(error.detalle)
        try:
            pendiente_obj = registrar_pendiente(
                "sincronizar_vault_git", {"paso": error.paso, **detalle}
            )
        except OSError:
            detalle["pendiente_registrado"] = False
            pendiente = "no_registrado"
        else:
            pendiente = self._ruta_pendiente(pendiente_obj)
        return ResultadoGit(False, error.paso, pendiente=pendiente, detalle=detalle)

    def _ruta_pendiente(self, valor: object) -> str:
        if not isinstance(valor, Path):
            return "registrado"
        try:
            return valor.relative_to(self.vault).as_posix()
        except ValueError:
            return "registrado"

    def _git(
        self,
        *args: str,
        paso: str,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        comando = [
            "git",
            "--git-dir",
            str(self.git_dir),
            "--work-tree",
            str(self.vault),
            *args,
        ]
        try:
            resultado = self._ejecutar(
                comando,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired as error:
            raise FalloSincronizacion(paso, {"motivo": "timeout"}) from error
        except OSError as error:
            raise FalloSincronizacion(
                paso, {"motivo": "git_no_disponible"}
            ) from error
        if check and resultado.returncode != 0:
            raise FalloSincronizacion(paso, {"codigo": resultado.returncode})
        return resultado


def _sanitizar_detalle(detalle: dict[str, object]) -> dict[str, object]:
    resultado: dict[str, object] = {}
    for clave, valor in detalle.items():
        clave_segura = redactar_secretos(str(clave))
        if isinstance(valor, str):
            resultado[clave_segura] = redactar_secretos(valor)
        elif isinstance(valor, list):
            resultado[clave_segura] = [
                redactar_secretos(item) if isinstance(item, str) else item
                for item in valor
            ]
        elif isinstance(valor, (int, float, bool)) or valor is None:
            resultado[clave_segura] = valor
    return resultado
