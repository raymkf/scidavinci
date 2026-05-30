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
  getElementStyle,
} from "../renderer-base";
import { drawThumbnailScatter } from "../thumbnail-base";

// ─── PCA renderer ────────────────────────────────────────────────────

function renderPCA(
  ctx: ChartRenderContext,
  data: ChartData,
  config: RenderConfig,
): OverlayConfig {
  const layout = computePlotLayout(ctx, config);
  const rows = data.rows;
  const xField = data.xField ?? "PC1";
  const yField = data.yField ?? "PC2";
  const groupField = data.groupField;
  const labelField = data.labelField;
  const xVarField = data.xValueField; // variance explained for PC1 (optional)
  const yVarField = data.yValueField; // variance explained for PC2 (optional)

  // Extract numeric data
  const xVals: number[] = [];
  const yVals: number[] = [];
  const groups: (string | undefined)[] = [];
  const labels: (string | undefined)[] = [];

  for (const r of rows) {
    const x = Number(r[xField]);
    const y = Number(r[yField]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xVals.push(x);
      yVals.push(y);
      groups.push(groupField ? String(r[groupField] ?? "N/A") : undefined);
      labels.push(labelField ? String(r[labelField] ?? "") : undefined);
    }
  }

  if (xVals.length === 0) {
    return { zones: [], boxSelectEnabled: false, zoomEnabled: false, panEnabled: false };
  }

  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const xPad = (xMax - xMin) * 0.08 || 1;
  const yPad = (yMax - yMin) * 0.08 || 1;

  const xScale = createLinearScale(
    [xMin - xPad, xMax + xPad],
    [0, layout.plotWidth],
  );
  const yScale = createLinearScale(
    [yMin - yPad, yMax + yPad],
    [layout.plotHeight, 0],
  );

  // Draw background, grid, axes
  drawBackground(ctx.chartLayer, ctx, config);

  const xTicks = computeLinearTicks(xMin - xPad, xMax + xPad, 5);
  const yTicks = computeLinearTicks(yMin - yPad, yMax + yPad, 5);
  drawGrid(ctx.chartLayer, layout, yTicks, config);

  // Build x-axis labels with PCA variance if available
  let xLabel = `PC1`;
  const xVar = rows.find(r => Number.isFinite(Number(r[xVarField ?? ""]))) ? rows[0]?.[xVarField ?? ""] : undefined;
  if (xVar !== undefined && Number.isFinite(Number(xVar))) {
    xLabel = `PC1 (${Number(xVar).toFixed(1)}%)`;
  }

  let yLabel = `PC2`;
  const yVar = rows.find(r => Number.isFinite(Number(r[yVarField ?? ""]))) ? rows[0]?.[yVarField ?? ""] : undefined;
  if (yVar !== undefined && Number.isFinite(Number(yVar))) {
    yLabel = `PC2 (${Number(yVar).toFixed(1)}%)`;
  }

  const xTicksForAxes = xTicks.map(t => ({ value: t.value, label: t.label }));
  const yTicksForAxes = yTicks.map(t => ({ value: t.value, label: t.label }));

  drawAxes(
    ctx.chartLayer,
    layout,
    config,
    (v) => layout.plotX + xScale(Number(v)),
    (v) => yScale(v),
    xTicksForAxes,
    yTicksForAxes,
  );

  // Draw axis labels with variance
  if (config.xLabel ?? true) {
    const xl = new Konva.Text({
      x: layout.plotX + layout.plotWidth / 2,
      y: layout.plotY + layout.plotHeight + 36,
      text: config.xLabel ?? xLabel,
      fontSize: 10,
      fontFamily: "Arial, sans-serif",
      fill: "#374151",
      align: "center",
      listening: false,
    });
    ctx.chartLayer.add(xl);
  }

  if (config.yLabel ?? true) {
    const yl = new Konva.Text({
      x: 14,
      y: layout.plotY + layout.plotHeight / 2,
      text: config.yLabel ?? yLabel,
      fontSize: 10,
      fontFamily: "Arial, sans-serif",
      fill: "#374151",
      rotation: -90,
      align: "center",
      listening: false,
    });
    yl.offsetX(yl.width() / 2);
    yl.offsetY(yl.height() / 2);
    ctx.chartLayer.add(yl);
  }

  if (config.title) {
    drawTitle(ctx.chartLayer, config.title, layout.plotX, layout.titleY, layout.plotWidth, config);
  }
  if (config.caption) {
    drawCaption(ctx.chartLayer, config.caption, layout.plotX, layout.captionY, layout.plotWidth, config);
  }

  // Group colors
  const uniqueGroups = Array.from(new Set(groups.filter((g): g is string => !!g)));
  const groupColorMap = new Map<string, string>();
  uniqueGroups.forEach((g, i) => {
    groupColorMap.set(g, resolveColor(i, config));
  });

  // Draw ellipses around groups (if groups present and enough points)
  const zones: OverlayZone[] = [];

  if (uniqueGroups.length > 0 && uniqueGroups.length < 10) {
    for (const group of uniqueGroups) {
      const gxVals: number[] = [];
      const gyVals: number[] = [];
      for (let i = 0; i < groups.length; i++) {
        if (groups[i] === group) {
          gxVals.push(xVals[i]!);
          gyVals.push(yVals[i]!);
        }
      }
      if (gxVals.length < 3) continue;

      const meanX = gxVals.reduce((a, b) => a + b, 0) / gxVals.length;
      const meanY = gyVals.reduce((a, b) => a + b, 0) / gyVals.length;
      const stdX = Math.sqrt(gxVals.reduce((a, b) => a + (b - meanX) ** 2, 0) / gxVals.length) * 2;
      const stdY = Math.sqrt(gyVals.reduce((a, b) => a + (b - meanY) ** 2, 0) / gyVals.length) * 2;

      const ellipseX = layout.plotX + xScale(meanX);
      const ellipseY = layout.plotY + yScale(meanY);
      const radiusX = xScale(meanX + stdX) - xScale(meanX);
      const radiusY = yScale(meanY - stdY) - yScale(meanY);

      const color = groupColorMap.get(group) ?? resolveColor(0, config);
      const ellipse = new Konva.Ellipse({
        x: ellipseX,
        y: ellipseY,
        radiusX: Math.abs(radiusX),
        radiusY: Math.abs(radiusY),
        fill: color,
        fillOpacity: 0.12,
        stroke: color,
        strokeWidth: 1,
        dash: [4, 3],
        listening: false,
      });
      ctx.chartLayer.add(ellipse);
    }
  }

  // Draw points
  for (let i = 0; i < xVals.length; i++) {
    const px = layout.plotX + xScale(xVals[i]!);
    const py = layout.plotY + yScale(yVals[i]!);
    const group = groups[i];
    const colorKey = group ? groupColorMap.get(group) ?? resolveColor(0, config) : resolveColor(0, config);

    const style = getElementStyle(`pca_${i}`, config, {
      color: colorKey,
      strokeWidth: 0,
      fillOpacity: 0.85,
    });

    const radius = 3.5;
    const point = new Konva.Circle({
      x: px,
      y: py,
      radius,
      fill: style.color,
      fillOpacity: style.fillOpacity,
      stroke: "#FFFFFF",
      strokeWidth: 0.5,
      listening: false,
    });
    ctx.chartLayer.add(point);

    // Label if labelField is provided
    if (labels[i]) {
      ctx.chartLayer.add(
        new Konva.Text({
          x: px + 5,
          y: py - 5,
          text: labels[i]!,
          fontSize: 7,
          fontFamily: "Arial, sans-serif",
          fill: "#374151",
          listening: false,
        }),
      );
    }

    // Overlay zone
    zones.push({
      id: `pca_${i}`,
      x: px - radius - 2,
      y: py - radius - 2,
      width: radius * 2 + 4,
      height: radius * 2 + 4,
      hitTolerance: 4,
      metadata: {
        chartType: "pca",
        series: group ?? "point",
        category: labels[i] ?? `point_${i}`,
        value: { x: xVals[i], y: yVals[i] },
        xField,
        yField,
        groupField,
        group,
      },
      cursor: "pointer",
    });
  }

  return { zones, boxSelectEnabled: true, zoomEnabled: true, panEnabled: false };
}

