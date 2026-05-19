---
name: bio-plot
description: "Professional bio-research data visualization using Python (matplotlib, seaborn, scanpy). Create publication-quality figures following Nature/Cell/Science standards: statistical plots with significance bars, volcano plots for differential expression, clustered heatmaps for expression data, PCA/UMAP for dimensionality reduction, Kaplan-Meier survival curves. Use for: (1) Creating new publication figures, (2) Beautifying existing plots, (3) Setting up journal-compliant figure configurations."
metadata: {"nanobot": {"requires": {"bins": ["python3"]}}}
---

# Bio Research Plotting Skill

Create publication-quality bio research figures using Python. All output follows Nature/Cell/Science journal standards.

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

## Workflow

1. **Set up config** — Load publication_config.md, apply global rcParams
2. **Choose plot type** — Load specific reference file for the plot
3. **Generate test data** — Use `generate_test_data.py` if sample data is needed
4. **Plot & customize** — Follow patterns in reference files
5. **Export** — Save as PDF (vector) or TIFF 300dpi (bitmap)

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
