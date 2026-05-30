---
name: chart-types-multi-set
description: "Multi-set chart types: Venn diagram, UpSet plot. Field requirements, formatting rules, and journal conventions."
---

# Multi-Set Charts (多集合类图表)

## Venn Diagram (`type: "venn"`)

Show overlap between 2-3 sets. Classic for gene list comparisons, pathway overlaps.

**Required fields**: Accept either: (a) `sets` array + `intersections` array, or (b) raw membership data with `setField` + `elementField`.

**Data format (recommended)**:
```json
{
  "sets": [{"name": "Treatment Up", "count": 245}, {"name": "Control Up", "count": 180}],
  "intersections": [
    {"sets": ["Treatment Up", "Control Up"], "count": 67},
    {"sets": ["Treatment Up"], "count": 178},
    {"sets": ["Control Up"], "count": 113}
  ]
}
```

**Style rules**:
- Circle fill: journal colors, opacity 0.3-0.4
- Circle stroke: same color, 2px
- Labels: set name + total count outside each circle
- Intersection counts: centered in overlap regions, bold
- Max 3 sets. For 4+ sets, use UpSet plot.
- Circles should be equal-sized (area proportional to set size is misleading in Venn diagrams)

## UpSet Plot (`type: "upset"`)

Show set intersections for any number of sets. Preferred over Venn for 3+ sets.

**Required fields**: `sets` array, `intersections` array (each intersection specifies which sets are combined).

**Style rules**:
- Top panel: vertical bar chart of intersection sizes, sorted descending
- Left panel: horizontal bar chart of set sizes
- Center matrix: dots (●) = set is in intersection, lines connect dots within each intersection
- Dot color: journal colors per set
- Bar fill: dark gray (#374151)
- Max display: 20-30 intersections (most frequent ones)

---

**Common rules**:
- Venn: max 3 sets. For ≥4 sets, use UpSet.
- Always include set sizes and intersection sizes as exact numbers
- Venn circle area should NOT be proportional to set size (this is mathematically impossible for all overlap regions simultaneously)
