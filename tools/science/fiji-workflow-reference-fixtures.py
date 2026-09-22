"""Generate independent geometric Fiji workflow fixtures. Does not import product code.

These are proposed acceptance inputs/oracles, not proof that the application supports
batching, mask revisions, temporal linkage, or biological validity.
"""
from pathlib import Path
import argparse, hashlib, json, datetime


def digest(data):
    return hashlib.sha256(data).hexdigest()


def generate(root):
    root.mkdir(parents=True, exist_ok=False)
    inventory = []

    def image(name, width, height, rectangles, background=0):
        pixels = bytearray([background] * (width * height))
        for x, y, w, h, value in rectangles:
            assert x >= 0 and y >= 0 and x+w <= width and y+h <= height
            for row in range(y, y+h):
                pixels[row*width+x:row*width+x+w] = bytes([value])*w
        content = f'P5\n{width} {height}\n255\n'.encode() + pixels
        (root/name).write_bytes(content)
        record = {'path': name, 'sha256': digest(content), 'width': width, 'height': height,
                  'bytes': len(content), 'foregroundGeometries': rectangles}
        inventory.append(record)
        return record

    # 8*6, 4*6, 0 geometric pixels. Nonzero ROI origin tests coordinate mapping.
    scratch = [image(f'scratch-S1-{hour}h.pgm', 24, 16, [(5,4,w,6,200)] if w else [])
               for hour,w in [(0,8),(24,4),(48,0)]]
    scratch_expanded = image('scratch-S1-expanded-24h.pgm',24,16,[(4,4,10,6,200)])
    # Two isolated 3*3 colonies, one 3*3 reflection, one two-colony touching object
    # consisting of 3*3 squares and a 1*1 bridge, plus one edge object and debris.
    source = image('colony-A1-raw.pgm',40,24,[(4,4,3,3,200),(12,4,3,3,200),(20,4,3,3,255),
                    (4,13,3,3,200),(8,13,3,3,200),(7,14,1,1,200),(0,19,2,2,200),(30,19,1,1,200)])
    excluded = image('colony-A1-exclusion-mask.pgm',40,24,[(20,4,3,3,255),(0,19,2,2,255)])
    corrected = image('colony-A1-reviewed-mask.pgm',40,24,[(4,4,3,3,255),(12,4,3,3,255),(4,13,3,3,255),(8,13,3,3,255)])
    well_b = image('colony-B1-raw.pgm',40,24,[(6,6,3,3,200)])
    # A square ring, then an explicit reviewed 1-pixel break on the top edge.
    tube = image('tube-ring.pgm',20,20,[(5,5,7,1,255),(5,11,7,1,255),(5,6,1,5,255),(11,6,1,5,255)])
    tube_open = image('tube-ring-reviewed.pgm',20,20,[(5,5,3,1,255),(9,5,3,1,255),(5,11,7,1,255),(5,6,1,5,255),(11,6,1,5,255)])
    # Bright-band oracle uses two-pixel regions against background 10.
    blot = image('western-four-lanes.pgm',24,12,[(2,2,2,1,110),(7,2,2,1,210),(12,2,2,1,255),(17,2,2,1,110),
                 (2,7,2,1,60),(7,7,2,1,60),(12,7,2,1,60),(17,7,2,1,10)],background=10)
    manifest = {
        'format':'zerowall-fiji-workflow-reference-fixtures','version':1,
        'scope':'Synthetic geometric reference and proposed integration acceptance; no product capability or biological validation claim',
        'inventory':inventory,
        'scratch':{'roi':{'x':2,'y':2,'width':18,'height':12},'sampleId':'S1','fieldId':'F1','biologicalReplicate':'donor-1',
                   'expectedHours':[0,24,48],'inputs':[{'timeHours':t,'asset':r['path'],'sha256':r['sha256']} for t,r in zip([0,24,48],scratch)],
                   'expected':{'initialAreaPixel':48,'remainingAreaPixel':[48,24,0],'closurePercent':[0,50,100]},
                   'missing24h':{'availableHours':[0,48],'missingHours':[24],'interpolation':'forbidden'},
                   'expanded':{'asset':scratch_expanded['path'],'remainingAreaPixel':60,'closurePercent':-25,'flag':'wound_area_expanded'},
                   'invalidCases':['duplicate S1/F1/24h','missing baseline','baseline from S2/F1','pixel spacing changes without physical area conversion','registration changed ROI without provenance']},
        'colony':{'plateId':'plate-1','wellLayout':{'A1':source['path'],'B1':well_b['path']},'minAreaPixel':2,'maxAreaPixel':100,
                  'expectedA1':{'thresholdForegroundPixel':51,'acceptedBeforeExclusions':5,'debrisCount':1,
                                'exclusionMask':excluded['path'],'acceptedAfterExclusions':3,'areaAfterExclusionAndAreaFilterPixel':37,
                                'reviewedMask':corrected['path'],'reviewedCount':4,'reviewedAreaPixel':36,
                                'seededCells':100,'colonyFormationFraction':0.04,'platingEfficiencyPercent':4},
                  'expectedB1':{'count':1,'areaPixel':9,'seededCells':None,'formationFraction':None},
                  'independence':'A1/B1 are wells; biological independence requires declared sample metadata',
                  'manualEdit':{'sourceSha256':source['sha256'],'baseRevision':1,'nextRevision':2,'reason':'exclude declared reflection/edge; remove bridge after review',
                                'reviewedMaskSha256':corrected['sha256'],'oldResultDisposition':'retained_needs_recheck'}},
        'bacterial':{'image':source['path'],'exclusions':excluded['path'],'reviewedMask':corrected['path'],
                     'count':4,'withMetadata':{'reciprocalDilution':1000,'platedVolumeMl':0.1,'expectedCfuPerMl':40000},
                     'missingVolume':{'count':4,'cfuPerMl':None,'status':'metadata_incomplete'},
                     'invalidCases':['zero volume','negative reciprocal dilution','count-only export labelled CFU/mL','reflection ROI from wrong source hash'],
                     'revisedCount':{'removeReviewedObjectIds':['reviewed-colony-4'],'note':'Use source-bound object IDs; never apply edits by array position across reruns'}},
        'tube':{'source':tube['path'],'reviewedMask':tube_open['path'],'expectedGraphCyclesBefore':1,'expectedGraphCyclesAfter':0,
                'definition':'E-V+C from native AnalyzeSkeleton graph; not enclosed area',
                'lengthAcceptance':'Compare against separately executed same-version native plugin; do not substitute pixel count for edge length',
                'requiredArtifacts':['mask','skeleton','pluginFields','graph','edge lengths','QC overlay','annotation revision']},
        'western':{'image':blot['path'],'polarity':'bright','bandAreas':[2,2,2,2],'backgroundMean':10,'controlLane':0,
                   'expectedCorrectedIntensity':[200,400,490,200],'expectedLoadingCorrected':[100,100,100,0],
                   'expectedNormalized':[2,4,4.9,None],'expectedRelativeControl':[1,2,2.45,None],
                   'requiredFlags':{'lane2':'saturated_high','lane3':'nonpositive_loading'},
                   'review':'Keep saturated values and QC flags; do not silently promote clipped values to valid comparative inference'},
        'batch':{'items':['scratch S1 0h','scratch S1 24h','missing image','colony A1','colony B1'],
                 'concurrency':1,'expectedOutcome':'partial_completion','failedItems':['missing image'],
                 'restart':'completed items retain same run IDs; reconcile in-flight ownership before rerun',
                 'idempotency':'same batch manifest and request ID returns same child runs; changed mask creates revision and new explicit request',
                 'cancel':'cancel pending and owned current item; preserve completed artifacts',
                 'result':'one row per declared input with success, failure, skipped or missing; never drop failed rows'}
    }
    # Independent hand-enumerated areas; no threshold/connected-component implementation is imported.
    assert 9+9+9+19+4+1 == 51
    assert 9+9+19 == 37
    assert 4*9 == 36
    assert 4*1000/0.1 == 40000
    assert [(48-v)/48*100 for v in [48,24,0]] == [0,50,100]
    (root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    verified = all(digest((root/i['path']).read_bytes())==i['sha256'] for i in inventory)
    (root/'fixture-selfcheck.json').write_text(json.dumps({'passed':verified,'files':len(inventory),
        'validation':'PGM bytes and independent geometric arithmetic only; application integration NOT run'},indent=2)+'\n',encoding='utf8')
    print(root)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    generate(args.output or Path('.build/fiji-workflow-fixtures')/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
