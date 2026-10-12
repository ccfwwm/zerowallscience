# fig-viewer R2-1: sidecar schema v1

This contract implements R1 §2.1–2.3. Export requires an explicit Figure/Artist/source
binding. No OCR, file-name inference, retrospective mapping of existing images, or
execution of sidecar code is involved. Existing `export_figure` and tool schemas
are unchanged. The default differential recipe has no viewer binding or sidecar.

## Bundle and publication

`export_bundle(binding, output_dir, figure_id=...)` writes
`output_dir/<figure_id>/<revision>/`. Figure IDs contain only ASCII letters,
digits, hyphens and underscores. All artifact references are relative to the
manifest directory. The manifest is written after its artifacts, validated in a
temporary directory, then the complete directory is renamed into place. Pending
directories must never be advertised by consumers. Failures remove pending files.

| Artifact | Required content and formal schema |
| --- | --- |
| `<figure_id>.png` | Independent final viewer PNG; SHA-256, integer width/height and export DPI in manifest |
| `<figure_id>.figview.json` | `assets/figview.schema.v1.json`: version 1; figure/revision/parent identity; image/data/hitmap references and hashes; capabilities; source/recipe/provenance; redraw |
| `<figure_id>.rows.json` | `assets/rows.schema.v1.json`: typed columns, semantic row identities and occurrence, raw value snapshot, source hash, parser configuration and filter/sort/aggregation lineage |
| `<figure_id>.hits.json` | `assets/hits.schema.v1.json`: axes, series, elements, geometry, explicit row groups, clip, zorder, global artist draw order and within-collection point order; final transforms/scales/renderer dimensions |
| `redraw` in manifest; optional `recipe.py` | Explicit recipe identity or registered script copied into bundle and hashed; original parameters, export parameters, library versions, seed and adjustable-parameter whitelist |

The three JSON files are formal JSON Schema draft 2020-12 schemas, shipped under
`python/figurelib/assets/`. All core objects are closed: unknown fields and
unsupported schema versions fail. Arbitrary finite JSON is allowed only in
designated metadata (parameters/provenance/semantic lineage/parser options).
Metadata is data, never executable instructions or HTML.

`revision` is lowercase SHA-256 of canonical manifest JSON **excluding only the
revision field**. Canonical JSON uses UTF-8, sorted object keys, no whitespace,
finite numbers, and literal Unicode. Referenced artifact hashes are included, so
any image/data/hit/script/parameter change creates a different revision. An
existing revision is validated and must be byte identical before reuse; the
exporter never overwrites it. `parent_revision` is null or an explicit previous
digest; the exporter does not infer lineage or require the parent to be local.

## Source rows and identity

Create `FigureBinding` once, before plot-specific sorting/filtering. It takes a
DataFrame snapshot immediately. Call `bind_points` with one explicit source
position group per plotted point. To bind a subset of a background collection,
also provide explicit `point_indices`; no coordinate-nearest or array-order
guessing is used. Aggregated points can reference multiple source rows; record
function/group keys/filters/statistics in `lineage.aggregations` and series
semantics. Consumers must display all contributors, not a fictional single row.

`row_id = sha256(canonical(semantic_id)) + ':' + occurrence`. A semantic ID comes
from the caller's `id_column` or the original DataFrame index. Duplicate semantic
IDs receive zero-based occurrence in **the captured source order**. Sorting the
plot uses the same snapshot and its explicit position groups; re-importing a
different source order is a new source snapshot, and cannot preserve indistinguishable
duplicate occurrences automatically. Gene/sample/node IDs and every original
column remain in raw values. Plotted values and transformation semantics live
separately in hits/series.

Column schema records type, original pandas dtype, unit (null if unspecified),
and encoding precision. Supported types are string, boolean, integer, number,
datetime and categorical; categories and ordering are retained. Unsupported
object values must be explicitly converted before binding. Missing/nonfinite
values are tagged `{"missing":"NA|NaN|+Infinity|-Infinity"}`; JSON NaN/Infinity
tokens are forbidden. Datetimes use `{"datetime":"<ISO text>"}`. Integers outside
JavaScript's exact ±(2^53−1) range use `{"integer":"<exact decimal text>"}`.
Finite floating point numbers use round-trippable JSON doubles. Raw CSV strings
already parsed as numbers cannot be reconstructed; parser settings and the
original file hash describe that boundary.

Source `kind` is `dataframe`, `file`, or `none`. Typed snapshot SHA-256 covers the
canonical `{columns, rows}` object. File sources additionally carry the original
file SHA-256 and a display label, with delimiter/encoding/parser options in rows.
The differential recipe parses and hashes the same captured input bytes. There
is no external file path for the consumer to follow; changing a source file later
cannot change this frozen snapshot.

