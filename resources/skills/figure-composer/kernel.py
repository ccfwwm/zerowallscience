def figure_outline_schema():
    return {
        "type": "object",
        "properties": {
            "claim": {"type": "string"},
            "width_mm": {"type": "number"},
            "ncol": {"type": "integer"},
            "row_heights_mm": {"type": "array", "items": {"type": "number"}},
            "panels": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "letter": {"type": "string"},
                        "role": {
                            "type": "string",
                            "enum": ["schematic", "hero", "primary", "supporting"],
                        },
                        "message": {"type": "string"},
                        "chart_family": {"type": "string"},
                        "data_path": {"type": ["string", "null"]},
                        "data_desc": {"type": "string"},
                        "row": {"type": "integer"},
                        "col": {"type": "integer"},
                        "colspan": {"type": "integer"},
                        "rowspan": {"type": "integer"},
                        "label_budget": {"type": "integer"},
                        "ask": {"type": "string"},
                    },
                    "required": [
                        "letter",
                        "role",
                        "message",
                        "chart_family",
                        "row",
                        "col",
                        "colspan",
                        "ask",
                    ],
                },
            },
        },
        "required": ["claim", "width_mm", "ncol", "row_heights_mm", "panels"],
    }


def grid_geom(outline, dpi=300, gutter_mm=4):
    mm = dpi / 25.4
    width = int(outline["width_mm"] * mm)
    ncol = outline["ncol"]
    gutter = int(gutter_mm * mm)
    col_width = (width - gutter * (ncol - 1)) // ncol
    row_heights = [int(height * mm) for height in outline["row_heights_mm"]]
    row_y = [sum(row_heights[:i]) + gutter * i for i in range(len(row_heights))]
    return width, ncol, col_width, row_heights, row_y, gutter


def panel_px(outline, letter, dpi=300, gutter_mm=4):
    _, _, col_width, row_heights, _, gutter = grid_geom(outline, dpi, gutter_mm)
    panel = next(item for item in outline["panels"] if item["letter"] == letter)
    colspan = panel["colspan"]
    rowspan = panel.get("rowspan", 1)
    row = panel["row"]
    width = col_width * colspan + gutter * (colspan - 1)
    height = sum(row_heights[row : row + rowspan]) + gutter * (rowspan - 1)
    return width, height


def panel_xy(outline, letter, dpi=300, gutter_mm=4):
    _, _, col_width, _, row_y, gutter = grid_geom(outline, dpi, gutter_mm)
    panel = next(item for item in outline["panels"] if item["letter"] == letter)
    return panel["col"] * (col_width + gutter), row_y[panel["row"]]


def panel_task(outline, letter, fig_label="Figure", rules_ref="load figure-style"):
    panel = next(item for item in outline["panels"] if item["letter"] == letter)
    width, height = panel_px(outline, letter)
    neighbours = ", ".join(
        f"{item['letter']}={item['role']}:{item['chart_family']}"
        for item in outline["panels"]
        if item["letter"] != letter
    )
    data_path = panel.get("data_path")
    data_line = (
        f"**Data path:** `{data_path}` — {panel.get('data_desc', '')}"
        if data_path
        else "**Data:** none (schematic)."
    )
    rowmates = [
        item["letter"]
        for item in outline["panels"]
        if item["row"] == panel["row"]
        and item["letter"] != letter
        and item.get("rowspan", 1) == panel.get("rowspan", 1)
    ]
    share_line = (
        f"- **Row-mates: {','.join(rowmates)}** — match y-limits for the same metric; "
        "label series identity once on the row."
        if rowmates
        else ""
    )
    label_budget = panel.get("label_budget", 4)
    return f"""Produce panel **{letter}** of {fig_label} at the exact project path requested by the parent.

## Figure claim
> {outline['claim']}

Neighbours: {neighbours}

## Panel
- **role:** {panel['role']} · **chart family:** {panel['chart_family']}
- **message:** {panel['message']}
- **show:** {panel['ask']}
{data_line}
{share_line}

Load `figure-style`. Keep every series identifiable and use no more than
{label_budget} narrative annotations beyond axes, titles, and identity labels.
Fill at least 75% of the available box. Reserve the top-left 10×6 mm for the
composer's panel letter.

Render with matplotlib at exactly {width}×{height} px and 300 dpi. Do not use
`bbox_inches='tight'`, `tight_layout`, or constrained layout. Verify the saved
PNG with Pillow, inspect it with ZeroWall's `view_image` tool, fix visible defects,
and return its concrete project-relative filename. Do not return an artifact id
or placeholder marker."""


def compose_crops(outline, dpi=300, gutter_mm=4, pad_px=4):
    """Return PIL-compatible crop boxes for every panel in the composite."""
    width, _, _, row_heights, row_y, _ = grid_geom(outline, dpi, gutter_mm)
    height = row_y[-1] + row_heights[-1]
    boxes = {}
    for panel in outline["panels"]:
        letter = panel["letter"]
        panel_width, panel_height = panel_px(outline, letter, dpi, gutter_mm)
        x, y = panel_xy(outline, letter, dpi, gutter_mm)
        boxes[letter] = (
            max(x - pad_px, 0),
            max(y - pad_px, 0),
            min(x + panel_width + pad_px, width),
            min(y + panel_height + pad_px, height),
        )
    return boxes


