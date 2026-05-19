# Dimensionality Reduction Plots: PCA / UMAP / t-SNE

Standard plots for clustering and sample relationship visualization.

## PCA Plot

```python
def pca_plot(X, labels=None, groups=None, colors=None,
             pc1=0, pc2=1, var_ratio=None, ax=None):
    """2D PCA scatter plot with optional grouping colors.

    Args:
        X: (n_samples, n_components) PCA result
        labels: sample labels for annotations
        groups: categorical group labels for coloring
        var_ratio: explained variance ratio array
        ax: matplotlib Axes
    """
    if ax is None:
        fig, ax = plt.subplots(figsize=(4, 4))

    df = pd.DataFrame({f"PC{pc1+1}": X[:, pc1], f"PC{pc2+1}": X[:, pc2]})
    if groups is not None:
        df["Group"] = groups

    palette = sns.color_palette("colorblind", n_colors=df["Group"].nunique() if groups is not None else 1)
    sns.scatterplot(data=df, x=f"PC{pc1+1}", y=f"PC{pc2+1}",
                    hue="Group" if groups is not None else None,
                    palette=palette, s=30, alpha=0.7, ax=ax,
                    edgecolor="black", linewidth=0.3)

    # Variance labels
    xlab = f"PC{pc1+1}"
    ylab = f"PC{pc2+1}"
    if var_ratio is not None:
        xlab += f" ({var_ratio[pc1]:.1%})"
        ylab += f" ({var_ratio[pc2]:.1%})"

    ax.set_xlabel(xlab, fontsize=8)
    ax.set_ylabel(ylab, fontsize=8)
    ax.axhline(0, c="gray", ls="--", lw=0.3, alpha=0.4)
    ax.axvline(0, c="gray", ls="--", lw=0.3, alpha=0.4)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_aspect("equal")

    return ax.figure, ax
```

## UMAP / t-SNE Plot

```python
def umap_plot(embedding, groups=None, palette="colorblind",
              s=5, alpha=0.6, ax=None):
    """UMAP or t-SNE 2D embedding scatter plot.

    Args:
        embedding: (n_samples, 2) array from umap/tsne
        groups: categorical labels for coloring
    """
    if ax is None:
        fig, ax = plt.subplots(figsize=(4.5, 4))

    df = pd.DataFrame({"UMAP1": embedding[:, 0], "UMAP2": embedding[:, 1]})
    if groups is not None:
        df["Group"] = groups

    sns.scatterplot(data=df, x="UMAP1", y="UMAP2",
                    hue="Group" if groups is not None else None,
                    palette=sns.color_palette(palette) if isinstance(palette, str) else palette,
                    s=s, alpha=alpha, ax=ax,
                    edgecolor="none", rasterized=True, legend="full")

    ax.set_xlabel("UMAP 1", fontsize=8)
    ax.set_ylabel("UMAP 2", fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_aspect("equal")

    return ax.figure, ax
```

## Scree Plot (Variance Explained)

```python
def scree_plot(var_ratio, n_show=10, ax=None):
    """Bar plot of explained variance per component."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(3.5, 3))

    n = min(len(var_ratio), n_show)
    cumulative = np.cumsum(var_ratio[:n])

    ax.bar(range(n), var_ratio[:n], color=CB_COLORS[0], alpha=0.7,
           edgecolor="black", linewidth=0.5, zorder=2)
    ax.plot(range(n), cumulative[:n], "o-", c="black",
            lw=1, markersize=3, zorder=3)

    ax.set_xlabel("Principal Component", fontsize=8)
    ax.set_ylabel("Variance Explained", fontsize=8)
    ax.set_xticks(range(n))
    ax.set_xticklabels([f"PC{i+1}" for i in range(n)], fontsize=6, rotation=45)
    ax.spines[["top", "right"]].set_visible(False)
    return ax.figure, ax
```
