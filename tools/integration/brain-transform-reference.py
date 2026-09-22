"""Independent NiftyReg affine field fixture; no anatomical accuracy claim."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import tifffile
from brainreg.core.backend.niftyreg.niftyreg_binaries import get_binary

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
shape = (16, 18, 20)
spacing = np.array([0.025, 0.05, 0.1])
affine = np.diag([*spacing, 1.0])
nib.save(nib.Nifti1Image(np.zeros(shape, dtype=np.float32), affine), root / "reference.nii")
transforms = {
    "identity": np.eye(4),
    "translation": np.array([[1, 0, 0, .05], [0, 1, 0, .075], [0, 0, 1, .1], [0, 0, 0, 1.]]),
    "axis-permutation": np.array([[0, 1, 0, .1], [0, 0, 1, .2], [1, 0, 0, .3], [0, 0, 0, 1.]]),
    "reflection": np.array([[-1, 0, 0, .3], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1.]]),
}
binary = Path(get_binary("reg_transform"))
points = [[0, 0, 0], [3, 4, 5], [3.2, 4.6, 5.3], [15, 17, 19], [0, 17, 0]]
report = []
for name, matrix in transforms.items():
    folder = root / name
    folder.mkdir(exist_ok=True)
    np.savetxt(folder / "affine.txt", matrix)
    run = subprocess.run([str(binary), "-ref", str(root / "reference.nii"), "-def", str(folder / "affine.txt"), str(folder / "field.nii")], capture_output=True, text=True, check=True)
    (folder / "niftyreg.log").write_text(run.stdout + run.stderr, encoding="utf-8")
    field = nib.load(folder / "field.nii").get_fdata()
    assert field.shape == (*shape, 1, 3)
    tifffile.imwrite(folder / "downsampled.tiff", np.zeros(shape, dtype=np.uint16), photometric="minisblack")
    for axis in range(3):
        tifffile.imwrite(folder / f"deformation_field_{axis}.tiff", field[..., 0, axis].astype(np.float32), photometric="minisblack")
    expected = [(matrix @ np.array([*(np.array(p) * spacing), 1]))[:3].tolist() for p in points]
    report.append({"name": name, "directory": str(folder), "points": points, "expectedMillimeter": expected, "matrix": matrix.tolist()})
print(json.dumps({"shape": shape, "sourceSpacingMillimeter": spacing.tolist(), "binary": str(binary), "binarySha256": hashlib.sha256(binary.read_bytes()).hexdigest(), "cases": report}))
