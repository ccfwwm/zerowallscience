"""Run with the installed managed interpreter; only fixture workspace files change."""
import ast
import json
import os
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'resources/biogenie/python'))
from zerowall_bridge import main
output = ROOT / 'test-results/skills-mcp/biogenie'
output.mkdir(parents=True, exist_ok=True)
os.chdir(output)
checks = []
def call(op, args, **extra):
    result = json.loads(main({'action': 'run', 'operation': op, 'arguments': args, **extra}))
    checks.append({'operation': op, **result})
    assert result['ok'], result
    return result['result']
assert sys.version_info[:3] == (3, 12, 10), sys.version
catalog = json.loads(main({'action': 'list'}))
assert catalog['ok'] and len(catalog['operations']) >= 40
assert call('seq_analyze', {'sequence': 'ATGGCCATTGTA', 'seq_type': 'dna'})['length'] == 12
assert call('seq_translate', {'sequence': 'ATGGCCATTGTA'})['protein'] == 'MAIV'
call('seq_io_write', {'path': 'sequence.fasta', 'records': [{'id': 'fixture', 'sequence': 'ATGGCCATTGTA'}], 'format': 'fasta'})
assert 'ATGGCCATTGTA' in json.dumps(call('seq_io_read', {'path': 'sequence.fasta', 'format': 'fasta'}))
Path('stats.csv').write_text('group,value\na,1\na,2\na,3\nb,6\nb,7\nb,8\n')
call('stats_test', {'path': 'stats.csv', 'group_col': 'group', 'value_col': 'value', 'test_type': 'ttest'})
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.plot([1,2,3],[2,4,8]); plt.savefig('plot.png'); plt.close()
call('fig_qa', {'path': 'plot.png'})
blocked = json.loads(main({'action': 'run', 'operation': 'seq_io_read', 'arguments': {'path': str(ROOT / 'package.json')}}))
assert not blocked['ok'] and 'escapes' in blocked['error']
missing = json.loads(main({'action': 'run', 'operation': 'sbol_write', 'arguments': {}}))
assert not missing['ok'] and missing['status'] == 'missing_dependency'
failed = json.loads(main({'action': 'run', 'operation': 'seq_io_read', 'arguments': {'path': 'missing.fasta'}}))
assert not failed['ok']
assert call('seq_io_read', {'path': 'sequence.fasta'})
syntax_errors = []
scripts = list((ROOT / 'resources/skills').rglob('*.py')) + list((ROOT / 'resources/biogenie').rglob('*.py'))
for script in scripts:
    if '__pycache__' in script.parts: continue
    try: ast.parse(script.read_text(encoding='utf-8-sig'), filename=str(script))
    except Exception as error: syntax_errors.append({'path': str(script.relative_to(ROOT)), 'error': str(error)})
report = {'python': sys.version, 'operations': len(catalog['operations']), 'checks': checks, 'path_boundary': blocked, 'isolated_profile': missing, 'python_scripts': len(scripts), 'syntax_errors': syntax_errors}
(output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok': not syntax_errors, 'python_scripts': len(scripts), 'syntax_errors': syntax_errors, 'output': str(output)}, ensure_ascii=False))
assert not syntax_errors