def compose_figure(
    outline,
    panel_paths,
    out_path,
    dpi=300,
    gutter_mm=4,
    letter_font="DejaVuSans-Bold.ttf",
    letter_pt=9,
    letter_case="lower",
):
    from PIL import Image, ImageDraw, ImageFont

    width, _, _, row_heights, row_y, _ = grid_geom(outline, dpi, gutter_mm)
    height = row_y[-1] + row_heights[-1]
    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype(letter_font, int(letter_pt / 72 * dpi))
    except Exception:
        font = ImageFont.load_default()
    for panel in outline["panels"]:
        letter = panel["letter"]
        panel_width, panel_height = panel_px(outline, letter, dpi, gutter_mm)
        x, y = panel_xy(outline, letter, dpi, gutter_mm)
        image = Image.open(panel_paths[letter]).convert("RGBA")
        if image.size != (panel_width, panel_height):
            image = image.resize((panel_width, panel_height))
        canvas.paste(image, (x, y), image)
        stamp = letter.lower() if letter_case == "lower" else letter.upper()
        draw.text(
            (x + int(1.5 / 25.4 * dpi), y + int(1 / 25.4 * dpi)),
            stamp,
            fill="black",
            font=font,
        )
    canvas.save(out_path)
    return out_path, (width, height)


def group_fixes_by_panel(review):
    grouped = {}
    for violation in review.get("violations", []):
        if violation.get("severity") not in ("BLOCKER", "MAJOR"):
            continue
        letter = violation.get("panel_letter") or (violation.get("location", " ") + " ")[0]
        grouped.setdefault(letter, []).append(
            f"- **[{violation['severity']}]** ({violation.get('rule_ref', '')}, "
            f"{violation.get('location', '')}) {violation.get('finding', '')} "
            f"**Fix:** {violation.get('fix', '')}"
        )
    return {letter: "\n".join(items) for letter, items in grouped.items()}


def review_schema(per_panel=True):
    violation_properties = {
        "severity": {"type": "string", "enum": ["BLOCKER", "MAJOR", "MINOR"]},
        "rule_ref": {"type": "string"},
        "location": {"type": "string"},
        "finding": {"type": "string"},
        "fix": {"type": "string"},
    }
    if per_panel:
        violation_properties["panel_letter"] = {"type": "string"}
    return {
        "type": "object",
        "properties": {
            "editor_verdict": {
                "type": "string",
                "enum": ["accept", "minor_revision", "major_revision", "reject"],
            },
            "outline_revisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {
                            "type": "string",
                            "enum": ["geometry", "titles", "panel_set", "label_budget", "other"],
                        },
                        "affected_panels": {"type": "array", "items": {"type": "string"}},
                        "finding": {"type": "string"},
                        "revision": {"type": "string"},
                    },
                    "required": ["kind", "affected_panels", "finding", "revision"],
                },
            },
            "violations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": violation_properties,
                    "required": list(violation_properties),
                },
            },
            "regression_vs_prev": {"type": "array", "items": {"type": "string"}},
            "strongest_aspect": {"type": "string"},
        },
        "required": ["editor_verdict", "outline_revisions", "violations", "strongest_aspect"],
    }


def composite_review_task(
    composite_path,
    outline,
    rules_path=None,
    previous_path=None,
    round_no=1,
    min_floor=5,
):
    panel_table = "\n".join(
        f"  {panel['letter']}: {panel['role']:<10} row{panel['row']}+"
        f"{panel.get('rowspan', 1)} col{panel['col']}+{panel['colspan']} — "
        f"{panel['chart_family']} — \"{panel['message']}\""
        for panel in outline["panels"]
    )
    previous_line = f"\n**Previous image:** `{previous_path}`" if previous_path else ""
    rules_line = f"\n**Design-rule source:** `{rules_path}`" if rules_path else ""
    return f"""Review the complete multi-panel figure as an adversarial journal production editor.

Inspect `{composite_path}` with ZeroWall's `view_image` tool. If panel-level inspection
is needed, use Python and Pillow to save concrete crop files, then inspect those
files with `view_image`. Do not assume an image-crop method exists inside Python.

Review both the outline and individual panels. Check dead space, grid geometry,
standalone titles, label budgets, seams, panel-letter placement, legibility, and
data fidelity. For data-backed panels, compare two or three plotted values with
the concrete `data_path` in the outline.

**Round:** {round_no}
**Composite:** `{composite_path}`{rules_line}{previous_line}
**Claim:** {outline['claim']}
**Outline:**
{panel_table}

Return only data matching the supplied review schema. Report at least
{min_floor} calibrated findings when they genuinely exist; never manufacture a
violation to reach the floor."""


def apply_outline_revisions(outline, revisions):
    """Return the panel letters affected by outline-level revisions."""
    affected = set()
    for revision in revisions:
        affected |= set(revision.get("affected_panels", []))
    return affected
