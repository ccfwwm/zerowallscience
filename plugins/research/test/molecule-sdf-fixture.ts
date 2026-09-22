export const moleculeSdf = `ZeroWall ethanol coordinate fixture
  ZeroWall          3D
Synthetic geometry only; not docking-ready
  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
>  <SOURCE>
Deterministic ZeroWall synthetic fixture

$$$$
`
export const moleculeSdfV3000 = `ZeroWall ethanol coordinate fixture
  ZeroWall          3D
Synthetic geometry only; not docking-ready
  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 3 2 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0000 0.0000 0.0000 0
M  V30 2 C 1.5000 0.0000 0.0000 0
M  V30 3 O 2.2500 1.2500 0.0000 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 2
M  V30 2 1 2 3
M  V30 END BOND
M  V30 END CTAB
M  END
$$$$
`
