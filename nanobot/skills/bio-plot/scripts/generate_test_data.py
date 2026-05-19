"""Generate synthetic bio research test data for all plot types."""

import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
_rng = np.random.RandomState(SEED)


def _get_rng(offset=0):
    """Return a seeded RandomState for reproducibility."""
    return np.random.RandomState(SEED + offset)


def generate_barplot_data(n_per_group=12, n_groups=4):
    """Generate data for grouped bar plot with significance."""
    rng = _get_rng(0)
    groups = [f"Group_{chr(65+i)}" for i in range(n_groups)]
    conditions = ["Control", "Treatment"]

    rows = []
    for group in groups:
        base = rng.normal(5, 0.5, n_per_group)
        for c in conditions:
            vals = base.copy()
            if c == "Treatment":
                vals += rng.uniform(1, 3, n_per_group)
            for v in vals:
                rows.append({"Group": group, "Condition": c, "Value": float(v)})

    return pd.DataFrame(rows)


def generate_boxplot_data(n_per_group=15, n_groups=4):
    """Generate data for box/violin plot."""
    rng = _get_rng(1)
    groups = [f"Treatment_{chr(65+i)}" for i in range(n_groups)]
    base_means = [5, 7, 4, 9]

    rows = []
    for i, g in enumerate(groups):
        vals = rng.normal(base_means[i], 1.2, n_per_group)
        for v in vals:
            rows.append({"Group": g, "Value": float(v)})

    return pd.DataFrame(rows)


def generate_volcano_data(n_genes=10000):
    """Generate differential expression data for volcano plot."""
    rng = _get_rng(2)

    log2fc = rng.normal(0, 1, n_genes)
    pvalues = rng.uniform(0, 1, n_genes)

    # Add some truly DE genes
    n_de = int(n_genes * 0.05)
    de_idx = rng.choice(n_genes, n_de, replace=False)
    log2fc[de_idx] = rng.choice(
        np.concatenate([rng.uniform(1, 4, n_de // 2), rng.uniform(-4, -1, n_de // 2)]),
        n_de, replace=False,
    )
    pvalues[de_idx] = rng.exponential(0.001, n_de)

    df = pd.DataFrame({
        "gene": [f"GENE_{i}" for i in range(n_genes)],
        "log2FoldChange": log2fc,
        "pvalue": pvalues,
        "padj": np.clip(pvalues * n_genes * 0.1, 0, 1),  # Bonferroni-ish
    })
    df["padj"] = df["padj"].clip(upper=1.0)
    return df


def generate_heatmap_data(n_genes=50, n_samples=12, n_clusters=3):
    """Generate expression matrix for heatmap."""
    rng = _get_rng(3)

    data = rng.normal(0, 1, (n_genes, n_samples))
    sample_labels = [f"Sample_{chr(65+i)}" for i in range(n_samples)]

    # Add cluster structure
    genes_per = n_genes // n_clusters
    for c in range(n_clusters):
        start = c * genes_per
        end = start + genes_per if c < n_clusters - 1 else n_genes
        cols = slice(c * (n_samples // n_clusters), (c + 1) * (n_samples // n_clusters))
        data[start:end, cols] += rng.uniform(1, 3, (end - start, cols.stop - cols.start))

    df = pd.DataFrame(data, index=[f"Gene_{i}" for i in range(n_genes)], columns=sample_labels)

    # Row annotation
    row_groups = pd.Categorical(
        [f"Cluster_{c}" for c in range(n_clusters) for _ in range(genes_per)][:n_genes]
    )
    row_color_map = {f"Cluster_{c}": color for c, color in enumerate(
        ["#E69F00", "#56B4E9", "#009E73", "#CC79A7"]
    )}
    row_colors = pd.DataFrame({"Cluster": row_groups})

    # Column annotation
    col_groups = pd.Categorical(
        [f"Condition_{chr(65+i)}" for i in range(n_samples)]
    )
    col_colors = pd.DataFrame({"Condition": col_groups})

    return df, row_colors, col_colors


def generate_pca_data(n_samples=60, n_features=100, n_groups=4):
    """Generate high-dim data with group structure for PCA/UMAP."""
    rng = _get_rng(4)
    groups = [f"Group_{chr(65+i)}" for i in range(n_groups)]
    samples_per = n_samples // n_groups

    data = []
    labels = []
    for i, g in enumerate(groups):
        mean = np.zeros(n_features)
        mean[i * (n_features // n_groups):(i + 1) * (n_features // n_groups)] = 2
        data.append(rng.multivariate_normal(mean, np.eye(n_features) * 0.5, samples_per))
        labels.extend([g] * samples_per)

    X = np.vstack(data)
    labels = np.array(labels)

    # PCA
    X_centered = X - X.mean(axis=0)
    U, S, Vt = np.linalg.svd(X_centered, full_matrices=False)
    pca_result = U[:, :5] * S[:5]
    var_ratio = S[:5]**2 / np.sum(S**2)

    return pca_result, var_ratio, labels


def generate_survival_data(n_total=200, n_groups=2):
    """Generate synthetic survival data with group effects."""
    rng = _get_rng(5)
    groups = np.array(["Control"] * (n_total // 2) + ["Treatment"] * (n_total // 2))
    rng.shuffle(groups)

    times = rng.exponential(50, n_total)
    events = rng.binomial(1, 0.7, n_total)

    # Treatment group lives longer
    treatment_mask = groups == "Treatment"
    times[treatment_mask] *= 1.5

    return pd.DataFrame({
        "time": times,
        "event": events,
        "group": groups,
    })
