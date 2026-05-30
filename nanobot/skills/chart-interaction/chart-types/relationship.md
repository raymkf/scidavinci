---
name: chart-types-relationship
description: "Relationship chart types: Scatter, Volcano, Correlation Heatmap. Field requirements, formatting rules, and journal conventions."
---

# Relationship Charts (关系类图表)

## Scatter Plot (`type: "scatter"`)

Show relationship between two numeric variables.

**Required fields**: `xValueField` (numeric), `yValueField` (numeric). Optional: `groupField` (color by category), `labelField`, `sizeField`.

**Auto-detect**: First two numeric columns in data.

**Style rules**:
- Points: circle, r=4 (r=2-3 for >500 points)
- Color: by `groupField` if present, else single journal color
- Opacity: 0.6-0.8 (lower for dense plots)
- X and Y axis labels must include units
- Correlation annotation optional: "r=0.73, p<0.001" in top-left of plot area

## Volcano Plot (`type: "volcano"`)

Differential expression/abundance analysis. Log2 fold change vs -log10(p-value).

**Required fields**: `xValueField` (log2FC, default "log2FoldChange"), `yValueField` (-log10P) OR `pValueField` (raw p-value). Optional: `labelField` (gene/protein name), `groupField` (up/down/ns categories).

**Auto-detect**: Fields matching `log2FoldChange`, `logFC`, `log2FC`, `padj`, `pvalue`, `p_value`, `negLog10P`.

**Style rules**:
- Colors: up-regulated = `#D55E00`, down-regulated = `#0072B2`, not significant = `#9CA3AF` (gray)
- Threshold lines: dashed vertical at ±`xThreshold` (default 1), dashed horizontal at `yThreshold` (default 1.301 = -log10(0.05))
- Point size: r=3, reduced to r=2 for >1000 points
- Top N genes: label up to 10 most significant or user-specified genes
- Caption must state thresholds used

**Threshold computation**:
- If `pValueField` is provided (not `yValueField`): compute `yValueField = -log10(pValueField)`
- xThreshold default: 1 (|log2FC| ≥ 1)
- yThreshold default: 1.301 (corresponds to p=0.05)

## Correlation Heatmap (`type: "correlation_heatmap"`)

Pairwise correlation matrix of multiple numeric variables.

**Required fields**: Numeric columns in data form a matrix. Each row = one variable, columns = other variables, values = correlation coefficients.

**Style rules**:
- Color scale: blue-white-red diverging (blue=negative, white=0, red=positive)
- Cell labels: correlation value or asterisk for significance
- Lower/upper triangle: show only one triangle to avoid redundancy
- Clustering: hierarchical clustering on rows and columns recommended
- Scale bar: include color legend with range [-1, 1]

---

**Common rules**:
- Include axis labels with units
- For dense scatter/volcano (>1000 pts), use lower opacity to show density
- Always report correlation coefficients with p-values when claiming correlation
