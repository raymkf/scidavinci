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
import { drawThumbnailBar } from "../thumbnail-base";

// ─── Bar renderer ───────────────────────────────────────────────

function renderBar(
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

  const groupWidth = bandwidth / yFields.length;

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

  // Draw bars
  const zones: OverlayZone[] = [];

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci]!;
    const xBase = layout.plotX + xScale(cat);

    for (let si = 0; si < yFields.length; si++) {
      const field = yFields[si]!;
      const value = Number(rows[ci]![field] ?? 0);
      if (!Number.isFinite(value)) continue;

      const colorIdx = yFields.length > 1 ? si : ci;
      const style = getElementStyle(`${field}@@${cat}`, config, {
        color: resolveColor(colorIdx, config),
        strokeWidth: 0,
        fillOpacity: 1,
      });

      const barX = xBase + si * groupWidth;
      const barHeight = yScale(value);
      const barY = layout.plotY + layout.plotHeight - barHeight;

      const rect = new Konva.Rect({
        x: barX,
        y: barY,
        width: groupWidth - 1,
        height: barHeight,
        fill: style.color,
        fillOpacity: style.fillOpacity,
        stroke: style.color,
        strokeWidth: 0,
        cornerRadius: 0,
        listening: false,
      });
      ctx.chartLayer.add(rect);

      // Error bar
      const errField = config.errorBars?.find((e) => e.series === field)?.field
        ?? `${field}_sem`;
      const errVal = Number(rows[ci]![errField] ?? 0);
      if (Number.isFinite(errVal) && errVal > 0) {
        const errHalf = yScale(errVal);
        const errX = barX + groupWidth / 2;
        const errY = barY;
        const errTop = errY - errHalf;

        ctx.chartLayer.add(
          new Konva.Line({
            points: [errX, errY, errX, errTop],
            stroke: style.color,
            strokeWidth: 1,
            listening: false,
          }),
        );
        // Cap
        ctx.chartLayer.add(
          new Konva.Line({
            points: [errX - 3, errTop, errX + 3, errTop],
            stroke: style.color,
            strokeWidth: 1,
            listening: false,
          }),
        );
      }

      // Overlay zone
      zones.push({
        id: `bar_${field}_${cat}`.replace(/[^a-zA-Z0-9_]/g, "_"),
        x: barX,
        y: barY,
        width: groupWidth - 1,
        height: barHeight,
        metadata: {
          chartType: "bar",
          series: field,
          category: cat,
          value,
          field,
          xField,
        },
        cursor: "pointer",
      });
    }
  }

  // Significance brackets
  const sigs = config.significance ?? [];
  for (const sig of sigs) {
    const fromX = layout.plotX + xScale(String(sig.from.category)) + bandwidth / 2;
    const toX = layout.plotX + xScale(String(sig.to.category)) + bandwidth / 2;
    const maxY = layout.plotY + layout.plotHeight - yScale(yMax);
    const bracketY = maxY - 10 - Math.random() * 20;

    ctx.chartLayer.add(
      new Konva.Line({
        points: [fromX, bracketY, fromX, maxY, toX, maxY, toX, bracketY],
        stroke: "#374151",
        strokeWidth: 1,
        listening: false,
      }),
    );

    ctx.chartLayer.add(
      new Konva.Text({
        x: (fromX + toX) / 2,
        y: bracketY - 14,
        text: sig.label,
        fontSize: 10,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        align: "center",
        width: 40,
        offsetX: 20,
        listening: false,
      }),
    );
  }

  return { zones, boxSelectEnabled: true, zoomEnabled: false, panEnabled: false };
}

// ─── Auto-detect ─────────────────────────────────────────────────

function canHandleBar(data: ChartData) {
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
  if (catCount > 50) return { suitable: false, score: 0.1, reason: "Too many categories for bar chart" };

  return { suitable: true, score: catCount <= 10 ? 0.9 : 0.6 };
}

// ─── Registration ────────────────────────────────────────────────

const BAR_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Category/x-axis field", autoDetect: { types: ["string"] } },
  { field: "yFields", role: "y", required: true, description: "Value field(s)", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "bar",
  family: "composition",
  displayName: "Bar Chart",
  description: "Compare values across categories with vertical bars",
  icon: "BarChart3",
  requiredFields: BAR_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderBar,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailBar(ctx, [0.8, 0.6, 0.9, 0.4, 0.7], w, h),
  canHandle: canHandleBar,
});
