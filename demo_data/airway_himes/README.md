# Airway Himes Demo Dataset

Minimal demo dataset for the BioDaVinci chart workflow.

## Paper

Himes BE, Jiang X, Wagner P, et al. RNA-Seq Transcriptome Profiling Identifies CRISPLD2 as a Glucocorticoid Responsive Gene that Modulates Cytokine Function in Airway Smooth Muscle Cells. PLOS ONE. 2014;9(6):e99625.

- Paper: https://doi.org/10.1371/journal.pone.0099625
- GEO accession: https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE52778
- Bioconductor packaged dataset: https://bioconductor.org/packages/release/data/experiment/html/airway.html

## Biological Setup

The study profiled human airway smooth muscle cells after dexamethasone treatment. The demo contrast here is:

- Dex: dexamethasone-treated cells
- Untreated: untreated control cells

This is useful for a compact interview demo because the differential expression signal is clear, the dataset is public, and CRISPLD2 is a named biological finding from the paper.

## Files

- `GSE52778_Dex_vs_Untreated_gene_exp.diff.gz`: original GEO Cuffdiff differential expression table.
- `volcano_dex_vs_untreated.csv`: cleaned real differential expression rows for a volcano plot. `pValue` is clipped at `1e-300` for plotting when GEO reports `0`; `rawPValue` preserves the original value.
- `bar_top_changed_genes.csv`: top changed genes for a bar chart.
- `line_selected_gene_expression.csv`: selected gene expression values from Untreated to Dex for a line chart.
- `pie_deg_categories.csv`: DEG category counts for a pie chart.
- `box_expression_distribution.csv`: log2(FPKM + 1) expression distribution summary for a box plot.

## Suggested Demo Flow

1. Start with `volcano_dex_vs_untreated.csv` to show the global differential expression pattern.
2. Use `bar_top_changed_genes.csv` to highlight the strongest dexamethasone-responsive genes.
3. Use `line_selected_gene_expression.csv` to show CRISPLD2 and known steroid-response genes increasing after Dex treatment.
4. Use `pie_deg_categories.csv` to summarize the number of up/down/not-significant genes.
5. Use `box_expression_distribution.csv` to demonstrate a compact distribution plot.

One-sentence narration:

"I am using the public Himes et al. PLOS ONE airway smooth muscle RNA-seq study; the demo compares dexamethasone-treated cells with untreated controls, then renders the same biological contrast as volcano, bar, line, pie, and box plots."
