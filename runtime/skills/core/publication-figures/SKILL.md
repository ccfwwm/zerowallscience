---
name: publication-figures
description: Use whenever you generate a chart, plot, or figure with matplotlib (or seaborn) in this workspace. Applies the ZeroWall Science publication figure style so every generated figure is publication-grade and shares one palette with the app's native charts. Not for interactive plotly/HTML — those follow the same palette manually.
---

# Publication Figures

Make generated figures **publication-grade and on-system by default**. Every
figure you produce with matplotlib must use the bundled ZeroWall Science style, so a
figure in a report and a stat tile in the app read as one design system.

## Apply the style (always, before plotting)

The style file `zerowall.mplstyle` sits next to this SKILL.md. Load it by
absolute path at the top of any figure script:

```python
import matplotlib.pyplot as plt
from pathlib import Path

# This skill's directory — the style ships beside SKILL.md.
STYLE = Path(__file__).resolve().parent / "zerowall.mplstyle" if "__file__" in dir() else None
# In a notebook/agent cell, use the skill's deployed path directly:
plt.style.use(str(STYLE)) if STYLE and STYLE.exists() else plt.style.use("default")
```

If you cannot resolve the path, set the palette inline (same hexes as below).

## The shared palette (single source of truth)

These are the exact hues the app's native charts use. Assign categorical series
in this fixed order — never a different order, never a cycled 9th hue.

| Slot | Hue | Light hex |
|------|-----|-----------|
| 1 | blue | `#2a78d6` |
| 2 | aqua | `#1baf7a` |
| 3 | yellow | `#eda100` |
| 4 | green | `#008300` |
| 5 | violet | `#4a3aa7` |
| 6 | red | `#e34948` |
| 7 | magenta | `#e87ba4` |
| 8 | orange | `#eb6834` |

Sequential (magnitude, one hue light→dark): `#cde2fb #9ec5f4 #6da7ec #3987e5
#256abf #184f95 #104281`. Diverging: blue ↔ red with a neutral gray midpoint.

## Rules (from the app's dataviz standard)

- **One y-axis.** Never two scales on one plot — use two charts or index to a
  common base.
- **Categorical color = identity, assigned in slot order; sequential = one hue
  by magnitude; diverging = two hues + gray midpoint.** Never a rainbow.
- **Thin marks, recessive chrome:** 2px lines, ≥6pt markers, hairline y-grid
  only, no top/right spines (the style sets these).
- **Label selectively** — the endpoint or the extreme, never a number on every
  point. A legend is present for ≥2 series; a single series needs none (the
  title names it).
- **Text stays in ink**, never the series color. Identity comes from the mark.
- **Save clean:** `plt.savefig(path, bbox_inches="tight")` (the style sets dpi).

## Checklist before returning a figure

1. Style applied (palette + chrome from `zerowall.mplstyle`).
2. Series colors assigned in slot order; ≤8 series (else group into "Other").
3. Single y-axis; legend iff ≥2 series; axis labels + units present.
4. Saved to the workspace and referenced by path so it surfaces as an artifact.