## Final PNG geometry

First-version inspect supports circular scatter points on rectilinear axes,
with linear/log x and y scales, inverted axes, explicit subsets and aggregate
row groups. Unsupported scales, marker transforms/shapes, custom clip paths,
path effects/sketch/hatch/nested rasterization are refused; the caller can export
an unbound preview instead. This concretizes the first R1 scatter scope; line,
bar/cell/node/edge geometry remain for later schema extensions.

The helper delegates PNG creation to the existing exporter, and captures the
last PNG `draw_event` after final size/DPI/tight layout. It uses each registered
Artist's actual offset transform, requires it to be the declared axes data
transform, and checks offsets still match the binding. Axes affine matrices and
non-affine log bases/domains are serialized independently. No second tight crop
translation is applied. PNG dimensions must match the final Agg renderer's
integer dimensions. Coordinates use continuous pixel boundaries; pixel centers
are `(i+0.5,j+0.5)` and the origin is top-left.

```text
data → log transform where applicable → captured affine A → display (dx,dy)
PNG point = (dx, captured_renderer_height − dy)
inverse: A^-1(u, captured_renderer_height − v, 1), then inverse log scales
```

Keep the captured renderer height (including any fraction) rather than assume it
equals the PNG's integer height. Serialize both. Hit-test in image pixel space,
then read explicit `row_ids`; inverse coordinates are for hints/verification.
The consumer first inverts its CSS viewport fit/zoom/pan transform; do not
multiply CSS click coordinates by DPR. `hit_candidates` is a reference image-space
implementation; it checks rectangular clip, then zorder/draw order/point order,
distance and stable element ID. It returns overlapping candidates, not an
unconditional nearest point.

Agg's single-color cached `draw_markers` path quantizes offsets. For the independent
viewer PNG the helper temporarily selects `draw_path_collection` using duplicated
inert URL entries and disables snapping, then restores both Artist settings even
on failure. Colors, data and sizes are retained. This preserves subpixel centers
as in the multicolor R1 spike; the viewer PNG may differ slightly from an existing
ordinary PNG due to rasterization. Its own hash and hitmap are always paired.
The original exporter, grayscale overwrite behavior and ordinary PNG are untouched.

Masked/nonfinite coordinates, nonpositive log domains, hidden/transparent/zero-size
markers produce explicit excluded records with their source row IDs. Finite
points outside a rectangular clip retain geometry, but cannot be selected there.
Axes bbox/clip are `[x0,y0,x1,y1]` in top-left coordinates. Legend/colorbar artists
are never mapped unless explicitly registered as supported data Artists. The
first recipe partitions `ns/up/down`: significant gray underpainting is excluded
from the ns binding, so every source point has exactly one scientific category.

## Capabilities, budgets and validation

Source-free Figures export image + manifest with `inspect='preview'`,
`reason='no-source-table'`, data/hitmap null. A source snapshot without point
bindings uses `reason='no-bound-points'`. An entirely excluded bound collection
also remains preview-only. Inspect is `points` only when valid point records exist.
`request_redraw` requires an explicit recipe or script reference; it is a request
capability, never permission to execute bundled code. Seeds may be null when the
caller did not seed the recipe; exact re-generation of unseeded label placement
is not promised. Library versions include Python/Matplotlib/NumPy/pandas/Pillow/
adjustText (or explicit `not-installed`).

| Budget | Enforcement and remedy |
| --- | --- |
| 10,000 points | Inclusive maximum of serialized non-excluded hit records, conservatively including off-clip geometry; reject larger collections. Filter/aggregate/split, or explicitly export preview without bindings |
| 8 MiB JSON | Sum of max(wire UTF-8 bytes, canonical parsed UTF-8 bytes) for manifest + rows + hits. Reject, suggest filter/aggregate/split. Script text has a separate 8 MiB read cap |
| 16 MiB PNG | Actual encoded PNG bytes; reject, suggest smaller DPI/dimensions or split |

The JSON interpretation resolves R1's “parsed JSON” budget as canonical parsed
UTF-8 bytes, while also bounding input bytes before parsing. It is not a claim
that Python/JavaScript heap allocation fits 8 MiB; R2-2 must bound its own memory.

`validate_bundle(path)` validates schema, finite JSON/duplicate keys, hashes,
immutable revision digest, PNG dimensions, source snapshot and column types,
semantic IDs/occurrences, reference integrity, capabilities, scale metadata,
and forward/inverse transform consistency. All three schema checks also occur
inside export before publication. Core coordinates must agree within 0.01 px;
actual raster centroid precision is tested independently by the acceptance suite.

