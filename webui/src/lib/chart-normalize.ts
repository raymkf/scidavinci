import { journalColor } from "@/lib/chart-style";
import type { ChartConfig, ChartElementStyle } from "@/lib/chart-types";

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Repair the common model mistake where a single-series bar chart with
 * differently colored bars is encoded as many one-bar series. Recharts renders
 * that as an ultra-thin grouped chart, so normalize it back to one value field
 * plus per-element colors.
 */
function normalizeSparseOneBarSeries(config: ChartConfig): ChartConfig {
  if (config.type !== "bar") return config;
  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const data = config.data as Record<string, unknown>[];
  if (fields.length < 4 || data.length < 4) return config;

  const hits = data.map((row) => {
    const rowHits = fields
      .map((field, fieldIndex) => ({ field, fieldIndex, value: numericValue(row[field]) }))
      .filter((item): item is { field: string; fieldIndex: number; value: number } => item.value !== null);
    return { row, rowHits };
  });
  const singleHitRows = hits.filter((item) => item.rowHits.length === 1);
  if (singleHitRows.length / data.length < 0.8) return config;

  const usedFields = new Set(singleHitRows.map((item) => item.rowHits[0].field));
  if (usedFields.size / fields.length < 0.8) return config;

  const xKey = config.xField ?? "name";
  const valueField = config.yField && !fields.includes(config.yField) ? config.yField : "value";
  const elementStyles: Record<string, ChartElementStyle> = { ...(config.elementStyles ?? {}) };
  const normalizedData = data.map((row, rowIndex) => {
    const hit = hits[rowIndex].rowHits[0];
    if (!hit) return row;
    const category = String(row[xKey] ?? hit.field);
    const color = config.colors?.[hit.fieldIndex] ?? journalColor(hit.fieldIndex);
    elementStyles[category] = { ...(elementStyles[category] ?? {}), color };
    elementStyles[`${valueField}@@${category}`] = {
      ...(elementStyles[`${valueField}@@${category}`] ?? {}),
      color,
    };
    return {
      ...row,
      [xKey]: row[xKey] ?? hit.field,
      [valueField]: hit.value,
    };
  });

  return {
    ...config,
    data: normalizedData,
    yField: valueField,
    yFields: [valueField],
    colors: config.colors?.length ? [config.colors[0]] : config.colors,
    elementStyles,
  };
}

export function normalizeChartConfig(config: ChartConfig): ChartConfig {
  return normalizeSparseOneBarSeries(config);
}
