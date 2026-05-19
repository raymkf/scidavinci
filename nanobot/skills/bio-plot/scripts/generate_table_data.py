"""Generate data for table-style bio research visualizations."""

import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42


def _rng(offset=0):
    return np.random.RandomState(SEED + offset)


def generate_correlation_data(n_vars=8, n_samples=50):
    """Generate correlated multi-variable data for correlation matrix."""
    rng = _rng(0)
    # Create a random correlation matrix
    n = n_vars
    X = rng.normal(0, 1, (n_samples, n))
    # Add some group structure
    for i in range(n):
        for j in range(n):
            if abs(i - j) == 1:
                X[:, j] += rng.normal(0, 0.3, n_samples)
    corr = np.corrcoef(X.T)

    var_names = [f"Var_{chr(65+i)}" for i in range(n)]
    return pd.DataFrame(corr, index=var_names, columns=var_names)


def generate_clinical_table_data(n_patients=20):
    """Generate synthetic clinical trial data for table display."""
    rng = _rng(1)

    data = {
        "Patient_ID": [f"P-{i+1:03d}" for i in range(n_patients)],
        "Age": rng.randint(25, 80, n_patients),
        "Sex": rng.choice(["Male", "Female"], n_patients),
        "BMI": np.round(rng.uniform(18.5, 35, n_patients), 1),
        "Treatment": rng.choice(["Drug_A", "Drug_B", "Placebo"], n_patients),
        "Response": rng.choice(["CR", "PR", "SD", "PD"], n_patients,
                                p=[0.2, 0.3, 0.3, 0.2]),
        "Biomarker_X": np.round(rng.uniform(0, 100, n_patients), 1),
        "Survival_Days": rng.randint(30, 800, n_patients),
        "Event": rng.binomial(1, 0.4, n_patients),
    }
    return pd.DataFrame(data)


def generate_enrichment_table_data(n_terms=15):
    """Generate GO/KEGG enrichment results for table display."""
    rng = _rng(2)

    terms = [
        "apoptotic signaling pathway",
        "cell cycle regulation",
        "DNA repair mechanism",
        "immune response activation",
        "inflammatory response",
        "metabolic reprogramming",
        "angiogenesis",
        "epithelial-mesenchymal transition",
        "oxidative phosphorylation",
        "p53 signaling pathway",
        "PI3K-Akt signaling pathway",
        "MAPK signaling cascade",
        "Wnt signaling pathway",
        "NF-kappaB signaling",
        "TGF-beta signaling",
    ][:n_terms]

    return pd.DataFrame({
        "Pathway": terms,
        "#Genes": rng.randint(5, 200, n_terms),
        "Fold_Enrichment": np.round(rng.uniform(1.5, 15, n_terms), 2),
        "p_value": np.round(rng.exponential(0.01, n_terms), 6),
        "FDR": np.round(rng.exponential(0.05, n_terms), 6),
        "Gene_Ratio": [f"{rng.randint(5, 50)}/{rng.randint(100, 500)}" for _ in range(n_terms)],
    })


def generate_confusion_matrix(n_classes=4, n_samples=200):
    """Generate confusion matrix data for classification results."""
    rng = _rng(3)
    classes = [f"Class_{chr(65+i)}" for i in range(n_classes)]

    true_labels = rng.randint(0, n_classes, n_samples)

    # Create confusion with some accuracy
    pred_labels = true_labels.copy()
    noise_idx = rng.choice(n_samples, int(n_samples * 0.3), replace=False)
    pred_labels[noise_idx] = rng.randint(0, n_classes, len(noise_idx))

    cm = np.zeros((n_classes, n_classes), dtype=int)
    for t, p in zip(true_labels, pred_labels):
        cm[t, p] += 1

    return cm, classes


def generate_marker_expression_table(n_genes=10, n_cell_types=5):
    """Generate marker gene expression by cell type."""
    rng = _rng(4)
    cell_types = [
        "T_cell", "B_cell", "NK_cell", "Monocyte", "Neutrophil",
        "Dendritic", "Macrophage", "Fibroblast", "Endothelial", "Epithelial",
    ][:n_cell_types]
    genes = [f"CD{3+i}i" if i < 3 else f"Gene_{chr(65+i-n_cell_types)}"
             for i in range(n_genes)]

    data = np.round(rng.uniform(0, 10, (n_genes, n_cell_types)), 2)
    df = pd.DataFrame(data, index=genes, columns=cell_types)
    return df
