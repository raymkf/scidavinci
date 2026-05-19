# Volcano Plot

Standard visualization for differential expression analysis.

## Standard Volcano Plot

```python
def volcano_plot(df, log2fc_col="log2FoldChange", pval_col="padj",
                 log10_thresh=1.3, fc_thresh=1.0,
                 up_color="#D55E00", down_color="#0072B2", ns_color="gray",
                 label_top_n=10, ax=None):
    """Create publication-ready volcano plot.

    Args:
        df: DataFrame with genes, log2FC, adjusted p-value
        log10_thresh: -log10(padj) threshold (default 1.3 = p<0.05)
        fc_thresh: |log2FC| threshold

    Returns:
        fig, ax
    """
    if ax is None:
        fig, ax = plt.subplots(figsize=(4.5, 4.5))

    df = df.copy()
    df["neg_log10"] = -np.log10(df[pval_col].clip(lower=1e-300))

    # Classify
    conditions = [
        (df[log2fc_col] >= fc_thresh) & (df["neg_log10"] >= log10_thresh),
        (df[log2fc_col] <= -fc_thresh) & (df["neg_log10"] >= log10_thresh),
    ]
    choices = ["Up", "Down"]
    df["category"] = np.select(conditions, choices, default="NS")

    # Plot
    color_map = {"Up": up_color, "Down": down_color, "NS": ns_color}
    for cat in ["Up", "Down", "NS"]:
        subset = df[df["category"] == cat]
        ax.scatter(subset[log2fc_col], subset["neg_log10"],
                   c=color_map[cat], s=4, alpha=0.4, label=cat,
                   edgecolors="none", rasterized=True)

    # Threshold lines
    ax.axhline(log10_thresh, c="gray", ls="--", lw=0.5, alpha=0.6)
    ax.axvline(fc_thresh, c="gray", ls="--", lw=0.5, alpha=0.6)
    ax.axvline(-fc_thresh, c="gray", ls="--", lw=0.5, alpha=0.6)

    # Label top genes
    top = df[df["category"] != "NS"].nlargest(label_top_n, "neg_log10")
    for _, row in top.iterrows():
        ax.annotate(row.get("gene", ""),
                    (row[log2fc_col], row["neg_log10"]),
                    fontsize=6, alpha=0.8, ha="center",
                    arrowprops=dict(arrowstyle="-", color="gray",
                                    lw=0.3, alpha=0.4))

    ax.set_xlabel("Log$_2$ Fold Change", fontsize=8)
    ax.set_ylabel("-$\\log_{10}$(adjusted $p$)", fontsize=8)
    ax.legend(loc="upper right", fontsize=7, markerscale=2, framealpha=0.85)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_title("Volcano Plot", fontsize=9)

    return ax.figure, ax
```
