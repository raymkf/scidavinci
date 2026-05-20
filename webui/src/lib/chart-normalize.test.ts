import { describe, expect, it } from "vitest";

import { normalizeChartConfig } from "@/lib/chart-normalize";
import type { ChartConfig } from "@/lib/chart-types";

describe("normalizeChartConfig", () => {
  it("collapses sparse one-bar series into one series with per-bar styles", () => {
    const config: ChartConfig = {
      type: "bar",
      xField: "gene",
      yFields: ["IL6", "TNF", "CXCL8", "ACTB"],
      colors: ["#D55E00", "#0072B2", "#009E73", "#000000"],
      data: [
        { gene: "IL6", IL6: 12.4 },
        { gene: "TNF", TNF: 8.7 },
        { gene: "CXCL8", CXCL8: 10.1 },
        { gene: "ACTB", ACTB: 3.2 },
      ],
    };

    const normalized = normalizeChartConfig(config);

    expect(normalized.yFields).toEqual(["value"]);
    expect(normalized.data.map((row) => row.value)).toEqual([12.4, 8.7, 10.1, 3.2]);
    expect(normalized.elementStyles?.IL6?.color).toBe("#D55E00");
    expect(normalized.elementStyles?.["value@@TNF"]?.color).toBe("#0072B2");
  });

  it("leaves real grouped bar charts unchanged", () => {
    const config: ChartConfig = {
      type: "bar",
      xField: "time",
      yFields: ["control", "treatment"],
      data: [
        { time: "Day 1", control: 3, treatment: 5 },
        { time: "Day 2", control: 4, treatment: 8 },
      ],
    };

    const normalized = normalizeChartConfig(config);

    expect(normalized.yFields).toBe(config.yFields);
    expect(normalized.data).toBe(config.data);
    expect(normalized.figure?.type).toBe("bar");
  });

  it("adds a structured figure model while preserving legacy chart fields", () => {
    const config: ChartConfig = {
      type: "bar",
      title: "Expression",
      caption: "Mean expression by group",
      aspectRatio: "16:9",
      xField: "group",
      yField: "value",
      xLabel: "Group",
      yLabel: "Expression",
      colors: ["#0072B2"],
      data: [
        { group: "A", value: 1 },
        { group: "B", value: 2 },
      ],
      elementStyles: {
        A: { color: "#D55E00" },
      },
    };

    const normalized = normalizeChartConfig(config);

    expect(normalized.figure?.schemaVersion).toBe(2);
    expect(normalized.figure?.layout?.aspectRatio).toBe("16:9");
    expect(normalized.figure?.title?.text).toBe("Expression");
    expect(normalized.figure?.caption?.text).toBe("Mean expression by group");
    expect(normalized.figure?.axes?.x?.title).toBe("Group");
    expect(normalized.figure?.axes?.y?.title).toBe("Expression");
    expect(normalized.figure?.scales?.color?.range).toEqual(["#0072B2"]);
    expect(normalized.figure?.marks?.[0]).toMatchObject({ type: "bar", series: "value" });
    expect(normalized.figure?.styleOverrides?.A?.color).toBe("#D55E00");
  });
});
