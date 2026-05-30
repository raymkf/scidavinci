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
  createBandScale,
  resolveColor,
  computeLinearTicks,
  getElementStyle,
} from "../renderer-base";
import { drawThumbnailLine } from "../thumbnail-base";

// ─── Area renderer ───────────────────────────────────────────────

function renderArea(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const xField = data.xField ?? "name";
  const yFields = data.yFields ?? (data.yField ? [data.yField] : []);
  const categories = rows.map((r) => String(r[xField] ?? ""));
  const allValues: number[] = [];

  for (const f of yFields) {
    for (const r of rows) {
      const v = Number(r[f]);
      if (Number.isFinite(v)) allValues.push(v);
    }
  }

  const yMax = allValues.length > 0 ? Math.max(...allValues, 0) * 1.15 : 1;
  const yScale = createLinearScale(
    [0, yMax],
    [0, layout.plotHeight],
  );
  const { scale: xScale, bandwidth } = createBandScale(
    categories,
    [0, layout.plotWidth],
  );

  // Draw chart elements
  drawBackground(ctx.chartLayer, ctx, config);
  const yTicks = computeLinearTicks(0, yMax);
  drawGrid(ctx.chartLayer, layout, yTicks, config);
  drawAxes(
    ctx.chartLayer,
    layout,
    config,
    (v) => xScale(String(v)),
    yScale,
    categories.map((c) => ({ value: c, label: c })),
    yTicks,
  );

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  // Draw filled areas, lines, and points
  const zones: OverlayZone[] = [];
  const baselineY = layout.plotY + layout.plotHeight - yScale(0);

  for (let si = 0; si < yFields.length; si++) {
    const field = yFields[si]!;
    const color = resolveColor(si, config);
    const style = getElementStyle(field, config, {
      color,
      strokeWidth: 2,
      fillOpacity: 0.3,
    });

    // Build data points (centered in each band)
    const dataPoints: { x: number; y: number; cat: string; value: number }[] = [];
    for (let ci = 0; ci < categories.length; ci++) {
      const cat = categories[ci]!;
      const value = Number(rows[ci]![field] ?? 0);
      if (!Number.isFinite(value)) continue;
      const x = layout.plotX + xScale(cat) + bandwidth / 2;
      const y = layout.plotY + layout.plotHeight - yScale(value);
      dataPoints.push({ x, y, cat, value });
    }

    if (dataPoints.length < 2) continue;

    // Draw filled area (closed polygon: baseline -> data points -> baseline)
    const areaPoints: number[] = [];
    areaPoints.push(dataPoints[0]!.x, baselineY);
    for (const pt of dataPoints) {
      areaPoints.push(pt.x, pt.y);
    }
    areaPoints.push(dataPoints[dataPoints.length - 1]!.x, baselineY);

    const area = new Konva.Line({
      points: areaPoints,
      fill: style.color,
      fillOpacity: style.fillOpacity,
      stroke: "transparent",
      strokeWidth: 0,
      closed: true,
      listening: false,
    });
    ctx.chartLayer.add(area);

    // Draw line on top of filled area
    const linePoints: number[] = [];
    for (const pt of dataPoints) {
      linePoints.push(pt.x, pt.y);
    }

    const line = new Konva.Line({
      points: linePoints,
      stroke: style.color,
      strokeWidth: style.strokeWidth,
      tension: 0.4,
      listening: false,
    });
    ctx.chartLayer.add(line);

    // Draw points
    for (const pt of dataPoints) {
      const dot = new Konva.Circle({
        x: pt.x,
        y: pt.y,
        radius: 3,
        fill: style.color,
        stroke: "#ffffff",
        strokeWidth: 0.5,
        listening: false,
      });
      ctx.chartLayer.add(dot);

      // Overlay zone for each point
      zones.push({
        id: `area_${field}_${pt.cat}`.replace(/[^a-zA-Z0-9_]/g, "_"),
        x: pt.x - 6,
        y: pt.y - 6,
        width: 12,
        height: 12,
        metadata: {
          chartType: "area",
          series: field,
          category: pt.cat,
          value: pt.value,
          field,
          xField,
        },
        cursor: "pointer",
      });
    }
  }

  return { zones, boxSelectEnabled: true, zoomEnabled: false, panEnabled: false };
}

// ─── Auto-detect ─────────────────────────────────────────────────

function canHandleArea(data: ChartData) {
  const xField = data.xField ?? "name";
  const yFields = data.yFields ?? (data.yField ? [data.yField] : []);
  const rows = data.rows;

  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const hasX = rows.some((r) => r[xField] !== undefined);
  const hasY = yFields.length > 0 && yFields.every((f) =>
    rows.some((r) => Number.isFinite(Number(r[f])))
  );

  if (!hasX || !hasY) {
    return { suitable: false, score: 0, reason: "Missing x or y fields" };
  }

  const catCount = new Set(rows.map((r) => String(r[xField]))).size;
  if (catCount < 2) return { suitable: false, score: 0.1, reason: "Need at least 2 data points for an area chart" };
  if (catCount > 200) return { suitable: false, score: 0.1, reason: "Too many categories for area chart" };

  return { suitable: true, score: catCount <= 20 ? 0.85 : 0.55 };
}

// ─── Registration ────────────────────────────────────────────────

const AREA_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Category/x-axis field", autoDetect: { types: ["string"] } },
  { field: "yFields", role: "y", required: true, description: "Value field(s)", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "area",
  family: "composition",
  displayName: "Area Chart",
  description: "Show magnitude trends with filled area beneath the line",
  icon: "AreaChart",
  requiredFields: AREA_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderArea,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailLine(ctx, [[0.3, 0.5, 0.7, 0.6, 0.9], [0.2, 0.4, 0.5, 0.8, 0.7]], w, h),
  canHandle: canHandleArea,
});
