# SciDaVinci Interactive Chart Demo Data

This directory contains small synthetic CSV files for public demos and tests.
The values are intentionally compact so they are easy to inspect, share, and
use in README examples.

- `volcano_markers.csv`: marker-level volcano plot data.
- `bar_top_markers.csv`: ranked marker changes for a bar chart.
- `line_timecourse.csv`: marker signal across time points.
- `pie_marker_categories.csv`: category counts for a pie chart.
- `box_group_distribution.csv`: grouped values for a box plot.
- `box_cytokine_summary.csv`: box-plot summary data for testing
  table-driven visualisation plus element-level biological interpretation.
- `cytokine_boxplot_background.pdf`: companion background material for
  `box_cytokine_summary.csv`.
- `area_signal_trend.csv`: cumulative signal by condition for an area chart.

Suggested prompt for the cytokine box-plot pair:

> Use `box_cytokine_summary.csv` and `cytokine_boxplot_background.pdf`.
> Create exactly one interactive box plot. Then, when I click a chart element,
> explain the selected element using the biological background.