// ─── Auto-detect ─────────────────────────────────────────────────────

function canHandlePCA(data: ChartData) {
  const rows = data.rows;
  if (rows.length === 0) return { suitable: false, score: 0, reason: "No data rows" };

  // Check for PC1/PC2-like column names
  const cols = Object.keys(rows[0] ?? {});
  const hasPC1 = cols.some((c) => /^PC1$/i.test(c) || c.toLowerCase() === "pc1");
  const hasPC2 = cols.some((c) => /^PC2$/i.test(c) || c.toLowerCase() === "pc2");

  if (hasPC1 && hasPC2) return { suitable: true, score: 0.9 };

  // Check if xField/yField match PC patterns
  const xField = data.xField ?? "";
  const yField = data.yField ?? "";
  if (/PC[12]/i.test(xField) || /PC[12]/i.test(yField)) return { suitable: true, score: 0.85 };

  return { suitable: false, score: 0, reason: "Missing PC1/PC2 fields" };
}

// ─── Registration ────────────────────────────────────────────────────

const PCA_REQUIRED_FIELDS: FieldRequirement[] = [
  { field: "xField", role: "x", required: true, description: "PC1 / x-axis field", autoDetect: { patterns: ["PC1", "pc1"] } },
  { field: "yField", role: "y", required: true, description: "PC2 / y-axis field", autoDetect: { patterns: ["PC2", "pc2"] } },
  { field: "groupField", role: "group", required: false, description: "Group/color field", autoDetect: { types: ["string"] } },
  { field: "labelField", role: "label", required: false, description: "Point label field", autoDetect: { types: ["string"] } },
];

registerChartType({
  type: "pca",
  family: "genomics",
  displayName: "PCA Plot",
  description: "Principal Component Analysis plot with group ellipses and variance labels",
  icon: "ScatterChart",
  requiredFields: PCA_REQUIRED_FIELDS,
  defaultStyle: {
    showGrid: true,
    showLegend: true,
    showTitle: true,
  },
  journalConventions: {},
  renderer: renderPCA,
  thumbnailRenderer: (ctx, w, h) => drawThumbnailScatter(ctx, 18, w, h),
  canHandle: canHandlePCA,
});
