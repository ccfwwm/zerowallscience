import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoleculeView } from "./MoleculeView";

/**
 * The dimensionality badge, read from its data hook: the 2D/3D toggle buttons
 * carry the same labels, so a text query would match both.
 */
const badge = () =>
  document.querySelector("[data-molecule-dimensionality]")?.getAttribute("data-molecule-dimensionality");
const toggle = (mode: "2D" | "3D") => screen.getByRole("button", { name: mode });

// 3Dmol needs WebGL, which jsdom lacks — mock it and assert the wiring
// (model handed over with the right format, styles applied on toggle).
const viewer = {
  setBackgroundColor: vi.fn(),
  addModel: vi.fn(),
  setStyle: vi.fn(),
  zoomTo: vi.fn(),
  zoom: vi.fn(),
  rotate: vi.fn(),
  render: vi.fn(),
  resize: vi.fn(),
  clear: vi.fn(),
  selectedAtoms: vi.fn(() => [{}, {}, {}]),
};
const createViewer = vi.fn(() => viewer);
vi.mock("3dmol", () => ({ createViewer: () => createViewer() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("MoleculeView", () => {
  it("hands a PDB's raw text to 3Dmol as a pdb model and reports atom count", async () => {
    render(<MoleculeView filename="1abc.pdb" text={"ATOM  1  C   LIG\nATOM  2  O   LIG"} />);
    await waitFor(() => expect(viewer.addModel).toHaveBeenCalled());
    expect(viewer.addModel).toHaveBeenCalledWith(expect.stringContaining("ATOM"), "pdb");
    expect(await screen.findByText("3 atoms")).toBeInTheDocument();
    expect(screen.getByText("PDB")).toBeInTheDocument();
  });

  it("converts a SMILES file to a coordinate-bearing model before rendering", async () => {
    render(<MoleculeView filename="mols.smi" text="CCO ethanol" />);
    // SMILES opens flat, so ask for the 3D view before checking the handover.
    await userEvent.click(toggle("3D"));
    await waitFor(() => expect(viewer.addModel).toHaveBeenCalled());
    const [model, format] = viewer.addModel.mock.calls[0];
    expect(format).toBe("sdf");
    // openchemlib laid out real coordinates (not the raw SMILES string).
    expect(model).not.toContain("CCO ethanol");
    expect(model).toMatch(/-?\d+\.\d{3,}/);
  });

  it("labels a SMILES layout 2D, since it carries no conformation", async () => {
    render(<MoleculeView filename="mols.smi" text="CCO ethanol" />);
    await waitFor(() => expect(badge()).toBe("2D"));
  });

  it("labels a flat molfile 2D and a conformer 3D", async () => {
    const atom = (z: string) => `    1.2000    0.5000    ${z} C   0  0`;
    const molfile = (z: string) => ["mol", "", "", "  1  0  0", atom(z)].join("\n");

    const { rerender, unmount } = render(<MoleculeView filename="flat.mol" text={molfile("0.0000")} />);
    await waitFor(() => expect(badge()).toBe("2D"));

    rerender(<MoleculeView filename="conf.mol" text={molfile("0.8700")} />);
    await waitFor(() => expect(badge()).toBe("3D"));
    unmount();
  });

  it("keeps the 3D label for a PDB, whose coordinates are measured", async () => {
    render(<MoleculeView filename="1abc.pdb" text={"ATOM  1  C   LIG\nATOM  2  O   LIG"} />);
    await waitFor(() => expect(badge()).toBe("3D"));
  });

  it("opens a flat file as a drawing and a conformer as a scene", async () => {
    const { unmount } = render(<MoleculeView filename="mols.smi" text="CCO ethanol" />);
    // A file with no third dimension is shown as the diagram it already is.
    expect(await screen.findByRole("img", { name: /2D structure diagram/ })).toBeInTheDocument();
    expect(viewer.addModel).not.toHaveBeenCalled();
    unmount();

    render(<MoleculeView filename="1abc.pdb" text={"ATOM  1  C   LIG\nATOM  2  O   LIG"} />);
    await waitFor(() => expect(viewer.addModel).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws a real structural formula in the 2D view", async () => {
    render(<MoleculeView filename="aspirin.smi" text="CC(=O)Oc1ccccc1C(=O)O aspirin" />);
    const stage = await screen.findByRole("img", { name: /2D structure diagram/ });
    // openchemlib produced an SVG depiction, mounted as real nodes.
    await waitFor(() => expect(stage.querySelector("svg")).not.toBeNull());
    expect(stage.querySelector("svg")!.getAttribute("width")).toBe("100%");
  });

  it("switches between the drawing and the scene on request", async () => {
    render(<MoleculeView filename="mols.smi" text="CCO ethanol" />);
    await screen.findByRole("img", { name: /2D structure diagram/ });

    await userEvent.click(toggle("3D"));
    await waitFor(() => expect(viewer.addModel).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // Render styles only mean something for the 3D scene.
    expect(screen.getByRole("button", { name: "Stick" })).toBeInTheDocument();

    await userEvent.click(toggle("2D"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stick" })).not.toBeInTheDocument());
    expect(screen.getByRole("img", { name: /2D structure diagram/ })).toBeInTheDocument();
  });

  it("offers no 2D view for formats that carry no bond orders", async () => {
    render(<MoleculeView filename="1abc.pdb" text={"ATOM  1  C   LIG\nATOM  2  O   LIG"} />);
    await waitFor(() => expect(viewer.addModel).toHaveBeenCalled());
    // Drawing a formula from a PDB would have to invent the bonds.
    expect(screen.queryByRole("button", { name: "2D" })).not.toBeInTheDocument();
  });

  it("re-applies the style when the user switches render mode", async () => {
    render(<MoleculeView filename="ligand.mol" text="mol" />);
    await waitFor(() => expect(viewer.setStyle).toHaveBeenCalled());
    viewer.setStyle.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Sphere" }));
    await waitFor(() =>
      expect(viewer.setStyle).toHaveBeenCalledWith({}, expect.objectContaining({ sphere: expect.anything() })),
    );
  });

  it("offers Cartoon only for macromolecules (small molecules lack residues)", async () => {
    const { rerender } = render(<MoleculeView filename="ligand.mol" text="small molecule" />);
    await waitFor(() => expect(viewer.addModel).toHaveBeenCalled());
    // A small molecule: cartoon would crash 3Dmol on missing resn, so it's hidden.
    expect(screen.queryByRole("button", { name: "Cartoon" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stick" })).toBeInTheDocument();

    // A protein (many alpha carbons) gets the cartoon option.
    const protein = Array.from({ length: 25 }, (_, i) => `ATOM  ${i} CA  ALA`).join("\n");
    rerender(<MoleculeView filename="1abc.pdb" text={protein} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cartoon" })).toBeInTheDocument());
  });

  it("explains a SMILES file with no parseable structures", async () => {
    render(<MoleculeView filename="empty.smi" text={"   \n# comment\n"} />);
    expect(await screen.findByText(/No chemical structures found/)).toBeInTheDocument();
    expect(viewer.addModel).not.toHaveBeenCalled();
  });
});
