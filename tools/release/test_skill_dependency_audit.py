import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('audit-skill-dependencies.py')
spec = importlib.util.spec_from_file_location('audit', SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_dynamic_imports_and_shell_boundaries(self):
        self.assertIn(('pyzotero', 1, 'dynamic-import'), audit.imports("importlib.import_module('pyzotero.zotero')"))
        self.assertEqual(list(audit.install_specs('Use `pip install pyzotero>=1.13` before proceeding.')), [('pyzotero>=1.13', 1)])

    def test_evidence_and_verification_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / 'skills' / 'zotero'
            skill.mkdir(parents=True)
            (skill / 'SKILL.md').write_text('---\nname: fixture\n---\n```sh\npip install pyzotero>=1.13\n```\n```python\nfrom pyzotero import zotero\n```\n')
            (skill / 'helper.py').write_text('import os, sys, tomllib\nimport localhelper\n')
            (skill / 'localhelper.py').write_text('')
            vendor = skill / 'vendor'
            vendor.mkdir()
            (vendor / 'run.py').write_text("import importlib\nimportlib.import_module('pyzotero')\n")
            site = root / 'site'
            dist = site / 'pyzotero-1.15.1.dist-info'
            dist.mkdir(parents=True)
            (dist / 'METADATA').write_text('Name: pyzotero\nVersion: 1.15.1\n')
            (dist / 'top_level.txt').write_text('pyzotero\n')
            output = root / 'audit.json'
            base = [sys.executable, str(SCRIPT), '--skills-root', str(root/'skills'), '--site-packages', str(site), '--output', str(output)]
            subprocess.run(base, check=True, capture_output=True)
            result = json.loads(output.read_text('utf-8'))['skills'][0]
            self.assertEqual(result['status'], 'optional')
            self.assertEqual([r['name'] for r in result['requirements']], ['pyzotero'])
            proof = root / 'proof.json'
            proof.write_text(json.dumps({'python':'3.12.10','isolated':True,'packages':{'pyzotero':'1.15.1'},'imports':{'pyzotero':{'ok':True}}}))
            subprocess.run([*base, '--verification', str(proof)], check=True, capture_output=True)
            result = json.loads(output.read_text('utf-8'))['skills'][0]
            self.assertEqual(result['status'], 'managed')
            self.assertTrue(any('/vendor/' in s['file'] for s in result['requirements'][0]['sources']))
            (skill / 'requirements.txt').write_text('pyzotero>=99\n')
            subprocess.run([*base, '--verification', str(proof)], check=True, capture_output=True)
            result = json.loads(output.read_text('utf-8'))['skills'][0]
            self.assertEqual(result['status'], 'optional')
            self.assertEqual(result['requirements'][0]['validation'], 'version-mismatch')


if __name__ == '__main__':
    unittest.main()
