"""Evidence-based Skill audit. Source text is data, never installation instructions."""
import argparse
import ast
from collections import Counter, defaultdict
from datetime import datetime, timezone
import importlib.metadata as metadata
import json
from pathlib import Path
import re
import shlex
import sys

ROOT = Path(__file__).resolve().parents[2]


def norm(value):
    return re.sub(r'[-_.]+', '-', value).lower()


def imports(text):
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return []
    result = []
    optional = set()
    for parent in ast.walk(tree):
        if isinstance(parent, ast.Try) and any(handler.type is None or any(isinstance(n, ast.Name) and n.id in ('ImportError', 'ModuleNotFoundError') for n in ast.walk(handler.type)) for handler in parent.handlers):
            optional.update(id(n) for stmt in parent.body for n in ast.walk(stmt))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.extend((item.name.split('.')[0], node.lineno, 'optional-import' if id(node) in optional else 'import') for item in node.names)
        elif isinstance(node, ast.ImportFrom) and not node.level and node.module:
            result.append((node.module.split('.')[0], node.lineno, 'optional-import' if id(node) in optional else 'import'))
        elif isinstance(node, ast.Call) and node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
            name = node.func.id if isinstance(node.func, ast.Name) else node.func.attr if isinstance(node.func, ast.Attribute) else ''
            if name in ('__import__', 'import_module', 'find_spec'):
                result.append((node.args[0].value.split('.')[0], node.lineno, 'dynamic-import'))
    return result


