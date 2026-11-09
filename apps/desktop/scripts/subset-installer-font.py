"""Rebuild the private installer font from Noto Sans SC (SIL OFL 1.1).

Requires fonttools 4.60.1. The source is supplied explicitly; ordinary Windows
packaging consumes the committed subset and does not download or subset fonts.
"""
import argparse
import hashlib
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
text = ''.join(chr(index) for index in range(32, 256)) + 'ZeroWallScience✓−×'
for locale in sorted((root / 'installer/locales').glob('*.json')):
    text += ''.join(json.loads(locale.read_text(encoding='utf-8'))['strings'].values())
font = TTFont(args.source)
font = instantiateVariableFont(font, {'wght': 450}, inplace=True)
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
family = 'ZeroWall Research Sans'
for name_id, value in {1:family,2:'Regular',3:'ZeroWallResearchSans-Regular-1',4:family,6:'ZeroWallResearchSans-Regular',16:family,17:'Regular'}.items():
    font['name'].setName(value,name_id,3,1,0x409)
    font['name'].setName(value,name_id,1,0,0)
font['OS/2'].fsSelection &= ~(1 << 5)
font['OS/2'].fsSelection |= 1 << 6
font['head'].macStyle = 0
target = root / 'installer/assets/research-font.ttf'
font.recalcTimestamp = False
font.save(target)
record = {
    'family': family,
    'sourceUrl': 'https://github.com/google/fonts/tree/main/ofl/notosanssc',
    'sourceSha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
    'fontToolsVersion': '4.60.1',
    'weight': 450,
    'glyphs': len(font.getGlyphOrder()),
    'bytes': target.stat().st_size,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'license': 'OFL-research-font.txt',
}
(target.parent/'research-font.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record,indent=2))
