---
name: bio-plot
description: "Fallback static bio-research plotting with Python for figure families that are not yet supported by the interactive chart-json renderer, such as UMAP/t-SNE/PCA embeddings, clustered heatmaps, Kaplan-Meier curves, and complex multi-panel publication composites. Do not use this skill for supported interactive chart-json figures such as bar, line, area, pie, volcano, or box plots unless the user explicitly asks for a static PDF/TIFF/matplotlib export."
metadata: {"nanobot": {"requires": {"bins": ["python3"]}}}
---

# Bio Research Plotting Skill

This is a **fallback static plotting skill**. The product direction is
interactive-first: if a figure can be represented as a supported `chart-json`
interactive chart, output `chart-json` as the primary result and do **not**
generate a matplotlib image by default.

Use Python/matplotlib only when:
- The user explicitly asks for a static PDF/TIFF/matplotlib figure.
- The requested figure type is not yet supported by the interactive renderer.
- The figure is a complex static publication composite that cannot be expressed
  faithfully as one supported interactive chart.

Supported interactive chart-json figure types currently include:
- bar
- line
- area
- pie
- volcano
- box

For these supported types, this skill must defer to the interactive chart
protocol. The chart must still follow Nature/Cell/Science-level visual quality,
but the output should be interactive `chart-json`, not a static image.

## Quick Start

```python
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
```

For detailed code patterns, load reference files as needed:
- [publication_config.md](references/publication_config.md) — Global config template
- [comparison_plots.md](references/comparison_plots.md) — Bar/box/violin + significance
- [volcano.md](references/volcano.md) — Volcano plots for differential expression
- [heatmap.md](references/heatmap.md) — Clustered/annotated heatmaps
- [dim_reduction.md](references/dim_reduction.md) — PCA/UMAP/t-SNE
- [survival.md](references/survival.md) — Kaplan-Meier curves

## Static Fallback Workflow

Use this workflow only after deciding that a static fallback is necessary:

1. **Confirm static need** — The user asked for static export or the figure is unsupported interactively.
2. **Set up config** — Load publication_config.md, apply global rcParams.
3. **Choose plot type** — Load the specific reference file.
4. **Generate test data** — Use `generate_test_data.py` if sample data is needed.
5. **Plot & customize** — Follow reference patterns.
6. **Export** — Save as PDF vector or TIFF 300dpi bitmap.

## Interactive WebUI Output

When the user is working in the web UI, the default output is an interactive
`chart-json` block. For supported interactive chart types, do not create a
matplotlib image unless explicitly requested. This lets the front end render
real clickable chart elements, preserve source-row metadata, support edits, and
export the edited figure.

Interactive WebUI charts must follow the same publication-quality standards as
matplotlib figures. Do not treat `chart-json` as a low-fidelity preview. Use
clean 2D chart types, explicit units, meaningful labels, white background,
minimal gridlines, and a colorblind-friendly journal palette.

Default palette for interactive charts and chartActions:
- blue `#0072B2`
- vermillion `#D55E00`
- bluish green `#009E73`
- reddish purple `#CC79A7`
- orange `#E69F00`
- sky blue `#56B4E9`
- yellow `#F0E442`
- black `#000000`

Use this format for simple bar, line, area, and pie charts:

```chart-json
{
  "type": "bar",
  "title": "Response rate by group",
  "xField": "group",
  "xLabel": "Time point",
  "yLabel": "Response rate (%)",
  "yFields": ["control", "treatment"],
  "unit": "%",
  "data": [
    {"group": "Week 1", "control": 45.2, "control_sem": 2.1, "treatment": 52.8, "treatment_sem": 2.4},
    {"group": "Week 2", "control": 48.1, "control_sem": 2.3, "treatment": 66.3, "treatment_sem": 2.8}
  ],
  "errorBars": [
    {"series": "control", "field": "control_sem", "label": "SEM"},
    {"series": "treatment", "field": "treatment_sem", "label": "SEM"}
  ],
  "significance": [
    {
      "from": {"series": "control", "category": "Week 2"},
      "to": {"series": "treatment", "category": "Week 2"},
      "label": "**",
      "pValue": "0.004"
    }
  ],
  "caption": "Bars show mean response rate; error bars show SEM."
}
```

