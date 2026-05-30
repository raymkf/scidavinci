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

// ─── Simple KDE (Gaussian kernel) ────────────────────────────────────

function kdeEstimate(
  values: number[],
  bandwidth: number,
  nPoints: number,
  dataMin: number,
  dataMax: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const step = (dataMax - dataMin) / (nPoints - 1);

  for (let i = 0; i < nPoints; i++) {
    const x = dataMin + i * step;
    let density = 0;
    for (const v of values) {
      const z = (x - v) / bandwidth;
      density += Math.exp(-0.5 * z * z);
    }
    density /= values.length * bandwidth * Math.sqrt(2 * Math.PI);
    points.push({ x, y: density });
  }
  return points;
}

// ─── Density renderer ────────────────────────────────────────────────

function renderDensity(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const yFields = data.yFields ?? (data.yField ? [data.yField] : []);

  // If no yFields specified, check for columns with numeric data
  if (yFields.length === 0) {
    const firstRow = rows[0] ?? {};
    const keys = Object.keys(firstRow).filter((k) => {
      const v = Number(firstRow[k]);
      return Number.isFinite(v);
    });
    if (keys.length > 0) {
      yFields.push(keys[0]!);
    }
  }

  if (yFields.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  // Extract series data
  const seriesData: { name: string; values: number[] }[] = [];

  for (const field of yFields) {
    const vals: number[] = [];
    for (const r of rows) {
      const v = Number(r[field]);
      if (Number.isFinite(v)) vals.push(v);
    }
    if (vals.length > 1) {
      seriesData.push({ name: field, values: vals });
    }
  }

  if (seriesData.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  // Compute global x range
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const sd of seriesData) {
    sd.values.sort((a, b) => a - b);
    const smin = sd.values[0]!;
    const smax = sd.values[sd.values.length - 1]!;
    if (smin < globalMin) globalMin = smin;
    if (smax > globalMax) globalMax = smax;
  }

  const pad = (globalMax - globalMin) * 0.1 || 1;
  const xMin = globalMin - pad;
  const xMax = globalMax + pad;

  const nPoints = 150;
  const bandwidthBase = (globalMax - globalMin) / 30 || 0.1;

  // Compute KDE curves and find global max density
  const densityCurves: { name: string; points: { x: number; y: number }[] }[] = [];
  let globalMaxDensity = 0;

  for (const sd of seriesData) {
    const bw = bandwidthBase;
    const points = kdeEstimate(sd.values, bw, nPoints, xMin, xMax);
    densityCurves.push({ name: sd.name, points });
    for (const p of points) {
      if (p.y > globalMaxDensity) globalMaxDensity = p.y;
    }
  }

  globalMaxDensity *= 1.1;
  if (globalMaxDensity === 0) globalMaxDensity = 1;

  const xScale = createLinearScale([xMin, xMax], [0, layout.plotWidth]);
  const yScale = createLinearScale([0, globalMaxDensity], [layout.plotHeight, 0]);

  // Draw background, grid, axes
  drawBackground(ctx.chartLayer, ctx, config);

  const yTicks = computeLinearTicks(0, globalMaxDensity);
  drawGrid(ctx.chartLayer, layout, yTicks, config);

  const xTicks = computeLinearTicks(xMin, xMax, 8);
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

  // Draw density curves
  const zones: OverlayZone[] = [];

  for (let si = 0; si < densityCurves.length; si++) {
    const curve = densityCurves[si]!;
    const color = resolveColor(si, config);

    const flatPoints: number[] = [];
    const firstPoint = curve.points[0]!;
    const lastPoint = curve.points[curve.points.length - 1]!;

    // Build the fill path: start from baseline, go through curve, back to baseline
    const baselineX = layout.plotX + xScale(firstPoint.x);
    const baselineY = layout.plotY + layout.plotHeight;

    // We need to draw: baseline point → curve points → back to baseline
    // Using Konva.Line for filled area and a separate line for the outline

    // Fill area under curve
    flatPoints.push(baselineX, baselineY);

    for (const p of curve.points) {
      flatPoints.push(layout.plotX + xScale(p.x), layout.plotY + yScale(p.y));
    }

    const endX = layout.plotX + xScale(lastPoint.x);
    flatPoints.push(endX, baselineY);

    // Filled area
    const area = new Konva.Line({
      points: flatPoints,
      fill: color,
      fillOpacity: 0.3,
      stroke: undefined,
      strokeWidth: 0,
      closed: true,
      listening: false,
    });
    ctx.chartLayer.add(area);

    // Line on top with full opacity
    const linePoints: number[] = [];
    for (const p of curve.points) {
      linePoints.push(layout.plotX + xScale(p.x), layout.plotY + yScale(p.y));
    }
    const line = new Konva.Line({
      points: linePoints,
      stroke: color,
      strokeWidth: 1.5,
      tension: 0.3,
      listening: false,
    });
    ctx.chartLayer.add(line);

    // Overlay zone: entire curve as one zone
    const avgY = curve.points.reduce((sum, p) => sum + p.y, 0) / curve.points.length;
    zones.push({
      id: `density_series_${si}`,
      x: layout.plotX,
      y: layout.plotY,
      width: layout.plotWidth,
      height: layout.plotHeight,
      metadata: {
        chartType: "density",
        series: curve.name,
        category: curve.name,
        value: avgY,
        field: curve.name,
        seriesIndex: si,
      },
      cursor: "default",
    });
  }

  return { zones, boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandleDensity(data: ChartData) {
  const rows = data.rows;
  if (rows.length < 10) return { suitable: false, score: 0, reason: "Too few data rows (< 10)" };

  const yFields = data.yFields ?? (data.yField ? [data.yField] : []);

  // If fields are explicitly specified, check them
  if (yFields.length > 0) {
    let allNumeric = true;
    for (const f of yFields) {
      const hasNumeric = rows.some((r) => Number.isFinite(Number(r[f])));
      if (!hasNumeric) allNumeric = false;
    }
    if (allNumeric) return { suitable: true, score: 0.7 };
  }

  // Auto-detect: look for numeric columns with sufficient data
  const firstRow = rows[0] ?? {};
  const numericCols = Object.keys(firstRow).filter((k) => {
    const vals = rows.filter((r) => Number.isFinite(Number(r[k])));
    return vals.length >= 10;
  });

  if (numericCols.length >= 1) return { suitable: true, score: 0.6 };
  return { suitable: false, score: 0.1, reason: "No numeric columns with sufficient data" };
}

// ─── Thumbnail: smooth curves ────────────────────────────────────────

function drawThumbnailDensity(
  canvasCtx: CanvasRenderingContext2D,
  w = 120,
  h = 90,
): void {
  // Background
  canvasCtx.fillStyle = "#F9FAFB";
  canvasCtx.fillRect(0, 0, w, h);
  const margin = 14;
  canvasCtx.fillStyle = "#FFFFFF";
  canvasCtx.fillRect(margin, margin, w - margin * 2, h - margin * 2);
  canvasCtx.strokeStyle = "#D1D5DB";
  canvasCtx.lineWidth = 0.5;
  canvasCtx.beginPath();
  canvasCtx.moveTo(margin, margin);
  canvasCtx.lineTo(margin, h - margin);
  canvasCtx.moveTo(margin, h - margin);
  canvasCtx.lineTo(w - margin, h - margin);
  canvasCtx.stroke();

  const plotW = w - margin * 2;
  const plotH = h - margin * 2;
  const colors = ["#0072B2", "#D55E00", "#009E73"];
  const nCurves = 2;

  for (let si = 0; si < nCurves; si++) {
    const cx = margin + plotW / 2 + (si - 0.5) * plotW * 0.2;
    const spread = plotW * (0.2 + si * 0.05);
    const peakY = margin + plotH * 0.12;
    const baseY = h - margin;

    const points: { x: number; y: number }[] = [];
    const nPts = 40;
    for (let i = 0; i <= nPts; i++) {
      const t = i / nPts;
      const x = margin + t * plotW;
      // Gaussian-like curve
      const z = (x - cx) / spread;
      const density = Math.exp(-0.5 * z * z);
      const y = baseY - density * (baseY - peakY);

      points.push({ x, y });
    }

    // Filled area
    canvasCtx.fillStyle = colors[si]!;
    canvasCtx.globalAlpha = 0.3;
    canvasCtx.beginPath();
    canvasCtx.moveTo(points[0]!.x, baseY);
    for (const p of points) {
      canvasCtx.lineTo(p.x, p.y);
    }
    canvasCtx.lineTo(points[points.length - 1]!.x, baseY);
    canvasCtx.closePath();
    canvasCtx.fill();

    // Line
    canvasCtx.globalAlpha = 1;
    canvasCtx.strokeStyle = colors[si]!;
    canvasCtx.lineWidth = 1.2;
    canvasCtx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) canvasCtx.moveTo(points[i]!.x, points[i]!.y);
      else canvasCtx.lineTo(points[i]!.x, points[i]!.y);
    }
    canvasCtx.stroke();
  }

  canvasCtx.globalAlpha = 1;
}

// ─── Registration ────────────────────────────────────────────────────

const DENSITY_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "yFields", role: "y", required: true, description: "Numeric series to compute density for", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "density",
  family: "distribution",
  displayName: "Density Plot",
  description: "KDE density plot comparing distributions of one or more numeric series",
  icon: "Activity",
  requiredFields: DENSITY_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderDensity,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailDensity(ctx, w, h),
  canHandle: canHandleDensity,
});
