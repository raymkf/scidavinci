---
name: chart-interaction
description: "Primary figure-generation skill for the WebUI. Generate publication-quality interactive charts with chart-json, preserve clickable element metadata, and modify chart styles via chartActions. Use this before any static plotting skill for supported figure types: bar, line, area, pie, volcano, and box."
always: true
---

# Chart Interaction Skill

This project is **interactive-first**. For supported figure types, generate and
modify interactive charts with `chart-json`; do not generate static matplotlib
images unless the user explicitly asks for static PDF/TIFF/matplotlib export or
the requested figure type is unsupported by the interactive renderer.

The frontend renders chart data that you provide in ` ```chart-json ` code
blocks and applies `chartActions` to modify existing chart elements.

## Publication-Quality Standard

Interactive charts are still research figures. Treat every `chart-json` chart
and every `chartActions` edit as if it may be exported for a manuscript or
supplementary figure.

Required visual standards:
- Use a colorblind-friendly journal palette by default:
  - blue `#0072B2`
  - vermillion `#D55E00`
  - bluish green `#009E73`
  - reddish purple `#CC79A7`
  - orange `#E69F00`
  - sky blue `#56B4E9`
  - yellow `#F0E442`
  - black `#000000`
- Prefer restrained 2D charts with white background, clear axes, minimal grid,
  no decorative gradients, no 3D, and no unnecessary effects.
- Use descriptive titles, meaningful series names, units, and concise captions.
- Do not use pie charts unless part-to-whole composition is genuinely the
  analytical question; prefer bar/line/area for comparisons and trends.
- When changing colors, map casual user color words to the nearest journal-safe
  color instead of using saturated web colors. For example, "red" should become
  vermillion `#D55E00`, and "blue" should become `#0072B2`.
- Maintain contrast and legibility after edits. Avoid pale colors for small
  marks unless there is a dark outline or a clear label.
- Do not claim statistical significance unless sample sizes, uncertainty, and
  statistical tests are provided.

## Selected Chart Elements

When the user has selected chart elements, they are prepended to the user message:

```
[Selected Chart Elements]
[2024 实验组: 82.3%] (elementId: bar_2024_treatment, chartType: bar, series: 实验组, category: 2024, value: 82.3)
[2024 对照组: 45.1%] (elementId: bar_2024_control, chartType: bar, series: 对照组, category: 2024, value: 45.1)
```

When `[Selected Chart Elements]` is present in the user message, you **must**:
- Prioritize understanding those elements in context
- Explicitly reference their labels, values, series, categories, and chart types in your response
- Combine element values, cross-element differences, chart context, and available research background

## Selected Visual Anchors

The user may also click ordinary generated images in the visual workspace. Those
clicks are prepended as coordinate anchors:

```
[Selected Visual Anchors]
[Figure 2 @ 43%, 61%] (assetId: message-abc-image-0, assetTitle: Figure 2, kind: image, xPct: 43.2, yPct: 61.0)
```

When `[Selected Visual Anchors]` is present:
- Treat the anchor as a precise user reference to a region in the named image.
- Use the image title, coordinates, and surrounding conversation to infer what
  the user is pointing at.
- Be explicit when the anchor is only coordinate-level and not backed by exact
  data values.
- If exact element-level edits are needed, produce or request a paired
  `chart-json` chart so the front end can expose true clickable data elements.

## Generating Interactive Charts

Priority rule:
- If the requested figure type is supported by `chart-json`, output `chart-json`
  as the primary result. Supported interactive types include bar, line, area,
  pie, volcano, and box.
- For broad requests such as "visualize this table" or "可视化一下这个表格",
  do not immediately create a chart. First inspect/list the uploaded dataset(s),
  infer which supported chart types are plausible for each table, then call
  `ask_user` with only those inferred chart options. If the user asks for one
  chart, ask a single-select question. If the user asks for multiple charts,
  alternatives, or a dashboard, make it clear that they may choose one or more
  options so the Web UI can collect a multi-select answer. For a box-plot
  summary table, include box as a candidate rather than silently creating it.
- When multiple spreadsheet files are available, handle them per dataset:
  inspect/list each dataset, ask which chart(s) to generate for each file,
  record the choices in the conversation, then generate charts only after all
  required dataset/chart choices are confirmed.
- If the user response contains a manual plot-selection block from the Web UI
  (`[Manual Plot Selection]`), treat it as an explicit plot plan. Use
  `list_datasets` to match file names to dataset IDs, inspect fields when
  needed, ask follow-up `ask_user` questions only for ambiguous field mappings,
  and generate only the selected chart types in the selected order.
