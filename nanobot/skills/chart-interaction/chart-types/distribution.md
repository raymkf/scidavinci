---
name: chart-types-distribution
description: "Distribution chart types: Box plot, Violin plot, Histogram, Density plot. Field requirements, formatting rules, and journal conventions."
---

# Distribution Charts (分布类图表)

## Box Plot (`type: "box"`)

Compare distributions across groups. Shows median, quartiles, range, and outliers.

**Required fields**: `xField` (group), at least one of: summary fields (`minField`, `q1Field`, `medianField`, `q3Field`, `maxField`) OR raw `values` field per group.

**Auto-detect**: Fields named `min`, `q1`, `median`, `q3`, `max` → summary format. Single numeric column + group column → raw format (backend computes summary).

**Style rules**:
- Fill: journal color, ~0.7 opacity
- Median line: white or dark, 2px
- Whisker caps: 50% of box width
- Outliers: small circles (r=3), same color as box, no fill
- Min 3 groups for meaningful comparison

**chart-canvas example** (summary format):
```chart-canvas
{"type": "box", "xField": "Group", "minField": "min", "q1Field": "q1", "medianField": "median", "q3Field": "q3", "maxField": "max", "xLabel": "Treatment Group", "yLabel": "Expression (FPKM)", "data": [...]}
```

## Violin Plot (`type: "violin"`)

Show full distribution shape. Preferred over box plot when n ≥ 10 per group.

**Required fields**: `xField` (group), `yField` or `values` (raw measurements).

**Style rules**:
- Fill: journal color, ~0.3 opacity
- Outline: same color, 1.5px
- Interior box: white median line, quartile marks
- Mirror symmetric (standard violin)
- Min 2 groups, recommended 3-6

## Histogram (`type: "histogram"`)

Frequency distribution of a single numeric variable.

**Required fields**: `xField` (numeric column to bin). Optional: `groupField` (overlay multiple histograms).

**Style rules**:
- Bin count: auto (Sturges' formula: ~log2(n)+1 bins) or user-specified
- Fill: journal color, 0.7 opacity
- Bar borders: same color, 0.5px
- Overlay mode (multiple groups): semi-transparent fills, distinct colors
- X-axis: continuous scale, not categorical

## Density Plot (`type: "density"`)

Smoothed probability density. Preferred over histogram for overlaying multiple distributions.

**Required fields**: `yFields` (numeric columns to compare) or `xField` + `groupField`.

**Style rules**:
- Fill under curve: journal color, 0.2-0.3 opacity
- Line: same color, 2px, no dots
- Max 5 overlaid curves (beyond that, use ridge plot or faceted histogram)
- Y-axis: "Density" label
- Bandwidth: auto (Silverman's rule)

---

**Common rules for all distribution charts**:
- Report n per group in caption: "n=12 per group"
- For small samples (n<5), prefer dot plots or strip plots over box/violin
- Y-axis must include 0 when showing counts or when proportions are meaningful
