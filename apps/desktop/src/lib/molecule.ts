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

/** Formats a 2D depiction can be drawn from: a connection table or SMILES. */
const DEPICTABLE_2D = new Set(["mol", "sdf", "smi", "smiles"]);

/**
 * Can this file be drawn as a conventional 2D structural formula?
 *
 * Only small-molecule connection tables qualify. A protein has no meaningful
 * flat depiction, and pdb/cif/mol2/xyz carry no bond orders, so a 2D drawing
 * from them would invent double bonds that the file never stated.
 */
export function canDepict2D(filename: string, content: string): boolean {
  return DEPICTABLE_2D.has(extOf(filename)) && !looksLikeMacromolecule(content);
}

/**
 * Render the first record of a molfile/SDF/SMILES as an SVG structural formula.
 *
 * This is a chemist's 2D drawing — bond orders, stereo bonds and atom labels
 * by openchemlib's own layout — not a projection of the 3D scene. Returns null
 * when nothing parses. openchemlib is loaded lazily.
 *
 * The returned markup is untrusted: it derives from workspace file content.
 * Callers must parse it (see renderSvgInto) rather than assigning innerHTML.
 */
export async function depict2D(
  filename: string,
  content: string,
  width: number,
  height: number,
): Promise<string | null> {
  const OCL = await import("openchemlib");
  let mol: import("openchemlib").Molecule | null = null;

  if (isSmilesFile(filename)) {
    const first = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!first) return null;
    try {
      mol = OCL.Molecule.fromSmiles(first.split(/\s+/)[0]);
    } catch {
      return null;
    }
  } else {
    // An SDF may hold many records; depict the first, matching the viewer.
    const record = content.split(/^\$\$\$\$\s*$/m)[0];
    try {
      mol = OCL.Molecule.fromMolfile(record);
    } catch {
      return null;
    }
  }

  if (!mol || mol.getAllAtoms() === 0) return null;
  // A 3D conformer projected flat overlaps badly; re-lay it out as a diagram.
  mol.inventCoordinates();
  return mol.toSVG(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), undefined, {
    autoCrop: true,
    autoCropMargin: 8,
    suppressChiralText: true,
  });
}

/**
 * Parse SVG markup and mount it, dropping anything executable.
 *
 * openchemlib escapes text content, but this markup is derived from untrusted
 * workspace files, so it is parsed as XML (never innerHTML) and scripts,
 * external references and event-handler attributes are stripped regardless.
 */
export function renderSvgInto(container: Element, svg: string): boolean {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.getElementsByTagName("parsererror").length > 0 || root.nodeName === "parsererror") {
    return false;
  }

  for (const el of Array.from(root.querySelectorAll("script, foreignObject, use, image, a"))) {
    el.remove();
  }
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "href" || name === "xlink:href") el.removeAttribute(attr.name);
    }
  }

  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  container.replaceChildren(document.importNode(root, true));
  return true;
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
