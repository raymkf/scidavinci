# Interactive Figure Workbench Roadmap

This project is moving toward an interactive-first scientific figure workbench.
Static plotting should be treated as a fallback, not the main product path.

## Core Product Direction

- Generate manuscript-quality interactive figures instead of static matplotlib images by default.
- Keep figure edits data-aware: the user should click/select visual elements, then instruct the model to restyle, annotate, compare, or explain those exact elements.
- Preserve journal-quality output after every user edit: palette, contrast, axis labels, uncertainty display, aspect ratio, and export quality must remain valid.
- Do not send full large datasets back into the model context. The model should receive only selected elements, selected rows, summaries, or explicit user intent.

## Near-Term Reliability Issues

### Per-Bar Coloring Must Not Become Multi-Series Grouping

Observed bug:

- User asked the model to change every bar in a bar chart to a different color.
- The model regenerated the chart using one series per bar.
- Recharts then rendered a grouped bar chart where every bar became extremely thin because each bar used only `1 / seriesCount` of the category width.
- When asked to fix it, the model replied that `chart-json` cannot support independent coloring in a single-series bar chart and tried to switch back to `bio-plot` static output.

Desired behavior:

- For an existing chart, the model should use `chartActions` targeting existing `elementId`s.
- For a newly generated single-series bar chart, it should remain a single `yField`/`yFields` entry and rely on per-element style overrides rather than inventing many series.
- The frontend should support durable per-element fills for bar elements, including export and thumbnail rendering.
- `bio-plot` must not take over just because the user requests per-bar colors.

Implementation notes:

- Add first-class per-element style metadata to `chart-json`, for example:
  - `elementStyles`: keyed by `elementId`
  - or `data[i]._style` for point/bar-local style
- Ensure `InteractiveChart`, workspace preview, thumbnails, and canvas export all read the same per-element style source.
- Add a validation/normalization layer that detects the anti-pattern "many one-value yFields created only for color" and converts it back to a single-series chart with per-element colors when possible.
- Update prompts/skills so the model never says independent bar colors require static matplotlib.

## Large Interactive Volcano Workbench

This is the main long-term idea to preserve. The goal is not merely to render a
volcano plot, but to build a real interactive scientific figure workbench around
dense point-based data.

Product thesis:

- We should do the difficult thing: make a complete, editable, exportable,
  publication-quality volcano plot that remains interactive even when the
  dataset is large.
- The user should be able to zoom into the figure, inspect dense regions,
  select exact points, style named genes/proteins, and ask the model to explain
  selected biological signals.
- The figure should stay data-aware. Every visible point must map back to its
  source table row, but the full table must not be pushed through the model
  context.

Target capabilities:

- Render complete large volcano plots without flooding the chat or model
  context.
- Support pan, zoom, reset, minimap, hover, click, shift-click, rectangle select,
  lasso select, and search by gene/protein/id.
- Let users zoom the workbench image enough to clearly inspect local clusters
  and individual candidate points.
- Let users click points directly and issue commands such as "make this point
  red", "label this gene", or "compare these selected genes".
- Let users select points by name or pattern, for example a pasted gene list,
  a search box, or model-generated identifiers.
- Let users restyle selected points or named points while keeping a sparse style
  overlay instead of rewriting the whole dataset.
- Allow labels/callouts for important points while avoiding unreadable label
  collisions.
- Preserve semantic traceability: clicked/selected points must map back to original table rows.
- Send only selected point rows, compact summaries, or explicit selection-set references to the model.
- Keep memory bounded enough for ordinary laptops by avoiding giant React/SVG
  node trees.

Likely architecture:

- Dataset registry or artifact layer for CSV/TSV/XLSX data.
- `chart-json` references data by `datasetId` plus field mappings, not by giant inline `data` arrays.
- Canvas/WebGL renderer with typed arrays for coordinates, flags, colors, and source row indexes.
- Web Worker preprocessing for projection, threshold classification, and spatial indexing.
- Spatial index for hit testing and selections.
- Style overlay keyed by stable row id or feature id.
- Level-of-detail rendering: draw all points when possible, but adapt point
  radius, opacity, hover precision, and labels based on zoom level.
- Persistent viewport state per figure: aspect ratio, zoom, pan, selected sets,
  labels, and style overrides should survive refresh.

Non-goals / constraints:

- Do not solve large volcano plots by asking the model to emit thousands of
  rows in `chart-json.data`.
- Do not let the chat transcript become the data transport layer.
- Do not fall back to a static matplotlib image for ordinary volcano editing
  interactions.
- Do not make every point a DOM/SVG element; dense plots need canvas/WebGL.

Possible user workflows:

- Upload a differential expression table, generate an interactive volcano plot,
  zoom into the significant upregulated region, click a gene, and ask the model
  to explain its biological relevance.
- Search for a gene set, color matching points with a journal-safe color, label
  the top hits, and export the edited figure.
- Lasso a dense cluster of points, ask for a compact summary of pathways or
  value ranges, then save that lasso as a named selection set.
- Click two or more points and ask the model to compare fold change, p-value,
  source-row annotations, and research background.

## Interaction Grammar To Add Later

- `style_by_ids`: apply style to exact element ids or source ids.
- `style_by_query`: apply style to rows matching a predicate such as gene names or significance class.
- `create_selection_set`: name a set of selected visual elements.
- `summarize_selection`: ask the model to explain selected elements without sending the entire dataset.
- `annotate_elements`: add labels, arrows, or callouts while preserving export quality.

## Product Rule

When the renderer supports an interactive figure type, the model must stay on
the interactive path. Static output is allowed only when the user explicitly
requests static export or the figure type is not yet supported interactively.
