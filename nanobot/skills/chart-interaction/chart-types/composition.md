---
name: chart-types-composition
description: "Composition chart types: Bar, Stacked Bar, Pie/Donut, Area. Field requirements, formatting rules, and journal conventions."
---

# Composition Charts (构成类图表)

## Bar Chart (`type: "bar"`)

Compare values across categories. The most common chart type in biology.

**Required fields**: `xField` (categories), `yFields` or `yField` (values). Optional: `errorBars`, `significance`.

**Style rules**:
- Vertical bars only (horizontal bars create perceptual biases in biology)
- Bar width: 60-80% of category spacing
- No 3D, no rounded corners (scientific convention)
- Error bars: SEM by default, upward only
- Y-axis must start at 0 (non-negotiable for bar charts)
- Max ~15 categories for a single chart; beyond that, use horizontal or dot plot
- Grouped bars: max 4 groups; use dodged position, not stacked (unless explicitly requested)

**chart-canvas example**:
```chart-canvas
{"type": "bar", "xField": "Treatment", "yFields": ["IFNγ", "IL-6"], "xLabel": "Treatment", "yLabel": "Cytokine (pg/mL)", "errorBars": [{"series": "IFNγ", "field": "IFNγ_sem", "label": "SEM"}], "data": [...]}
```

**Single-series colored bars**: Keep one yField. Use `elementStyles` keyed by category name to assign per-bar colors. Do NOT split into multiple one-bar series.

## Stacked Bar (`type: "stacked_bar"`)

Show part-to-whole composition across categories.

**Required fields**: `xField` (categories), `yFields` (stack components). Optional: total label.

**Style rules**:
- Colors: sequential palette from same hue, or journal colors for each stack component
- Max 5 stack components
- Do not stack when components are independent (use grouped bars instead)
- Bottom segment sits on baseline (0)

## Pie / Donut (`type: "pie"`)

Part-to-whole composition. Use sparingly — only when the question is genuinely about proportions of a whole.

**Required fields**: `nameField` (slice labels), `valueField` (slice values).

**Style rules**:
- Max 6 slices. For >6 categories, use bar chart instead
- Sort slices by value (largest to smallest), clockwise from 12 o'clock
- Label: category name + percentage. Values < 5% can be grouped into "Other"
- Donut (inner radius 50-60%) preferred over full pie for readability
- No explode, no 3D

## Area Chart (`type: "area"`)

Show continuous change over a sequence, with filled area under the line.

**Required fields**: `xField` (sequence/ordered categories), `yFields` (values).

**Style rules**:
- Fill opacity: 0.2-0.3 per series
- Line on top of fill: 2px, same color
- Max 3 series in one area chart
- X-axis must be ordered (time, dose, etc.)

---

**Common rules**:
- For all composition charts, include percentage labels or values where the reader needs exact numbers
- Bar charts always start Y-axis at 0
- Pie charts limited to ≤6 categories
