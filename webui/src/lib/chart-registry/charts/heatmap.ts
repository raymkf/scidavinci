import Konva from "konva";
import type { ChartRenderContext, ChartData, RenderConfig, OverlayConfig, OverlayZone, FieldRequirement } from "../types";
import { registerChartType } from "../registry";
import {
  computePlotLayout,
  drawBackground,
  drawTitle,
  drawCaption,
} from "../renderer-base";
import { drawThumbnailHeatmap } from "../thumbnail-base";

// ─── HSL color interpolation helper ─────────────────────────────────

function hslColorForHeatmap(value: number, minVal: number, maxVal: number): string {
  // blue (240°) → white → red (0°)
  // For low values: blue, mid: white, high: red
  if (maxVal === minVal) return "#FFFFFF";
  const t = (value - minVal) / (maxVal - minVal); // 0..1
  // t=0 → blue (h=240,s=1,l=0.45), t=0.5 → white (s=0,l=1), t=1 → red (h=0,s=1,l=0.45)
  const h = 240 * (1 - t); // 240 → 0
  const s = t < 0.5 ? 1 - 2 * t : 2 * (t - 0.5); // 1 at edges, 0 at center
  const l = t < 0.5 ? 0.45 + 1.1 * t : 1.45 - 1.1 * t; // 0.45 → 1 → 0.45
  return `hsl(${h},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
}

// ─── Heatmap renderer ───────────────────────────────────────────────

function renderHeatmap(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const xField = data.xField ?? "column";
  const yField = data.yField ?? "row";
  const valueField = data.valueField ?? "value";

  // Extract column and row labels from the data
  const colSet = new Set<string>();
  const rowSet = new Set<string>();

  for (const r of rows) {
    colSet.add(String(r[xField] ?? ""));
    rowSet.add(String(r[yField] ?? ""));
  }

  const colLabels = Array.from(colSet);
  const rowLabels = Array.from(rowSet);

  // Build a lookup map for fast cell access
  const cellMap = new Map<string, number>();
  for (const r of rows) {
    const col = String(r[xField] ?? "");
    const row = String(r[yField] ?? "");
    const val = Number(r[valueField]);
    if (Number.isFinite(val)) {
      cellMap.set(`${row}::${col}`, val);
    }
  }

  // Compute value range
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const v of cellMap.values()) {
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (!Number.isFinite(minVal)) {
    minVal = 0;
    maxVal = 1;
  }
  const range = maxVal - minVal || 1;

  const nCols = colLabels.length;
  const nRows = rowLabels.length;

  // Cell dimensions
  const maxCols = 100;
  const maxRows = 50;
  const actualCols = Math.min(nCols, maxCols);
  const actualRows = Math.min(nRows, maxRows);

  const cellW = Math.max(2, Math.floor(layout.plotWidth / actualCols));
  const cellH = Math.max(2, Math.floor(layout.plotHeight / actualRows));

  const totalCellW = cellW * actualCols;
  const totalCellH = cellH * actualRows;
  const offsetX = layout.plotX;
  const offsetY = layout.plotY;

  // Draw background
  drawBackground(ctx.chartLayer, ctx, config);

  // Draw title
  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }

  // Draw cells
  const zones: OverlayZone[] = [];
  const totalCells = actualRows * actualCols;
  const showOverlays = totalCells <= 2000;

  for (let ri = 0; ri < actualRows; ri++) {
    const rowLabel = rowLabels[ri]!;
    for (let ci = 0; ci < actualCols; ci++) {
      const colLabel = colLabels[ci]!;
      const value = cellMap.get(`${rowLabel}::${colLabel}`) ?? NaN;

      const cx = offsetX + ci * cellW;
      const cy = offsetY + ri * cellH;

      const fillColor = Number.isFinite(value)
        ? hslColorForHeatmap(value, minVal, maxVal)
        : "#EEEEEE";

      const cell = new Konva.Rect({
        x: cx,
        y: cy,
        width: cellW,
        height: cellH,
        fill: fillColor,
        stroke: "#E5E5E5",
        strokeWidth: 0.5,
        listening: false,
      });
      ctx.chartLayer.add(cell);

      // Overlay zone (only if reasonable number of cells)
      if (showOverlays && Number.isFinite(value)) {
        zones.push({
          id: `heatmap_${ri}_${ci}`,
          x: cx,
          y: cy,
          width: cellW,
          height: cellH,
          metadata: {
            chartType: "heatmap",
            series: valueField,
            category: `${rowLabel} / ${colLabel}`,
            value,
            row: rowLabel,
            column: colLabel,
            rowIndex: ri,
            colIndex: ci,
          },
          cursor: "pointer",
        });
      }
    }
  }

  // Draw row labels
  const labelSize = 8;
  for (let ri = 0; ri < actualRows; ri++) {
    const rowLabel = rowLabels[ri]!;
    const ly = offsetY + ri * cellH + cellH / 2;
    const label = new Konva.Text({
      x: offsetX - 4,
      y: ly,
      text: rowLabel.length > 10 ? rowLabel.slice(0, 9) + "…" : rowLabel,
      fontSize: labelSize,
      fontFamily: "Arial, sans-serif",
      fill: "#374151",
      align: "right",
      width: offsetX - 8,
      offsetX: offsetX - 8,
      verticalAlign: "middle",
      listening: false,
    });
    ctx.chartLayer.add(label);
  }

  // Draw column labels
  for (let ci = 0; ci < actualCols; ci++) {
    const colLabel = colLabels[ci]!;
    const lx = offsetX + ci * cellW + cellW / 2;
    const label = new Konva.Text({
      x: lx,
      y: offsetY + totalCellH + 4,
      text: colLabel.length > 10 ? colLabel.slice(0, 9) + "…" : colLabel,
      fontSize: labelSize,
      fontFamily: "Arial, sans-serif",
      fill: "#374151",
      align: "center",
      width: cellW,
      rotation: -45,
      offsetX: 0,
      listening: false,
    });
    ctx.chartLayer.add(label);
  }

  // Draw caption
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  // Color scale legend
  const legendX = offsetX + totalCellW + 12;
  const legendY = offsetY;
  const legendW = 14;
  const legendH = Math.min(totalCellH, 200);
  if (legendX + legendW + 6 < ctx.width / ctx.dpr) {
    for (let i = 0; i < legendH; i++) {
      const t = 1 - i / legendH;
      const color = hslColorForHeatmap(minVal + t * range, minVal, maxVal);
      ctx.chartLayer.add(
        new Konva.Rect({
          x: legendX,
          y: legendY + i,
          width: legendW,
          height: 2,
          fill: color,
          stroke: undefined,
          strokeWidth: 0,
          listening: false,
        }),
      );
    }

    // Min/Max labels
    ctx.chartLayer.add(
      new Konva.Text({
        x: legendX + legendW + 4,
        y: legendY,
        text: maxVal.toPrecision(2),
        fontSize: 8,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        listening: false,
      }),
    );
    ctx.chartLayer.add(
      new Konva.Text({
        x: legendX + legendW + 4,
        y: legendY + legendH - 10,
        text: minVal.toPrecision(2),
        fontSize: 8,
        fontFamily: "Arial, sans-serif",
        fill: "#374151",
        listening: false,
      }),
    );
  }

  return { zones, boxSelectEnabled: false, zoomEnabled: true, panEnabled: true };
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandleHeatmap(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  const xField = data.xField ?? "column";
  const yField = data.yField ?? "row";
  const valueField = data.valueField ?? "value";

  const colSet = new Set<string>();
  const rowSet = new Set<string>();
  let numericCount = 0;

  for (const r of rows) {
    const col = String(r[xField] ?? "");
    const row = String(r[yField] ?? "");
    const val = Number(r[valueField]);
    if (col) colSet.add(col);
    if (row) rowSet.add(row);
    if (Number.isFinite(val)) numericCount++;
  }

  const nCols = colSet.size;
  const nRows = rowSet.size;

  if (nCols < 2 || nRows < 2) return { suitable: false, score: 0, reason: "Insufficient row/column cardinality" };
  if (numericCount < nCols * nRows * 0.5) return { suitable: false, score: 0.1, reason: "Too many missing values" };
  if (nCols * nRows === numericCount && nCols > 1 && nRows > 1) return { suitable: true, score: 0.95 };

  return { suitable: true, score: 0.7 };
}

// ─── Registration ────────────────────────────────────────────────────

const HEATMAP_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "Column field (matrix columns)", autoDetect: { types: ["string"] } },
  { field: "yField", role: "y", required: true, description: "Row field (matrix rows)", autoDetect: { types: ["string"] } },
  { field: "valueField", role: "value", required: true, description: "Expression/heat value", autoDetect: { types: ["number"] } },
];

registerChartType({
  type: "heatmap",
  family: "genomics",
  displayName: "Heatmap",
  description: "Visualize matrix data as a grid of colored cells (blue-white-red)",
  icon: "Grid3X3",
  requiredFields: HEATMAP_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: false,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderHeatmap,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailHeatmap(ctx, w, h),
  canHandle: canHandleHeatmap,
});
