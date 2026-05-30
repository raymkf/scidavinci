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
} from "../renderer-base";
import { drawThumbnailBackground } from "../thumbnail-base";

// ─── Box renderer ──────────────────────────────────────────────────

function renderBox(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;

  const xField = data.xField ?? "group";
  const minField = data.minField ?? "min";
  const q1Field = data.q1Field ?? "q1";
  const medianField = data.medianField ?? "median";
  const q3Field = data.q3Field ?? "q3";
  const maxField = data.maxField ?? "max";
  const outliersField = data.outliersField ?? "outliers";

  const categories = rows.map((r) => String(r[xField] ?? ""));

  // Collect all values for y scale
  const allMins: number[] = [];
  const allMaxs: number[] = [];
  for (const r of rows) {
    const mn = Number(r[minField]);
    const mx = Number(r[maxField]);
    if (Number.isFinite(mn)) allMins.push(mn);
    if (Number.isFinite(mx)) allMaxs.push(mx);
  }

  if (allMins.length === 0 || allMaxs.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  const yMin = Math.min(...allMins);
  const yMax = Math.max(...allMaxs);
  const yPad = (yMax - yMin) * 0.1 || 1;

  const yScale = createLinearScale(
    [yMin - yPad, yMax + yPad],
    [0, layout.plotHeight],
  );
  const { scale: xScale, bandwidth } = createBandScale(
    categories,
    [0, layout.plotWidth],
  );

  // Draw chart elements
  drawBackground(ctx.chartLayer, ctx, config);
  const yTicks = computeLinearTicks(yMin - yPad, yMax + yPad);
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

  // Draw boxes
  const zones: OverlayZone[] = [];
  const boxWidth = bandwidth * 0.6;
  const whiskerLineWidth = bandwidth * 0.3;

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci]!;
    const r = rows[ci]!;

    const q1 = Number(r[q1Field]);
    const median = Number(r[medianField]);
    const q3 = Number(r[q3Field]);
    const minVal = Number(r[minField]);
    const maxVal = Number(r[maxField]);

    if (!Number.isFinite(q1) || !Number.isFinite(median) || !Number.isFinite(q3)) continue;

    const color = resolveColor(ci, config);

    const boxX = layout.plotX + xScale(cat) + (bandwidth - boxWidth) / 2;
    const whiskerX = layout.plotX + xScale(cat) + bandwidth / 2;

    const q1Y = layout.plotY + layout.plotHeight - yScale(q1);
    const q3Y = layout.plotY + layout.plotHeight - yScale(q3);
    const medianY = layout.plotY + layout.plotHeight - yScale(median);
    const boxHeight = q1Y - q3Y;

    // Box rect (from q1 to q3)
    const box = new Konva.Rect({
      x: boxX,
      y: q3Y,
      width: boxWidth,
      height: boxHeight,
      fill: color,
      fillOpacity: 0.7,
      stroke: color,
      strokeWidth: 1,
      listening: false,
    });
    ctx.chartLayer.add(box);

    // Median line
    ctx.chartLayer.add(
      new Konva.Line({
        points: [boxX, medianY, boxX + boxWidth, medianY],
        stroke: "#FFFFFF",
        strokeWidth: 2,
        listening: false,
      }),
    );

    // Whiskers
    if (Number.isFinite(minVal)) {
      const minY = layout.plotY + layout.plotHeight - yScale(minVal);
      // Upper whisker line (from q1 down to min)
      ctx.chartLayer.add(
        new Konva.Line({
          points: [whiskerX, q1Y, whiskerX, minY],
          stroke: color,
          strokeWidth: 1,
          listening: false,
        }),
      );
      // Upper cap
      ctx.chartLayer.add(
        new Konva.Line({
          points: [whiskerX - whiskerLineWidth / 2, minY, whiskerX + whiskerLineWidth / 2, minY],
          stroke: color,
          strokeWidth: 1,
          listening: false,
        }),
      );
    }

    if (Number.isFinite(maxVal)) {
      const maxY = layout.plotY + layout.plotHeight - yScale(maxVal);
      // Lower whisker line (from q3 up to max)
      ctx.chartLayer.add(
        new Konva.Line({
          points: [whiskerX, q3Y, whiskerX, maxY],
          stroke: color,
          strokeWidth: 1,
          listening: false,
        }),
      );
      // Lower cap
      ctx.chartLayer.add(
        new Konva.Line({
          points: [whiskerX - whiskerLineWidth / 2, maxY, whiskerX + whiskerLineWidth / 2, maxY],
          stroke: color,
          strokeWidth: 1,
          listening: false,
        }),
      );
    }

    // Outliers
    const outliersRaw = r[outliersField];
    const outliers: number[] = [];
    if (Array.isArray(outliersRaw)) {
      for (const o of outliersRaw) {
        const v = Number(o);
        if (Number.isFinite(v)) outliers.push(v);
      }
    }

    const outlierColor = "#374151";
    for (const ov of outliers) {
      const oy = layout.plotY + layout.plotHeight - yScale(ov);
      ctx.chartLayer.add(
        new Konva.Circle({
          x: whiskerX,
          y: oy,
          radius: 3,
          fill: outlierColor,
          stroke: outlierColor,
          strokeWidth: 0,
          opacity: 0.6,
          listening: false,
        }),
      );
    }

    // Overlay zone
    zones.push({
      id: `box_${cat}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      x: boxX,
      y: Math.min(q3Y, layout.plotY + layout.plotHeight - yScale(minVal) - 5),
      width: boxWidth,
      height: Math.abs(
        Math.min(q3Y, layout.plotY + layout.plotHeight - yScale(maxVal)) -
        Math.max(q1Y, layout.plotY + layout.plotHeight - yScale(minVal))
      ) + 10,
      metadata: {
        chartType: "box",
        series: cat,
        category: cat,
        value: median,
        q1,
        q3,
        median,
        min: minVal,
        max: maxVal,
        xField,
      },
      cursor: "pointer",
    });
  }

  return { zones, boxSelectEnabled: true, zoomEnabled: false, panEnabled: false };
}

// ─── Box thumbnail ─────────────────────────────────────────────────

function drawThumbnailBox(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  drawThumbnailBackground(ctx2d, w, h);
  const margin = 16;
  const plotW = w - margin * 2;
  const plotH = h - margin * 2;
  const boxW = plotW * 0.15;
  const colors = ["#0072B2", "#D55E00", "#009E73"];

  for (let i = 0; i < 3; i++) {
    const cx = margin + plotW * (0.2 + i * 0.3);
    const boxH = plotH * (0.25 + Math.random() * 0.15);
    const boxTop = margin + plotH * (0.2 + Math.random() * 0.2);
    const medianY = boxTop + boxH * (0.3 + Math.random() * 0.4);
    const whiskerTop = boxTop - plotH * (0.1 + Math.random() * 0.15);
    const whiskerBottom = boxTop + boxH + plotH * (0.1 + Math.random() * 0.15);
    const whiskerCapW = boxW * 0.6;

    const color = colors[i]!;

    // Box
    ctx2d.fillStyle = color;
    ctx2d.globalAlpha = 0.7;
    ctx2d.fillRect(cx - boxW / 2, boxTop, boxW, boxH);
    ctx2d.globalAlpha = 1;

    // Box stroke
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(cx - boxW / 2, boxTop, boxW, boxH);

    // Median
    ctx2d.strokeStyle = "#FFFFFF";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(cx - boxW / 2, medianY);
    ctx2d.lineTo(cx + boxW / 2, medianY);
    ctx2d.stroke();

    // Whisker top
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 0.8;
    ctx2d.beginPath();
    ctx2d.moveTo(cx, boxTop);
    ctx2d.lineTo(cx, whiskerTop);
    ctx2d.stroke();

    // Whisker top cap
    ctx2d.beginPath();
    ctx2d.moveTo(cx - whiskerCapW / 2, whiskerTop);
    ctx2d.lineTo(cx + whiskerCapW / 2, whiskerTop);
    ctx2d.stroke();

    // Whisker bottom
    ctx2d.beginPath();
    ctx2d.moveTo(cx, boxTop + boxH);
    ctx2d.lineTo(cx, whiskerBottom);
    ctx2d.stroke();

    // Whisker bottom cap
    ctx2d.beginPath();
    ctx2d.moveTo(cx - whiskerCapW / 2, whiskerBottom);
    ctx2d.lineTo(cx + whiskerCapW / 2, whiskerBottom);
    ctx2d.stroke();
  }
}

// ─── Auto-detect ───────────────────────────────────────────────────

const BOX_STAT_FIELDS: Array<RegExp[]> = [
  // min/q1/median/q3/max pattern
  [/\bmin\b/i, /\bq1\b/i, /\bmedian\b/i, /\bq3\b/i, /\bmax\b/i],
  // lower/25th/50th/75th/upper pattern
  [/\blower\b/i, /\b25(th|pct|pctile|percentile)?\b/i, /\b50(th|pct|pctile|percentile)?\b/i, /\b75(th|pct|pctile|percentile)?\b/i, /\bupper\b/i],
  // minimum/p25/median/p75/maximum pattern
  [/\bminimum\b/i, /\bp25\b/i, /\bmedian\b/i, /\bp75\b/i, /\bmaximum\b/i],
];

function canHandleBox(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };
  if (rows.length > 100) return { suitable: false, score: 0.1, reason: "Too many rows for box plot (summary data expected)" };

  const cols = Object.keys(rows[0]!);

  // Check if explicit fields are set and exist
  if (data.minField || data.q1Field || data.medianField || data.q3Field || data.maxField) {
    const mf = data.minField ?? "min";
    const q1 = data.q1Field ?? "q1";
    const med = data.medianField ?? "median";
    const q3 = data.q3Field ?? "q3";
    const maxf = data.maxField ?? "max";
    const hasMf = rows.some((r) => Number.isFinite(Number(r[mf])));
    const hasQ1 = rows.some((r) => Number.isFinite(Number(r[q1])));
    const hasMed = rows.some((r) => Number.isFinite(Number(r[med])));
    const hasQ3 = rows.some((r) => Number.isFinite(Number(r[q3])));
    const hasMax = rows.some((r) => Number.isFinite(Number(r[maxf])));
    if (hasMf && hasQ1 && hasMed && hasQ3 && hasMax) {
      return { suitable: true, score: 0.9 };
    }
    if (hasQ1 || hasMed || hasQ3) {
      return { suitable: false, score: 0.5, reason: "Partial box plot fields found" };
    }
  }

  // Try pattern matching
  let bestScore = 0;
  let bestMatches = 0;
  for (const patterns of BOX_STAT_FIELDS) {
    let matches = 0;
    for (const pattern of patterns) {
      if (cols.some((c) => pattern.test(c))) {
        matches++;
      }
    }
    if (matches > bestMatches) {
      bestMatches = matches;
      bestScore = matches / patterns.length;
    }
  }

  if (bestMatches >= 3) {
    return { suitable: true, score: 0.5 + bestScore * 0.4 };
  }

  return { suitable: false, score: 0, reason: "No box plot summary fields detected (min/q1/median/q3/max)" };
}

// ─── Registration ──────────────────────────────────────────────────

const BOX_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Group/category field", autoDetect: { types: ["string"] } },
  { field: "minField", role: "value", required: true, description: "Minimum value field", autoDetect: { patterns: ["min", "minimum", "lower"], types: ["number"] } },
  { field: "q1Field", role: "value", required: true, description: "First quartile field", autoDetect: { patterns: ["q1", "p25", "25th", "lower_quartile"], types: ["number"] } },
  { field: "medianField", role: "value", required: true, description: "Median field", autoDetect: { patterns: ["median", "p50", "50th"], types: ["number"] } },
  { field: "q3Field", role: "value", required: true, description: "Third quartile field", autoDetect: { patterns: ["q3", "p75", "75th", "upper_quartile"], types: ["number"] } },
  { field: "maxField", role: "value", required: true, description: "Maximum value field", autoDetect: { patterns: ["max", "maximum", "upper"], types: ["number"] } },
  { field: "outliersField", role: "value", required: false, description: "Outliers array field", autoDetect: { patterns: ["outliers", "outlier"], types: ["number"] } },
];

registerChartType({
  type: "box",
  family: "distribution",
  displayName: "Box Plot",
  description: "Show data distribution with quartiles, median, and whiskers",
  icon: "BoxPlot",
  requiredFields: BOX_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: false,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderBox,
  thumbnailRenderer: drawThumbnailBox,
  canHandle: canHandleBox,
});
