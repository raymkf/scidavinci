import type { ChartConfig, ChartElementStyle } from "@/lib/chart-types";

type StyleMap = Map<string, ChartElementStyle>;

export function chartElementId(chartId: string, series: string, category: string | number): string {
  return `${chartId}_${series}_${category}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function isStyle(value: unknown): value is ChartElementStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as ChartElementStyle;
  return style.color !== undefined || style.stroke !== undefined || style.strokeWidth !== undefined;
}

export function rowElementStyle(row: Record<string, unknown>, series: string): ChartElementStyle | undefined {
  const direct = row._style;
  const perSeries = row._styles;
  if (perSeries && typeof perSeries === "object") {
    const style = (perSeries as Record<string, unknown>)[series];
    if (isStyle(style)) return style;
  }
  return isStyle(direct) ? direct : undefined;
}

export function configuredElementStyle(
  config: ChartConfig,
  chartId: string,
  series: string,
  category: string | number,
  row?: Record<string, unknown>,
): ChartElementStyle | undefined {
  const fromRow = row ? rowElementStyle(row, series) : undefined;
  const styles = config.elementStyles;
  if (!styles) return fromRow;
  const id = chartElementId(chartId, series, category);
  const candidates = [
    id,
    `${series}@@${category}`,
    `${series}:${category}`,
    `${category}`,
  ];
  const fromConfig = candidates.map((key) => styles[key]).find(Boolean);
  return fromConfig || fromRow ? { ...fromConfig, ...fromRow } : undefined;
}

export function resolveElementColor(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  fallback: string,
  row?: Record<string, unknown>,
): string {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.color ?? configuredElementStyle(config, chartId, series, category, row)?.color ?? fallback;
}

export function resolveElementStroke(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  row?: Record<string, unknown>,
): string | undefined {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.stroke ?? configuredElementStyle(config, chartId, series, category, row)?.stroke;
}

export function resolveElementStrokeWidth(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  row?: Record<string, unknown>,
): number | undefined {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.strokeWidth ?? configuredElementStyle(config, chartId, series, category, row)?.strokeWidth;
}
