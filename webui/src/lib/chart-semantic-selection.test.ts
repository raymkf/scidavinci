import { describe, expect, it } from "vitest";

import {
  buildChartSelectableElements,
  resolveSemanticSelectionAction,
} from "@/lib/chart-semantic-selection";
import type { ChartAction, VisualAsset } from "@/lib/chart-types";

function chartAsset(chartConfig: VisualAsset["chartConfig"]): VisualAsset {
  return {
    id: "asset-1",
    kind: "chart",
    title: "Chart",
    createdAt: 1,
    chartConfig,
  };
}

describe("chart semantic selection", () => {
  it("builds selectable box outlier elements", () => {
    const elements = buildChartSelectableElements(
      {
        type: "box",
        data: [
          { group: "A", min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [9] },
        ],
      },
      "asset-1",
    );

    expect(elements.map((item) => item.elementId)).toEqual([
      "asset_1_box_A",
      "asset_1_outlier_A_1",
    ]);
  });

  it("resolves an outlier semantic action to select_elements", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "outliers",
      assetId: "active",
      plan: { method: "explicit_outliers_field" },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "box",
        data: [
          { group: "A", min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [9, 10] },
          { group: "B", min: 2, q1: 3, median: 4, q3: 5, max: 6, outliers: [] },
        ],
      }),
    );

    expect(resolved?.targetElementIds).toEqual([
      "asset_1_outlier_A_1",
      "asset_1_outlier_A_2",
    ]);
  });

  it("infers box outliers from min/max outside 1.5 IQR fences", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "outliers",
      plan: { method: "iqr_1_5" },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "box",
        data: [
          { group: "A", min: 0, q1: 2, median: 3, q3: 4, max: 12 },
          { group: "B", min: 2, q1: 3, median: 4, q3: 5, max: 6 },
        ],
      }),
    );

    expect(resolved?.elements?.map((item) => item.label)).toEqual([
      "high outlier: 12",
    ]);
    expect(resolved?.targetElementIds).toEqual(["asset_1_outlier_A_1"]);
  });

  it("resolves volcano significant points by direction", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "significant",
      plan: { direction: "up" },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "volcano",
        xThreshold: 1,
        yThreshold: 1.3,
        data: [
          { gene: "A", log2FoldChange: 2, negLog10P: 3 },
          { gene: "B", log2FoldChange: -2, negLog10P: 3 },
          { gene: "C", log2FoldChange: 0.2, negLog10P: 0.4 },
        ],
      }),
    );

    expect(resolved?.targetElementIds).toEqual(["asset_1_up_A"]);
  });

  it("resolves top n by a source row field", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "top_n",
      plan: { n: 2, valueField: "score" },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "bar",
        xField: "name",
        yField: "count",
        data: [
          { name: "A", count: 1, score: 10 },
          { name: "B", count: 2, score: 30 },
          { name: "C", count: 3, score: 20 },
        ],
      }),
    );

    expect(resolved?.targetElementIds).toEqual([
      "asset_1_count_B",
      "asset_1_count_C",
    ]);
  });

  it("generates consistent volcano element IDs matching chartElementId format", () => {
    const elements = buildChartSelectableElements(
      {
        type: "volcano",
        xThreshold: 1,
        yThreshold: 1.3,
        xValueField: "log2FoldChange",
        yValueField: "negLog10P",
        labelField: "gene",
        data: [
          { gene: "BRCA1", log2FoldChange: 2.5, negLog10P: 5.2 },
          { gene: "TP53", log2FoldChange: -1.8, negLog10P: 3.1 },
          { gene: "ACTB", log2FoldChange: 0.3, negLog10P: 0.8 },
          { gene: "GAPDH", log2FoldChange: -0.2, negLog10P: 0.3 },
        ],
      },
      "chart-volcano-1",
    );

    expect(elements.map((e) => e.elementId)).toEqual([
      "chart_volcano_1_up_BRCA1",
      "chart_volcano_1_down_TP53",
      "chart_volcano_1_not_significant_ACTB",
      "chart_volcano_1_not_significant_GAPDH",
    ]);
    expect(elements.map((e) => e.series)).toEqual(["up", "down", "not significant", "not significant"]);
  });

  it("resolves volcano significant down-regulated points", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "significant",
      plan: { direction: "down" },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "volcano",
        xThreshold: 1,
        yThreshold: 1.3,
        data: [
          { gene: "A", log2FoldChange: 3, negLog10P: 4 },
          { gene: "B", log2FoldChange: -2.5, negLog10P: 3 },
          { gene: "C", log2FoldChange: -1.5, negLog10P: 2 },
          { gene: "D", log2FoldChange: 0.3, negLog10P: 0.4 },
        ],
      }),
    );

    expect(resolved?.targetElementIds).toEqual(["asset_1_down_B", "asset_1_down_C"]);
  });

  it("resolves volcano significant both directions with multi-select", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "significant",
      plan: { direction: "both" },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "volcano",
        xThreshold: 1,
        yThreshold: 1.3,
        data: [
          { gene: "UP1", log2FoldChange: 2, negLog10P: 4 },
          { gene: "DOWN1", log2FoldChange: -2, negLog10P: 5 },
          { gene: "NS1", log2FoldChange: 0.2, negLog10P: 0.5 },
        ],
      }),
    );

    expect(resolved?.targetElementIds).toEqual(["asset_1_up_UP1", "asset_1_down_DOWN1"]);
  });

  it("leaves semantic selection mode implicit unless the model specifies it", () => {
    const action: ChartAction = {
      type: "select_by_semantic_query",
      intent: "label_match",
      plan: { labels: ["Alpha"] },
    };

    const resolved = resolveSemanticSelectionAction(
      action,
      chartAsset({
        type: "bar",
        xField: "name",
        yField: "count",
        data: [
          { name: "Alpha", count: 1 },
          { name: "Beta", count: 2 },
        ],
      }),
    );

    expect(resolved?.targetElementIds).toEqual(["asset_1_count_Alpha"]);
    expect(resolved?.mode).toBeUndefined();
  });
});
