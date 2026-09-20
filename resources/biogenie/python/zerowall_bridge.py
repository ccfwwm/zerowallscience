"""Managed-interpreter adapter. Never downloads runtimes or installs dependencies."""
import ast
import contextlib
import hashlib
import importlib.metadata
import inspect
import io
import json
import os
from pathlib import Path
import sys
import traceback

ROOT = Path(__file__).resolve().parent
NETWORK_OPS = {'entrez_search', 'entrez_fetch', 'blast_search', 'uniprot', 'pathway_search', 'pathway_design', 'plasmid_search', 'plasmid_info'}
DEFAULT_DATABASE = {'entrez_search', 'entrez_fetch', 'uniprot', 'pubmed_search', 'pubmed_abstract', 'enrichr'}
PROFILES = {'sbol_write': 'sbol', 'sbol_read': 'sbol', 'circuit_compile': 'circuit', 'circuit_simulate': 'circuit'}


def signature(function):
    tree = ast.parse(inspect.getsource(function))
    fields = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) and node.value.id == 'args' and isinstance(node.slice, ast.Constant):
            fields[str(node.slice.value)] = {'required': True}
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'args' and node.func.attr == 'get' and node.args and isinstance(node.args[0], ast.Constant):
            field = fields.setdefault(str(node.args[0].value), {'required': False})
            if len(node.args) > 1:
                try:
                    field['default'] = ast.literal_eval(node.args[1])
                except (ValueError, TypeError):
                    pass
    return fields


def execute(envelope):
    import bio_ops
    action = envelope.get('action', 'list')
    op = envelope.get('operation')
    if action == 'list':
        return {'operations': [{'id': key, 'summary': (inspect.getdoc(fn) or '').split('\n')[0], 'default_backend': 'bio-tools' if key in DEFAULT_DATABASE else 'biogenie', 'dependency_profile': PROFILES.get(key, 'shared')} for key, fn in bio_ops.OPS.items()]}
    if op not in bio_ops.OPS:
        raise ValueError('UNKNOWN_OPERATION: use bio_local list')
    function = bio_ops.OPS[op]
    if action == 'describe':
        return {'id': op, 'description': inspect.getdoc(function), 'parameters': signature(function), 'dependency_profile': PROFILES.get(op, 'shared'), 'network': op in NETWORK_OPS}
    if action != 'run':
        raise ValueError('Unknown action')
    args = envelope.get('arguments', {})
    if not isinstance(args, dict):
        raise ValueError('arguments must be an object')
    # AST-derived fields are discovery hints: some indexed keys belong to
    # conditional branches. The operation validates the selected branch.
    if op in DEFAULT_DATABASE and envelope.get('backend') != 'biogenie':
        raise ValueError('Use Bio Tools database entry by default; backend=biogenie explicitly selects this implementation')
    if op == 'blast_search' and not envelope.get('confirm_remote_upload'):
        raise ValueError('REMOTE_UPLOAD_CONFIRMATION_REQUIRED: BLAST sends sequence data to a remote service')
    profile = PROFILES.get(op)
    if profile and os.environ.get('ZEROWALL_BIO_PROFILE') != profile:
        raise ModuleNotFoundError('ISOLATED_PROFILE_REQUIRED: ' + profile + '; use python_environment preview with profile')
    workspace = Path.cwd().resolve()

    def check_path(value):
        path = Path(value).resolve()
        if not path.is_relative_to(workspace):
            raise ValueError('Path escapes current workspace: ' + str(value))

    def walk(value, key=''):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, k)
        elif isinstance(value, list):
            for item in value:
                walk(item, key)
        elif isinstance(value, str) and (key in {'path', 'file', 'out_file', 'output', 'input', 'filename', 'directory', 'workdir'} or key.endswith(('_path', '_file', '_dir'))):
            check_path(value)
    walk(args)
    result = function(args)
    if isinstance(result, dict) and result.get('error'):
        raise RuntimeError(result['error'])
    artifacts = []
    def collect(value):
        if isinstance(value, dict):
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, str) and len(value) < 1024:
            try:
                path = Path(value).resolve()
                if path.is_relative_to(workspace) and path.is_file():
                    artifacts.append({'path': str(path), 'size': path.stat().st_size, 'sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()})
            except (OSError, ValueError):
                pass
    collect(result)
    return {'result': bio_ops._sanitize_json(result), 'artifacts': artifacts, 'provenance': {'backend': 'biogenie', 'version': '0.6.36', 'operation': op, 'python': sys.version.split()[0], 'executable': sys.executable}}


def main(envelope):
    capture = io.StringIO()
    try:
        import bio_ops
        with contextlib.redirect_stdout(capture):
            result = execute(envelope)
        return json.dumps({'ok': True, **result, 'log': capture.getvalue()[-100000:]}, ensure_ascii=False, cls=bio_ops.SafeEncoder)
    except ModuleNotFoundError as error:
        return json.dumps({'ok': False, 'status': 'missing_dependency', 'error': str(error), 'repair': 'Use python_environment to inspect and preview required packages. No automatic installation.'})
    except Exception as error:
        return json.dumps({'ok': False, 'status': 'failed', 'error': f'{type(error).__name__}: {error}', 'log': capture.getvalue()[-100000:]})
