// Chemical-structure helpers (P1-3). Pure and WebGL-free so they unit-test in
// jsdom; the interactive 3D depiction happens in MoleculeView via 3Dmol.js.

/** 3Dmol.js render styles the viewer exposes. */
export type MoleculeStyleMode = "stick" | "sphere" | "cartoon";

/**
 * What the coordinates in a model actually describe. A structure drawn in 2D
 * (or laid out from SMILES) has every z at zero: it is a diagram, not a
 * conformation, and must not be presented as 3D.
 */
export type MoleculeDimensionality = "2D" | "3D";

/** File extension → the format string 3Dmol.js expects in `addModel`. */
const MOLECULE_FORMATS: Record<string, string> = {
  cif: "cif",
  cube: "cube",
  mcif: "cif",
  mmcif: "cif",
  mol: "sdf",
  mol2: "mol2",
  pdb: "pdb",
  pqr: "pqr",
  sdf: "sdf",
  xyz: "xyz",
  // SMILES has no coordinates; it is converted to a molblock first (see
  // smilesToMolblock) and then handed to 3Dmol as an "sdf" model.
  smi: "sdf",
  smiles: "sdf",
};

/** Extensions with no 3D coordinates — a molblock must be generated first. */
const SMILES_EXTS = new Set(["smi", "smiles"]);

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** The 3Dmol format for a file, or null when it is not a molecule file. */
export function moleculeFormatFor(filename: string): string | null {
  return MOLECULE_FORMATS[extOf(filename)] ?? null;
}

export function isSmilesFile(filename: string): boolean {
  return SMILES_EXTS.has(extOf(filename));
}

/**
 * Heuristic: does this look like a macromolecule (protein / large complex)
 * rather than a small molecule? Secondary-structure records or many atoms /
 * alpha carbons imply a cartoon depiction reads better than sticks.
 */
export function looksLikeMacromolecule(content: string): boolean {
  if (/^(HELIX|SHEET)\s/m.test(content)) return true;
  const atoms = content.match(/^ATOM\s+/gm)?.length ?? 0;
  const alphaCarbons = content.match(/^ATOM\s+\d+\s+CA\s+/gm)?.length ?? 0;
  return atoms > 120 || alphaCarbons > 20;
}

/** The style to open a file with: cartoon for macromolecules, else sticks. */
export function defaultStyleMode(filename: string, content: string): MoleculeStyleMode {
  const macromoleculeExt = ["cif", "mcif", "mmcif", "pdb", "pqr"].includes(extOf(filename));
  return macromoleculeExt && looksLikeMacromolecule(content) ? "cartoon" : "stick";
}

/**
 * Read the dimensionality of a model's coordinates.
 *
 * Molfile/SDF atom lines and XYZ lines both start with three coordinates. If
 * every z is zero the structure is flat — a 2D depiction, not a conformation.
 * Formats that only exist in 3D (pdb/cif/mol2/pqr/cube) are reported as 3D
 * without parsing, since their coordinates are measured or modelled.
 *
 * Returns "3D" when no coordinate lines are recognisable, so an unparseable
 * file is never downgraded to a claim we cannot support either way.
 */
export function dimensionalityOf(content: string, format: string | null): MoleculeDimensionality {
  if (format !== "sdf" && format !== "xyz") return "3D";

  // Match a leading x y z triple, the shape shared by molfile V2000 atom
  // blocks ("  1.2340   -0.5670    0.0000 C") and XYZ lines ("C 1.234 ...").
  const TRIPLE = /^\s*(?:[A-Za-z][A-Za-z]?\s+)?(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\b/;
  let sawCoordinates = false;
  for (const line of content.split(/\r?\n/)) {
    const m = TRIPLE.exec(line);
    if (!m) continue;
    sawCoordinates = true;
    if (parseFloat(m[3]) !== 0) return "3D";
  }
  return sawCoordinates ? "2D" : "3D";
}

/**
 * Convert a `.smi` / `.smiles` file (one `<SMILES> [name]` per line, `#`
 * comments skipped) into a single SDF string.
 *
 * SMILES encodes connectivity only, so openchemlib lays the atoms out as a
 * flat diagram (`inventCoordinates`, every z zero). The result is a 2D
 * depiction the viewer can draw — it is NOT a conformation, and callers must
 * label it accordingly (see dimensionalityOf). Returns null if no line parses.
 * openchemlib is loaded lazily to keep it out of the main bundle.
 */
export async function smilesToMolblock(text: string): Promise<string | null> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return null;

  const OCL = await import("openchemlib");
  const records: string[] = [];
  for (const line of lines) {
    const [smiles, ...rest] = line.split(/\s+/);
    try {
      const mol = OCL.Molecule.fromSmiles(smiles);
      if (mol.getAllAtoms() === 0) continue;
      mol.inventCoordinates(); // ensure a laid-out 2D depiction
      const name = rest.join(" ") || `Structure ${records.length + 1}`;
      // A molfile's first line is its title; the rest is the connection table.
      const molfile = mol.toMolfile().split(/\r?\n/);
      molfile[0] = name;
      records.push(molfile.join("\n"));
    } catch {
      // Skip an unparseable SMILES line rather than failing the whole file.
    }
  }
  if (records.length === 0) return null;
  return `${records.join("\n$$$$\n")}\n$$$$\n`;
}
