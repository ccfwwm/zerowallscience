/** Trusted, bundled adapters. User image/ROI content is passed as JSON, never Python source. */
const common = String.raw`
import os, json, hashlib, uuid, math, sys

def load_request():
    with open(os.environ['ZEROWALL_ANNOTATION_REQUEST'], 'rb') as handle:
        request = json.loads(handle.read().decode('utf-8'))
    digest = hashlib.sha256()
    with open(request['sourcePath'], 'rb') as handle:
        while True:
            chunk = handle.read(1048576)
            if not chunk: break
            digest.update(chunk)
    if digest.hexdigest() != request['document']['sourceSha256']:
        raise ValueError('Source image changed since launch')
    return request

def save_return(request, rois, origin):
    document = dict(request['document'])
    coordinates = document['payload']['coordinates']
    seen = set()
    if len(rois) > 10000: raise ValueError('ROI count limit exceeded')
    for roi in rois:
        if not roi['id'] or roi['id'] in seen: roi['id'] = str(uuid.uuid4())
        seen.add(roi['id'])
        if roi['kind'] == 'rectangle':
            if roi['width'] <= 0 or roi['height'] <= 0: raise ValueError('Empty rectangle')
            points = [(roi['x'],roi['y']),(roi['x']+roi['width'],roi['y']+roi['height'])]
        elif roi['kind'] == 'point': points = [(roi['x'],roi['y'])]
        else: points = roi['points']
        for x,y in points:
            if math.isnan(x) or math.isnan(y) or math.isinf(x) or math.isinf(y) or not (0 <= x <= coordinates['width'] and 0 <= y <= coordinates['height']):
                raise ValueError('ROI is outside original image bounds')
    document['payload'] = {'coordinates':coordinates,'rois':rois}
    document['origin'] = origin
    document['bridgeId'] = request['bridgeId']
    # Exclusive output: never overwrite an earlier native return, even after Host restarts.
    data = (json.dumps(document, ensure_ascii=True, allow_nan=False, indent=2)+'\n').encode('utf-8')
    descriptor = os.open(request['returnPath'], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
`

export const napariAnnotationAdapter = common + String.raw`
import numpy as np

def build_layers(viewer, document):
    shapes = viewer.add_shapes(name='ZeroWall ROI', ndim=2, edge_color='yellow', face_color='transparent')
    points = viewer.add_points(np.empty((0,2)), name='ZeroWall points', size=5, face_color='yellow')
    shapes_data, shape_types, shape_ids, shape_names = [], [], [], []
    point_data, point_ids, point_names = [], [], []
    for roi in document['payload']['rois']:
        if roi['kind'] == 'point':
            point_data.append([roi['y']-0.5,roi['x']-0.5]); point_ids.append(roi['id']); point_names.append(roi['name'])
            continue
        if roi['kind'] == 'rectangle':
            x,y,w,h = roi['x'],roi['y'],roi['width'],roi['height']
            vertices = [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]
        else: vertices = roi['points']
        shapes_data.append([[y-0.5,x-0.5] for x,y in vertices])
        shape_types.append(roi['kind']); shape_ids.append(roi['id']); shape_names.append(roi['name'])
    if shapes_data: shapes.add(shapes_data, shape_type=shape_types)
    shapes.properties = {'roi_id':np.array(shape_ids,dtype=str),'roi_name':np.array(shape_names,dtype=str)}
    if point_data: points.data = np.array(point_data,dtype=float)
    points.properties = {'roi_id':np.array(point_ids,dtype=str),'roi_name':np.array(point_names,dtype=str)}
    shapes.current_properties = {'roi_id':np.array(['']),'roi_name':np.array(['ROI'])}
    points.current_properties = {'roi_id':np.array(['']),'roi_name':np.array(['Point'])}
    return shapes, points

def collect_layers(viewer, image, shapes, points):
    rois = []
    for layer in (image,shapes,points):
        if layer not in viewer.layers: raise ValueError('Required bridge layer was removed; undo deletion before exporting')
        if not np.allclose(layer.data_to_world((0,0)),(0,0),rtol=0,atol=1e-8) or not np.allclose(layer.data_to_world((1,0)),(1,0),rtol=0,atol=1e-8) or not np.allclose(layer.data_to_world((0,1)),(0,1),rtol=0,atol=1e-8):
            raise ValueError('Layer transforms must remain identity')
    if len(viewer.layers) != 3: raise ValueError('Additional layers cannot be exported by this ROI bridge')
    def base(layer,index):
        return {'id':str(layer.properties['roi_id'][index]),'name':str(layer.properties['roi_name'][index]) or 'ROI','page':0}
    for i,vertices in enumerate(shapes.data):
        kind = shapes.shape_type[i]
        if kind not in ('rectangle','polygon'): raise ValueError('Only rectangle and polygon shapes are supported')
        xy = [[float(p[1])+0.5,float(p[0])+0.5] for p in vertices]
        roi = base(shapes,i)
        xs,ys = [p[0] for p in xy],[p[1] for p in xy]
        # Rotated rectangles must stay polygons; their bounding box is not the original ROI.
        if kind == 'rectangle' and all(abs(x-min(xs))<1e-7 or abs(x-max(xs))<1e-7 for x in xs) and all(abs(y-min(ys))<1e-7 or abs(y-max(ys))<1e-7 for y in ys):
            roi.update(kind='rectangle',x=min(xs),y=min(ys),width=max(xs)-min(xs),height=max(ys)-min(ys))
        else: roi.update(kind='polygon',points=xy)
        rois.append(roi)
    for i,p in enumerate(points.data):
        roi = base(points,i); roi.update(kind='point',x=float(p[1])+0.5,y=float(p[0])+0.5); rois.append(roi)
    return rois

def main():
    import napari
    import imageio.v3 as iio
    from qtpy.QtWidgets import QPushButton, QMessageBox
    request = load_request(); document = request['document']; coordinates = document['payload']['coordinates']
    data = iio.imread(request['sourcePath'])
    if data.shape[:2] != (coordinates['height'],coordinates['width']) or data.ndim not in (2,3) or (data.ndim==3 and data.shape[2] not in (3,4)):
        raise ValueError('Decoded axes do not match the single-page image contract')
    viewer = napari.Viewer(title='ZeroWall ROI - '+request['bridgeId'])
    image = viewer.add_image(data, name='Source (original pixels)', rgb=data.ndim==3)
    shapes,points = build_layers(viewer,document)
    button = QPushButton('Save ROI return (once)')
    def save():
        try:
            save_return(request,collect_layers(viewer,image,shapes,points),'napari')
            button.setEnabled(False)
            QMessageBox.information(None,'ZeroWall','Saved. Return to the workbench and collect this revision.')
        except Exception as error: QMessageBox.critical(None,'ZeroWall',str(error))
    button.clicked.connect(save)
    viewer.window.add_dock_widget(button,name='ZeroWall annotation return',area='right')
    print('ZEROWALL_ANNOTATION_READY '+request['bridgeId']); sys.stdout.flush()
    napari.run()

if __name__ == '__main__': main()
`

