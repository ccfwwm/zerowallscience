import { describe, expect, it } from "vitest";
import {
  canDepict2D,
  defaultStyleMode,
  depict2D,
  dimensionalityOf,
  isSmilesFile,
  looksLikeMacromolecule,
  moleculeFormatFor,
  renderSvgInto,
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

describe("canDepict2D", () => {
  it("accepts small-molecule connection tables and SMILES", () => {
    expect(canDepict2D("aspirin.sdf", "")).toBe(true);
    expect(canDepict2D("ligand.smi", "CCO")).toBe(true);
    expect(canDepict2D("query.smiles", "CCO")).toBe(true);
  });

  it("rejects formats that carry no bond orders", () => {
    // Drawing a structural formula from these would have to invent the bonds.
    for (const name of ["1abc.pdb", "cell.cif", "opt.xyz", "lig.mol2", "notes.txt"]) {
      expect(canDepict2D(name, "")).toBe(false);
    }
  });

  it("rejects a macromolecule even in an accepted format", () => {
    const residues = Array.from(
      { length: 25 },
      (_, i) => `ATOM  ${String(i + 1).padStart(5)}  CA  MET A${String(i + 1).padStart(4)}`,
    );
    const protein = ["HEADER", ...residues].join("\n");
    expect(canDepict2D("big.sdf", protein)).toBe(false);
  });
});

describe("depict2D", () => {
  it("draws SMILES as an SVG structural formula", async () => {
    const svg = await depict2D("aspirin.smi", "CC(=O)Oc1ccccc1C(=O)O aspirin\n", 400, 300);
    expect(svg).not.toBeNull();
    expect(svg!).toMatch(/^<svg/);
    expect(svg!).toContain("</svg>");
  });

  it("draws the first record of an SDF", async () => {
    const sdf = await smilesToMolblock("CCO ethanol\nc1ccccc1 benzene\n");
    const svg = await depict2D("two.sdf", sdf!, 400, 300);
    expect(svg).not.toBeNull();
    expect(svg!).toMatch(/^<svg/);
  });

  it("returns null when nothing parses", async () => {
    expect(await depict2D("empty.smi", "# only a comment\n", 400, 300)).toBeNull();
    expect(await depict2D("junk.sdf", "not a molfile", 400, 300)).toBeNull();
  });

  it("escapes text rather than emitting markup", async () => {
    // The molfile title line is dropped and atom labels are escaped, so file
    // content cannot inject nodes into the drawing.
    const svg = await depict2D("x.smi", "CCO '><script>alert(1)</script>\n", 400, 300);
    expect(svg).not.toBeNull();
    expect(svg!).not.toContain("<script");
  });
});

describe("renderSvgInto", () => {
  const host = () => document.createElement("div");

  it("mounts the drawing and stretches it to the container", () => {
    const el = host();
    expect(renderSvgInto(el, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect/></svg>')).toBe(
      true,
    );
    const svg = el.firstElementChild!;
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("height")).toBe("100%");
    expect(svg.querySelector("rect")).not.toBeNull();
  });

  it("replaces whatever was there before", () => {
    const el = host();
    el.appendChild(document.createElement("span"));
    renderSvgInto(el, '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>');
    expect(el.childElementCount).toBe(1);
    expect(el.querySelector("span")).toBeNull();
  });

  it("strips active content and links", () => {
    const el = host();
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      "<script>alert(1)</script>",
      '<image href="x.png"/>',
      '<a href="https://example.com"><text>t</text></a>',
      '<rect onclick="alert(1)" onload="alert(2)"/>',
      "</svg>",
    ].join("");
    expect(renderSvgInto(el, svg)).toBe(true);
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("image")).toBeNull();
    expect(el.querySelector("a")).toBeNull();
    const rect = el.querySelector("rect")!;
    expect(rect.getAttribute("onclick")).toBeNull();
    expect(rect.getAttribute("onload")).toBeNull();
  });

  it("refuses malformed SVG instead of mounting an error document", () => {
    const el = host();
    expect(renderSvgInto(el, "<svg><unclosed>")).toBe(false);
    expect(el.childElementCount).toBe(0);
  });
});
