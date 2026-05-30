import Konva from "konva";
import type { ChartRenderContext, ChartData, RenderConfig, OverlayConfig, OverlayZone, FieldRequirement } from "../types";
import { registerChartType } from "../registry";
import {
  computePlotLayout,
  drawBackground,
  drawTitle,
  drawCaption,
  resolveColor,
  createLinearScale,
} from "../renderer-base";

// ─── UpSet data shape ────────────────────────────────────────────────

interface UpsetIntersection {
  sets: string[];
  count: number;
}

interface UpsetSetSize {
  name: string;
  count: number;
}

interface UpsetData {
  intersections: UpsetIntersection[];
  setSizes: UpsetSetSize[];
}

function extractUpsetData(data: ChartData): UpsetData | null {
  const rows = data.rows;
  if (rows.length === 0) return null;

  // Support structured data
  const raw = data as unknown as Record<string, unknown>;
  if (raw.upsetIntersections && raw.upsetSetSizes) {
    return {
      intersections: raw.upsetIntersections as UpsetIntersection[],
      setSizes: raw.upsetSetSizes as UpsetSetSize[],
    };
  }

  // Try to parse from rows
  const nameField = data.nameField ?? "name";
  const valueField = data.valueField ?? "count";

  const intersections: UpsetIntersection[] = [];
  const setCounts = new Map<string, number>();

  for (const r of rows) {
    const name = String(r[nameField] ?? "");
    const value = Number(r[valueField] ?? 0);
    if (!name || !Number.isFinite(value) || value <= 0) continue;

    const parts = name.split(/[&,;|+]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 1) {
      intersections.push({ sets: parts, count: value });
      for (const s of parts) {
        setCounts.set(s, (setCounts.get(s) ?? 0) + value);
      }
    }
  }

  // Normalize: individual sets have their own total counts
  const setSizes: UpsetSetSize[] = Array.from(setCounts.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  if (setSizes.length < 2 || intersections.length === 0) return null;

  return { intersections, setSizes };
}

// ─── UpSet renderer ──────────────────────────────────────────────────

function renderUpset(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const upsetData = extractUpsetData(data);

  drawBackground(ctx.chartLayer, ctx, config);

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  if (!upsetData) {
    ctx.chartLayer.add(
      new Konva.Text({
        x: layout.plotX + layout.plotWidth / 2,
        y: layout.plotY + layout.plotHeight / 2,
        text: "Invalid UpSet data. Provide intersection and set size data.",
        fontSize: 12,
        fontFamily: "Arial, sans-serif",
        fill: "#999999",
        align: "center",
        width: layout.plotWidth,
        listening: false,
      }),
    );
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  const intersections = upsetData.intersections.slice(0, 25);
  const setSizes = upsetData.setSizes;

  // Layout proportions
  const leftMargin = 100;
  const topHeight = layout.plotHeight * 0.35; // intersection bars height
  const rightWidth = 100; // set size bars width

  const intBarAreaX = layout.plotX + leftMargin;
  const intBarAreaY = layout.plotY;
  const intBarAreaW = layout.plotWidth - leftMargin - rightWidth;
  const intBarAreaH = topHeight;

  const matrixX = layout.plotX + leftMargin;
  const matrixY = layout.plotY + topHeight + 20;
  const matrixH= (setSizes.length) * 22 + 10;

  const setBarX = layout.plotX;
  const setBarY = matrixY;
  const setBarW = leftMargin - 20;
  const setBarH = matrixH;

  // ── Top: Intersection size bar chart ──
  const maxIntCount = Math.max(...intersections.map((ix) => ix.count), 1);
  const intBarScale = createLinearScale([0, maxIntCount * 1.1], [0, intBarAreaH]);
  const intBarWidth = Math.max(6, Math.min(30, intBarAreaW / intersections.length - 4));

  const zones: OverlayZone[] = [];

  for (let i = 0; i < intersections.length; i++) {
    const ix = intersections[i]!;
    const barH = intBarScale(ix.count);
    const barX = intBarAreaX + i * (intBarAreaW / intersections.length) + (intBarAreaW / intersections.length - intBarWidth) / 2;
    const barY = intBarAreaY + intBarAreaH - barH;

    const color = resolveColor(0, config);
    const rect = new Konva.Rect({
      x: barX,
      y: barY,
      width: intBarWidth,
      height: barH,
      fill: color,
      fillOpacity: 0.85,
      stroke: undefined,
      strokeWidth: 0,
      cornerRadius: 1,
      listening: false,
    });
    ctx.chartLayer.add(rect);

    // Overlay zone for intersection bar
    zones.push({
      id: `upset_bar_${i}`,
      x: barX,
      y: barY,
      width: intBarWidth,
      height: barH,
      metadata: {
        chartType: "upset",
        series: ix.sets.join(" & "),
        category: ix.sets.join(" & "),
        value: ix.count,
        sets: ix.sets,
        intersectionIndex: i,
      },
      cursor: "pointer",
    });

    // Count label on top
    ctx.chartLayer.add(
      new Konva.Text({
        x: barX + intBarWidth / 2,
        y: barY - 12,
        text: String(ix.count),
        fontSize: 7,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        align: "center",
        width: intBarWidth * 2,
        offsetX: intBarWidth,
        listening: false,
      }),
    );
  }

  // ── Left: Set size bar chart ──
  const maxSetSize = Math.max(...setSizes.map((s) => s.count), 1);
  const setBarScale = createLinearScale([0, maxSetSize * 1.1], [setBarW, 0]);

  for (let i = 0; i < setSizes.length; i++) {
    const ss = setSizes[i]!;
    const barW = setBarScale(ss.count);
    const barX = setBarX + setBarW - barW;
    const barY = setBarY + i * (setBarH / setSizes.length) + (setBarH / setSizes.length - 14) / 2;

    const color = resolveColor(i + 1, config);
    ctx.chartLayer.add(
      new Konva.Rect({
        x: barX,
        y: barY,
        width: barW,
        height: 14,
        fill: color,
        fillOpacity: 0.85,
        stroke: undefined,
        strokeWidth: 0,
        cornerRadius: 2,
        listening: false,
      }),
    );

    // Set name label to the right of bar
    ctx.chartLayer.add(
      new Konva.Text({
        x: barX - 4,
        y: barY,
        text: ss.name.length > 10 ? ss.name.slice(0, 9) + "…" : ss.name,
        fontSize: 8,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        align: "right",
        width: barX - 8,
        offsetX: barX - 8,
        verticalAlign: "middle",
        height: 14,
        listening: false,
      }),
    );
  }

  // ── Center: Membership matrix (dots + lines) ──
  const dotSpacingX = intBarAreaW / intersections.length;
  const dotSpacingY = setBarH / setSizes.length;

  for (let si = 0; si < setSizes.length; si++) {
    const setName = setSizes[si]!.name;
    const dotY = matrixY + si * dotSpacingY + dotSpacingY / 2;

    // For each intersection, draw dot if this set is a member
    for (let ii = 0; ii < intersections.length; ii++) {
      const ix = intersections[ii]!;
      const dotX = matrixX + ii * dotSpacingX + dotSpacingX / 2;
      const isMember = ix.sets.includes(setName);

      if (isMember) {
        // Filled circle
        ctx.chartLayer.add(
          new Konva.Circle({
            x: dotX,
            y: dotY,
            radius: 4,
            fill: resolveColor(si + 1, config),
            fillOpacity: 0.9,
            stroke: undefined,
            strokeWidth: 0,
            listening: false,
          }),
        );
      }
    }

    // Draw connecting lines across intersections where this set is present
    const memberIndices: number[] = [];
    for (let ii = 0; ii < intersections.length; ii++) {
      if (intersections[ii]!.sets.includes(setName)) {
        memberIndices.push(ii);
      }
    }
    if (memberIndices.length >= 2) {
      for (let mi = 1; mi < memberIndices.length; mi++) {
        const prevIdx = memberIndices[mi - 1]!;
        const currIdx = memberIndices[mi]!;
        // Only connect if they are consecutive in the intersection list
        if (currIdx - prevIdx === 1) {
          const x1 = matrixX + prevIdx * dotSpacingX + dotSpacingX / 2;
          const x2 = matrixX + currIdx * dotSpacingX + dotSpacingX / 2;
          ctx.chartLayer.add(
            new Konva.Line({
              points: [x1, dotY, x2, dotY],
              stroke: resolveColor(si + 1, config),
              strokeWidth: 1.5,
              fillOpacity: 0.6,
              listening: false,
            }),
          );
        }
      }
    }
  }

  // ── Axis labels ──
  ctx.chartLayer.add(
    new Konva.Text({
      x: intBarAreaX + intBarAreaW / 2,
      y: intBarAreaY - 20,
      text: "Intersection Size",
      fontSize: 9,
      fontFamily: "Arial, sans-serif",
      fill: "#374151",
      fontStyle: "bold",
      align: "center",
      listening: false,
    }),
  );

  return { zones, boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
}

// ─── Thumbnail: simplified bars + dots pattern ───────────────────────

function drawThumbnailUpset(
  canvasCtx: CanvasRenderingContext2D,
  w = 120,
  h = 90,
): void {
  canvasCtx.fillStyle = "#F9FAFB";
  canvasCtx.fillRect(0, 0, w, h);

  const margin = 10;
  const topH = (h - margin * 2) * 0.35;
  const leftW = 25;
  const rightW = 20;

  // Intersection bars (top)
  const barCount = 5;
  const barAreaW = w - margin * 2 - leftW - rightW;
  const barW = Math.max(2, barAreaW / barCount - 4);

  for (let i = 0; i < barCount; i++) {
    const barH = (0.4 + 0.5 * Math.random()) * topH;
    const x = margin + leftW + i * (barAreaW / barCount) + (barAreaW / barCount - barW) / 2;
    const y = margin + topH - barH;
    canvasCtx.fillStyle = "#0072B2";
    canvasCtx.fillRect(x, y, barW, barH);
  }

  // Set size bars (left)
  const setCount = 3;
  const setBarH = 6;
  const setBarAreaH = h - margin * 2 - topH - 10;

  for (let i = 0; i < setCount; i++) {
    const barW2 = (0.3 + 0.6 * Math.random()) * leftW;
    const y2 = margin + topH + 10 + i * (setBarAreaH / setCount) + (setBarAreaH / setCount - setBarH) / 2;
    canvasCtx.fillStyle = i === 0 ? "#0072B2" : i === 1 ? "#D55E00" : "#009E73";
    canvasCtx.fillRect(margin + leftW - barW2, y2, barW2, setBarH);
  }

  // Dots in matrix area
  const dotAreaW = w - margin * 2 - leftW - rightW;
  for (let si = 0; si < setCount; si++) {
    const dy = margin + topH + 10 + si * (setBarAreaH / setCount) + setBarAreaH / (setCount * 2);
    // 2-3 dots per set
    const dotCount = 2 + Math.floor(Math.random() * 3);
    for (let di = 0; di < dotCount; di++) {
      const dx = margin + leftW + (di + 1) * (dotAreaW / (barCount + 1));
      canvasCtx.fillStyle = si === 0 ? "#0072B2" : si === 1 ? "#D55E00" : "#009E73";
      canvasCtx.beginPath();
      canvasCtx.arc(dx, dy, 2, 0, Math.PI * 2);
      canvasCtx.fill();
    }
  }
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandleUpset(data: ChartData) {
  const raw = data as unknown as Record<string, unknown>;
  if (raw.upsetIntersections && raw.upsetSetSizes) return { suitable: true, score: 0.95 };

  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const nameField = data.nameField ?? "name";
  let setCount = 0;
  let intCount = 0;
  const setNames = new Set<string>();

  for (const r of rows) {
    const name = String(r[nameField] ?? "");
    const parts = name.split(/[&,;|+]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1) {
      setCount++;
      setNames.add(parts[0]!);
    } else if (parts.length >= 2) {
      intCount++;
      for (const p of parts) setNames.add(p);
    }
  }

  if (setNames.size >= 2 && intCount >= 2) return { suitable: true, score: 0.8 };
  if (setCount >= 3 && intCount >= 1) return { suitable: true, score: 0.65 };

  return { suitable: false, score: 0.05, reason: "Missing set membership/combinatorial structure" };
}

// ─── Registration ────────────────────────────────────────────────────

const UPSET_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "nameField", role: "id", required: true, description: "Set combination name field", autoDetect: { types: ["string"] } },
  { field: "valueField", role: "value", required: true, description: "Intersection/set count field", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "upset",
  family: "multi-set",
  displayName: "UpSet Plot",
  description: "Visualize set intersections with bar charts and membership matrix",
  icon: "BarChartHorizontal",
  requiredFields: UPSET_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: false,
    showLegend: false,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderUpset,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailUpset(ctx, w, h),
  canHandle: canHandleUpset,
});
