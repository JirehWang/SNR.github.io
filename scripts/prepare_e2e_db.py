import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.import_floorplan_placements import import_placements


def main():
    parser = argparse.ArgumentParser(description="Prepare the isolated Playwright database.")
    parser.add_argument("--source", required=True, help="Source SQLite database.")
    parser.add_argument("--target", required=True, help="Target SQLite database.")
    parser.add_argument("--input", required=True, help="Floorplan placement JSON fixture.")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    target = Path(args.target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    import_placements(target, Path(args.input).resolve(), backup_dir=None)
    print(f"Prepared E2E DB: {target}")


if __name__ == "__main__":
    main()
