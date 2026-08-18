import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TransferPackageTestCase(unittest.TestCase):
    def test_package_contains_runtime_files_without_local_data(self):
        powershell = shutil.which("powershell")
        if not powershell:
            self.skipTest("PowerShell is required to verify the Windows transfer package")

        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [
                    powershell,
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(ROOT / "scripts" / "package.ps1"),
                    "-SkipVerification",
                    "-OutputDirectory",
                    temp_dir,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )

            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            archives = list(Path(temp_dir).glob("SNR-reservation-*.zip"))
            self.assertEqual(1, len(archives), result.stdout + result.stderr)

            with zipfile.ZipFile(archives[0]) as archive:
                names = {name.replace("\\", "/") for name in archive.namelist()}

            required = {
                "SNR-reservation/index.html",
                "SNR-reservation/app.js",
                "SNR-reservation/styles.css",
                "SNR-reservation/start.ps1",
                "SNR-reservation/app/server.py",
                "SNR-reservation/scripts/start-local.ps1",
                "SNR-reservation/scripts/start-lan.ps1",
                "SNR-reservation/scripts/check-target.ps1",
                "SNR-reservation/scripts/backup-local.ps1",
                "SNR-reservation/docs/LOCAL_DEPLOYMENT.md",
                "SNR-reservation/data/rlab_reservation.db",
            }
            self.assertTrue(required.issubset(names), sorted(required - names))
            self.assertFalse(any("/.git/" in f"/{name}" for name in names))
            self.assertFalse(any("/node_modules/" in f"/{name}" for name in names))
            database_files = [name for name in names if name.endswith((".db", ".sqlite", ".sqlite3"))]
            self.assertEqual(["SNR-reservation/data/rlab_reservation.db"], database_files)

    def test_lan_start_script_builds_urls_from_selected_ip(self):
        powershell = shutil.which("powershell")
        if not powershell:
            self.skipTest("PowerShell is required to verify the Windows LAN launcher")

        result = subprocess.run(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ROOT / "scripts" / "start-lan.ps1"),
                "-IpAddress",
                "192.168.10.25",
                "-Port",
                "8123",
                "-ShowOnly",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("http://192.168.10.25:8123", result.stdout)
        self.assertIn("http://192.168.10.25:8123/?view=bulletin", result.stdout)


if __name__ == "__main__":
    unittest.main()
