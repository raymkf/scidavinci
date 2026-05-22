import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { ChartSelectionProvider, useChartSelection } from "@/contexts/ChartSelectionContext";

function wrapper({ children }: { children: ReactNode }) {
  return <ChartSelectionProvider persistenceKey={null}>{children}</ChartSelectionProvider>;
}

describe("ChartSelectionContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("styles elements selected earlier in the same action batch", () => {
    const { result } = renderHook(() => useChartSelection(), { wrapper });

    act(() => {
      result.current.applyActions([
        {
          type: "select_elements",
          elements: [
            {
              elementId: "chart_outlier_A_1",
              chartType: "box",
              series: "outlier",
              category: "A_1",
              value: 12,
              label: "A outlier 1: 12",
            },
          ],
        },
        {
          type: "style_current_selection",
          style: { color: "#D55E00", stroke: "#D55E00", pointSize: 5 },
        },
      ]);
    });

    expect(result.current.selectedElements.map((item) => item.elementId)).toEqual([
      "chart_outlier_A_1",
    ]);
    expect(result.current.elementStyles.get("chart_outlier_A_1")).toMatchObject({
      color: "#D55E00",
      stroke: "#D55E00",
      pointSize: 5,
    });
  });

  it("adds later implicit select actions in the same model batch", () => {
    const { result } = renderHook(() => useChartSelection(), { wrapper });

    act(() => {
      result.current.applyActions([
        {
          type: "select_elements",
          elements: [
            {
              elementId: "chart_count_A",
              chartType: "bar",
              series: "count",
              category: "A",
              value: 10,
              label: "A count: 10",
            },
          ],
        },
        {
          type: "select_elements",
          elements: [
            {
              elementId: "chart_count_B",
              chartType: "bar",
              series: "count",
              category: "B",
              value: 20,
              label: "B count: 20",
            },
          ],
        },
        {
          type: "style_current_selection",
          style: { stroke: "#111827", strokeWidth: 3 },
        },
      ]);
    });

    expect(result.current.selectedElements.map((item) => item.elementId)).toEqual([
      "chart_count_A",
      "chart_count_B",
    ]);
    expect(result.current.elementStyles.get("chart_count_A")).toMatchObject({
      stroke: "#111827",
      strokeWidth: 3,
    });
    expect(result.current.elementStyles.get("chart_count_B")).toMatchObject({
      stroke: "#111827",
      strokeWidth: 3,
    });
  });

  it("applies style_by_ids to volcano element IDs", () => {
    const { result } = renderHook(() => useChartSelection(), { wrapper });

    act(() => {
      result.current.applyActions([
        {
          type: "style_by_ids",
          targetElementIds: ["chart_up_BRCA1", "chart_down_TP53"],
          style: { color: "#D55E00", stroke: "#111827", strokeWidth: 3, pointSize: 6 },
        },
      ]);
    });

    expect(result.current.elementStyles.get("chart_up_BRCA1")).toMatchObject({
      color: "#D55E00",
      stroke: "#111827",
      strokeWidth: 3,
      pointSize: 6,
    });
    expect(result.current.elementStyles.get("chart_down_TP53")).toMatchObject({
      color: "#D55E00",
      stroke: "#111827",
      strokeWidth: 3,
      pointSize: 6,
    });
    expect(result.current.elementStyles.get("chart_ns_ACTB")).toBeUndefined();
  });

  it("style_current_selection applies to volcano significant points after semantic select", () => {
    const { result } = renderHook(() => useChartSelection(), { wrapper });

    act(() => {
      result.current.applyActions([
        {
          type: "select_elements",
          elements: [
            {
              elementId: "chart_up_GeneA",
              chartType: "volcano",
              series: "up",
              category: "GeneA",
              value: 5.2,
              label: "GeneA: log2FoldChange=2.50, negLog10P=5.20",
            },
            {
              elementId: "chart_up_GeneB",
              chartType: "volcano",
              series: "up",
              category: "GeneB",
              value: 4.1,
              label: "GeneB: log2FoldChange=1.80, negLog10P=4.10",
            },
          ],
        },
        {
          type: "style_current_selection",
          style: { color: "#E69F00", pointSize: 7, stroke: "#E69F00", strokeWidth: 2 },
        },
      ]);
    });

    expect(result.current.selectedElements.map((e) => e.elementId)).toEqual([
      "chart_up_GeneA",
      "chart_up_GeneB",
    ]);
    expect(result.current.elementStyles.get("chart_up_GeneA")).toMatchObject({
      color: "#E69F00",
      pointSize: 7,
      stroke: "#E69F00",
      strokeWidth: 2,
    });
    expect(result.current.elementStyles.get("chart_up_GeneB")).toMatchObject({
      color: "#E69F00",
      pointSize: 7,
      stroke: "#E69F00",
      strokeWidth: 2,
    });
  });

  it("preserves explicit replace mode inside a model batch", () => {
    const { result } = renderHook(() => useChartSelection(), { wrapper });

    act(() => {
      result.current.applyActions([
        {
          type: "select_elements",
          elements: [
            {
              elementId: "chart_count_A",
              chartType: "bar",
              series: "count",
              category: "A",
              value: 10,
              label: "A count: 10",
            },
          ],
        },
        {
          type: "select_elements",
          mode: "replace",
          elements: [
            {
              elementId: "chart_count_B",
              chartType: "bar",
              series: "count",
              category: "B",
              value: 20,
              label: "B count: 20",
            },
          ],
        },
      ]);
    });

    expect(result.current.selectedElements.map((item) => item.elementId)).toEqual([
      "chart_count_B",
    ]);
  });
});
