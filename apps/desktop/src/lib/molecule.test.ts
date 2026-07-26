import { describe, expect, it } from "vitest";
import {
  defaultStyleMode,
  dimensionalityOf,
  isSmilesFile,
  looksLikeMacromolecule,
  moleculeFormatFor,
  smilesToMolblock,
} from "./molecule";

describe("moleculeFormatFor", () => {
  it("maps chemical extensions to their 3Dmol format", () => {
    expect(moleculeFormatFor("ligand.mol")).toBe("sdf");
    expect(moleculeFormatFor("lib.sdf")).toBe("sdf");
    expect(moleculeFormatFor("complex.mol2")).toBe("mol2");
    expect(moleculeFormatFor("1abc.pdb")).toBe("pdb");
    expect(moleculeFormatFor("crystal.cif")).toBe("cif");
    expect(moleculeFormatFor("struct.mmcif")).toBe("cif");
    expect(moleculeFormatFor("cluster.xyz")).toBe("xyz");
    expect(moleculeFormatFor("mols.smi")).toBe("sdf");
  });

  it("returns null for non-molecule files", () => {
    expect(moleculeFormatFor("report.md")).toBeNull();
    expect(moleculeFormatFor("noext")).toBeNull();
  });
});

describe("isSmilesFile", () => {
  it("flags only the coordinate-free SMILES extensions", () => {
    expect(isSmilesFile("a.smi")).toBe(true);
    expect(isSmilesFile("a.smiles")).toBe(true);
    expect(isSmilesFile("a.sdf")).toBe(false);
    expect(isSmilesFile("a.pdb")).toBe(false);
  });
});

describe("looksLikeMacromolecule", () => {
  it("detects secondary-structure records", () => {
    expect(looksLikeMacromolecule("HELIX    1  AA1 ...\n")).toBe(true);
    expect(looksLikeMacromolecule("SHEET    1 ...\n")).toBe(true);
  });

  it("detects many alpha carbons", () => {
    const atoms = Array.from({ length: 25 }, (_, i) => `ATOM  ${i} CA  ALA`).join("\n");
    expect(looksLikeMacromolecule(atoms)).toBe(true);
  });

  it("treats a small molecule as not macromolecular", () => {
    expect(looksLikeMacromolecule("ATOM  1  C   LIG\nATOM  2  O   LIG")).toBe(false);
  });
});

describe("defaultStyleMode", () => {
  it("opens a protein PDB in cartoon", () => {
    const pdb = Array.from({ length: 25 }, (_, i) => `ATOM  ${i} CA  ALA`).join("\n");
    expect(defaultStyleMode("1abc.pdb", pdb)).toBe("cartoon");
  });

  it("opens a small molecule in stick", () => {
    expect(defaultStyleMode("ligand.mol", "small")).toBe("stick");
    // A small-molecule format never defaults to cartoon even if content is odd.
    expect(defaultStyleMode("x.sdf", "HELIX ")).toBe("stick");
  });
});

describe("smilesToMolblock", () => {
  it("converts SMILES lines to a coordinate-bearing SDF", async () => {
    const sdf = await smilesToMolblock("# comment\nCCO ethanol\nc1ccccc1 benzene\n");
    expect(sdf).not.toBeNull();
    // Two records separated by the SDF delimiter, each named from the line.
    expect(sdf!.match(/\$\$\$\$/g)).toHaveLength(2);
    expect(sdf!.startsWith("ethanol\n")).toBe(true);
    expect(sdf).toContain("\nbenzene\n");
    // Atoms were laid out, so there is something to draw.
    expect(sdf).toMatch(/-?\d+\.\d{3,}/);
  });

  it("lays SMILES out flat — it is a diagram, not a conformation", async () => {
    const sdf = await smilesToMolblock("CC(=O)Oc1ccccc1C(=O)O aspirin\n");
    expect(sdf).not.toBeNull();
    // inventCoordinates is a 2D layout: every z is zero. Claiming 3D here
    // would assert a conformation SMILES does not encode.
    expect(dimensionalityOf(sdf!, "sdf")).toBe("2D");
  });

  it("returns null when nothing parses", async () => {
    expect(await smilesToMolblock("   \n# only a comment\n")).toBeNull();
  });
});

describe("dimensionalityOf", () => {
  const atom = (x: number, y: number, z: number) =>
    `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${z.toFixed(4).padStart(10)} C   0  0`;

  it("reads a flat molfile as 2D", () => {
    const flat = ["name", "", "", "  2  1  0", atom(1.2, 0.5, 0), atom(-1.2, -0.5, 0)].join("\n");
    expect(dimensionalityOf(flat, "sdf")).toBe("2D");
  });

  it("reads a molfile with any non-zero z as 3D", () => {
    const conformer = ["name", "", "", "  2  1  0", atom(1.2, 0.5, 0), atom(-1.2, -0.5, 0.87)].join("\n");
    expect(dimensionalityOf(conformer, "sdf")).toBe("3D");
  });

  it("handles XYZ, where the element leads the coordinates", () => {
    expect(dimensionalityOf("2\ncomment\nC 0.0000 0.0000 0.0000\nO 1.1300 0.0000 0.0000\n", "xyz")).toBe("2D");
    expect(dimensionalityOf("2\ncomment\nC 0.0000 0.0000 0.0000\nO 1.1300 0.0000 1.2000\n", "xyz")).toBe("3D");
  });

  it("treats inherently 3D formats as 3D without parsing", () => {
    // A PDB's coordinates are measured or modelled; z may legitimately be 0.
    expect(dimensionalityOf("ATOM      1  C   LIG A   1       1.000   2.000   0.000", "pdb")).toBe("3D");
    expect(dimensionalityOf("data_x", "cif")).toBe("3D");
    expect(dimensionalityOf("", "mol2")).toBe("3D");
  });

  it("does not downgrade a file whose coordinates it cannot find", () => {
    expect(dimensionalityOf("no coordinates here", "sdf")).toBe("3D");
  });
});
