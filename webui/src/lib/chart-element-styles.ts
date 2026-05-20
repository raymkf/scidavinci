import type { ChartConfig, ChartElementStyle } from "@/lib/chart-types";

type StyleMap = Map<string, ChartElementStyle>;

export function chartElementId(chartId: string, series: string, category: string | number): string {
  return `${chartId}_${series}_${category}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function isStyle(value: unknown): value is ChartElementStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as ChartElementStyle;
  return (
    style.color !== undefined
    || style.stroke !== undefined
    || style.strokeWidth !== undefined
    || style.fillOpacity !== undefined
    || style.opacity !== undefined
    || style.pointSize !== undefined
    || style.visible !== undefined
    || style.zIndex !== undefined
    || style.barWidthScale !== undefined
    || style.fontSize !== undefined
    || style.fontWeight !== undefined
    || style.textColor !== undefined
  );
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

export function resolveElementFillOpacity(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  fallback: number,
  row?: Record<string, unknown>,
): number {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.fillOpacity
    ?? configuredElementStyle(config, chartId, series, category, row)?.fillOpacity
    ?? fallback;
}

export function resolveElementOpacity(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  fallback: number,
  row?: Record<string, unknown>,
): number {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.opacity
    ?? configuredElementStyle(config, chartId, series, category, row)?.opacity
    ?? fallback;
}

export function resolveElementVisible(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  fallback: boolean,
  row?: Record<string, unknown>,
): boolean {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.visible
    ?? configuredElementStyle(config, chartId, series, category, row)?.visible
    ?? fallback;
}

export function resolveElementPointSize(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  fallback: number,
  row?: Record<string, unknown>,
): number {
  const id = chartElementId(chartId, series, category);
  return runtimeStyles.get(id)?.pointSize
    ?? configuredElementStyle(config, chartId, series, category, row)?.pointSize
    ?? fallback;
}

export function resolveElementBarWidthScale(
  config: ChartConfig,
  runtimeStyles: StyleMap,
  chartId: string,
  series: string,
  category: string | number,
  fallback = 1,
  row?: Record<string, unknown>,
): number {
  const id = chartElementId(chartId, series, category);
  const value = runtimeStyles.get(id)?.barWidthScale
    ?? configuredElementStyle(config, chartId, series, category, row)?.barWidthScale
    ?? fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(2, Math.max(0.08, value));
}