For interactive charts, include `xLabel`, `yLabel`, `caption`, `errorBars`, and
`significance` whenever the data supports them. If the prompt only gives means
without uncertainty, do not invent SEM/SD/CI; state that the chart is
descriptive.

Supported interactive chart types now include:
- `bar`, `line`, `area`, `pie`
- `volcano` for differential expression/proteomics/metabolomics results
- `box` for box-and-whisker summaries

For volcano plots, keep all rows in `data` when feasible and include stable
gene/protein identifiers. Do not inline thousands of rows in the model's chat
response. Large volcano datasets should be loaded by a frontend data layer or
referenced as a data artifact/file; the model should output the plot
specification and only pass clicked-point source rows back during interaction.

```chart-json
{
  "type": "volcano",
  "title": "Differential expression volcano plot",
  "aspectRatio": "1:1",
  "xLabel": "log2 fold change",
  "yLabel": "-log10(p-value)",
  "xValueField": "log2FoldChange",
  "pValueField": "pValue",
  "labelField": "gene",
  "xThreshold": 1,
  "yThreshold": 1.301,
  "data": [
    {"gene": "IL6", "log2FoldChange": 1.8, "pValue": 0.0008},
    {"gene": "ACTB", "log2FoldChange": 0.1, "pValue": 0.62}
  ],
  "caption": "Points represent genes; dashed lines show |log2FC| = 1 and p = 0.05."
}
```

For box plots:

```chart-json
{
  "type": "box",
  "title": "Expression distribution by group",
  "aspectRatio": "4:3",
  "xField": "group",
  "yLabel": "Normalized expression",
  "minField": "min",
  "q1Field": "q1",
  "medianField": "median",
  "q3Field": "q3",
  "maxField": "max",
  "data": [
    {"group": "control", "min": 1.2, "q1": 2.1, "median": 2.8, "q3": 3.2, "max": 4.4},
    {"group": "treatment", "min": 1.5, "q1": 2.8, "median": 3.6, "q3": 4.1, "max": 5.2}
  ],
  "caption": "Boxes show IQR; center lines show median; whiskers show min-max."
}
```

Use `aspectRatio` deliberately: `"1:1"` for volcano and correlation-like
plots, `"4:3"` for most manuscript panels, and `"16:9"` for presentation-wide
figures.

For large datasets:
- Do not dump the entire table into markdown or `chart-json.data`.
- Do not force the model to carry the entire volcano dataset in conversation
  history.
- Prefer a data-file/reference workflow; interaction should send only the
  clicked element's row-level semantics to the model.

If the user asks to change a clicked element, return a short explanation plus a
JSON object containing `chartActions`:

```json
{
  "reply": "I highlighted the selected treatment bar in red.",
  "chartActions": [
    {
      "type": "update_element_style",
      "targetElementIds": ["..."],
      "style": {"color": "#D55E00", "stroke": "#111827", "strokeWidth": 2}
    }
  ]
}
```

When a user edits an interactive figure, keep the result journal-compliant:
map casual color requests to the nearest palette color, keep outlines modest,
avoid decorative effects, preserve legibility, and mention if the requested
change would reduce interpretability.

Static matplotlib images are appropriate only for unsupported interactive
families or explicit static export requests. For static images, explain that the
user can click positions in the visual workspace to create coordinate anchors,
but exact element-level semantics require a paired `chart-json` output.

## Global Principles

- **Colorblind-friendly**: Use Nature palette — blue (#0072B2), orange (#D55E00), green (#009E73)
- **No 3D effects**: 3D bar/pie charts distort perception — always use 2D
- **Remove chartjunk**: No background color, no top/right spines, minimal gridlines
- **Show individual points**: For n<20, overlay raw data on bar/box plots
- **Consistent scales**: Same y-axis range across comparable panels

## Test Cases

Pre-generated test scripts are at `tests/bio-plot/`. Each produces a standalone figure:
- `pytest tests/bio-plot/test_barplot.py` — bar+significance plot
- `pytest tests/bio-plot/test_volcano.py` — volcano plot
- `pytest tests/bio-plot/test_heatmap.py` — clustered heatmap
- `pytest tests/bio-plot/test_boxplot.py` — box+violin plot
- `pytest tests/bio-plot/test_pca_umap.py` — PCA/UMAP plots
- `pytest tests/bio-plot/test_survival.py` — Kaplan-Meier curves

Run all: `pytest tests/bio-plot/ -v`
