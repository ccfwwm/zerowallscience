"""Independent pydna PCR/assembly/digestion and Biopython restriction reference."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.build' / 'sequence-reference-python'))
import Bio
import pydna
from Bio.Restriction import BsaI, BsmBI
from Bio.Seq import Seq
from pydna.amplify import pcr
from pydna.assembly import Assembly
from pydna.dseqrecord import Dseqrecord

def circle_matches(a, b):
    return len(a) == len(b) and (a in b+b or str(Seq(a).reverse_complement()) in b+b)

data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
linear = pcr(data['forward'], data['reverse'], Dseqrecord(data['template']), limit=20)
circular = pcr(data['circularForward'], data['circularReverse'], Dseqrecord(data['template'], circular=True), limit=20)
assembly = Assembly([Dseqrecord(s) for s in data['gibson']], limit=20)
gibson = assembly.assemble_circular()
digests = []
golden = []
for name, enzyme in [('BsaI', BsaI), ('BsmBI', BsmBI)]:
    sequences = data['golden'] if name == 'BsaI' else [s.replace('GGTCTC', 'CGTCTC').replace('GAGACC', 'GAGACG') for s in data['golden']]
    pieces = []
    for sequence in sequences:
        fragments = Dseqrecord(sequence).cut(enzyme)
        if len(fragments) != 3:
            raise RuntimeError('Expected two cuts and three linear fragments')
        pieces.append(fragments[1])
    product = pieces[0]
    for fragment in pieces[1:]:
        product += fragment
    product = product.looped()
    golden.append({'enzyme': name, 'sequence': str(product.seq).upper(), 'circularEquivalent': circle_matches(str(product.seq).upper(), data['goldenExpected'])})
    digests.append({'enzyme': name, 'cuts': [enzyme.search(Seq(s), linear=True) for s in sequences], 'retainedWatson': [str(p.seq.watson).upper() for p in pieces], 'overhangs': [p.seq.ovhg for p in pieces]})
result = {'versions': {'python': sys.version.split()[0], 'pydna': pydna.__version__, 'biopython': Bio.__version__},
          'pcr': str(linear.seq).upper(), 'circularPcr': str(circular.seq).upper(),
          'gibson': {'products': len(gibson), 'circularEquivalent': bool(gibson) and all(circle_matches(str(p.seq).upper(), data['gibsonExpected']) for p in gibson)},
          'golden': golden, 'digests': digests}
print(json.dumps(result))