- When using the `plot_dataset` tool, include the returned `chart-json` code
  block verbatim in the final assistant response so the Web UI can render it in
  the chat. Do not leave generated charts only as files, assets, or tool
  results.
- Do not switch to matplotlib/Python just because the request is biomedical or
  "publication quality"; the frontend renderer enforces publication styling.
- Use matplotlib only for currently unsupported interactive figure families
  such as UMAP/t-SNE/PCA scatter with embeddings, clustered heatmaps,
  Kaplan-Meier curves, multi-panel composites, highly customized volcano labels,
  or when the user explicitly asks for PDF/TIFF/static publication export.
- When matplotlib is necessary, also provide a paired `chart-json` version if
  the underlying data can be represented by a supported interactive type.
- Do not emit unexplained figures. If you output one or more charts, include a
  short natural-language reason for each chart before or after it: what data it
  visualizes, why it is useful for the user's request, and the main takeaway.
- Avoid generating multiple alternative charts unless the user asks for
  alternatives or each chart has a distinct stated purpose. When in doubt,
  ask the user to choose from the inferred options before producing charts.

When you want to display data as an interactive chart, output a fenced code block with language `chart-json`:

```chart-json
{
  "type": "bar",
  "title": "Response Rate by Year and Group",
  "xLabel": "Year",
  "yLabel": "Response rate (%)",
  "data": [
    { "Year": "2023", "实验组": 78.5, "实验组_sem": 3.1, "对照组": 42.3, "对照组_sem": 2.8 },
    { "Year": "2024", "实验组": 82.3, "实验组_sem": 2.6, "对照组": 45.1, "对照组_sem": 2.5 }
  ],
  "xField": "Year",
  "yFields": ["实验组", "对照组"],
  "unit": "%",
  "errorBars": [
    { "series": "实验组", "field": "实验组_sem", "label": "SEM" },
    { "series": "对照组", "field": "对照组_sem", "label": "SEM" }
  ],
  "significance": [
    {
      "from": { "series": "对照组", "category": "2024" },
      "to": { "series": "实验组", "category": "2024" },
      "label": "**",
      "pValue": "0.004"
    }
  ],
  "caption": "Bars show mean response rate; error bars show SEM."
}
```

When no explicit colors are requested, include either no `colors` field (the
frontend will apply the journal palette) or use only the journal palette above.

Important bar-chart rule:
- Do not represent a single-series bar chart as many one-bar series just to
  give each bar a different color. That creates grouped bars and makes each bar
  too thin.
- If the user asks for different colors on individual bars in an existing
  chart, keep the chart structure unchanged and return `chartActions` targeting
  the existing bar `elementId`s.
- If the user asks for a newly generated single-series bar chart where each bar
  has its own color, keep one numeric field and use `elementStyles` keyed by the
  bar category or by `${series}@@${category}`:

```chart-json
{
  "type": "bar",
  "title": "Expression by gene",
  "xField": "gene",
  "yField": "expression",
  "yLabel": "Normalized expression",
  "data": [
    { "gene": "IL6", "expression": 12.4 },
    { "gene": "TNF", "expression": 8.7 }
  ],
  "elementStyles": {
    "IL6": { "color": "#D55E00" },
    "TNF": { "color": "#0072B2" }
  }
}
```

- Do not switch to matplotlib just because the user wants individual bar
  colors. Per-element styling belongs to the interactive chart path.

Supported chart types:

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `"bar"` | Vertical bar chart (default) | `xField`, `yFields` or `yField` |
| `"line"` | Line chart with dots | `xField`, `yFields` or `yField` |
| `"pie"` | Pie chart with labels | `nameField`, `valueField` |
| `"area"` | Area chart with fill | `xField`, `yFields` or `yField` |
| `"volcano"` | Differential analysis volcano plot | `xValueField`, `yValueField` or `pValueField`, `labelField` |
| `"box"` | Box-and-whisker summaries | `xField`, `minField`, `q1Field`, `medianField`, `q3Field`, `maxField` |

