# Heatmap

Clustered and annotated heatmaps for expression data.

## Clustered Heatmap with Seaborn

```python
def clustered_heatmap(data, z_score=0, cmap="RdBu_r",
                      row_colors=None, col_colors=None,
                      figsize=(7, 6), gene_labels=None, **kwargs):
    """Clustered heatmap with annotations, standard for expression data.

    Args:
        data: DataFrame (rows=genes, columns=samples)
        z_score: 0 for row-wise, 1 for col-wise, None for none
        row_colors: Series for row annotation colors
        col_colors: Series for column annotation colors
        gene_labels: list of gene names (printed in plot)

    Returns:
        clustergrid from sns.clustermap
    """
    g = sns.clustermap(
        data,
        z_score=z_score,
        cmap=cmap,
        center=0 if z_score is not None else None,
        vmin=-2 if z_score == 0 else None,
        vmax=2 if z_score == 0 else None,
        row_cluster=True,
        col_cluster=True,
        figsize=figsize,
        linewidths=0.3,
        linecolor="gray",
        cbar_pos=(0.02, 0.85, 0.03, 0.15),
        dendrogram_ratio=(0.1, 0.05),
        xticklabels=True,
        yticklabels=bool(gene_labels is None or len(gene_labels) <= 50),
        method="average",
        metric="euclidean",
        row_colors=row_colors,
        col_colors=col_colors,
        **kwargs,
    )

    if gene_labels and len(gene_labels) <= 50:
        g.ax_heatmap.set_yticklabels(gene_labels, fontsize=6, style="italic")

    return g
```

## Simple Heatmap with Annotations

```python
def annotated_heatmap(data, annot=True, fmt=".2f", cmap="coolwarm",
                      center=0, ax=None):
    """Heatmap with numeric annotations, good for small matrices."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(5, 4))

    sns.heatmap(data, annot=annot, fmt=fmt, cmap=cmap, center=center,
                linewidths=0.5, ax=ax,
                cbar_kws={"shrink": 0.8, "label": "Value"},
                annot_kws={"fontsize": 7})
    ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right")
    ax.set_yticklabels(ax.get_yticklabels(), rotation=0)
    return ax.figure, ax
```

## Key Heatmap Rules

| Aspect | Guidance |
|--------|----------|
| Color | Diverging (RdBu_r) for log2FC, sequential (viridis) for counts |
| Z-score | Always z-score normalized rows for expression heatmaps |
| Clipping | Clip at vmin/vmax to prevent outliers from washing out signal |
| Gene labels | Only show when n ≤ 50; italicize gene names |
| Annotation bars | Use row_colors/col_colors for metadata (condition, treatment) |
| Dendrograms | Always include for exploratory; optionally omit for publication |
