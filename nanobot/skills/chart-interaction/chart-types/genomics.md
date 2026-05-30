---
name: chart-types-genomics
description: "Genomics chart types: Heatmap, PCA plot. Field requirements, formatting rules, and journal conventions."
---

# Genomics Charts (组学类图表)

## Heatmap (`type: "heatmap"`)

Matrix visualization of expression/abundance data. Rows = genes/features, columns = samples/conditions.

**Required fields**: `xField` (column key), `yField` (row key), `valueField` (numeric matrix value).

**Style rules**:
- Color scale: Blue-White-Red diverging for centered data (e.g., z-score normalized). Sequential (e.g., white-to-red) for non-negative data (e.g., counts).
- Row/column clustering: hierarchical clustering with dendrograms when >10 rows/columns. Use `clusterRows: true` / `clusterColumns: true` in config.
- Cell borders: none (heatmap cells should blend). Optional light borders for small matrices (<30x30).
- Row labels: right-aligned, font-size 8-9pt. Hide when >50 rows.
- Column labels: angled 45° or 90° when >10 columns.
- Include color scale bar (legend gradient).

**chart-canvas example**:
```chart-canvas
{"type": "heatmap", "xField": "sample", "yField": "gene", "valueField": "zscore", "clusterRows": true, "clusterColumns": true, "colorScheme": "RdBu", "title": "Top 50 DEGs Across Conditions", "data": [...]}
```

**Scale**: Support up to 50 rows × 100 columns. Beyond that, use backend rendering.

## PCA Plot (`type: "pca"`)

Principal component analysis visualization. Show sample clustering and variance explained.

**Required fields**: `xValueField` (PC1), `yValueField` (PC2). Optional: `groupField` (color by group), `labelField` (sample names), variance explained percentages.

**Auto-detect**: Fields named `PC1`, `PC2`, `PC3`, or columns starting with "PC".

**Style rules**:
- Points: circle, r=5, fill by `groupField`
- Axis labels: include variance explained: "PC1 (32.5%)"
- Confidence ellipses: 95% CI ellipse per group (semi-transparent fill, same color as group)
- Group centroids: optional larger markers at group means
- Max display: 2 PCs in one chart. PC3+PC4 in separate panels for multi-panel figures.
- Sample labels: label only outliers or user-specified samples

**chart-canvas example**:
```chart-canvas
{"type": "pca", "xValueField": "PC1", "yValueField": "PC2", "groupField": "condition", "xLabel": "PC1 (34.2%)", "yLabel": "PC2 (18.7%)", "ellipseGroups": true, "data": [...]}
```

---

**Common rules**:
- Heatmap color must be perceptually uniform (not rainbow/jet)
- PCA axes must be proportional (same unit length for PC1 and PC2)
- Include variance explained for each PC shown
