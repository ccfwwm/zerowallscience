---
name: figure-composer
description: >
  Compose multi-panel scientific figures with consistent styling and layout.
  Use this skill to combine individual plots into publication-ready figures
  with proper panel labels, alignment, and professional formatting.
---

# Figure Composer

Create publication-ready multi-panel figures by composing individual plots with
consistent styling, proper alignment, and professional layout. This skill handles
the common task of assembling standalone plots into complex figures for papers,
posters, and presentations.

## When to use

- Combining multiple plots into a single multi-panel figure
- Creating figures with consistent panel labels (A, B, C, ...)
- Aligning plots with different aspect ratios
- Applying journal-specific formatting requirements
- Generating figures for manuscripts, grants, or presentations

## Core principles

1. **Consistency**: Uniform fonts, sizes, colors across panels
2. **Clarity**: Clear panel labels and logical flow
3. **Accessibility**: Colorblind-safe palettes, sufficient contrast
4. **Standards**: Follow journal guidelines (Nature, Science, Cell, PLOS, etc.)

## Basic composition

### Using matplotlib/Python

```python
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec

fig = plt.figure(figsize=(12, 8))
gs = GridSpec(2, 2, figure=fig, hspace=0.3, wspace=0.3)

# Panel A: Line plot
ax1 = fig.add_subplot(gs[0, 0])
ax1.plot(x, y)
ax1.text(-0.1, 1.1, 'A', transform=ax1.transAxes,
         fontsize=16, fontweight='bold', va='top')

# Panel B: Scatter plot
ax2 = fig.add_subplot(gs[0, 1])
ax2.scatter(x, y)
ax2.text(-0.1, 1.1, 'B', transform=ax2.transAxes,
         fontsize=16, fontweight='bold', va='top')

# Panel C: Bar plot (spanning full width)
ax3 = fig.add_subplot(gs[1, :])
ax3.bar(categories, values)
ax3.text(-0.05, 1.1, 'C', transform=ax3.transAxes,
         fontsize=16, fontweight='bold', va='top')

plt.savefig('figure1.pdf', dpi=300, bbox_inches='tight')
```

### Using R patchwork

```r
library(ggplot2)
library(patchwork)

p1 <- ggplot(data, aes(x, y)) + geom_line() +
      labs(tag = 'A') + theme_classic()
p2 <- ggplot(data, aes(x, y)) + geom_point() +
      labs(tag = 'B') + theme_classic()
p3 <- ggplot(data, aes(x, y)) + geom_col() +
      labs(tag = 'C') + theme_classic()

# Compose layout
(p1 | p2) / p3 +
  plot_annotation(tag_levels = 'A') &
  theme(plot.tag = element_text(size = 16, face = 'bold'))

ggsave('figure1.pdf', width = 12, height = 8, dpi = 300)
```

## Layout patterns

### Side-by-side (2 panels)
```python
gs = GridSpec(1, 2, figure=fig)
```

### Grid (4 panels)
```python
gs = GridSpec(2, 2, figure=fig)
```

### Mixed sizes
```python
gs = GridSpec(2, 3, figure=fig)
ax1 = fig.add_subplot(gs[0, :2])  # Spans 2 columns
ax2 = fig.add_subplot(gs[0, 2])   # Single column
ax3 = fig.add_subplot(gs[1, :])   # Spans full width
```

## Styling guidelines

### Fonts
- Main text: 7-9 pt for most journals
- Panel labels: 12-14 pt, bold
- Axis labels: 8-10 pt
- Consistent font family (Arial, Helvetica, or Times)

### Colors
- Use colorblind-safe palettes (viridis, Set2, ColorBrewer)
- Sufficient contrast (WCAG AA: 4.5:1 minimum)
- Avoid red-green combinations

### Resolution
- Vector formats (PDF, SVG) preferred
- Raster: 300+ DPI for print, 600 DPI for microscopy images
- Final width: 89 mm (single column), 183 mm (double column), 247 mm (full page)

## Journal-specific requirements

### Nature/Cell
- Single column: 89 mm, double: 183 mm
- Arial or Helvetica, 5-7 pt minimum
- RGB color mode
- PDF or EPS format

### PLOS
- Width: 789-2250 pixels at 300 DPI
- Arial, Helvetica, or Times, 6-12 pt
- TIF or EPS format

### Science
- Width: 5.5 cm (single) or 12 cm (double)
- Helvetica, 6-8 pt
- PDF, EPS, or TIF

## Best practices

- **Start with sketches**: Plan layout before coding
- **Consistent spacing**: Use equal margins and gaps
- **Logical flow**: Left-to-right, top-to-bottom reading order
- **Self-contained legends**: Each panel should be interpretable independently
- **White space**: Don't overcrowd; use negative space effectively
- **Version control**: Save source code alongside figures

## Common issues

| Issue | Solution |
|---|---|
| Misaligned panels | Use GridSpec or patchwork; avoid manual positioning |
| Inconsistent fonts | Set `rcParams` globally in matplotlib or theme in ggplot2 |
| Low resolution | Export at 300+ DPI; use vector formats when possible |
| Poor color contrast | Test with colorblind simulators; use accessible palettes |
| Text clipping | Use `bbox_inches='tight'` or adjust figure margins |

## Automation tools

- **Python**: `matplotlib`, `seaborn`, `plotly`
- **R**: `ggplot2` + `patchwork`, `cowplot`, `gridExtra`
- **External**: Inkscape, Adobe Illustrator (for final polish)

## Related skills

- `figure-style` — Apply journal-specific styling
- `publication-figures` — General publication figure guidelines
- `paper-narrative` — Structure figures to support paper narrative

---

**Next:** Apply journal-specific styling, generate high-resolution exports, or
create supplementary figure galleries.
