"""Stream the archive instead of holding the scientific runtime twice in RAM."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

staging, root, archive = map(Path, sys.argv[1:4])
hashes = {}
entries = set()
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
    # The base archive is the offline Python bootstrap only. Skills, MCP
    # services, and dependency metadata are application resources or signed
    # manifests and must never be duplicated inside this ZIP.
    python_root = staging / 'Python'
    if not python_root.is_dir():
        raise RuntimeError(f'Shared Python directory is missing: {python_root}')
    for p in sorted(python_root.rglob('*')):
        if not p.is_file() or '__pycache__' in p.parts or p.suffix in ('.pyc', '.pyo'):
            continue
        if p.suffix == '.pem':
            # The bundled certifi CA is needed by pip. Reject every other PEM
            # and fail closed if a private key is ever staged by mistake.
            if p.name != 'cacert.pem' or p.parent.name != 'certifi':
                continue
            if b'PRIVATE KEY' in p.read_bytes():
                raise RuntimeError(f'Private key in certificate bundle: {p.name}')
        if '.secrets' in p.parts or p.name.startswith('.env'):
            raise RuntimeError(f'Secret-like file in archive input: {p.relative_to(staging).as_posix()}')
        relative = p.relative_to(staging).as_posix()
        entry = relative
        normalized = entry.casefold()
        if normalized in entries:
            raise RuntimeError(f'Duplicate archive entry: {entry}')
        entries.add(normalized)
        z.write(p, entry)
        with p.open('rb') as f:
            hashes[relative] = hashlib.file_digest(f, 'sha256').hexdigest()
with archive.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
archive.with_suffix('.inventory.json').write_text(json.dumps({'size':archive.stat().st_size,'sha256':digest,'sourceHashes':hashes,'content':'python-bootstrap-only'}),encoding='utf-8')
print(json.dumps({'size':archive.stat().st_size,'sha256':digest,'files':len(hashes)}))
