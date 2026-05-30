import Konva from "konva";
import type { ChartRenderContext, ChartData, RenderConfig, OverlayConfig, OverlayZone, FieldRequirement } from "../types";
import { registerChartType } from "../registry";
import {
  computePlotLayout,
  drawBackground,
  drawTitle,
  drawCaption,
  drawGrid,
  createLinearScale,
  createBandScale,
  computeLinearTicks,
} from "../renderer-base";

// ─── Bubble chart renderer ───────────────────────────────────────────

function renderBubble(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const xField = data.xField ?? "enrichmentRatio";
  const yField = data.yField ?? "pathway";
  const valueField = data.valueField ?? "count";
  const sizeField = (data as unknown as Record<string, unknown>).sizeField as string ?? "geneCount";
  const colorField = (data as unknown as Record<string, unknown>).colorField as string ?? "pValue";

  // Extract data
  interface BubbleDatum {
    label: string;
    xVal: number;
    size: number;
    count: number;
    pValue: number;
  }
  const bubbles: BubbleDatum[] = [];

  for (const r of rows) {
    const xVal = Number(r[xField]);
    const label = String(r[yField] ?? "");
    const count = Number(r[valueField] ?? 0);
    const size = Number(r[sizeField] ?? 0);
    const pv = Number(r[colorField] ?? 1);

    if (Number.isFinite(xVal) && label) {
      bubbles.push({ label, xVal, size: Number.isFinite(size) ? size : 10, count: Number.isFinite(count) ? count : 0, pValue: Number.isFinite(pv) ? pv : 1 });
    }
  }

  if (bubbles.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  bubbles.sort((a, b) => b.size - a.size);

  const categories = bubbles.map((b) => b.label);
  const xMin = Math.min(...bubbles.map((b) => b.xVal), 0);
  const xMax = Math.max(...bubbles.map((b) => b.xVal), 1) * 1.1;
  const maxSize = Math.max(...bubbles.map((b) => b.size), 1);
  const minP = Math.min(...bubbles.map((b) => b.pValue), 1e-10);
  const maxP = Math.max(...bubbles.map((b) => b.pValue), 0.05);

  const xScale = createLinearScale([xMin, xMax], [0, layout.plotWidth]);
  const { scale: yScale, bandwidth } = createBandScale(categories, [0, layout.plotHeight]);

  // Draw background, grid, axes
  drawBackground(ctx.chartLayer, ctx, config);

  const xTicks = computeLinearTicks(xMin, xMax, 5);
  drawGrid(ctx.chartLayer, layout, xTicks.map(t => ({ value: t.value, label: "" })), config);

  // Custom vertical grid lines
  for (const tick of xTicks) {
    if (config.showGrid !== false) {
      ctx.chartLayer.add(
        new Konva.Line({
          points: [
            layout.plotX + xScale(tick.value),
            layout.plotY,
            layout.plotX + xScale(tick.value),
            layout.plotY + layout.plotHeight,
          ],
          stroke: "#E5E7EB",
          strokeWidth: 0.5,
          dash: [3, 3],
          listening: false,
        }),
      );
    }
  }

  // Y axis line
  ctx.chartLayer.add(
    new Konva.Line({
      points: [layout.plotX, layout.plotY + layout.plotHeight, layout.plotX + layout.plotWidth, layout.plotY + layout.plotHeight],
      stroke: "#111827",
      strokeWidth: 1,
      listening: false,
    }),
  );
  ctx.chartLayer.add(
    new Konva.Line({
      points: [layout.plotX, layout.plotY, layout.plotX, layout.plotY + layout.plotHeight],
      stroke: "#111827",
      strokeWidth: 1,
      listening: false,
    }),
  );

  // X axis ticks
  for (const tick of xTicks) {
    const tx = layout.plotX + xScale(tick.value);
    ctx.chartLayer.add(
      new Konva.Line({
        points: [tx, layout.plotY + layout.plotHeight, tx, layout.plotY + layout.plotHeight + 4],
        stroke: "#111827",
        strokeWidth: 1,
        listening: false,
      }),
    );
    ctx.chartLayer.add(
      new Konva.Text({
        x: tx,
        y: layout.plotY + layout.plotHeight + 6,
        text: tick.label,
        fontSize: 8,
        fontFamily: "Arial, sans-serif",
        fill: "#111827",
        align: "center",
        width: 50,
        offsetX: 25,
        listening: false,
      }),
    );
  }

  // Y axis labels (pathway names)
  for (let i = 0; i < categories.length; i++) {
    const cy = layout.plotY + yScale(categories[i]!) + bandwidth / 2;
    ctx.chartLayer.add(
      new Konva.Text({
        x: layout.plotX - 6,
        y: cy,
        text: categories[i]!.length > 20 ? categories[i]!.slice(0, 19) + "…" : categories[i]!,
        fontSize: 8,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        align: "right",
        width: layout.plotX - 10,
        offsetX: layout.plotX - 10,
        verticalAlign: "middle",
        listening: false,
      }),
    );
  }

  // X axis label
  if (config.xLabel) {
    ctx.chartLayer.add(
      new Konva.Text({
        x: layout.plotX + layout.plotWidth / 2,
        y: layout.plotY + layout.plotHeight + 36,
        text: config.xLabel,
        fontSize: 10,
        fontFamily: "Arial, sans-serif",
        fill: "#111827",
        align: "center",
        listening: false,
      }),
    );
  }

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  // Draw bubbles
  const zones: OverlayZone[] = [];

  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i]!;
    const bx = layout.plotX + xScale(b.xVal);
    const by = layout.plotY + yScale(b.label) + bandwidth / 2;

    // Radius: map size to 3-40px
    const sizeRatio = b.size / maxSize;
    const radius = 3 + sizeRatio * 37;

    // Color: p-value based (red=significant, gray=not)
    const pRatio = maxP > minP ? Math.log10(b.pValue / minP) / Math.log10(maxP / minP) : 0.5;
    const significance = 1 - Math.min(1, Math.max(0, pRatio)); // 1 = most significant, 0 = not

    // Red for significant, gray for not
    const r = Math.round(220 * significance + 180 * (1 - significance));
    const g = Math.round(38 * significance + 180 * (1 - significance));
    const bl = Math.round(38 * significance + 180 * (1 - significance));
    const fillOpacity = 0.7;

    const color = `rgb(${r},${g},${bl})`;

    const bubble = new Konva.Circle({
      x: bx,
      y: by,
      radius: Math.max(2, radius),
      fill: color,
      fillOpacity,
      stroke: "#FFFFFF",
      strokeWidth: 1,
      listening: false,
    });
    ctx.chartLayer.add(bubble);

    // Count label inside bubble if large enough
    if (radius > 10 && b.count > 0) {
      ctx.chartLayer.add(
        new Konva.Text({
          x: bx,
          y: by,
          text: String(b.count),
          fontSize: Math.min(9, Math.max(6, radius * 0.4)),
          fontFamily: "Arial, sans-serif",
          fill: "#FFFFFF",
          align: "center",
          verticalAlign: "middle",
          width: radius * 2,
          offsetX: radius,
          offsetY: 4,
          listening: false,
        }),
      );
    }

    // Overlay zone — uses circle highlight shape
    zones.push({
      id: `bubble_${i}`,
      x: bx - radius,
      y: by - radius,
      width: radius * 2,
      height: radius * 2,
      metadata: {
        _shape: "circle",
        _circle_cx: bx,
        _circle_cy: by,
        _circle_r: radius,
        chartType: "bubble",
        series: b.label,
        category: b.label,
        value: b.count,
        enrichmentRatio: b.xVal,
        pValue: b.pValue,
        geneCount: b.size,
      },
      cursor: "pointer",
    });
  }

  // Legend for size and color
  const legendX = layout.plotX + layout.plotWidth + 12;
  const legendY = layout.plotY + 10;
  if (legendX + 40 < ctx.width / ctx.dpr) {
    // Size legend
    ctx.chartLayer.add(
      new Konva.Text({
        x: legendX,
        y: legendY,
        text: "Gene Count",
        fontSize: 9,
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
        fill: "#374151",
        listening: false,
      }),
    );

    const sizeCircles = [
      { r: 7, label: String(Math.round(maxSize * 0.3)) },
      { r: 14, label: String(Math.round(maxSize * 0.6)) },
      { r: 20, label: String(maxSize) },
    ];
    for (let si = 0; si < sizeCircles.length; si++) {
      const sc = sizeCircles[si]!;
      const sy = legendY + 20 + si * 30;
      ctx.chartLayer.add(
        new Konva.Circle({
          x: legendX + 10,
          y: sy,
          radius: sc.r,
          fill: "#CCCCCC",
          fillOpacity: 0.5,
          stroke: "#999999",
          strokeWidth: 0.5,
          listening: false,
        }),
      );
      ctx.chartLayer.add(
        new Konva.Text({
          x: legendX + 28,
          y: sy,
          text: sc.label,
          fontSize: 8,
          fontFamily: "Arial, sans-serif",
          fill: "#374151",
          verticalAlign: "middle",
          listening: false,
        }),
      );
    }
  }

  return { zones, boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
}

