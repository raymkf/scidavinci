import Konva from "konva";
import type { ChartRenderContext, ChartData, RenderConfig, OverlayConfig, OverlayZone, FieldRequirement } from "../types";
import { registerChartType } from "../registry";
import {
  computePlotLayout,
  drawBackground,
  drawTitle,
  drawCaption,
  resolveColor,
} from "../renderer-base";

// ─── Venn diagram data shape ─────────────────────────────────────────

interface VennSet {
  name: string;
  count: number;
}

interface VennIntersection {
  sets: string[];
  count: number;
}

interface VennData {
  sets: VennSet[];
  intersections: VennIntersection[];
}

function extractVennData(data: ChartData): VennData | null {
  const rows = data.rows;
  if (rows.length === 0) return null;

  // Try to interpret the data as set/intersection format
  const sets: VennSet[] = [];
  const intersections: VennIntersection[] = [];

  const nameField = data.nameField ?? "name";
  const valueField = data.valueField ?? "count";

  for (const r of rows) {
    const name = String(r[nameField] ?? "");
    const value = Number(r[valueField] ?? 0);
    if (!name || !Number.isFinite(value)) continue;

    // Check if this is a single set or an intersection
    const parts = name.split(/[&,;|+]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1) {
      sets.push({ name: parts[0]!, count: value });
    } else if (parts.length <= 3) {
      intersections.push({ sets: parts, count: value });
    }
  }

  // Also check if data was provided in structured form directly
  if (sets.length === 0 && (data as unknown as Record<string, unknown>).vennSets) {
    const rawSets = (data as unknown as Record<string, unknown>).vennSets as VennSet[] | undefined;
    const rawInts = (data as unknown as Record<string, unknown>).vennIntersections as VennIntersection[] | undefined;
    if (rawSets) sets.push(...rawSets);
    if (rawInts) intersections.push(...rawInts);
  }

  if (sets.length < 2 || sets.length > 3) return null;

  return { sets: sets.slice(0, 3), intersections };
}

// ─── Venn renderer ───────────────────────────────────────────────────

