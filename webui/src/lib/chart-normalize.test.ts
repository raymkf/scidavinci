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

    expect(normalizeChartConfig(config)).toBe(config);
  });
});
