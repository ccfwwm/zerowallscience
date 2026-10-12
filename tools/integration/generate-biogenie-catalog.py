"""Generate discovery from the actual OPS AST, without importing dependencies."""
import ast
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
modules = {p.stem: ast.parse(p.read_text(encoding='utf-8-sig')) for p in root.glob('*.py')}
tree = modules['bio_ops']
functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
for node in tree.body:
    if isinstance(node, ast.ImportFrom) and node.module in modules:
        source = {n.name: n for n in modules[node.module].body if isinstance(n, ast.FunctionDef)}
        for alias in node.names:
            if alias.name in source:
                functions[alias.asname or alias.name] = source[alias.name]
registry = next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'OPS' for t in n.targets))
adapter = modules['zerowall_bridge']
defaults = next(ast.literal_eval(n.value) for n in adapter.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'DEFAULT_DATABASE' for t in n.targets))
network = next(ast.literal_eval(n.value) for n in adapter.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'NETWORK_OPS' for t in n.targets))
operations = []
for key, value in zip(registry.keys, registry.values):
    operation = ast.literal_eval(key)
    function = functions[value.id]
    parameters = {}
    for node in ast.walk(function):
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) and node.value.id == 'args' and isinstance(node.slice, ast.Constant):
            parameters[str(node.slice.value)] = {'required': True}
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'args' and node.func.attr == 'get' and node.args and isinstance(node.args[0], ast.Constant):
            field = parameters.setdefault(str(node.args[0].value), {'required': False})
            if len(node.args) > 1:
                try:
                    field['default'] = ast.literal_eval(node.args[1])
                except (ValueError, TypeError):
                    pass
    description = ast.get_docstring(function) or ''
    operations.append({'id': operation, 'summary': description.split('\n')[0], 'description': description, 'parameters': parameters, 'default_backend': 'bio-tools' if operation in defaults else 'biogenie', 'dependency_profile': 'shared', 'network': operation in network})
Path(sys.argv[2]).write_text(json.dumps({'schema': 1, 'upstreamVersion': '0.6.48', 'operations': operations}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Generated {len(operations)} BioGenie operations without importing Python modules')
