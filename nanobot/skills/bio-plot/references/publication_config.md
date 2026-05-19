# Publication Figure Configuration

Global matplotlib configuration for bio research publications.

## Journal Size Standards

| Journal | Single-col | 1.5-col | Double-col | Max height |
|---------|-----------|---------|------------|------------|
| Nature  | 89mm | 114mm | 183mm | 247mm |
| Cell    | 85mm | 114mm | 174mm | 225mm |
| Science | 88mm | — | 183mm | 250mm |
| PNAS    | 87mm | — | 178mm | 225mm |
| PLOS    | 74mm | — | 156mm | — |

## Complete Config Template

```python
import matplotlib.pyplot as plt
import matplotlib as mpl

# Convert mm to inches for figsize
MM_TO_IN = 1 / 25.4

def set_pub_config(journal="nature", columns=1):
    """Apply publication-quality matplotlib rcParams.

    Args:
        journal: "nature", "cell", "science", "pnas", "plos"
        columns: 1 (single), 1.5, or 2 (double)
    """
    size_map = {
        "nature": {1: (89, 247), 1.5: (114, 247), 2: (183, 247)},
        "cell":   {1: (85, 225), 1.5: (114, 225), 2: (174, 225)},
        "science":{1: (88, 250), 2: (183, 250)},
        "pnas":   {1: (87, 225), 2: (178, 225)},
        "plos":   {1: (74, 200), 2: (156, 200)},
    }
    w, h = size_map.get(journal, size_map["nature"]).get(columns, size_map["nature"][1])
    w, h = w * MM_TO_IN, h * MM_TO_IN

    plt.rcParams.update({
        # Figure
        "figure.dpi": 150,
        "savefig.dpi": 300,
        "savefig.format": "pdf",
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.05,
        "figure.figsize": (w, h),

        # Font
        "font.family": "sans-serif",
        "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
        "font.size": 8,
        "axes.titlesize": 9,
        "axes.labelsize": 8,
        "xtick.labelsize": 7,
        "ytick.labelsize": 7,
        "legend.fontsize": 7,
        "figure.titlesize": 10,

        # Axes
        "axes.linewidth": 0.8,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "xtick.major.width": 0.6,
        "xtick.major.size": 3,
        "ytick.major.width": 0.6,
        "ytick.major.size": 3,
        "xtick.direction": "out",
        "ytick.direction": "out",

        # Lines
        "lines.linewidth": 1.5,
        "lines.markersize": 5,

        # Legend
        "legend.frameon": True,
        "legend.framealpha": 0.8,
        "legend.fancybox": False,
    })
```

## Colorblind-Friendly Palette

```python
# Wong (2011) Nature Methods — 8-color palette
CB_COLORS = [
    "#0072B2",  # Blue
    "#D55E00",  # Orange / Vermillion
    "#009E73",  # Green
    "#F0E442",  # Yellow
    "#56B4E9",  # Sky Blue
    "#CC79A7",  # Pink / Purple
    "#E69F00",  # Orange / Gold
    "#000000",  # Black
]

# ColorBrewer qualitative palettes (seaborn)
# sns.color_palette("Set2", 8)
# sns.color_palette("Dark2", 8)
```

## Recommended Colormaps

| Data type | Colormap | Notes |
|-----------|----------|-------|
| Expression (diverging) | `RdBu_r`, `coolwarm` | Center at 0 for log2FC |
| Expression (sequential) | `viridis`, `plasma` | Perceptually uniform |
| Categorical | `colorblind`, `Set2`, `Dark2` | Colorblind-friendly |
| Single-color seq | `Blues`, `Purples`, `Oranges` | Monochromatic |

## Significance Notation

| Symbol | Meaning |
|--------|---------|
| ns | p > 0.05 |
| * | p ≤ 0.05 |
| ** | p ≤ 0.01 |
| *** | p ≤ 0.001 |
| **** | p ≤ 0.0001 |
