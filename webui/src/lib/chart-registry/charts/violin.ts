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
import { drawThumbnailViolin } from "../thumbnail-base";

// ─── Violin renderer ───────────────────────────────────────────────

interface ViolinGroupData {
  group: string;
  values: number[];
  min: number;
  max: number;
  median: number;
  q1: number;
  q3: number;
  mean: number;
}

function computeQuartiles(sorted: number[]): { median: number; q1: number; q3: number } {
  const n = sorted.length;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
    : sorted[Math.floor(n / 2)]!;

  const lowerHalf = sorted.slice(0, Math.floor(n / 2));
  const upperHalf = sorted.slice(Math.ceil(n / 2));

  const q1 = lowerHalf.length % 2 === 0
    ? (lowerHalf[lowerHalf.length / 2 - 1]! + lowerHalf[lowerHalf.length / 2]!) / 2
    : lowerHalf[Math.floor(lowerHalf.length / 2)]!;

  const q3 = upperHalf.length % 2 === 0
    ? (upperHalf[upperHalf.length / 2 - 1]! + upperHalf[upperHalf.length / 2]!) / 2
    : upperHalf[Math.floor(upperHalf.length / 2)]!;

  return { median, q1, q3 };
}

/**
 * Build a KDE-based density profile for a set of values.
 * Returns an array of [y_position, density] pairs (density normalized to 0-1).
 */
function computeDensity(
  values: number[],
  bandwidth: number,
  numBins = 40,
): Array<{ y: number; density: number }> {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = range * 0.1;
  const yMin = min - pad;
  const yMax = max + pad;

  const result: Array<{ y: number; density: number }> = [];
  const step = (yMax - yMin) / numBins;

  for (let i = 0; i <= numBins; i++) {
    const y = yMin + i * step;
    let sum = 0;
    for (const v of values) {
      const z = (y - v) / bandwidth;
      // Gaussian kernel
      sum += Math.exp(-0.5 * z * z);
    }
    result.push({ y, density: sum / values.length });
  }

  // Normalize to 0-1
  const maxDensity = Math.max(...result.map((d) => d.density), 0.001);
  for (const d of result) {
    d.density /= maxDensity;
  }

  return result;
}