function renderVenn(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const vennData = extractVennData(data);

  drawBackground(ctx.chartLayer, ctx, config);

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  if (!vennData || vennData.sets.length < 2) {
    ctx.chartLayer.add(
      new Konva.Text({
        x: layout.plotX + layout.plotWidth / 2,
        y: layout.plotY + layout.plotHeight / 2,
        text: "Invalid Venn data. Provide 2-3 sets with counts.",
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

  const sets = vennData.sets;
  const nSets = sets.length;

  const cx = layout.plotX + layout.plotWidth / 2;
  const cy = layout.plotY + layout.plotHeight / 2;
  const maxR = Math.min(layout.plotWidth, layout.plotHeight) * 0.35;

  // Circle centers and radii based on number of sets
  const circleSpecs: { x: number; y: number; r: number }[] = [];

  if (nSets === 2) {
    const d = maxR * 0.8;
    circleSpecs.push({ x: cx - d, y: cy, r: maxR });
    circleSpecs.push({ x: cx + d, y: cy, r: maxR });
  } else if (nSets === 3) {
    // Equal positioning for 3 circles
    const d = maxR * 0.7;
    circleSpecs.push({ x: cx, y: cy - d * 1.1, r: maxR }); // top
    circleSpecs.push({ x: cx - d * 1.05, y: cy + d * 0.55, r: maxR }); // bottom-left
    circleSpecs.push({ x: cx + d * 1.05, y: cy + d * 0.55, r: maxR }); // bottom-right
  }

  const zones: OverlayZone[] = [];

  // Draw circles
  for (let i = 0; i < circleSpecs.length; i++) {
    const spec = circleSpecs[i]!;
    const color = resolveColor(i, config);

    const circle = new Konva.Circle({
      x: spec.x,
      y: spec.y,
      radius: spec.r,
      fill: color,
      fillOpacity: 0.4,
      stroke: color,
      strokeWidth: 1.5,
      listening: false,
    });
    ctx.chartLayer.add(circle);

    // Set name label
    ctx.chartLayer.add(
      new Konva.Text({
        x: spec.x,
        y: spec.y - spec.r - 16,
        text: `${sets[i]!.name}\n(${sets[i]!.count})`,
        fontSize: 10,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        fontStyle: "bold",
        align: "center",
        width: spec.r * 2,
        offsetX: spec.r,
        listening: false,
      }),
    );

    // Overlay zone — circle highlight matching the venn set
    zones.push({
      id: `venn_set_${i}`,
      x: spec.x - spec.r,
      y: spec.y - spec.r,
      width: spec.r * 2,
      height: spec.r * 2,
      metadata: {
        _shape: "circle",
        _circle_cx: spec.x,
        _circle_cy: spec.y,
        _circle_r: spec.r,
        chartType: "venn",
        series: sets[i]!.name,
        category: sets[i]!.name,
        value: sets[i]!.count,
        setName: sets[i]!.name,
        setCount: sets[i]!.count,
      },
      cursor: "pointer",
    });
  }

  // Draw intersection labels
  const intersectionMap = new Map<string, number>();
  for (const ix of vennData.intersections) {
    const key = ix.sets.slice().sort().join("&");
    intersectionMap.set(key, ix.count);
  }

  // Compute intersection counts for 2-set diagram
  if (nSets === 2) {
    // Overlap region is approximately in the middle
    const overlapLabel = intersectionMap.get(
      [sets[0]!.name, sets[1]!.name].sort().join("&")
    );
    if (overlapLabel !== undefined) {
      ctx.chartLayer.add(
        new Konva.Text({
          x: cx,
          y: cy,
          text: String(overlapLabel),
          fontSize: 11,
          fontFamily: "Arial, sans-serif",
          fill: "#374151",
          fontStyle: "bold",
          align: "center",
          verticalAlign: "middle",
          listening: false,
        }),
      );
    }
  } else if (nSets === 3) {
    // Compute pairwise and triple intersections
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const key = [sets[i]!.name, sets[j]!.name].sort().join("&");
        const count = intersectionMap.get(key);
        if (count !== undefined) {
          // Place label between circles i and j
          const mx = (circleSpecs[i]!.x + circleSpecs[j]!.x) / 2;
          const my = (circleSpecs[i]!.y + circleSpecs[j]!.y) / 2;
          // Shift outward from center
          const dx = mx - cx;
          const dy = my - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const lx = mx + (dx / dist) * 12;
          const ly = my + (dy / dist) * 12;

          ctx.chartLayer.add(
            new Konva.Text({
              x: lx,
              y: ly,
              text: String(count),
              fontSize: 9,
              fontFamily: "Arial, sans-serif",
              fill: "#374151",
              align: "center",
              verticalAlign: "middle",
              listening: false,
            }),
          );
        }
      }
    }

    // Triple intersection at center
    const tripleKey = [sets[0]!.name, sets[1]!.name, sets[2]!.name].sort().join("&");
    const tripleCount = intersectionMap.get(tripleKey);
    if (tripleCount !== undefined) {
      ctx.chartLayer.add(
        new Konva.Text({
          x: cx,
          y: cy,
          text: String(tripleCount),
          fontSize: 10,
          fontFamily: "Arial, sans-serif",
          fill: "#374151",
          fontStyle: "bold",
          align: "center",
          verticalAlign: "middle",
          listening: false,
        }),
      );
    }
  }

  return { zones, boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
}

// ─── Thumbnail: 3 overlapping circles ────────────────────────────────

function drawThumbnailVenn(
  canvasCtx: CanvasRenderingContext2D,
  w = 120,
  h = 90,
): void {
  canvasCtx.fillStyle = "#F9FAFB";
  canvasCtx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 3;
  const colors = ["#0072B2", "#D55E00", "#009E73"];

  // Three circles with overlap layout
  const positions = [
    { x: cx, y: cy - r * 0.45 },
    { x: cx - r * 0.65, y: cy + r * 0.4 },
    { x: cx + r * 0.65, y: cy + r * 0.4 },
  ];

  for (let i = 0; i < 3; i++) {
    canvasCtx.fillStyle = colors[i]!;
    canvasCtx.globalAlpha = 0.4;
    canvasCtx.beginPath();
    canvasCtx.arc(positions[i]!.x, positions[i]!.y, r, 0, Math.PI * 2);
    canvasCtx.fill();
    canvasCtx.globalAlpha = 1;

    canvasCtx.strokeStyle = colors[i]!;
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.arc(positions[i]!.x, positions[i]!.y, r, 0, Math.PI * 2);
    canvasCtx.stroke();
  }
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandleVenn(data: ChartData) {
  // Check structured data first
  const raw = data as unknown as Record<string, unknown>;
  if (raw.vennSets || raw.sets) return { suitable: true, score: 0.95 };

  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const nameField = data.nameField ?? "name";
  const valueField = data.valueField ?? "count";

  // Count sets vs intersections
  let setCount = 0;
  let intersectionCount = 0;

  for (const r of rows) {
    const name = String(r[nameField] ?? "");
    const parts = name.split(/[&,;|+]/).map((s) => s.trim()).filter(Boolean);
    const val = Number(r[valueField] ?? 0);
    if (!Number.isFinite(val) || val <= 0) continue;
    if (parts.length === 1) setCount++;
    else if (parts.length <= 3) intersectionCount++;
  }

  if (setCount >= 2 && setCount <= 3 && intersectionCount >= 0) {
    return { suitable: true, score: 0.8 };
  }

  return { suitable: false, score: 0, reason: "Not recognizable as Venn/overlap data" };
}

// ─── Registration ────────────────────────────────────────────────────

const VENN_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "nameField", role: "id", required: true, description: "Set name field", autoDetect: { types: ["string"] } },
  { field: "valueField", role: "value", required: true, description: "Count field", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "venn",
  family: "multi-set",
  displayName: "Venn Diagram",
  description: "Visualize set overlaps with 2-3 overlapping circles",
  icon: "Circle",
  requiredFields: VENN_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: false,
    showLegend: false,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderVenn,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailVenn(ctx, w, h),
  canHandle: canHandleVenn,
});
