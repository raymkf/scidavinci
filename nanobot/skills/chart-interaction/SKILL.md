---
name: chart-interaction
description: "Primary figure-generation skill for scidavinci WebUI. Generate publication-quality interactive charts with Python matplotlib rendering + Konva overlay, preserve clickable element metadata, and modify chart styles via chartActions. Supports 18+ bioinformatics chart types."
always: true
---

# Chart Interaction Skill

This project is **interactive-first** and targets **journal/publication-quality figures**.
Charts are rendered by Python matplotlib/seaborn on the backend and displayed as PNG images
with a transparent Konva.js overlay for element interaction. Output ` ```chart-image ` code
blocks containing the rendered image URL and overlay zone coordinates.

## 1. Publication-Quality Standards (~30 lines)

- **Color palette**: Colorblind-friendly journal palette (Wong 2011):
  `#0072B2`(blue) `#D55E00`(vermillion) `#009E73`(green) `#CC79A7`(purple) `#E69F00`(orange) `#56B4E9`(sky) `#F0E442`(yellow) `#000000`(black)
- **Chart style**: Restrained 2D, white background, clear axes, minimal grid. No 3D, no decorative gradients, no gratuitous effects.
- **Font**: Arial/Helvetica, 10pt axis labels, 12pt title, 9pt legend. Export at 300 DPI minimum.
- **Axes**: Ticks inward. No top/right border lines (classic biology journal style: open axes).
- **Legend**: Inside top-right by default, no border. If it occludes data, move to top or bottom.
- **Error bars**: Default to SEM for bar charts. Switch to SD or CI when explicitly requested.
- **Significance**: `*p<0.05, **p<0.01, ***p<0.001, ****p<0.0001`. Never claim significance without sample sizes and statistical tests.
- **Map casual color words** to journal-safe colors: "red"→`#D55E00`, "blue"→`#0072B2`, "green"→`#009E73`.

## 2. Plan Mode — Structured Chart Planning (~40 lines)

**Trigger**: When the user makes a broad request like "visualize this data", "看看这些数据画什么图",
"帮我看看这个差异表达数据" — DO NOT immediately call `plot_dataset`. Instead:

1. Use `list_datasets` to inspect available datasets.
2. For each dataset, identify the column types and infer candidate chart types.
3. Output a `<plot_plan>` JSON block (see schema below) with up to **6 recommendations**.
4. Wait for the user to confirm their selections before generating any charts.

**Plan JSON schema**:
```json
{
  "plan_id": "plan-001",
  "title": "Differential Expression Visualization Plan",
  "description": "One-sentence summary of what this plan covers",
  "datasets": ["dataset-uuid-1"],
  "recommendations": [
    {
      "chart_type": "volcano",
      "display_name": "Volcano Plot",
      "rationale": "Show significantly up/down-regulated genes with fold-change vs p-value",
      "required_fields": [
        {"field": "log2FoldChange", "role": "x", "available": true},
        {"field": "negLog10P", "role": "y", "available": false},
        {"field": "pvalue", "role": "pValue", "available": true}
      ],
      "suggested_config": {"xValueField": "log2FoldChange", "pValueField": "pvalue"},
      "priority": "recommended"
    }
  ]
}
```

- `priority`: "recommended" (strong fit), "alternative" (works but not ideal), "conditional" (only if specific conditions met)
- Each recommendation MUST include `rationale` (1-2 sentences) and field availability check.
- **Skip Plan Mode** when: the user explicitly names a chart type ("画一个火山图"), or the request is clearly single-chart ("把这个表做成bar chart").

## 3. Direct Chart Generation (~20 lines)

When the user has confirmed a plan or explicitly requested a chart type, call `plot_dataset`
with the appropriate parameters. The tool returns a ` ```chart-image ` code block containing
the backend-rendered PNG URL, overlay zones, and metadata.

**Do NOT construct chart-image JSON manually** — always use the `plot_dataset` tool, which:
1. Queries the full dataset via DuckDB
2. Renders the chart with Python matplotlib/seaborn (Nature journal quality)
3. Returns a ` ```chart-image ` block that the frontend displays as an interactive image+overlay

The chart-image format returned by plot_dataset looks like:
```chart-image
{
  "imageUrl": "/api/charts/chart_abc123.png",
  "imageWidth": 800,
  "imageHeight": 520,
  "type": "volcano",
  "title": "Volcano Plot: Treatment vs Control",
  "zones": [
    {"id": "gene_TP53", "x": 423.5, "y": 28.1, "width": 8, "height": 8,
     "metadata": {"label": "TP53", "value": 5.2, "chartType": "volcano", ...}}
  ]
}
```

**CRITICAL — Include chart-image block in your response.** The frontend renders charts
from ` ```chart-image ` blocks found in your **assistant message content**. When
`plot_dataset` returns a ` ```chart-image ` block, you MUST copy it verbatim into
your response message. Without it, the user sees NO chart — just text. Write your reply
text around the chart-image block; keep the block intact without modification.

Supported chart types (call plot_dataset with these): bar, line, pie, area, volcano, box,
scatter, violin, heatmap, pca, bubble, venn, upset, histogram, density, stacked_bar, gsea,
correlation_heatmap, enrichment_bar.

**Overlay highlight shapes**: Zone highlights now match actual chart geometry:
- Rect (default): bars, boxes, area fills, heatmap cells
- Circle: scatter points, bubble markers, venn set circles, line data points
- Wedge: pie/donut slices

Shape metadata (`_shape`, `_circle_cx/cy/r`, `_wedge_cx/cy/r`, `_konva_rotation/_konva_angle`)
is automatically embedded by the backend renderer and frontend chart renderers. No manual
configuration needed.

