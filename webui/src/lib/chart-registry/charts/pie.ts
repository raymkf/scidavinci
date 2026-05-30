import Konva from "konva";
import type { ChartRenderContext, ChartData, RenderConfig, OverlayConfig, OverlayZone, FieldRequirement } from "../types";
import { registerChartType } from "../registry";
import {
  computePlotLayout,
  drawBackground,
  drawTitle,
  drawCaption,
  resolveColor,
  getElementStyle,
} from "../renderer-base";
import { drawThumbnailPie } from "../thumbnail-base";

// ─── Pie renderer ────────────────────────────────────────────────

function renderPie(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const nameField = data.nameField ?? data.labelField ?? data.xField ?? "name";
  const valueField = data.valueField ?? (data.yField ?? (data.yFields?.length ? data.yFields[0]! : undefined) ?? "value");

  // Collect valid values
  const items: { name: string; value: number }[] = [];
  for (const r of rows) {
    const name = String(r[nameField] ?? "");
    const val = Number(r[valueField] ?? 0);
    if (Number.isFinite(val) && val > 0) {
      items.push({ name, value: val });
    }
  }

  if (items.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  const total = items.reduce((s, v) => s + v.value, 0);

  // Pie position and size
  const centerX = layout.plotX + layout.plotWidth / 2;
  const centerY = layout.plotY + layout.plotHeight / 2;
  const radius = Math.min(layout.plotWidth, layout.plotHeight) / 2 - 10;

  drawBackground(ctx.chartLayer, ctx, config);

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  const zones: OverlayZone[] = [];

  // Draw slices
  let startAngle = -90; // Start from 12 o'clock position

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const pct = (item.value / total) * 100;
    const sweepAngle = (item.value / total) * 360;
    const color = resolveColor(i, config);
    const style = getElementStyle(item.name, config, {
      color,
      strokeWidth: 1,
      fillOpacity: 1,
    });

    // Draw wedge slice
    const wedge = new Konva.Wedge({
      x: centerX,
      y: centerY,
      radius,
      angle: sweepAngle,
      rotation: startAngle,
      fill: style.color,
      fillOpacity: style.fillOpacity,
      stroke: "#ffffff",
      strokeWidth: 1,
      listening: false,
    });
    ctx.chartLayer.add(wedge);

    // Percentage label inside slice
    const midAngleDeg = startAngle + sweepAngle / 2;
    const midAngleRad = (midAngleDeg * Math.PI) / 180;
    const labelRadius = radius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(midAngleRad);
    const labelY = centerY + labelRadius * Math.sin(midAngleRad);

    if (pct > 3) {
      const label = new Konva.Text({
        x: labelX,
        y: labelY,
        text: `${pct.toFixed(0)}%`,
        fontSize: 11,
        fontFamily: "Arial, sans-serif",
        fill: "#ffffff",
        align: "center",
        verticalAlign: "middle",
        offsetX: 20,
        offsetY: 7,
        width: 40,
        listening: false,
      });
      ctx.chartLayer.add(label);
    }

    // Wedge-shaped overlay zone matching the actual slice geometry.
    // The hit rect spans the slice's bounding box; the highlight shape
    // (Konva.Wedge) is built from _shape:"wedge" metadata by overlay-engine.
    const zoneW = radius * 2;
    const zoneH = radius * 2;
    zones.push({
      id: `pie_${item.name}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      x: centerX - radius,
      y: centerY - radius,
      width: zoneW,
      height: zoneH,
      metadata: {
        _shape: "wedge",
        _wedge_cx: centerX,
        _wedge_cy: centerY,
        _wedge_r: radius,
        _konva_rotation: startAngle,
        _konva_angle: sweepAngle,
        chartType: "pie",
        series: item.name,
        category: item.name,
        name: item.name,
        value: item.value,
        percentage: pct,
        nameField,
        valueField,
      },
      cursor: "pointer",
    });

    startAngle += sweepAngle;
  }

  return { zones, boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
}

// ─── Auto-detect ─────────────────────────────────────────────────

function canHandlePie(data: ChartData) {
  const nameField = data.nameField ?? data.labelField ?? data.xField ?? "name";
  const valueField = data.valueField ?? (data.yField ?? (data.yFields?.length ? data.yFields[0]! : undefined) ?? "value");
  const rows = data.rows;

  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const hasNames = rows.some((r) => r[nameField] !== undefined);
  const hasValues = rows.some((r) => Number.isFinite(Number(r[valueField] ?? 0)) && Number(r[valueField] ?? 0) > 0);

  if (!hasNames || !hasValues) {
    return { suitable: false, score: 0, reason: "Missing name or value fields" };
  }

  const catCount = new Set(rows.map((r) => String(r[nameField]))).size;
  if (catCount > 10) return { suitable: false, score: 0.1, reason: "Too many categories for pie chart" };

  return { suitable: true, score: catCount <= 6 ? 0.9 : 0.6 };
}

// ─── Registration ────────────────────────────────────────────────

const PIE_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "nameField", role: "label", required: true, description: "Category/name field", autoDetect: { types: ["string"] } },
  { field: "valueField", role: "value", required: true, description: "Value field", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "pie",
  family: "composition",
  displayName: "Pie/Donut Chart",
  description: "Show proportions of a whole with pie slices",
  icon: "PieChart",
  requiredFields: PIE_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: false,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderPie,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailPie(ctx, [35, 25, 20, 15, 5], w, h),
  canHandle: canHandlePie,
});
