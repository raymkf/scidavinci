import Konva from "konva";
import type { ChartRenderContext, ChartData, RenderConfig, OverlayConfig, OverlayZone, FieldRequirement } from "../types";
import { registerChartType } from "../registry";
import {
  computePlotLayout,
  drawBackground,
  drawTitle,
  drawCaption,
  drawGrid,
  drawAxes,
  createLinearScale,
  resolveColor,
  computeLinearTicks,
} from "../renderer-base";
import { drawThumbnailBar } from "../thumbnail-base";

// ─── Histogram renderer ──────────────────────────────────────────────

function renderHistogram(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const xField = data.xField ?? "value";

  // Extract numeric values
  const values: number[] = [];
  for (const r of rows) {
    const v = Number(r[xField]);
    if (Number.isFinite(v)) {
      values.push(v);
    }
  }

  if (values.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  // Auto-bin: 20-30 bins
  values.sort((a, b) => a - b);
  const minVal = values[0]!;
  const maxVal = values[values.length - 1]!;
  const dataRange = maxVal - minVal || 1;

  // Aim for ~25 bins
  const nBins = Math.min(50, Math.max(5, Math.ceil(values.length / 10)));
  const binWidth = dataRange / nBins;
  const bins = new Array<number>(nBins).fill(0);
  const binEdges: number[] = [];

  for (let i = 0; i <= nBins; i++) {
    binEdges.push(minVal + i * binWidth);
  }

  for (const v of values) {
    let idx = Math.floor((v - minVal) / binWidth);
    if (idx >= nBins) idx = nBins - 1;
    if (idx < 0) idx = 0;
    bins[idx]!++;
  }

  const maxCount = Math.max(...bins, 1);

  const xScale = createLinearScale([minVal, maxVal], [0, layout.plotWidth]);
  const yScale = createLinearScale([0, maxCount * 1.1], [layout.plotHeight, 0]);

  // Draw background, grid, axes
  drawBackground(ctx.chartLayer, ctx, config);

  const yTicks = computeLinearTicks(0, maxCount * 1.1);
  drawGrid(ctx.chartLayer, layout, yTicks, config);

  const xTicks = computeLinearTicks(minVal, maxVal, 8);
  drawAxes(
    ctx.chartLayer,
    layout,
    config,
    (v) => layout.plotX + xScale(Number(v)),
    (v) => yScale(v),
    xTicks.map((t) => ({ value: t.value, label: t.label })),
    yTicks.map((t) => ({ value: t.value, label: t.label })),
  );

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  // Draw histogram bars
  const zones: OverlayZone[] = [];
  const barColor = resolveColor(0, config);

  for (let i = 0; i < nBins; i++) {
    const count = bins[i]!;
    if (count === 0) continue;

    const binStart = binEdges[i]!;
    const binEnd = binEdges[i + 1]!;
    const bx = layout.plotX + xScale(binStart);
    const bw = Math.max(1, xScale(binEnd) - xScale(binStart) - 1);
    const bh = layout.plotHeight - yScale(count);
    const by = layout.plotY + yScale(count);

    const rect = new Konva.Rect({
      x: bx,
      y: by,
      width: bw,
      height: bh,
      fill: barColor,
      fillOpacity: 0.85,
      stroke: "#FFFFFF",
      strokeWidth: 0.5,
      cornerRadius: 0,
      listening: false,
    });
    ctx.chartLayer.add(rect);

    // Overlay zone (top 20 bins by count)
    if (zones.length < 20 || count > maxCount * 0.1) {
      zones.push({
        id: `histogram_bin_${i}`,
        x: bx,
        y: by,
        width: bw,
        height: bh,
        metadata: {
          chartType: "histogram",
          series: xField,
          category: `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`,
          value: count,
          binIndex: i,
          binStart,
          binEnd,
        },
        cursor: "pointer",
      });
    }
  }

  return { zones, boxSelectEnabled: true, zoomEnabled: false, panEnabled: false };
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandleHistogram(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const xField = data.xField ?? "value";
  let numericCount = 0;

  for (const r of rows) {
    const v = Number(r[xField]);
    if (Number.isFinite(v)) numericCount++;
  }

  if (numericCount < 3) return { suitable: false, score: 0, reason: "Too few numeric values" };
  if (numericCount < 10) return { suitable: true, score: 0.4 };

  // Single numeric column with many rows = good histogram candidate
  if (numericCount >= 20) return { suitable: true, score: 0.8 };
  return { suitable: true, score: 0.6 };
}

// ─── Registration ────────────────────────────────────────────────────

const HISTOGRAM_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Numeric value field", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "histogram",
  family: "distribution",
  displayName: "Histogram",
  description: "Show frequency distribution of a numeric variable with binned bars",
  icon: "BarChart3",
  requiredFields: HISTOGRAM_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: false,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderHistogram,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailBar(ctx, [0.3, 0.5, 0.8, 0.9, 0.6, 0.4, 0.2], w, h),
  canHandle: canHandleHistogram,
});