function renderViolin(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;

  const xField = data.xField ?? data.groupField ?? "group";
  const yField = data.yField ?? data.valueField ?? (data.yFields ? data.yFields[0] : "value");

  // Group rows by xField, collecting yField values
  const groupMap = new Map<string, number[]>();
  for (const r of rows) {
    const group = String(r[xField] ?? "");
    const value = Number(r[yField]);
    if (Number.isFinite(value)) {
      const arr = groupMap.get(group) || [];
      arr.push(value);
      groupMap.set(group, arr);
    } else if (Array.isArray(r[yField])) {
      // yField may be an array of values per row
      const arr = groupMap.get(group) || [];
      for (const v of r[yField] as unknown[]) {
        const nv = Number(v);
        if (Number.isFinite(nv)) arr.push(nv);
      }
      groupMap.set(group, arr);
    }
  }

  if (groupMap.size === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  const categories = Array.from(groupMap.keys());

  // Compute summary stats per group
  const groupData: ViolinGroupData[] = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const [group, values] of groupMap) {
    const sorted = [...values].sort((a, b) => a - b);
    const { median, q1, q3 } = computeQuartiles(sorted);
    const min = sorted[0]!;
    const max = sorted[sorted.length - 1]!;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    groupData.push({ group, values: sorted, min, max, median, q1, q3, mean });

    if (min < globalMin) globalMin = min;
    if (max > globalMax) globalMax = max;
  }

  const yPad = (globalMax - globalMin) * 0.1 || 1;

  const yScale = createLinearScale(
    [globalMin - yPad, globalMax + yPad],
    [0, layout.plotHeight],
  );
  const { scale: xScale, bandwidth } = createBandScale(
    categories,
    [0, layout.plotWidth],
  );

  // Draw chart elements
  drawBackground(ctx.chartLayer, ctx, config);
  const yTicks = computeLinearTicks(globalMin - yPad, globalMax + yPad);
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

  // Draw violins
  const zones: OverlayZone[] = [];
  const violinMaxHalfWidth = bandwidth * 0.45;

  for (let ci = 0; ci < groupData.length; ci++) {
    const gd = groupData[ci]!;
    const color = resolveColor(ci, config);
    const centerX = layout.plotX + xScale(gd.group) + bandwidth / 2;

    // Compute density profile
    const bandwidthParam = (gd.max - gd.min) / (Math.sqrt(gd.values.length) || 1) * 0.9;
    const densityProfile = computeDensity(gd.values, Math.max(bandwidthParam, 0.01));

    if (densityProfile.length < 2) continue;

    // Build path for violin shape
    const rightPoints: number[] = [];
    const leftPoints: number[] = [];

    for (const d of densityProfile) {
      const y = layout.plotY + layout.plotHeight - yScale(d.y);
      const halfWidth = d.density * violinMaxHalfWidth;
      rightPoints.push(centerX + halfWidth, y);
      leftPoints.push(centerX - halfWidth, y);
    }

    // Path goes: top → down the right side → bottom → up the left side → close
    const allPoints = [
      ...rightPoints, // top to bottom on right side
      ...leftPoints.reverse(), // bottom to top on left side
    ];

    // Only first two points from rightPoints start the path
    const pathPoints = allPoints;

    ctx.chartLayer.add(
      new Konva.Line({
        points: pathPoints,
        fill: color,
        fillOpacity: 0.4,
        stroke: color,
        strokeWidth: 1.5,
        closed: true,
        tension: 0,
        listening: false,
      }),
    );

    // Box plot overlay inside violin
    const medianY = layout.plotY + layout.plotHeight - yScale(gd.median);
    const q1Y = layout.plotY + layout.plotHeight - yScale(gd.q1);
    const q3Y = layout.plotY + layout.plotHeight - yScale(gd.q3);
    const boxHeight = q1Y - q3Y;
    const innerBoxHalfWidth = violinMaxHalfWidth * 0.25;

    // Box rect
    ctx.chartLayer.add(
      new Konva.Rect({
        x: centerX - innerBoxHalfWidth,
        y: q3Y,
        width: innerBoxHalfWidth * 2,
        height: boxHeight,
        fill: "#FFFFFF",
        fillOpacity: 0.9,
        stroke: color,
        strokeWidth: 1,
        listening: false,
      }),
    );

    // Median line (extends slightly wider than the box)
    ctx.chartLayer.add(
      new Konva.Line({
        points: [
          centerX - innerBoxHalfWidth * 1.6,
          medianY,
          centerX + innerBoxHalfWidth * 1.6,
          medianY,
        ],
        stroke: "#FFFFFF",
        strokeWidth: 2,
        listening: false,
      }),
    );

    // Mean dot
    const meanY = layout.plotY + layout.plotHeight - yScale(gd.mean);
    ctx.chartLayer.add(
      new Konva.Circle({
        x: centerX,
        y: meanY,
        radius: 2.5,
        fill: "#FFFFFF",
        stroke: color,
        strokeWidth: 1,
        listening: false,
      }),
    );

    // Overlay zone
    const violinTop = layout.plotY + layout.plotHeight - yScale(gd.max + (gd.max - gd.min) * 0.1);
    const violinBottom = layout.plotY + layout.plotHeight - yScale(gd.min - (gd.max - gd.min) * 0.1);

    zones.push({
      id: `violin_${gd.group}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      x: centerX - violinMaxHalfWidth - 2,
      y: Math.min(violinTop, violinBottom) - 2,
      width: violinMaxHalfWidth * 2 + 4,
      height: Math.abs(violinTop - violinBottom) + 4,
      metadata: {
        chartType: "violin",
        series: gd.group,
        category: gd.group,
        value: gd.median,
        median: gd.median,
        q1: gd.q1,
        q3: gd.q3,
        min: gd.min,
        max: gd.max,
        mean: gd.mean,
        count: gd.values.length,
        xField,
        yField,
      },
      cursor: "pointer",
    });
  }

  return { zones, boxSelectEnabled: true, zoomEnabled: false, panEnabled: false };
}

// ─── Auto-detect ───────────────────────────────────────────────────

function canHandleViolin(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const yField = data.yField ?? data.valueField ?? (data.yFields ? data.yFields[0] : "value");

  // Need one categorical and one numeric field
  const cols = Object.keys(rows[0]!);

  // Check for explicit fields
  if (data.xField || data.groupField) {
    const xf = data.xField ?? data.groupField ?? "group";
    const yf = yField;
    const hasX = rows.some((r) => r[xf] !== undefined && r[xf] !== null);
    const hasY = rows.some((r) => {
      const v = r[yf];
      if (Array.isArray(v)) return v.length > 0;
      return Number.isFinite(Number(v));
    });
    if (hasX && hasY) {
      // Count distinct groups
      const groupSet = new Set(rows.map((r) => String(r[xf] ?? "")));
      if (groupSet.size > 1 && groupSet.size <= 20) {
        return { suitable: true, score: 0.85 };
      }
      if (groupSet.size <= 20) {
        return { suitable: true, score: 0.6 };
      }
      return { suitable: false, score: 0.3, reason: "Too many groups for violin plot" };
    }
  }

  // Auto-detect: find a categorical column and a numeric column
  const stringCols = cols.filter((c) =>
    rows.some((r) => typeof r[c] === "string" || (typeof r[c] === "number" && !Number.isFinite(Number(r[c]))))
  );
  const numericCols = cols.filter((c) =>
    rows.some((r) => {
      const v = r[c];
      if (Array.isArray(v)) return v.some((e: unknown) => Number.isFinite(Number(e)));
      return Number.isFinite(Number(v));
    })
  );

  if (stringCols.length > 0 && numericCols.length > 0) {
    const catCol = stringCols[0]!;
    const numCol = numericCols[0]!;

    // Verify the numeric column has actual numeric values
    const hasNumeric = rows.some((r) => {
      const v = r[numCol];
      if (Array.isArray(v)) return v.some((e: unknown) => Number.isFinite(Number(e)));
      return Number.isFinite(Number(v));
    });
    if (!hasNumeric) {
      return { suitable: false, score: 0.2, reason: "Numeric column contains no valid numbers" };
    }

    const groupSet = new Set(rows.map((r) => String(r[catCol] ?? "")));

    if (groupSet.size >= 2 && groupSet.size <= 20) {
      // Check multiple values per group
      const groupCounts = new Map<string, number>();
      for (const r of rows) {
        const g = String(r[catCol] ?? "");
        groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
      }
      const avgPerGroup = rows.length / groupSet.size;
      if (avgPerGroup >= 3) {
        return { suitable: true, score: 0.7 };
      }
      return { suitable: true, score: 0.5 };
    }
  }

  return { suitable: false, score: 0, reason: "Need one categorical + one numeric field with multiple values per group" };
}

// ─── Registration ──────────────────────────────────────────────────

const VIOLIN_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Group/category field", autoDetect: { types: ["string"] } },
  { field: "yField", role: "y", required: true, description: "Numeric value field (raw data)", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "violin",
  family: "distribution",
  displayName: "Violin Plot",
  description: "Show data distribution density with embedded box plot",
  icon: "ChartSpline",
  requiredFields: VIOLIN_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: false,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderViolin,
  thumbnailRenderer: drawThumbnailViolin,
  canHandle: canHandleViolin,
});
