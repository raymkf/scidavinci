---
name: chart-types-pathway
description: "Pathway chart types: Enrichment Bubble, GSEA, Enrichment Bar. Field requirements, formatting rules, and journal conventions."
---

# Pathway Charts (通路类图表)

## Enrichment Bubble Chart (`type: "bubble"`)

GO/KEGG enrichment visualization. X-axis = enrichment ratio or gene ratio, Y-axis = pathway names.

**Required fields**: `xField` (enrichment ratio e.g. GeneRatio), `yField` (pathway/term name), `sizeField` (count or gene count), `colorField` (p-value or adjusted p-value).

**Auto-detect**: Fields matching `GeneRatio`, `enrichment`, `Count`, `pvalue`, `p.adjust`, `padj`, `FDR`.

**Style rules**:
- Bubble size: proportional to gene count (sqrt scale recommended)
- Bubble color: gradient from red (significant) to blue or gray (not significant) based on p-value
- Y-axis: pathway names, sorted by p-value (most significant at top)
- Include p-value color legend
- Max 20 pathways displayed; top N by significance
- Bubble opacity: 0.7-0.8
- X-axis label: "Gene Ratio" or "Enrichment Ratio"
- Caption should note: "Bubble size = gene count; color = -log10(FDR)"

## GSEA Plot (`type: "gsea"`)

Gene Set Enrichment Analysis running score visualization.

**Required fields**: Two-part data:
1. Running enrichment score over ranked gene list
2. Gene set member positions (waterfall/barcode at bottom)

**Style rules**:
- Top panel: running ES curve (Line, 2px)
- Top panel: horizontal line at y=0 (baseline)
- Top panel: max ES point marked with dot and vertical dashed line
- Bottom panel: barcode/waterfall showing gene set member positions (vertical lines)
- X-axis: "Rank in Ordered Dataset"
- Y-axis (top): "Running Enrichment Score (ES)"
- Color: green (#009E73) for positive ES, red (#D55E00) for negative ES

## Enrichment Bar Chart (`type: "enrichment_bar"`)

Horizontal bar chart of pathway enrichment scores. Simpler alternative to bubble chart.

**Required fields**: `xField` (pathway name), `yField` (-log10(p-value) or enrichment score). Optional: `colorField`.

**Style rules**:
- Horizontal bars (pathway names are usually long)
- Sorted by value, most significant at top
- Color: gradient from dark (significant) to light (not significant)
- Include p-value threshold line (dashed at -log10(0.05) = 1.301)
- Max 20 pathways

---

**Common rules**:
- Always report the enrichment method and database version in the caption: "GO Biological Process (v2024), FDR < 0.05"
- For all enrichment charts, sort by significance
- Include FDR/p-value correction method in metadata or caption
