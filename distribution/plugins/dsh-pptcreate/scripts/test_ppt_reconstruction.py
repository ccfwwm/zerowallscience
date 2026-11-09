"""Local reconstruction regressions; no OCR inference or network requests."""
import importlib.util
import pathlib
import unittest
import tempfile
import json
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw, ImageFont

spec = importlib.util.spec_from_file_location('reconstruct', pathlib.Path(__file__).with_name('ppt-reconstruct.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FontFitTests(unittest.TestCase):
    def test_regular_glyphs_are_not_automatically_promoted_to_bold(self):
        regular=pathlib.Path('C:/Windows/Fonts/arial.ttf');bold=regular.with_name('arialbd.ttf')
        if not regular.is_file() or not bold.is_file():self.skipTest('Windows font fixtures unavailable')
        target=worker.analysis.glyph_image('Research 60%',str(regular),75)[0]
        fit=worker.fit_font('Research 60%',target,[(str(bold),'Arial',True),(str(regular),'Arial',False)])
        self.assertFalse(fit['bold'])

    def test_missing_cjk_glyph_is_not_a_font_match(self):
        latin = pathlib.Path('C:/Windows/Fonts/arial.ttf')
        cjk = pathlib.Path('C:/Windows/Fonts/msyh.ttc')
        if not latin.is_file() or not cjk.is_file(): self.skipTest('Windows font fixtures unavailable')
        self.assertFalse(worker.font_has_glyph(str(latin), '\u7814'))
        self.assertTrue(worker.font_has_glyph(str(cjk), '\u7814'))
        font = ImageFont.truetype(str(cjk), 90)
        text = '\u79d1\u7814\u673a\u5236'
        box = font.getbbox(text)
        image = Image.new('L', (box[2], box[3]-box[1]))
        ImageDraw.Draw(image).text((0, -box[1]), text, font=font, fill=255)
        fit = worker.fit_font(text, np.asarray(image), [(str(latin), 'Arial', False), (str(cjk), 'Microsoft YaHei', False)])
        self.assertEqual(fit['family'], 'Microsoft YaHei')

    def test_font_size_respects_source_width(self):
        paths = [pathlib.Path('C:/Windows/Fonts/arial.ttf'), pathlib.Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
        path = next((path for path in paths if path.is_file()), None)
        if path is None: self.skipTest('Font fixture unavailable')
        font = ImageFont.truetype(str(path), 100)
        text = 'Mechanism and rescue'
        box = font.getbbox(text)
        image = Image.new('L', (box[2], box[3]-box[1]))
        ImageDraw.Draw(image).text((0, -box[1]), text, font=font, fill=255)
        image = image.resize((round(image.width*.8), image.height))
        fit = worker.fit_font(text, np.asarray(image), [(str(path), font.getname()[0], False)])
        self.assertLessEqual(fit['glyphWidth'], image.width*1.02)
        self.assertLess(fit['sizePx'], 90)


class EvidenceTests(unittest.TestCase):
    def test_repair_rejects_old_layout_evidence_even_when_the_source_is_identical(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            receipt={'source':{'sha256':'same-source'},'elements':[]}
            comparison={'sourceSha256':'same-source','elementsSha256':'different-layout','regions':[]}
            (root/'receipt.json').write_text(json.dumps(receipt),'utf-8')
            (root/'comparison.json').write_text(json.dumps(comparison),'utf-8')
            with self.assertRaisesRegex(ValueError,'different text layout'):
                worker.repair_render({'receipt':str(root/'receipt.json'),'comparisonPath':str(root/'comparison.json'),'outputDir':directory})

    def test_probe_rejects_neighbor_ink_and_accepts_antialiasing(self):
        color='#183F18';fg=np.array([24,63,24])
        pixels=np.full((40,150,3),255,np.uint8)
        pixels[8:28,10:60]=fg
        pixels[8:28,60]=np.rint(fg*.6+255*.4)
        pixels[8:28,80:140]=[24,24,24]
        mask=worker.analysis.probe_ink(pixels,color)
        self.assertEqual(worker.analysis.tight(mask),[10,8,61,28])
        self.assertEqual(mask[:,80:].sum(),0)

    def test_different_glyph_strokes_fail_even_with_identical_bounding_boxes(self):
        import cv2
        first=np.zeros((80,80),dtype=np.uint8);second=first.copy()
        cv2.rectangle(first,(10,10),(70,70),255,4)
        cv2.line(second,(10,10),(70,70),255,4);cv2.line(second,(10,70),(70,10),255,4)
        self.assertEqual(worker.analysis.outline_distance(first,first),0)
        self.assertGreater(worker.analysis.outline_distance(first,second),2)

    def test_protected_scientific_crop_keeps_all_pixels_and_prevents_ocr_erasure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=pathlib.Path(temporary);rng=np.random.default_rng(7)
            original=rng.integers(0,256,(100,100,3),dtype=np.uint8)
            source=root/'source.png';Image.fromarray(original).save(source)
            rows=[[[[25,25],[65,25],[65,45],[25,45]],'H1',.99]]
            with patch.object(worker.analysis,'recognize',return_value=(rows,{'globalRegions':1})),patch.object(worker,'ocr_engine',return_value=None):
                receipt=worker.reconstruct({'image':str(source),'page':1,'width':100,'height':100,'outputDir':str(root/'out'),
                    'regions':[{'kind':'scientific-image','sourceBounds':[20,20,60,60]}]})
            component=next(c for c in receipt['components'] if c['type']=='scientific-image')
            self.assertTrue(component['sourcePixelsPreserved'])
            self.assertEqual(next(c for c in receipt['components'] if c['type']=='text')['reason'],'protected-scientific-region')
            self.assertFalse(any(e['elementType']=='text' for e in receipt['elements']))
            image=next(e for e in receipt['elements'] if e['elementId']==component['id'])
            np.testing.assert_array_equal(np.asarray(Image.open(root/'out'/image['src'])),original[20:80,20:80])

    def test_independent_inventory_detects_a_text_missing_from_all_ocr_results(self):
        inventory={'sourceSha256':'image-hash','verifiedAgainstSource':True,'reviewer':'source-review',
                   'complete':True,'scientificImagesReviewed':True,'items':[
                       {'id':'title','type':'text','sourceBounds':[10,10,200,40],'text':'Research'},
                       {'id':'missing','type':'text','sourceBounds':[10,80,200,40],'text':'Ku70'}]}
        components=[{'id':'ocr-title','type':'text','sourceRegion':[10,10,200,40],
                     'text':'Research','editMode':'native-text'}]
        result=worker.analysis.validate_inventory(inventory,'image-hash',components)
        self.assertEqual(result['expectedItems'],2);self.assertEqual(result['matchedItems'],1)
        self.assertFalse(result['contentVerified']);self.assertEqual(result['issues'][0]['id'],'missing')
        inventory['sourceSha256']='stale-image'
        with self.assertRaisesRegex(ValueError,'hash'):worker.analysis.validate_inventory(inventory,'image-hash',components)

    def test_partial_inventory_and_conflicting_native_text_never_approve_quality(self):
        inventory={'sourceSha256':'s','verifiedAgainstSource':True,'reviewer':'source-review','items':[
            {'id':'label','type':'text','sourceBounds':[0,0,100,20],'text':'H1'}]}
        components=[{'id':'ocr-label','type':'text','sourceRegion':[0,0,100,20],'text':'HI','editMode':'native-text'}]
        result=worker.analysis.validate_inventory(inventory,'s',components)
        self.assertFalse(result['inventoryVerified'])
        self.assertEqual({x['reason'] for x in result['issues']},{'text-conflict','inventory-incomplete'})

    def test_native_panel_keeps_source_edge_details_and_rejects_photography(self):
        rgb=np.full((120,240,3),[220,235,247],np.uint8)
        rgb[:3]=[20,80,120];rgb[50:65,70:110]=[220,20,40]
        result=worker.analysis.panel_layers(rgb)
        self.assertIsNotNone(result);self.assertGreater(result['explainedInterior'],.9)
        self.assertEqual(result['residual'][60,80,3],255)
        self.assertEqual(result['residual'][80,80,3],0)
        self.assertTrue(np.array_equal(result['residual'][:,:,:3],rgb))
        rng=np.random.default_rng(42)
        self.assertIsNone(worker.analysis.panel_layers(rng.integers(0,256,(120,240,3),dtype=np.uint8)))

    def test_review_cannot_mutate_raw_ocr_confidence_or_reuse_derived_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'ocr.json';rows=[[[[0,0],[100,0],[100,20],[0,20]],'H1',.73]]
            passes={'globalRegions':1,'characters':[{'text':'H','box':[0,0,1,1],'confidence':.8}]}
            value={'schemaVersion':3,'fingerprint':'source','results':rows,'passes':passes,'rawDigest':worker.analysis.digest({'results':rows,'passes':passes})}
            path.write_text(json.dumps(value),'utf-8')
            self.assertEqual(worker.analysis.read_raw_cache(path,'source')['results'][0][2],.73)
            value['results'][0][2]=0;path.write_text(json.dumps(value),'utf-8')
            self.assertIsNone(worker.analysis.read_raw_cache(path,'source'))
            value['rawDigest']=worker.analysis.digest(value['results']);value['derivedFrom']='failed-review'
            path.write_text(json.dumps(value),'utf-8');self.assertIsNone(worker.analysis.read_raw_cache(path,'source'))
            value['rawDigest']=worker.analysis.digest({'results':value['results'],'passes':value['passes']});value.pop('derivedFrom')
            value['passes']['characters'][0]['confidence']=0;path.write_text(json.dumps(value),'utf-8')
            self.assertIsNone(worker.analysis.read_raw_cache(path,'source'))
            value['schemaVersion']=2;path.write_text(json.dumps(value),'utf-8')
            self.assertIsNone(worker.analysis.read_raw_cache(path,'source'))

    def test_local_word_cannot_duplicate_its_global_line(self):
        line=[[[10,10],[210,10],[210,35],[10,35]],'Research mechanism',.98]
        word=[[[12,12],[95,12],[95,34],[12,34]],'Research',.999]
        missed=[[[10,90],[110,90],[110,115],[10,115]],'New label',.99]
        rows=[line,word,missed];original=json.dumps(rows)
        selected=worker.analysis.select_ocr(rows,{'globalRegions':1})
        self.assertEqual([row[1] for row in selected],['Research mechanism','New label'])
        self.assertEqual(json.dumps(rows),original)

    def test_repair_uses_actual_render_shift_without_moving_other_objects(self):
        receipt={'width':960,'height':540,'elements':[
            {'elementId':'title','elementType':'text','bounds':[10,20,200,50],'content':{'text':'Research','fontSize':30}},
            {'elementId':'photo','elementType':'image','bounds':[300,50,200,100]}]}
        comparison={'regions':[{'id':'title','alignment':{'edgeError':8,'dx':-4,'dy':8,'heightRatio':1,'sourceInkBounds':[10,20,180,30],'renderInkBounds':[14,12,180,30]}}]}
        result,changes=worker.analysis.repair_elements(receipt,comparison)
        self.assertEqual(result[0]['bounds'][:2],[6,28]);self.assertEqual(result[1],receipt['elements'][1])
        self.assertEqual(receipt['elements'][0]['bounds'][:2],[10,20]);self.assertEqual(len(changes),1)

    def test_movable_cutout_does_not_leave_a_duplicate_on_plain_canvas(self):
        rgb=np.full((100,200,3),[30,80,120],np.uint8);rgb[30:70,60:140]=[230,20,50]
        plane,reliable=worker.analysis.region_underlay(rgb,[60,30,140,70])
        self.assertTrue(reliable);self.assertLess(np.max(abs(plane.astype(int)-[30,80,120])),2)


if __name__ == '__main__': unittest.main()
