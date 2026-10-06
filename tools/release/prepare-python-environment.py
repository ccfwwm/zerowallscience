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


def verify_core_wheels(wheelhouse, requirements):
    core = {}
    for raw in requirements.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Za-z0-9_.-]+)==([^\s]+)(?:\s+--hash=sha256:[a-f0-9]{64})?$", raw.strip())
        if match:
            core[normalized(match.group(1))] = match.group(2)
    verified = {}
    for wheel in wheelhouse.glob("*.whl"):
        with zipfile.ZipFile(wheel) as archive:
            metadata_path = next(name for name in archive.namelist() if name.endswith(".dist-info/METADATA"))
            metadata = email.message_from_bytes(archive.read(metadata_path))
        name, version = normalized(metadata["Name"]), metadata["Version"]
        if name in core:
            if core[name] != version:
                raise RuntimeError(f"Core wheel version differs from requirements: {name}=={version}")
            verified[name] = hashlib.sha256(wheel.read_bytes()).hexdigest()
    missing = sorted(set(core) - set(verified))
    if missing:
        raise RuntimeError(f"Core wheels were not resolved for the target platform: {', '.join(missing)}")
    return verified


def make_core_wheel_lock(work):
    """Resolve the minimal offline core only from the pinned Windows wheel lock."""
    base_requirements = ROOT / "resources/python/requirements-base.txt"
    windows_lock = ROOT / "resources/python/requirements-windows.lock"
    available = {}
    for raw in windows_lock.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Za-z0-9_.-]+)==([^\s]+)\s+--hash=sha256:([a-f0-9]{64})$", raw.strip())
        if match:
            available[normalized(match.group(1))] = (match.group(1), match.group(2), match.group(3))
    rows = []
    for raw in base_requirements.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Za-z0-9_.-]+)==([^\s]+)(?:\s+--hash=sha256:[a-f0-9]{64})?$", raw.strip())
        if not match:
            continue
        name, version = normalized(match.group(1)), match.group(2)
        locked = available.get(name)
        if locked is None or locked[1] != version:
            raise RuntimeError(f"Core package is missing from the Windows wheel lock: {name}=={version}")
        rows.append(f"{locked[0]}=={locked[1]} --hash=sha256:{locked[2]}")
    if not rows:
        raise RuntimeError("Core requirements are empty")
    target = work / "requirements-core.lock"
    target.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return target


def run(args, **kwargs):
    print("RUN", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", required=True)
    parser.add_argument("--input", help="Owned MCP staging input; defaults to mcp-environment-staging.")
    parser.add_argument("--base-only", action="store_true", help="Build only the signed minimal Windows core layer.")
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
    # The default installer needs only the small offline core. Build it from
    # the actual Windows wheel hashes; full science builds continue to use the
    # upstream sdist lock and may compile explicitly authorized sources.
    if args.base_only:
        source_lock = make_core_wheel_lock(work)
    run_args = [sys.executable, "-m", "pip", "wheel"]
    if args.base_only:
        run_args.append("--only-binary=:all:")
    else:
        run_args.append("--prefer-binary")
    run_args += ["--require-hashes", "-r", source_lock, "--wheel-dir", wheelhouse]
    run(run_args, env=env)
    core_hashes = verify_core_wheels(wheelhouse, ROOT / "resources/python/requirements-base.txt")
    expected = dict(re.findall(r"^([A-Za-z0-9_.-]+)==([^\s\\]+)", source_lock.read_text(encoding="utf-8"), re.M))
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
    install_lock = source_lock
    if not args.base_only:
        final_lock.write_text('# Windows x64 / CPython 3.12.10; hashes of the actual release wheels.\n' + ''.join(f"{r['name']}=={r['version']} --hash=sha256:{r['sha256']}\n" for r in sorted(rows, key=lambda r: r['name'])), encoding='utf-8')
        install_lock = final_lock
    if any(next(row for row in rows if row['name'] == name)['sha256'] != digest for name, digest in core_hashes.items()):
        raise RuntimeError('Windows lock wheel hashes do not match the verified base-layer wheel set')
    # Keep the core roots in requirements-base.txt and their Windows wheel
    # digests in requirements-windows.lock. Full science builds must not
    # rewrite the roots into a second, divergent dependency lock.
    (work / 'wheel-inventory.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
    if not staging.exists():
        source_staging = Path(args.input).resolve() if args.input else ROOT / 'mcp-environment-staging'
        if not source_staging.is_dir() or source_staging == staging:
            raise RuntimeError(f"Invalid MCP staging input: {source_staging}")
        shutil.copytree(source_staging, staging, ignore=shutil.ignore_patterns('site-packages', '__pycache__', '*.pyc', '*private*.pem', '*public*.pem', 'prepare-bootstrap.ps1', 'build-stdlib-zip.py', 'requirements-core.lock'))
    legacy_resources = staging / 'python'
    resources = staging / 'resources/python'
    # On Windows, ``python`` and ``Python`` name the same directory. Move only
    # the historical metadata-only folder; never relocate the embedded runtime
    # into resources/python when the stage already contains Python/python.exe.
    if not resources.exists() and legacy_resources.exists() and not (legacy_resources / 'python.exe').is_file():
        resources.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(legacy_resources), str(resources))
    legacy_python = staging / 'bio-tools/python'
    shared_python = staging / 'Python'
    if not shared_python.exists() and legacy_python.exists():
        shared_python.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(legacy_python), str(shared_python))
    if not shared_python.is_dir():
        raise RuntimeError('Staging runtime must contain the shared Python directory.')
    legacy_site = shared_python / 'site-packages'
    site = shared_python / 'Lib/site-packages'
    if not site.exists() and legacy_site.exists():
        site.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(legacy_site), str(site))
    if site.exists():
        if not site.is_relative_to(work) or site.is_symlink():
            raise RuntimeError('Unsafe staging site-packages path')
        shutil.rmtree(site)
    run([sys.executable, '-m', 'pip', 'install', '--no-index', '--find-links', wheelhouse, '--require-hashes', '--no-compile', '--target', site, '-r', install_lock], env=env)
    pth = shared_python / 'python312._pth'
    # Include Lib for normal CPython distributions where encodings and other
    # stdlib modules are not entirely packed into python312.zip.  This keeps
    # the managed archive bootable before pip or an MCP server is invoked.
    pth.write_text('python312.zip\n.\nDLLs\nLib\nLib/site-packages\n../bio-tools/lib\nLib/site-packages/win32\nLib/site-packages/win32/lib\nLib/site-packages/pythonwin\nimport site\n', encoding='utf-8')
    shutil.copyfile(site / 'win32/lib/pywintypes.py', site / 'pywintypes.py')
    python = shared_python / 'python.exe'
    run([python, '-s', '-B', '-m', 'pip', 'check'], env=env)
    run([python, '-s', '-B', '-c', 'import sys; assert sys.version_info[:3] == (3,12,10); print(sys.version)'], env=env)
    print('Prepared', staging, flush=True)


if __name__ == '__main__':
    main()
