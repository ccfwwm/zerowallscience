export const BRAIN_GLOBE_RUNNER = String.raw`import base64, csv, io, json, os, sys
from pathlib import Path
import numpy as np
from brainglobe_atlasapi import BrainGlobeAtlas

def fail(message):
    print(json.dumps({"error": str(message)}, ensure_ascii=False)); raise SystemExit(2)

try:
    request = json.load(sys.stdin)
    atlas_name = request.get("atlas", "allen_mouse_25um")
    if atlas_name != "allen_mouse_25um":
        fail("Only the Allen adult mouse 25 um atlas is enabled in the first BrainGlobe runner.")
    atlas_dir = request.get("brainglobeDir")
    if not atlas_dir: fail("A managed BrainGlobe atlas directory is required.")
    atlas = BrainGlobeAtlas(atlas_name, brainglobe_dir=atlas_dir, check_latest=False)
    structures = atlas.structures
    def structure_record(item):
        return {"id": int(item.get("id", item.get("annotation_value", 0))), "acronym": str(item.get("acronym", "")), "name": str(item.get("name", "")), "parentId": (None if item.get("parent_structure_id") is None else int(item["parent_structure_id"]))}
    def region_matches(query):
        q = str(query or "").strip().lower()
        return [structure_record(value) for value in structures.values() if q in str(value.get("name", "")).lower() or q == str(value.get("acronym", "")).lower() or q == str(value.get("id", "")).lower()]
    def atlas_summary():
        metadata = atlas.metadata
        values = list(structures.values())
        values.sort(key=lambda item: (len(item.get("structure_id_path", [])), int(item.get("id", 0))))
        return {"atlas": atlas_name, "version": str(metadata.get("version")) if metadata.get("version") is not None else None, "species": str(metadata.get("species", "Mus musculus")), "resolution": [float(x) for x in atlas.resolution], "shape": [int(x) for x in atlas.shape], "regionCount": len(values), "regions": [structure_record(item) for item in values[:int(request.get("maxRegions", 256))]], "notes": ["Real BrainGlobe atlasapi metadata and annotation volume.", "Allen adult mouse CCF atlas at 25 um isotropic resolution.", "Region list is bounded for transport; use region query for exact lookup."]}
    operation = request.get("operation", "summary")
    if operation == "summary":
        print(json.dumps({"summary": atlas_summary(), "atlasRoot": str(atlas.root_dir)}, ensure_ascii=False)); raise SystemExit(0)
    if operation == "region":
        matches = region_matches(request.get("region"))
        if request.get("includeVoxelCount"):
            enriched = []
            for item in matches[:32]:
                mask = atlas.get_structure_mask(item["id"])
                item = {**item, "voxelCount": int(np.count_nonzero(mask)), "volumeUm3": float(np.count_nonzero(mask) * np.prod(np.asarray(atlas.resolution, dtype=float)))}
                enriched.append(item)
            matches = enriched
        print(json.dumps({"region": {"query": str(request.get("region", "")), "matches": matches, "notes": ["Exact acronym, numeric ID or case-insensitive name substring lookup.", "Voxel volume uses the atlas declared isotropic resolution."]}}, ensure_ascii=False)); raise SystemExit(0)
    if operation == "slice":
        axis = int(request.get("axis", 0)); index = int(request.get("index", 0)); downsample = max(1, int(request.get("downsample", 1)))
        if axis not in (0, 1, 2): fail("axis must be 0, 1 or 2")
        if index < 0 or index >= atlas.annotation.shape[axis]: fail("slice index is outside the atlas volume")
        plane = np.take(atlas.annotation, index, axis=axis)
        if downsample > 1: plane = plane[::downsample, ::downsample]
        h, w = [int(x) for x in plane.shape]
        png = None
        try:
            from PIL import Image
            rgb = np.zeros((h, w, 3), dtype=np.uint8)
            labels = np.asarray(plane, dtype=np.uint32)
            rgb[..., 0] = (labels * 53 % 251).astype(np.uint8); rgb[..., 1] = (labels * 97 % 241).astype(np.uint8); rgb[..., 2] = (labels * 193 % 239).astype(np.uint8)
            rgb[labels == 0] = 0
            out = io.BytesIO(); Image.fromarray(rgb, mode="RGB").save(out, format="PNG", optimize=True); png = base64.b64encode(out.getvalue()).decode("ascii")
        except Exception:
            png = None
        print(json.dumps({"slice": {"axis": axis, "index": index, "width": w, "height": h, "downsample": downsample, "labels": [int(x) for x in plane.reshape(-1)], **({"pngBase64": png} if png else {}), "notes": ["Labels come from the real Allen annotation volume.", "PNG colors are deterministic display colors, not anatomical ontology colors."]}}, ensure_ascii=False)); raise SystemExit(0)
    if operation in ("coordinates", "trajectory"):
        coordinates = request.get("coordinates") or []
        units = request.get("coordinateUnits", "voxel")
        if units not in ("voxel", "micron"): fail("coordinateUnits must be voxel or micron")
        if len(coordinates) > int(request.get("maxCells", 100000)): fail("coordinate count exceeds the configured bound")
        rows = []; counts = {}
        for index, raw in enumerate(coordinates):
            if not isinstance(raw, (list, tuple)) or len(raw) != 3: fail("each coordinate must contain x,y,z")
            point = [float(x) for x in raw]
            if not all(np.isfinite(point)): fail("coordinates must be finite")
            try:
                region_id = atlas.structure_from_coords(point, microns=(units == "micron"), as_acronym=False)
                if isinstance(region_id, str): acronym = region_id; rid = region_id; hemisphere = "outside"
                else:
                    info = structures[int(region_id)]; rid = int(region_id); acronym = str(info.get("acronym", "")); hemisphere = str(atlas.hemisphere_from_coords(point, microns=(units == "micron"), as_string=True))
                counts[(str(rid), acronym)] = counts.get((str(rid), acronym), 0) + 1
                rows.append({"index": index, "coordinate": point, "regionId": rid, "acronym": acronym, "hemisphere": hemisphere})
            except Exception:
                counts[("outside", "outside")] = counts.get(("outside", "outside"), 0) + 1
                rows.append({"index": index, "coordinate": point, "regionId": "outside", "acronym": "outside", "hemisphere": "outside"})
        by_region = [{"regionId": (int(rid) if rid.isdigit() else rid), "acronym": acronym, "count": count} for (rid, acronym), count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))]
        if operation == "trajectory":
            print(json.dumps({"analysis": {"total": len(rows), "mapped": len(rows) - counts.get(("outside", "outside"), 0), "outside": counts.get(("outside", "outside"), 0), "byRegion": by_region, "cells": rows, "notes": ["Coordinates were mapped with BrainGlobeAtlas.structure_from_coords.", "A trajectory is an ordered coordinate annotation; it is not a tractography result."]}}, ensure_ascii=False)); raise SystemExit(0)
        print(json.dumps({"analysis": {"total": len(rows), "mapped": len(rows) - counts.get(("outside", "outside"), 0), "outside": counts.get(("outside", "outside"), 0), "byRegion": by_region, "cells": rows, "notes": ["Coordinates were mapped with BrainGlobeAtlas.structure_from_coords.", "Cell rows are bounded and preserve input order."]}}, ensure_ascii=False)); raise SystemExit(0)
    fail("Unsupported BrainGlobe operation")
except SystemExit:
    raise
except Exception as exc:
    fail(f"{type(exc).__name__}: {exc}")
`
