"""Build the managed runtime from locked wheels, never from user site-packages."""
import argparse
import email
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def normalized(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def run(args, **kwargs):
    print("RUN", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", required=True)
    args = parser.parse_args()
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    staging = work / "staging"
    wheelhouse = work / "wheels"
    wheelhouse.mkdir(exist_ok=True)
    source_lock = ROOT / "resources/python/requirements-research.lock"
    if sys.version_info[:3] != (3, 12, 10):
        raise SystemExit("Build requires CPython 3.12.10")
    env = {**os.environ, "PYTHONNOUSERSITE": "1", "PYTHONPATH": "", "PIP_DISABLE_PIP_VERSION_CHECK": "1"}
    run([sys.executable, "-m", "pip", "wheel", "--prefer-binary", "--require-hashes", "-r", source_lock, "--wheel-dir", wheelhouse], env=env)
    expected = dict(re.findall(r"^([A-Za-z0-9_.-]+)==([^\s\\]+)", source_lock.read_text(), re.M))
    expected = {normalized(k): v for k, v in expected.items()}
    rows = []
    for wheel in sorted(wheelhouse.glob("*.whl")):
        with zipfile.ZipFile(wheel) as z:
            metadata = email.message_from_bytes(z.read(next(n for n in z.namelist() if n.endswith('.dist-info/METADATA'))))
        name, version = normalized(metadata['Name']), metadata['Version']
        if expected.get(name) != version:
            raise RuntimeError(f"Unexpected wheel {wheel.name}")
        rows.append({"name": name, "version": version, "file": wheel.name, "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(), "size": wheel.stat().st_size})
    if len(rows) != len(expected) or {r['name'] for r in rows} != set(expected):
        raise RuntimeError("Wheel set does not exactly match the source lock")
    final_lock = ROOT / 'resources/python/requirements-windows.lock'
    final_lock.write_text('# Windows x64 / CPython 3.12.10; hashes of the actual release wheels.\n' + ''.join(f"{r['name']}=={r['version']} --hash=sha256:{r['sha256']}\n" for r in sorted(rows, key=lambda r: r['name'])), encoding='utf-8')
    (work / 'wheel-inventory.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
    if not staging.exists():
        shutil.copytree(ROOT / 'mcp-environment-staging', staging, ignore=shutil.ignore_patterns('site-packages', '__pycache__', '*.pyc', '*private*.pem', '*public*.pem'))
    site = staging / 'bio-tools/python/site-packages'
    if site.exists():
        if not site.is_relative_to(work) or site.is_symlink():
            raise RuntimeError('Unsafe staging site-packages path')
        shutil.rmtree(site)
    run([sys.executable, '-m', 'pip', 'install', '--no-index', '--find-links', wheelhouse, '--require-hashes', '--no-compile', '--target', site, '-r', final_lock], env=env)
    pth = staging / 'bio-tools/python/python312._pth'
    pth.write_text('python312.zip\n.\nsite-packages\n../lib\nsite-packages/win32\nsite-packages/win32/lib\nsite-packages/pythonwin\nimport site\n', encoding='utf-8')
    shutil.copyfile(site / 'win32/lib/pywintypes.py', site / 'pywintypes.py')
    python = staging / 'bio-tools/python/python.exe'
    run([python, '-s', '-B', '-m', 'pip', 'check'], env=env)
    run([python, '-s', '-B', '-c', 'import sys; assert sys.version_info[:3] == (3,12,10); print(sys.version)'], env=env)
    print('Prepared', staging, flush=True)


if __name__ == '__main__':
    main()
