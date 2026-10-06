"""Create a minimal CPython + pip bootstrap archive for the Windows app."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tempfile
import zipfile


def safe_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    seen = set()
    with zipfile.ZipFile(archive) as source:
        for info in source.infolist():
            name = info.filename.replace("\\", "/")
            path = PurePosixPath(name)
            mode = info.external_attr >> 16
            if (not name or path.is_absolute() or any(part in ("", ".", "..") for part in path.parts)
                    or ":" in path.parts[0] or stat.S_ISLNK(mode)
                    or (mode and not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)))):
                raise RuntimeError(f"Unsafe ZIP entry: {info.filename}")
            target = (destination / Path(*path.parts)).resolve()
            if not target.is_relative_to(root):
                raise RuntimeError(f"ZIP entry escapes output: {info.filename}")
            normalized = name.casefold().rstrip("/")
            if normalized in seen:
                raise RuntimeError(f"Duplicate ZIP entry: {info.filename}")
            seen.add(normalized)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(info) as incoming, target.open("wb") as outgoing:
                    shutil.copyfileobj(incoming, outgoing)


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_archive(runtime: Path, output: Path) -> dict:
    hashes = {}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as target:
        for path in sorted(runtime.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix in (".pyc", ".pyo"):
                continue
            relative = PurePosixPath("Python", *path.relative_to(runtime).parts).as_posix()
            if relative.casefold() in {name.casefold() for name in hashes}:
                raise RuntimeError(f"Duplicate archive entry: {relative}")
            data_hash = hash_file(path)
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100644 & 0xFFFF) << 16
            with target.open(info, "w") as entry, path.open("rb") as source:
                shutil.copyfileobj(source, entry)
            hashes[relative] = data_hash
    return {"size": output.stat().st_size, "sha256": hash_file(output), "fileCount": len(hashes), "files": hashes}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python-archive", required=True)
    parser.add_argument("--pip-wheel", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-python", default="3.12.10")
    parser.add_argument("--expected-pip", default="26.2.1")
    args = parser.parse_args()
    python_archive = Path(args.python_archive).resolve()
    pip_wheel = Path(args.pip_wheel).resolve()
    output = Path(args.output).resolve()
    if output.exists():
        raise RuntimeError(f"Refusing to overwrite bootstrap archive: {output}")

    with tempfile.TemporaryDirectory(prefix="zws-python-bootstrap-") as temporary:
        work = Path(temporary)
        runtime = work / "Python"
        safe_extract(python_archive, runtime)
        if not (runtime / "python.exe").is_file() or not (runtime / "python312.zip").is_file():
            raise RuntimeError("Official CPython embeddable archive is incomplete.")
        site_packages = runtime / "Lib" / "site-packages"
        site_packages.mkdir(parents=True)
        safe_extract(pip_wheel, site_packages)
        (runtime / "python312._pth").write_text(
            "python312.zip\n.\nDLLs\nLib\nLib/site-packages\nimport site\n", encoding="ascii"
        )
        executable = runtime / "python.exe"
        version = subprocess.run([executable, "-I", "-B", "-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"], check=True, capture_output=True, text=True).stdout.strip()
        if version != args.expected_python:
            raise RuntimeError(f"Bootstrap Python version mismatch: {version}")
        pip_version = subprocess.run([executable, "-I", "-B", "-m", "pip", "--version"], check=True, capture_output=True, text=True).stdout.strip()
        if f"pip {args.expected_pip} " not in pip_version:
            raise RuntimeError(f"Bootstrap pip version mismatch: {pip_version}")
        subprocess.run([executable, "-I", "-B", "-m", "pip", "check"], check=True, capture_output=True, text=True)
        inventory = subprocess.run(
            [executable, "-I", "-B", "-c", "import importlib.metadata,json; print(json.dumps(sorted((d.metadata.get('Name') or d.name).lower() for d in importlib.metadata.distributions())))"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        packages = json.loads(inventory)
        if packages != ["pip"]:
            raise RuntimeError(f"Bootstrap archive must contain only pip; got {packages}")
        result = make_archive(runtime, output)
    receipt = {"pythonVersion": args.expected_python, "pipVersion": args.expected_pip, "packages": ["pip"], **result}
    output.with_suffix(".inventory.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: receipt[key] for key in ("pythonVersion", "pipVersion", "packages", "size", "sha256", "fileCount")}, indent=2))


if __name__ == "__main__":
    main()