Optional plot_dataset parameters:
- `journal`: "nature" | "science" | "cell" | "lancet" (controls font, tick style, etc.)
- `aspect_ratio`: e.g. "4:3", "1:1", "16:9"
- `x_label`, `y_label`: override axis labels
- `element_styles`: JSON string mapping element keys to style overrides for per-element
  appearance changes. Keys use `category` (gene name, bar label) or `series@@category`
  for disambiguation in grouped charts. Supported style fields: `color`, `fillOpacity`,
  `stroke`, `strokeWidth`, `pointSize`, `visible`. Example:
  `'{"TP53": {"color": "#FF0000", "fillOpacity": 0.5}, "Treatment@@Cell Line A": {"color": "#D55E00"}}'`.
  Use this to regenerate a chart with specific elements recolored — do NOT use chartActions
  for color/style changes on chart-image charts.

For detailed field requirements of each chart type, read the corresponding chart-type skill file:
`skills/chart-interaction/chart-types/distribution.md` (box, violin, histogram, density)
`skills/chart-interaction/chart-types/relationship.md` (scatter, volcano, correlation_heatmap)
`skills/chart-interaction/chart-types/composition.md` (bar, stacked_bar, pie, donut)
`skills/chart-interaction/chart-types/genomics.md` (heatmap, pca)
`skills/chart-interaction/chart-types/multi-set.md` (venn, upset)
`skills/chart-interaction/chart-types/pathway.md` (bubble, gsea, enrichment_bar)

## 4. Interaction Protocol — CRITICAL: Two Chart Types

**There are TWO fundamentally different chart rendering paths. They have DIFFERENT interaction capabilities.**

### chart-image (Backend PNG + Overlay)

These are static PNG images rendered by Python matplotlib with a transparent Konva.js overlay
for hit detection. The overlay is generated automatically by `plot_dataset`.

**What chartActions CAN do (overlay-level only):**
- `select_elements` / `clear_selection` — toggle overlay highlight outlines on elements
- `select_by_semantic_query` — select elements by label, threshold, top_n, etc. → shows overlay highlight
- `add_annotation` — add text/arrow annotations on the overlay

**What chartActions CANNOT do (no visual effect on the PNG):**
- `update_element_style` / `style_current_selection` / `style_by_ids` — changing color, size, stroke on a PNG has ZERO visual effect
- Any action that modifies the rendered appearance of chart elements

**Rule: When the user asks to change how a chart-image chart LOOKS (color, size, labels, axis, title),
you MUST call `plot_dataset` again with updated parameters to regenerate the entire image.
Do NOT use chartActions for visual style changes on chart-image charts.**

### chart-canvas (Frontend Konva Rendering)

These are vector charts rendered entirely in the browser via Konva.js. chartActions CAN
modify element styles (color, stroke, size) in real-time with immediate visual feedback.

### When to use chartActions vs Regeneration

| User asks to... | chart-image (PNG) | chart-canvas (Konva) |
|---|---|---|
| Highlight/select elements | ✅ chartActions | ✅ chartActions |
| Change element color | ❌ → regenerate | ✅ chartActions |
| Change size/point size | ❌ → regenerate | ✅ chartActions |
| Add annotations | ✅ chartActions | ✅ chartActions |
| Change title/axis labels | ❌ → regenerate | ❌ → regenerate |
| Add/remove grid | ❌ → regenerate | ❌ → regenerate |
| Adjust axis range | ❌ → regenerate | ❌ → regenerate |

**When regenerating a chart-image chart for style changes:**
1. Query the specific data you need (e.g., find the gene name)
2. Call `plot_dataset` with the SAME dataset and chart type, plus the `element_styles` parameter
   to override colors/styles for specific elements by name
3. The tool returns a fresh chart-image block — the old chart is replaced

**NEVER fall back to manual matplotlib/Python scripts.** Always use `plot_dataset` for chart generation.
It handles journal styling, color palettes, and overlay zones automatically.

### chartActions JSON format

Embed chartActions in your response when using overlay-level features:

```json
{"reply": "I've highlighted the top 10 significant genes.", "chartActions": [
  {"type": "select_by_semantic_query", "intent": "top_n", "plan": {"n": 10, "valueField": "negLog10P", "labelField": "gene"}}
]}
```

Supported actions: `select_elements`, `clear_selection`, `select_by_semantic_query`
(intents: outliers/top_n/bottom_n/threshold/category/label_match/significant),
`add_annotation`, `update_axis`, `update_legend`, `update_text_block`, `update_background`.

DO NOT use `style_current_selection`, `update_element_style`, or `style_by_ids` on chart-image charts.
These actions have no visual effect on PNG images.

When `[Selected Chart Elements]` appears in the user message:
- Explicitly reference their labels, values, and chart types in your response.
- Use their element IDs in chartActions when the user asks to highlight them.

## 5. Data Handling (~20 lines)

- **Large tables**: Do NOT inline thousands of rows in data. Always use `plot_dataset`
  tool which queries the full dataset via DuckDB. Do not construct chart-image JSON manually.
- **Dense charts (volcano/heatmap)**: Keep all rows when < 3000 points. Above that, use the tool path.
- **Missing values**: Skip rows with missing required fields. Note in caption: "n=X after excluding missing values."
- **Attachments**: CSV/XLSX files are auto-profiled. Large attachments (>1000 rows) send only metadata
  (column names, types, sample rows, summary stats). The model sees these profiles, not raw data.

## Manual Plot Selection

When the user message contains `[Manual Plot Selection]`, treat it as an explicit plot plan:
- Match file names to dataset IDs via `list_datasets`.
- Generate only the selected chart types, in the selected order.
- Use `ask_user` only for ambiguous field mappings.