export const fijiAnnotationAdapter = common + String.raw`
from ij import IJ
from ij.gui import Roi, PolygonRoi, PointRoi
from ij.plugin.frame import RoiManager
from java.awt import Button, Frame, BorderLayout
from jarray import array

def build_rois(manager, document):
    for item in document['payload']['rois']:
        if item['kind']=='rectangle': roi=Roi(float(item['x']),float(item['y']),float(item['width']),float(item['height']))
        elif item['kind']=='point': roi=PointRoi(float(item['x'])-0.5,float(item['y'])-0.5)
        else: roi=PolygonRoi(array([float(p[0]) for p in item['points']],'f'),array([float(p[1]) for p in item['points']],'f'),len(item['points']),Roi.POLYGON)
        roi.setName(item['name']); roi.setProperty('zerowall.id',item['id']); manager.addRoi(roi)

def collect_rois(manager):
    result=[]
    for roi in manager.getRoisAsArray():
        item={'id':str(roi.getProperty('zerowall.id') or uuid.uuid4()),'name':unicode(roi.getName() or 'ROI'),'page':0}
        kind=roi.getType()
        if kind==Roi.RECTANGLE:
            if roi.getCornerDiameter()!=0: raise ValueError('Rounded rectangles require an explicit polygon')
            bounds=roi.getFloatBounds(); item.update(kind='rectangle',x=bounds.x,y=bounds.y,width=bounds.width,height=bounds.height)
        elif kind==Roi.POINT:
            points=roi.getFloatPolygon()
            if points.npoints!=1: raise ValueError('Split multi-point ROIs into single points before returning')
            item.update(kind='point',x=float(points.xpoints[0])+0.5,y=float(points.ypoints[0])+0.5)
        elif kind==Roi.POLYGON:
            points=roi.getFloatPolygon(); item.update(kind='polygon',points=[[float(points.xpoints[i]),float(points.ypoints[i])] for i in range(points.npoints)])
        else: raise ValueError('Only rectangle, polygon and single-point ROIs are supported')
        result.append(item)
    return result

def main():
    request=load_request(); document=request['document']; coordinates=document['payload']['coordinates']
    image=IJ.openImage(request['sourcePath'])
    if image is None or image.getWidth()!=coordinates['width'] or image.getHeight()!=coordinates['height'] or image.getStackSize()!=1:
        raise ValueError('Image geometry does not match single-page bridge contract')
    manager=RoiManager.getInstance()
    if manager is not None and manager.getCount()>0: raise ValueError('Existing ROI Manager is not empty; preserve its content and use a fresh bridge instance')
    if manager is None: manager=RoiManager()
    build_rois(manager,document); image.show(); manager.runCommand(image,'Show All')
    frame=Frame('ZeroWall ROI - '+request['bridgeId']); button=Button('Save ROI Manager return (once)')
    def save(event):
        try:
            if image.getWidth()!=coordinates['width'] or image.getHeight()!=coordinates['height'] or image.getStackSize()!=1: raise ValueError('Source geometry changed')
            save_return(request,collect_rois(manager),'fiji'); button.setEnabled(False)
            IJ.showMessage('ZeroWall','Saved. Return to the workbench and collect this revision.')
        except Exception as error: IJ.error('ZeroWall',str(error))
    button.addActionListener(save); frame.add(button,BorderLayout.CENTER); frame.pack(); frame.setVisible(True)
    with open(request['returnPath']+'.ready','w') as ready: ready.write(request['bridgeId'])
    print('ZEROWALL_ANNOTATION_READY '+request['bridgeId']); sys.stdout.flush()

if __name__ == '__main__' or os.environ.get('ZEROWALL_ANNOTATION_AUTORUN') == '1':
    try: main()
    except Exception:
        import traceback
        with open(os.environ['ZEROWALL_ANNOTATION_REQUEST']+'.error','w') as error:
            error.write(traceback.format_exc())
        raise
`
