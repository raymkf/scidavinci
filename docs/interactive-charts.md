# Interactive Charts

SciDaVinci generates `chart-json` blocks that the Web UI renders as clickable visual assets. Users can select chart elements, ask follow-up questions, and ask the model to update styles or annotations.

## Supported Chart Types

| Chart type | Best for | Interactive elements |
| --- | --- | --- |
| Bar | Group comparison, Top N ranking, expression/statistic comparison | Individual bars, grouped bars |
| Line | Time series, before/after changes, expression trends | Data points, line series |
| Pie | Category proportions and summary counts | Slices |
| Area | Continuous changes and cumulative trends | Area series, data points |
| Box | Distribution comparison and outlier inspection | Boxes, outliers |
| Volcano | Differential expression and significance analysis | Gene points, significance regions |

## Example Prompts

```text
Read demo_data/interactive_charts/volcano_markers.csv and create a volcano plot highlighting up-regulated and down-regulated markers.
```

```text
Select GENE_A, GENE_B, and GENE_D, color them red, add labels, and compare them with the other significantly changed markers.
```

```text
Create a bar chart from demo_data/interactive_charts/bar_top_markers.csv.
```

To compose a multi-panel figure, use the right-side Visual workspace manually: click `New Collage`, use `Add` to place generated charts on the collage canvas, choose a layout such as `1x2`, then export PNG.

## Test Fixtures

The release test fixtures live under `tests/interactive_charts/`. They are intentionally small and verify the public chart-generation contract without shipping large raw research datasets.