// ─── Custom Thumbnail: circles of varying sizes ──────────────────────

function drawThumbnailBubble(
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
  canvasCtx.moveTo(margin, h - margin);
  canvasCtx.lineTo(w - margin, h - margin);
  canvasCtx.stroke();

  // Circles of varying sizes
  const circles = [
    { x: 0.2, y: 0.6, r: 4, c: "#DC2626" },
    { x: 0.35, y: 0.5, r: 7, c: "#DC2626" },
    { x: 0.5, y: 0.65, r: 10, c: "#EF4444" },
    { x: 0.62, y: 0.4, r: 5, c: "#DC2626" },
    { x: 0.75, y: 0.55, r: 8, c: "#F87171" },
    { x: 0.88, y: 0.45, r: 6, c: "#DC2626" },
  ];

  const pw = w - margin * 2;
  const ph = h - margin * 2;
  for (const c of circles) {
    canvasCtx.fillStyle = c.c;
    canvasCtx.globalAlpha = 0.65;
    canvasCtx.beginPath();
    canvasCtx.arc(margin + c.x * pw, margin + c.y * ph, c.r, 0, Math.PI * 2);
    canvasCtx.fill();
    canvasCtx.globalAlpha = 1;
  }
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandleBubble(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const cols = Object.keys(rows[0] ?? {});

  // Check for pathway/enrichment column name patterns
  const hasPathway = cols.some((c) =>
    /pathway|term|go_term|kegg|gene_set|description/i.test(c)
  );
  const hasEnrichment = cols.some((c) =>
    /enrichment|gene.?ratio|fold.?enrichment|richFactor/i.test(c)
  );
  const hasPValue = cols.some((c) =>
    /p.?value|p.?adj|fdr|q.?value|padj/i.test(c)
  );

  if (hasPathway && hasEnrichment) return { suitable: true, score: 0.9 };
  if (hasPathway && hasPValue) return { suitable: true, score: 0.75 };
  if (hasEnrichment && hasPValue && rows.length >= 3) return { suitable: true, score: 0.55 };

  return { suitable: false, score: 0.1, reason: "Missing pathway/enrichment column patterns" };
}

// ─── Registration ────────────────────────────────────────────────────

const BUBBLE_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Enrichment ratio / gene ratio (x-axis)", autoDetect: { patterns: ["enrichmentRatio", "geneRatio", "richFactor", "foldEnrichment"] } },
  { field: "yField", role: "y", required: true, description: "Pathway/term name (y-axis)", autoDetect: { patterns: ["pathway", "term", "description"] } },
  { field: "valueField", role: "value", required: true, description: "Gene count", autoDetect: { patterns: ["count", "geneCount", "size"] } },
];

registerChartType({
  type: "bubble",
  family: "pathway",
  displayName: "Enrichment Bubble Chart",
  description: "Pathway/GO/KEGG enrichment visualization with bubble size and color",
  icon: "CircleDot",
  requiredFields: BUBBLE_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderBubble,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailBubble(ctx, w, h),
  canHandle: canHandleBubble,
});
