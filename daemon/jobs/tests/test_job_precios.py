import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_precios


class TestCorrer(unittest.TestCase):
    def test_returncode_0_no_tira(self):
        fake = mock.Mock(returncode=0, stdout="precios retail: 3 actualizados / 5 materiales; sin precio: []", stderr="")
        with mock.patch.object(job_precios.subprocess, "run", return_value=fake) as m:
            job_precios.correr({}, "tok")  # no debe lanzar
        # corre el script correcto, en el repo correcto
        self.assertEqual(
            m.call_args.args[0],
            ["npx", "tsx", "scripts/cotizador/refrescar-precios.ts"],
        )
        self.assertEqual(m.call_args.kwargs["cwd"], job_precios.REPO)

    def test_returncode_1_tira_runtimeerror_con_stderr(self):
        fake = mock.Mock(returncode=1, stdout="", stderr="Error consultando recetas: boom")
        with mock.patch.object(job_precios.subprocess, "run", return_value=fake):
            with self.assertRaisesRegex(RuntimeError, "Error consultando recetas: boom"):
                job_precios.correr({}, "tok")


if __name__ == "__main__":
    unittest.main()
