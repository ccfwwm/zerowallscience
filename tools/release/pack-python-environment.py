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
    for source, prefix in [(staging, ''), (root/'resources/skills', 'skills/'), (root/'resources/python', 'python/')]:
        for p in sorted(source.rglob('*')):
            if not p.is_file() or '__pycache__' in p.parts or p.suffix in ('.pyc', '.pyo'):
                continue
            if p.suffix == '.pem':
                # Public TLS trust bundles are runtime dependencies. Exclude all
                # other PEMs, and reject any private key in the allowed bundle.
                if p.name != 'cacert.pem' or p.parent.name != 'certifi':
                    continue
                if b'PRIVATE KEY' in p.read_bytes():
                    raise RuntimeError(f'Private key in certificate bundle: {p.name}')
            if p.name.startswith('.env') and p.suffix in ('.example', '.sample', '.template'):
                continue
            relative = p.relative_to(source).as_posix()
            # Installed runtime staging contains older copies of these assets.
            # The repository is authoritative and is added once below.
            if not prefix and relative.split('/', 1)[0].lower() in ('skills', 'python'):
                continue
            if '.secrets' in p.parts or p.name.startswith('.env'):
                raise RuntimeError(f'Secret-like file in archive input: {relative}')
            if prefix=='python/' and not (p.name.startswith('requirements-') or p.name.startswith('skill-dependenc')):
                continue
            entry = prefix+relative
            normalized = entry.casefold()
            if normalized in entries:
                raise RuntimeError(f'Duplicate archive entry: {entry}')
            entries.add(normalized)
            z.write(p, entry)
            if not prefix:
                with p.open('rb') as f: hashes[relative] = hashlib.file_digest(f,'sha256').hexdigest()
with archive.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
archive.with_suffix('.inventory.json').write_text(json.dumps({'size':archive.stat().st_size,'sha256':digest,'sourceHashes':hashes}),encoding='utf-8')
print(json.dumps({'size':archive.stat().st_size,'sha256':digest,'files':len(hashes)}))
