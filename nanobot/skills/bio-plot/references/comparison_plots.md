# Comparison Plots: Bar / Box / Violin with Significance

Common patterns for group comparison figures in bio research.

## Significance Bar Annotation

```python
def add_sig_bars(ax, pairs, heights, p_values=None, stars=None, bar_height=0.03):
    """Add significance bars between groups.

    Args:
        ax: matplotlib Axes
        pairs: list of (x1, x2) tuples
        heights: y-positions for each bar
        p_values: optional list of exact p-values
        stars: optional list of star strings (overrides automatic)
    """
    for i, ((x1, x2), h) in enumerate(zip(pairs, heights)):
        s = stars[i] if stars else (
            "****" if p_values[i] <= 0.0001 else
            "***"  if p_values[i] <= 0.001 else
            "**"   if p_values[i] <= 0.01 else
            "*"    if p_values[i] <= 0.05 else
            "n.s."
        )
        ax.plot([x1, x1, x2, x2],
                [h, h + bar_height, h + bar_height, h],
                lw=0.6, c="black")
        ax.text((x1 + x2) / 2, h + bar_height, s,
                ha="center", va="bottom", fontsize=7)
```

## Bar Plot with Individual Points

```python
def barplot_with_points(data, x_col, y_col, hue_col, ax=None):
    """Grouped bar plot overlayed with individual data points."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(3.5, 4))

    # Bars
    sns.barplot(data=data, x=x_col, y=y_col, hue=hue_col,
                ax=ax, palette="Set2", edgecolor="black",
                linewidth=0.8, capsize=0.05, errwidth=0.8)

    # Overlay individual points with jitter
    for i, (name, grp) in enumerate(data.groupby([x_col, hue_col])):
        x_pos = i  # Bar center
        y_vals = grp[y_col].values
        jitter = np.random.normal(0, 0.08, len(y_vals))
        ax.scatter(x_pos + jitter, y_vals, s=15, c="black",
                   alpha=0.6, edgecolors="none", zorder=5)

    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    ax.spines[["top", "right"]].set_visible(False)
    return ax
```

## Box Plot + Violin

```python
def box_violin_plot(data, x_col, y_col, ax=None):
    """Overlaid violin + box plot, standard for bio distribution viz."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(4, 4))

    sns.violinplot(data=data, x=x_col, y=y_col, ax=ax,
                   inner=None, palette="Set2", alpha=0.6)
    sns.boxplot(data=data, x=x_col, y=y_col, ax=ax,
                width=0.2, linewidth=0.8, fliersize=2,
                palette="Set2", boxprops={"alpha": 0.7})

    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    ax.spines[["top", "right"]].set_visible(False)
    return ax
```

## Raincloud Plot (modern alternative)

```python
def raincloud_plot(data, x_col, y_col, ax=None):
    """Half-violin + jitter + box, modern distribution plot."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(4, 4))

    categories = data[x_col].unique()
    palette = sns.color_palette("colorblind", len(categories))

    for i, cat in enumerate(categories):
        subset = data[data[x_col] == cat][y_col].values
        # Half-violin
        from scipy import stats
        kde = stats.gaussian_kde(subset)
        xs = np.linspace(subset.min(), subset.max(), 100)
        density = kde(xs)
        density = density / density.max() * 0.3
        ax.fill_betweenx(xs, i, i + density, alpha=0.3,
                         color=palette[i], edgecolor="none")
        # Jitter
        jitter = np.random.normal(i, 0.04, len(subset))
        ax.scatter(jitter, subset, s=8, alpha=0.5,
                   color=palette[i], edgecolors="none", zorder=3)
        # Box
        q25, q75 = np.percentile(subset, [25, 75])
        med = np.median(subset)
        ax.plot([i - 0.1, i + 0.1], [med, med],
                lw=2, color="black")
        ax.add_patch(plt.Rectangle((i - 0.08, q25), 0.16, q75 - q25,
                                    lw=0.8, ec="black", fc="none"))

    ax.set_xlim(-0.5, len(categories) - 0.5)
    ax.set_xticks(range(len(categories)))
    ax.set_xticklabels(categories)
    ax.set_ylabel(y_col)
    ax.spines[["top", "right"]].set_visible(False)
    return ax
```