The validator rejects absolute/UNC/URL/backslash/percent-encoded/traversal
references and symlink/junction aliases; references must resolve to files within
the canonical local bundle directory. Script content is read only for hashing.
This is a local producer/reference-validator policy, not a browser security
sandbox; R2-2 must validate Remote paths, hashes, size, cancellation and lifecycle
before rendering. Corrupted/missing sidecars should disable inspect and retain
any independently usable preview; no helper silently fabricates row mappings.

Run the CLI from the repo using the existing plugin Python environment:

```powershell
$env:PYTHONPATH = "$PWD/python"
& "$env:USERPROFILE/.dsh/dsh-bio-genie/python-env/Scripts/python.exe" -B -m figurelib.figview_validate <manifest-path>
node scripts/run-python-test.mjs test/test_figview.py
npm run bench
```

The CLI prints a JSON validation report and exits nonzero on failure. For isolated
Python (`-I`), explicitly insert this repository's `python` directory in a wrapper
before calling `validate_bundle`; `PYTHONPATH` is intentionally ignored by `-I`.
The acceptance suite writes `acceptance.json` and real bundles under
`FIGVIEW_EVIDENCE_DIR`, or an isolated temporary folder by default. It covers 48
Cartesian cases: linear/log x × linear/log y × inverted y × tight × 100/300/600 DPI,
with final size change, every eligible point, actual PNG coverage-weighted color
centroids, raw-row lookup and both transform directions. Opaque R1-size color
probes make raster centroids measurable across DPIs; original recipe styles are
separately compared byte-for-byte. Pure-pixel centroid errors are also retained.
R1's two original multicolor probes run with the original pure-color method.
Budget tests use actual 10,000/10,001-point tables, >8 MiB JSON, >16 MiB PNG,
preview-only fallback, immutable reuse/parent revision, and semantic/schema/hash/
coordinate mutations that must fail.

## R2-1 local acceptance, 2026-10-06

Starting repository HEAD was `606e87b925af1eab1bd0340ee00159ceb7d92d5a`, clean.
The existing plugin Python environment used Python 3.12 and Matplotlib 3.11.2.
`npm run bench` exited 0; the new suite ran 8 tests, with zero failures/errors.
Existing differential checks passed 8/8; layout checks passed 18/18; documentation
counts passed 28/28 with zero warnings/skips (62 tools, 57 semantic tools, 50 skills).

| Actual measurement | Maximum error |
| --- | --- |
| Every-point data → serialized pixel, 48 cases / 336 eligible point checks | 2.2737367544323206e-13 px |
| Pixel → data → pixel, same complete matrix | 2.2737367544323206e-13 px |
| Actual PNG coverage-weighted centroid, 100 DPI | 0.042690084518525705 px |
| Actual PNG coverage-weighted centroid, 300 DPI | 0.0284611961416768 px |
| Actual PNG coverage-weighted centroid, 600 DPI | 0.0160120026913618 px |
| Actual PNG pure-pixel centroid, entire matrix (different estimator) | 0.24368550522452767 px |
| R1 linear probe, original pure-color method | 0.029759292422980456 px |
| R1 log/inverted probe, original pure-color method | 0.040307226957826466 px |

Every measured eligible point resolves back to its explicit source row. Negative
coordinates on log x are explicitly excluded rather than invented or sanitized.
The exact point-boundary bundle has 10,000 hit records, 10,001 retained source rows
and 5,581,393 combined JSON bytes. The 10,001-point bundle is refused. An actual
21,605,911-byte PNG is refused against 16,777,216 bytes; an 8,388,608-byte metadata
string plus manifest structure exceeds the JSON budget and is refused. Refusal
directories contain no committed manifests or pending artifacts. Source-free
preview reports `inspect='preview'`, `reason='no-source-table'`, `request_redraw=false`.

Evidence is retained outside the repository at
`F:/A_longriverplan/plot-quality/figview-R2-1/acceptance.json` (per-point records),
`../figview-R2-1-bench.log` (complete bench), `validator-output.json` (217 retained
bundles, including development revisions, all valid), and `validator-cli-output.json`
(real CLI: recipe bundle, 9 rows/9 points, version 1, valid). Run the retained
`validate-all.py` with plugin Python `-I -B` to reproduce the complete validator
scan, or pass a manifest argument for the CLI. `npm pack --dry-run --json` confirms
all three schemas, helpers and contract documentation are included; no package
was published. No desktop/profile installation or R2-2 UI acceptance was attempted.
