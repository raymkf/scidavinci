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
  computeLinearTicks,
} from "../renderer-base";
import { drawThumbnailScatter } from "../thumbnail-base";

// ─── Volcano renderer ──────────────────────────────────────────────

function renderVolcano(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;

  const xValueField = data.xValueField ?? "log2FoldChange";
  const yValueField = data.yValueField ?? "negLog10P";
  const pValueField = data.pValueField ?? "pvalue";
  const labelField = data.labelField ?? "gene";
  const groupField = data.groupField ?? "group";

  const xThreshold = data.xThreshold ?? 1;
  // -log10(0.05) ≈ 1.301
  const yThreshold = data.yThreshold ?? -Math.log10(0.05);

  // Extract numeric values
  const xVals: number[] = [];
  const yVals: number[] = [];
  const validRows: typeof rows = [];

  for (const r of rows) {
    const x = Number(r[xValueField]);
    const y = Number(r[yValueField]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xVals.push(x);
      yVals.push(y);
      validRows.push(r);
    }
  }

  if (xVals.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const xPad = (xMax - xMin) * 0.05 || 0.5;
  const yMax = Math.max(...yVals, 0) * 1.05 || 1;

  const xScale = createLinearScale(
    [xMin - xPad, xMax + xPad],
    [0, layout.plotWidth],
  );
  const yScale = createLinearScale(
    [0, yMax],
    [0, layout.plotHeight],
  );

  // Draw chart elements
  drawBackground(ctx.chartLayer, ctx, config);
  const yTicks = computeLinearTicks(0, yMax);
  const xTicks = computeLinearTicks(xMin - xPad, xMax + xPad);
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

  // Draw threshold lines (dashed)
  const thresholdColor = "#6B7280";
  const thresholdDash = [6, 4];

  // Vertical threshold at +xThreshold
  const vxPos = layout.plotX + xScale(xThreshold);
  if (vxPos >= layout.plotX && vxPos <= layout.plotX + layout.plotWidth) {
    ctx.chartLayer.add(
      new Konva.Line({
        points: [vxPos, layout.plotY, vxPos, layout.plotY + layout.plotHeight],
        stroke: thresholdColor,
        strokeWidth: 1,
        dash: thresholdDash,
        listening: false,
      }),
    );
  }

  // Vertical threshold at -xThreshold
  const vxNeg = layout.plotX + xScale(-xThreshold);
  if (vxNeg >= layout.plotX && vxNeg <= layout.plotX + layout.plotWidth) {
    ctx.chartLayer.add(
      new Konva.Line({
        points: [vxNeg, layout.plotY, vxNeg, layout.plotY + layout.plotHeight],
        stroke: thresholdColor,
        strokeWidth: 1,
        dash: thresholdDash,
        listening: false,
      }),
    );
  }

  // Horizontal threshold at yThreshold
  const hyPos = layout.plotY + layout.plotHeight - yScale(yThreshold);
  if (hyPos >= layout.plotY && hyPos <= layout.plotY + layout.plotHeight) {
    ctx.chartLayer.add(
      new Konva.Line({
        points: [layout.plotX, hyPos, layout.plotX + layout.plotWidth, hyPos],
        stroke: thresholdColor,
        strokeWidth: 1,
        dash: thresholdDash,
        listening: false,
      }),
    );
  }

  // Colours for volcano groups
  const VOLCANO_COLORS: Record<string, string> = {
    up: "#D55E00",
    down: "#0072B2",
    ns: "#9CA3AF",
  };

  // Determine group assignment
  function getGroup(x: number, y: number, pVal?: number): string {
    // If group field is explicitly set, use it
    // Otherwise derive from thresholds
    if (pVal !== undefined) {
      const pThresh = 0.05;
      if (pVal < pThresh) {
        if (x >= xThreshold) return "up";
        if (x <= -xThreshold) return "down";
      }
      return "ns";
    }
    // Use y threshold as proxy
    const absYThresh = yThreshold;
    if (y >= absYThresh) {
      if (x >= xThreshold) return "up";
      if (x <= -xThreshold) return "down";
    }
    return "ns";
  }

  // Batch-draw all points in a single group for performance
  const pointGroup = new Konva.Group({ listening: false });
  const pointRadius = 3.5;

  const zones: OverlayZone[] = [];

  for (let i = 0; i < validRows.length; i++) {
    const r = validRows[i]!;
    const x = Number(r[xValueField]);
    const y = Number(r[yValueField]);
    const pVal = Number(r[pValueField]);

    // Determine group - check explicit groupField first
    let group = String(r[groupField] ?? "").toLowerCase();
    if (!["up", "down", "ns"].includes(group)) {
      group = getGroup(x, y, Number.isFinite(pVal) ? pVal : undefined);
    }

    const color = VOLCANO_COLORS[group] ?? VOLCANO_COLORS["ns"]!;

    const px = layout.plotX + xScale(x);
    const py = layout.plotY + layout.plotHeight - yScale(y);

    pointGroup.add(
      new Konva.Circle({
        x: px,
        y: py,
        radius: pointRadius,
        fill: color,
        stroke: color,
        strokeWidth: 0,
        opacity: group === "ns" ? 0.4 : 0.75,
        listening: false,
      }),
    );

    // Overlay zones only for significant points (up/down)
    if (group === "up" || group === "down") {
      const label = String(r[labelField] ?? `point_${i}`);
      zones.push({
        id: `volcano_${group}_${label}`.replace(/[^a-zA-Z0-9_]/g, "_"),
        x: px - pointRadius,
        y: py - pointRadius,
        width: pointRadius * 2,
        height: pointRadius * 2,
        hitTolerance: 6,
        metadata: {
          chartType: "volcano",
          series: group,
          category: label,
          value: y,
          log2FC: x,
          pValue: pVal,
          xField: xValueField,
          yField: yValueField,
        },
        cursor: "pointer",
      });
    }
  }

  ctx.chartLayer.add(pointGroup);

  return { zones, boxSelectEnabled: true, zoomEnabled: true, panEnabled: true };
}

// ─── Auto-detect ───────────────────────────────────────────────────

const VOLCANO_X_PATTERNS = [/log2?foldchange/i, /log2?fc/i, /logfc/i, /fold.?change/i, /^fc$/i];
const VOLCANO_Y_PATTERNS = [/neglog10/i, /-log10/i, /^-?log10/i, /padj/i, /p.?value/i, /pval/i, /adj\.?p/i, /fdr/i];

function canHandleVolcano(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  // Check if we have an explicit xValueField or yValueField set
  if (data.xValueField || data.yValueField) {
    const xField = data.xValueField ?? "log2FoldChange";
    const yField = data.yValueField ?? "negLog10P";
    const hasX = rows.some((r) => Number.isFinite(Number(r[xField])));
    const hasY = rows.some((r) => Number.isFinite(Number(r[yField])));
    if (hasX && hasY) return { suitable: true, score: 0.85 };
  }

  // Check column name patterns
  const cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
  let xCol: string | null = null;
  let yCol: string | null = null;

  for (const col of cols) {
    if (!xCol && VOLCANO_X_PATTERNS.some((p) => p.test(col))) {
      xCol = col;
    }
    if (!yCol && VOLCANO_Y_PATTERNS.some((p) => p.test(col))) {
      yCol = col;
    }
  }

  if (xCol && yCol) {
    const hasX = rows.some((r) => Number.isFinite(Number(r[xCol!])));
    const hasY = rows.some((r) => Number.isFinite(Number(r[yCol!])));
    if (hasX && hasY) return { suitable: true, score: 0.8 };
  }

  if (xCol || yCol) {
    return { suitable: false, score: 0.3, reason: `Partial match (x:${xCol ?? "none"}, y:${yCol ?? "none"})` };
  }

  return { suitable: false, score: 0, reason: "No logFC/p-value columns detected" };
}

// ─── Registration ──────────────────────────────────────────────────

const VOLCANO_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xValueField", role: "x", required: true, description: "Log2 fold change field", autoDetect: { patterns: ["log2FoldChange", "logFC", "log2FC", "foldChange"], types: ["number"] } },
  { field: "yValueField", role: "y", required: true, description: "-log10(p-value) field", autoDetect: { patterns: ["negLog10P", "negLog10PValue", "negLog10Pval"], types: ["number"] } },
  { field: "pValueField", role: "pValue", required: false, description: "Raw p-value field (optional)", autoDetect: { patterns: ["pvalue", "pval", "padj", "p_value", "adj.P.Val"], types: ["number"] } },
  { field: "labelField", role: "label", required: false, description: "Point label field (gene name)", autoDetect: { types: ["string"] } },
  { field: "groupField", role: "group", required: false, description: "Group assignment (up/down/ns)", autoDetect: { patterns: ["group", "direction", "regulation", "change"], types: ["string"] } },
];

registerChartType({
  type: "volcano",
  family: "relationship",
  displayName: "Volcano Plot",
  description: "Visualize differential expression with log2 fold change vs significance",
  icon: "Mountain",
  requiredFields: VOLCANO_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: false,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderVolcano,
  thumbnailRenderer: (canvasCtx, w, h) => drawThumbnailScatter(canvasCtx, 25, w, h),
  canHandle: canHandleVolcano,
});
