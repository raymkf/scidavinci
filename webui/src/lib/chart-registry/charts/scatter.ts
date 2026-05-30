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
import { drawThumbnailScatter } from "../thumbnail-base";

// ─── Scatter renderer ──────────────────────────────────────────────

const MAX_OVERLAY_POINTS = 500;

function detectNumericColumns(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]!);
  return cols.filter((col) =>
    rows.every((r) => {
      const v = r[col];
      return v === undefined || v === null || v === "" || Number.isFinite(Number(v));
    }) &&
    rows.some((r) => r[col] !== undefined && r[col] !== null && r[col] !== "")
  );
}

function renderScatter(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;

  if (rows.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  // Auto-detect numeric columns if not specified
  const numericCols = detectNumericColumns(rows);
  const xValueField = data.xValueField ?? numericCols[0] ?? "x";
  const yValueField = data.yValueField ?? numericCols[1] ?? numericCols[0] ?? "y";
  const groupField = data.groupField;
  const labelField = data.labelField ?? "label";

  // Extract valid points
  interface ScatterPoint {
    x: number;
    y: number;
    group: string;
    label: string;
    row: Record<string, unknown>;
  }

  const points: ScatterPoint[] = [];
  const groups = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const x = Number(r[xValueField]);
    const y = Number(r[yValueField]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const group = groupField ? String(r[groupField] ?? "default") : "default";
      const label = String(r[labelField] ?? `point_${i}`);
      points.push({ x, y, group, label, row: r });
      groups.add(group);
    }
  }

  if (points.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  // Compute scales
  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);

  const xPad = (xMax - xMin) * 0.05 || 0.5;
  const yPad = (yMax - yMin) * 0.05 || 0.5;

  const xScale = createLinearScale(
    [xMin - xPad, xMax + xPad],
    [0, layout.plotWidth],
  );
  const yScale = createLinearScale(
    [yMin - yPad, yMax + yPad],
    [0, layout.plotHeight],
  );

  // Draw chart elements
  drawBackground(ctx.chartLayer, ctx, config);
  const xTicks = computeLinearTicks(xMin - xPad, xMax + xPad);
  const yTicks = computeLinearTicks(yMin - yPad, yMax + yPad);
  drawGrid(ctx.chartLayer, layout, yTicks, config);
  drawAxes(
    ctx.chartLayer,
    layout,
    config,
    (v) => xScale(Number(v)),
    yScale,
    xTicks,
    yTicks,
  );

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  // Group colors
  const groupList = Array.from(groups);
  const groupColors = new Map<string, string>();
  groupList.forEach((g, i) => {
    groupColors.set(g, resolveColor(i, config));
  });

  // Batch-draw points in a Konva.Group for performance
  const pointGroup = new Konva.Group({ listening: false });
  const pointRadius = 4;
  const hasGroups = groups.size > 1;

  for (const pt of points) {
    const px = layout.plotX + xScale(pt.x);
    const py = layout.plotY + layout.plotHeight - yScale(pt.y);
    const color = hasGroups
      ? (groupColors.get(pt.group) ?? resolveColor(0, config))
      : resolveColor(0, config);

    pointGroup.add(
      new Konva.Circle({
        x: px,
        y: py,
        radius: pointRadius,
        fill: color,
        stroke: color,
        strokeWidth: 0,
        opacity: 0.75,
        listening: false,
      }),
    );
  }

  ctx.chartLayer.add(pointGroup);

  // Build overlay zones (limit to MAX_OVERLAY_POINTS for performance)
  const zones: OverlayZone[] = [];
  const shouldOverlay = points.length <= MAX_OVERLAY_POINTS;
  const step = shouldOverlay ? 1 : Math.ceil(points.length / MAX_OVERLAY_POINTS);

  for (let i = 0; i < points.length; i += step) {
    const pt = points[i]!;
    const px = layout.plotX + xScale(pt.x);
    const py = layout.plotY + layout.plotHeight - yScale(pt.y);

    const r = pointRadius + 2;
    zones.push({
      id: `scatter_${pt.group}_${pt.label}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      x: px - r,
      y: py - r,
      width: r * 2,
      height: r * 2,
      hitTolerance: 6,
      metadata: {
        _shape: "circle",
        _circle_cx: px,
        _circle_cy: py,
        _circle_r: r,
        chartType: "scatter",
        series: pt.group,
        category: pt.label,
        value: pt.y,
        x: pt.x,
        y: pt.y,
        xField: xValueField,
        yField: yValueField,
      },
      cursor: "pointer",
    });
  }

  return {
    zones,
    boxSelectEnabled: true,
    zoomEnabled: true,
    panEnabled: true,
  };
}

// ─── Auto-detect ───────────────────────────────────────────────────

function canHandleScatter(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const numericCols = detectNumericColumns(rows);

  if (numericCols.length < 2) {
    return { suitable: false, score: 0, reason: "Need at least 2 numeric columns" };
  }

  // If we have explicit x/y fields, check them
  if (data.xValueField || data.yValueField) {
    const xf = data.xValueField ?? numericCols[0]!;
    const yf = data.yValueField ?? numericCols[1]!;
    const hasX = rows.some((r) => Number.isFinite(Number(r[xf])));
    const hasY = rows.some((r) => Number.isFinite(Number(r[yf])));
    if (hasX && hasY) return { suitable: true, score: 0.85 };
  }

  // Default: suitable for any data with 2+ numeric columns
  const score = Math.min(0.8, 0.4 + numericCols.length * 0.1);
  return { suitable: true, score };
}

// ─── Registration ──────────────────────────────────────────────────

const SCATTER_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xValueField", role: "x", required: true, description: "X-axis numeric field", autoDetect: { types: ["number"] } },
  { field: "yValueField", role: "y", required: true, description: "Y-axis numeric field", autoDetect: { types: ["number"] } },
  { field: "groupField", role: "group", required: false, description: "Color-by-group field", autoDetect: { types: ["string"] } },
  { field: "labelField", role: "label", required: false, description: "Point label field", autoDetect: { types: ["string"] } },
];

registerChartType({
  type: "scatter",
  family: "relationship",
  displayName: "Scatter Plot",
  description: "Visualize relationship between two numeric variables",
  icon: "ScatterChart",
  requiredFields: SCATTER_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderScatter,
  thumbnailRenderer: (canvasCtx, w, h) => drawThumbnailScatter(canvasCtx, 20, w, h),
  canHandle: canHandleScatter,
});
