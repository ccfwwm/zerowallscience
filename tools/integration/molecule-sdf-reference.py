"""Independent RDKit read-only reference; reads JSON stdin, writes JSON stdout."""
import io
import json
import math
import sys
from rdkit import Chem, rdBase

references = []
for case in json.load(sys.stdin):
    records = list(Chem.ForwardSDMolSupplier(io.BytesIO(case['source'].encode('utf-8')), sanitize=True, removeHs=False, strictParsing=True))
    assert len(records) == 1 and records[0] is not None
    mol = records[0]
    summary = case['summary']
    assert mol.GetNumAtoms() == summary['atomCount']
    assert mol.GetNumBonds() == len(summary['bonds'])
    conf = mol.GetConformer()
    errors = []
    for i, atom in enumerate(mol.GetAtoms()):
        supplied = summary['atoms'][i]
        assert atom.GetSymbol() == supplied['element']
        assert atom.GetFormalCharge() == supplied['formalCharge']
        position = conf.GetAtomPosition(i)
        errors.extend(abs(value - supplied[key]) for key, value in zip(['x', 'y', 'z'], [position.x, position.y, position.z]))
    expected = sorted((min(b.GetBeginAtomIdx(), b.GetEndAtomIdx()), max(b.GetBeginAtomIdx(), b.GetEndAtomIdx()), 4 if b.GetIsAromatic() else int(b.GetBondTypeAsDouble())) for b in mol.GetBonds())
    actual = sorted((min(b['atomA'], b['atomB']), max(b['atomA'], b['atomB']), b['order']) for b in summary['bonds'])
    assert actual == expected
    distance = (conf.GetAtomPosition(0) - conf.GetAtomPosition(1)).Length()
    assert math.isclose(distance, case['distance'], rel_tol=0, abs_tol=1e-9)
    assert max(errors) <= 1e-9
    references.append({'encoding': summary['sdfEncoding'], 'atoms': mol.GetNumAtoms(), 'bonds': mol.GetNumBonds(), 'canonicalSmiles': Chem.MolToSmiles(mol), 'distanceAngstrom': distance, 'maxCoordinateError': max(errors)})
print(json.dumps({'status': 'passed', 'rdkit': rdBase.rdkitVersion, 'tolerance': 1e-9, 'references': references, 'scope': 'Synthetic ethanol coordinate parsing, element/charge/bond and distance reference only; no preparation or docking'}))