def install_specs(text):
    # Join shell continuations, preserving the first line as provenance.
    lines = text.splitlines()
    for i, line in enumerate(lines):
        match = re.search(r'\b(?:uv\s+(?:pip\s+install|add)|pip3?\s+install|conda\s+install)\s+(.+)', line)
        if not match:
            continue
        prefix = line[:match.start()].strip()
        if prefix and not (prefix.endswith(('`', '(', ':')) or re.fullmatch(r'(?:\$\s*)?(?:python[\d.]*\s+-m|!)', prefix) or 'install with ' in prefix.lower()):
            continue
        command = re.split(r'`|\)|&&|\|\||;|\.\s+[A-Z]', match[1], maxsplit=1)[0]
        j = i
        while command.rstrip().endswith('\\') and j + 1 < len(lines):
            j += 1
            command = command.rstrip()[:-1] + ' ' + lines[j].strip()
        try:
            tokens = shlex.split(command.split('#', 1)[0].replace('`', ''))
        except ValueError:
            continue
        skip = False
        for token in tokens:
            if skip:
                skip = False
                continue
            if token in ('-r', '-c', '-e', '--requirement', '--constraint', '--prerelease', '--python', '--index-url', '--extra-index-url', '--channel', '--target', '--upgrade-strategy'):
                skip = True
                continue
            token = token.rstrip('.')
            if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:(?:[<>=!~]=?)[A-Za-z0-9.*+!,<>=~-]+)?', token):
                yield token, i + 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skills-root', default=str(ROOT / 'resources/skills'))
    parser.add_argument('--site-packages')
    parser.add_argument('--verification')
    parser.add_argument('--output', default=str(ROOT / 'resources/python/skill-dependencies.json'))
    args = parser.parse_args()
    root = Path(args.skills_root).resolve()
    policy = json.loads((ROOT / 'resources/python/skill-dependency-policy.json').read_text())
    aliases = policy['importAliases']
    packages, module_packages = {}, {}
    if args.site_packages:
        for dist in metadata.distributions(path=[args.site_packages]):
            name = norm(dist.metadata['Name'])
            packages[name] = {'version': dist.version, 'location': 'bio-tools/python/site-packages', 'imports': []}
            tops = (dist.read_text('top_level.txt') or '').splitlines()
            if not tops:
                tops = sorted({str(p).replace('\\', '/').split('/')[0].removesuffix('.py') for p in (dist.files or []) if '/' in str(p) or str(p).endswith('.py')})
            for top in tops:
                if top.isidentifier():
                    module_packages.setdefault(top, name)
                    packages[name]['imports'].append(top)
    checks = {}
    if args.verification:
        verification = json.loads(Path(args.verification).read_text(encoding='utf-8'))
        if verification.get('python') != '3.12.10' or not verification.get('isolated'):
            raise SystemExit('Verification must use isolated CPython 3.12.10')
        checks = verification.get('imports', {})
        verified_inventory = verification.get('packages', {})
        if {k:v['version'] for k,v in packages.items()} != verified_inventory:
            raise SystemExit('Verification inventory does not match audited site-packages')
    paths = sorted(p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    skill_paths = sorted(p for p in paths if p.name == 'SKILL.md')
    skill_dirs = {p.parent for p in skill_paths}
    owned = defaultdict(list)
    for p in paths:
        owner = next((parent for parent in p.parents if parent in skill_dirs), None)
        if owner:
            owned[owner].append(p)
    skills = []
    parse_errors = []
    for skill_path in skill_paths:
        folder = skill_path.parent
        text = skill_path.read_text('utf-8-sig', errors='replace')
        match = re.search(r'^name:\s*[\"\']?([^\r\n\"\']+)', text, re.M)
        name = match[1].strip() if match else folder.name
        files = owned[folder]
        # Local modules are scoped to this Skill, not a repository-wide name set.
        local = {p.stem for p in files if p.suffix == '.py'} | {p.parent.name for p in files if p.name == '__init__.py'}
        # PEP 420 namespace packages also work without __init__.py.
        local |= {p.relative_to(folder).parts[0] for p in files if p.suffix == '.py' and len(p.relative_to(folder).parts) > 1}
        evidence = []
        for p in files:
            if p.suffix not in ('.py', '.md', '.txt', '.toml', '.lock'):
                continue
            content = p.read_text('utf-8-sig', errors='replace')
            rel = str(p.relative_to(root)).replace('\\', '/')
            role = 'development' if any(x in p.parts for x in ('tests', 'test')) or p.name.startswith('test_') else 'optional-example' if p.suffix == '.md' else 'runtime'
            found = []
            if p.suffix == '.py':
                try:
                    ast.parse(content)
                except SyntaxError as error:
                    parse_errors.append({'file': rel, 'line': error.lineno, 'reason': error.msg})
                found = imports(content)
            elif p.suffix == '.md':
                for block in re.finditer(r'```(?:python|py)\s*\n(.*?)```', content, re.S):
                    offset = content[:block.start(1)].count('\n')
                    found.extend((m, line + offset, 'document-import') for m, line, _ in imports(block[1]))
                for spec, line in install_specs(content):
                    pkg = norm(re.split(r'[\[<>=!~]', spec)[0])
                    evidence.append({'package': pkg, 'file': rel, 'line': line, 'kind': 'install-declaration', 'role': role, 'requested': spec})
            elif p.name.startswith('requirements'):
                for i, line in enumerate(content.splitlines(), 1):
                    match = re.match(r'^([A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[\w,.-]+\])?(?:[<>=!~][^\s;\\]+)?)', line.strip())
                    if match:
                        spec = match[1]
                        evidence.append({'package': norm(re.split(r'[\[<>=!~]', spec)[0]), 'file': rel, 'line': i, 'kind': 'requirements', 'role': role, 'requested': spec})
            elif p.name == 'pyproject.toml':
                import tomllib
                try:
                    project = tomllib.loads(content).get('project', {})
                    for spec in project.get('dependencies', []):
                        evidence.append({'package': norm(re.split(r'[\[<>=!~; ]', spec)[0]), 'file': rel, 'line': 1, 'kind': 'pyproject', 'role': 'runtime', 'requested': spec})
                    for group, specs in project.get('optional-dependencies', {}).items():
                        for spec in specs:
                            evidence.append({'package': norm(re.split(r'[\[<>=!~; ]', spec)[0]), 'file': rel, 'line': 1, 'kind': 'pyproject-extra', 'role': 'optional-example', 'requested': spec, 'extra': group})
                except tomllib.TOMLDecodeError:
                    parse_errors.append({'file': rel, 'reason': 'Invalid TOML'})
            for module, line, kind in found:
                if module in sys.stdlib_module_names or module in local:
                    continue
                pkg = aliases.get(module, module_packages.get(module, norm(module)))
                evidence.append({'package': pkg, 'import': module, 'file': rel, 'line': line, 'kind': kind, 'role': 'optional-feature' if kind == 'optional-import' and role == 'runtime' else role})
        grouped = defaultdict(list)
        for item in evidence:
            grouped[item['package']].append(item)
        requirements = []
        for pkg, sources in sorted(grouped.items()):
            installed = packages.get(pkg)
            modules = sorted({s['import'] for s in sources if s.get('import')})
            verified_modules = {m.split('.')[0] for m, result in checks.items() if result.get('ok')}
            verified = bool(installed) and (all(m in verified_modules for m in modules) if modules else any(m in verified_modules for m in installed['imports']))
            status = 'managed' if verified else 'optional'
            reason = 'Installed and isolated import verified.' if verified else 'Not verified in this shared runtime; see source evidence and independent environment policy.'
            req = {'name': pkg, 'status': status, 'reason': reason, 'sources': sources, 'imports': modules, 'validation': 'passed' if verified else 'not-verified'}
            if modules:
                req['import'] = modules[0]
            if installed:
                req.update({'installedVersion': installed['version'], 'location': installed['location']})
                from packaging.requirements import Requirement, InvalidRequirement
                for source in sources:
                    if source.get('requested'):
                        try:
                            requirement = Requirement(source['requested'])
                            source['versionSatisfied'] = not requirement.specifier or requirement.specifier.contains(installed['version'])
                        except InvalidRequirement:
                            source['versionSatisfied'] = None
                if any(s.get('versionSatisfied') is False for s in sources):
                    req.update(status='optional', validation='version-mismatch', reason='Installed version does not satisfy every documented requirement; see source evidence.')
            requirements.append(req)
        unresolved = [r for r in requirements if r['status'] != 'managed' and any(s['role'] != 'development' for s in r['sources'])]
        status = 'optional' if unresolved else 'managed' if any(r['status'] == 'managed' for r in requirements) else 'optional' if requirements else 'ready'
        reason = 'Runtime dependencies are verified; optional/documented versions remain separately recorded.' if status == 'managed' else 'No third-party Python dependency detected.' if status == 'ready' else 'Some capabilities require additional dependencies; consult evidence.'
        if name in policy['heavy']:
            status, reason = 'optional', 'Heavy models or specialized runtime: use an independent environment.'
        if name in policy['external']:
            status, reason = 'external', 'Requires an external service, credentials, hardware or system runtime.'
        if name in policy['independent']:
            status, reason = 'incompatible', policy['independent'][name]
        skills.append({'name': name, 'path': str(folder.relative_to(root)).replace('\\', '/'), 'status': status, 'reason': reason, 'detectedImports': sorted({s['import'] for s in evidence if s.get('import')}), 'requirements': requirements})
    summary = {s: sum(skill['status'] == s for skill in skills) for s in ('ready', 'managed', 'optional', 'external', 'incompatible')}
    report = {'schema': 1, 'platform': 'win32', 'architecture': 'x64', 'python': '3.12.10', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'summary': summary, 'skills': skills, 'parseErrors': parse_errors, 'scannedFiles': len(paths), 'installedPackageCount': len(packages)}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'skills': len(skills), 'summary': summary, 'parseErrors': len(parse_errors)}))


if __name__ == '__main__':
    main()