All fields for `bar`/`line`/`area`:
- `type`: chart type
- `title`: optional heading above chart
- `data`: array of objects (each object = one row)
- `xField`: key for x-axis / category column
- `yFields`: array of keys for data series (use `yField` for single series)
- `xLabel`: manuscript-ready x-axis title
- `yLabel`: manuscript-ready y-axis title, with units when applicable
- `unit`: optional suffix for numerical labels
- `caption`: figure legend/caption text suitable for export
- `aspectRatio`: optional figure ratio such as `"1:1"`, `"4:3"`, or `"16:9"`
- `description`: optional short UI caption when `caption` is absent
- `errorBars`: optional uncertainty metadata, one object per series:
  `{ "series": "treatment", "field": "treatment_sem", "label": "SEM" }`
- `significance`: optional statistical brackets:
  `{ "from": {"series": "...", "category": "..."}, "to": {"series": "...", "category": "..."}, "label": "*", "pValue": "0.03" }`

Pie chart fields:
- `type: "pie"`
- `data`: array of objects
- `nameField`: key for slice labels
- `valueField`: key for numerical values
- `caption`: figure legend/caption text suitable for export

Volcano chart fields:
- `type: "volcano"`
- `data`: array of gene/protein/feature rows
- `xValueField`: log2 fold-change field, commonly `"log2FoldChange"`
- `yValueField`: `-log10(p)` field when already computed
- `pValueField`: raw p-value field when `yValueField` is absent
- `labelField`: gene/protein identifier used for clicked-element semantics
- `groupField`: optional category such as "up", "down", "not significant"
- `xThreshold`: fold-change cutoff, often `1`
- `yThreshold`: `-log10(p)` cutoff, often `1.301` for p=0.05

Box chart fields:
- `type: "box"`
- `data`: one object per group
- `xField`: group label
- `minField`, `q1Field`, `medianField`, `q3Field`, `maxField`
- `outliersField`: optional array field for outlier values

For manuscript-quality scientific charts, include axis labels, units, captions,
and uncertainty fields whenever the underlying data supports them. Do not omit
error bars when the prompt provides SD/SEM/CI or replicate-level summaries.

For dense charts such as volcano plots, keep every data row in `data` when
the dataset is small enough to fit comfortably in the response. Do **not**
inline thousands of rows into a chat response. Large datasets must be handled
as data artifacts/files or by the frontend data layer, with `chart-json`
containing only the plot specification and a reference to the data source once
available. Include stable `idField` or `labelField` values so a clicked point
can be traced back to the source table. The frontend should send only the
clicked element's source row back to the model, not the entire table.

Hard rule for dense data:
- Do not paste full large tables into natural language or markdown.
- Do not emit giant `chart-json.data` arrays for large volcano plots.
- If the data is large and no data-reference mechanism is available, ask the
  user to upload/use a data file and explain that the interactive renderer
  should load the file directly.
- For quick demos only, use a small synthetic subset and label it clearly as a
  demo, not the full dataset.

## Modifying Chart Styles (chartActions)

When the user asks to change colors, highlight elements, or add annotations to selected chart elements, you must return a JSON block with `chartActions`:

```json
{
  "reply": "已将这根柱子改为红色。这是一根很高的柱子，代表了该实验组的最高响应率。",
  "chartActions": [
    {
      "type": "update_element_style",
      "targetElementIds": ["bar_2024_treatment"],
      "style": {
        "color": "#D55E00",
        "stroke": "#111827",
        "strokeWidth": 2
      }
    }
  ]
}
```

For annotations:
```json
{
  "reply": "已添加注释说明这个异常值。",
  "chartActions": [
    {
      "type": "add_annotation",
      "targetElementIds": ["bar_2023_control"],
      "text": "Possible measurement error — value deviates >3σ from mean"
    }
  ]
}
```

**Important**: chartActions must be included within the natural language response body, either as a standalone JSON code block or embedded in the response text. The frontend parses `{"reply": "...", "chartActions": [...]}` patterns.

When producing `chartActions`, preserve publication quality:
- Use journal-safe colors from the palette above.
- Keep `strokeWidth` modest, usually 1.5–2.5.
- Avoid flashy styling, heavy outlines, shadows, or animated-looking effects.
- If a user requests a poor visual choice, satisfy the intent with the nearest
  publication-safe alternative and briefly explain the choice.

## Statistical Rigor

- If sample size, error bars, confidence intervals, or statistical test results are absent from the chart data or selected elements, you **cannot** claim statistical significance.
- You may only do descriptive comparisons (e.g., "X is higher than Y").
- Always qualify uncertainty: "based on the available data" / "this is a descriptive observation".
- If the user asks for statistical analysis, prompt them to provide sample size, standard deviation/error, confidence intervals, or formal test results.
