import Konva from "konva";
import type { ChartRenderContext, RenderConfig, JournalPreset } from "./types";
import { JOURNAL_COLORS, JOURNAL_CHART_STYLE } from "@/lib/chart-style";

// Journal-specific style presets
export const JOURNAL_PRESETS: Record<JournalPreset, {
  fontFamily: string;
  titleSize: number;
  labelSize: number;
  tickSize: number;
  axisColor: string;
  gridColor: string;
  backgroundColor: string;
}> = {
  nature: {
    fontFamily: "Arial, Helvetica, sans-serif",
    titleSize: 12,
    labelSize: 10,
    tickSize: 8,
    axisColor: "#333333",
    gridColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
  },
  science: {
    fontFamily: "Helvetica, Arial, sans-serif",
    titleSize: 11,
    labelSize: 9,
    tickSize: 8,
    axisColor: "#222222",
    gridColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
  },
  cell: {
    fontFamily: "Arial, Helvetica, sans-serif",
    titleSize: 11,
    labelSize: 9,
    tickSize: 7,
    axisColor: "#333333",
    gridColor: "#EEEEEE",
    backgroundColor: "#FFFFFF",
  },
  lancet: {
    fontFamily: "Times New Roman, serif",
    titleSize: 12,
    labelSize: 10,
    tickSize: 8,
    axisColor: "#000000",
    gridColor: "#DDDDDD",
    backgroundColor: "#FFFFFF",
  },
  custom: {
    fontFamily: JOURNAL_CHART_STYLE.fontFamily,
    titleSize: 12,
    labelSize: 10,
    tickSize: 8,
    axisColor: JOURNAL_CHART_STYLE.axisColor,
    gridColor: JOURNAL_CHART_STYLE.gridColor,
    backgroundColor: JOURNAL_CHART_STYLE.background,
  },
};

const PLOT_MARGIN = { top: 10, right: 20, bottom: 50, left: 60 };
const TITLE_HEIGHT = 32;
const CAPTION_HEIGHT = 28;

export interface PlotLayout {
  plotX: number;
  plotY: number;
  plotWidth: number;
  plotHeight: number;
  titleY: number;
  captionY: number;
}

export function computePlotLayout(
  ctx: ChartRenderContext,
  config: RenderConfig,
): PlotLayout {
  const hasTitle = Boolean(config.title ?? config.figure?.title?.text);
  const hasCaption = Boolean(config.caption ?? config.figure?.caption?.text);

  const titleY = PLOT_MARGIN.top;
  const plotY = titleY + (hasTitle ? TITLE_HEIGHT : 0);
  const plotX = PLOT_MARGIN.left;
  const plotWidth = ctx.width - PLOT_MARGIN.left - PLOT_MARGIN.right;
  const plotHeight =
    ctx.height - plotY - (hasCaption ? CAPTION_HEIGHT : 0) - PLOT_MARGIN.bottom;
  const captionY = plotY + plotHeight + 8;

  return { plotX, plotY, plotWidth, plotHeight, titleY, captionY };
}

export function createStage(
  container: HTMLDivElement,
  width: number,
  height: number,
  dpr = Math.min(window.devicePixelRatio || 1, 2),
): Konva.Stage {
  const stage = new Konva.Stage({
    container,
    width,
    height,
  });

  // Scale for retina but keep logical coords consistent
  stage.scale({ x: dpr, y: dpr });
  stage.width(width / dpr);
  stage.height(height / dpr);

  return stage;
}

export function createChartLayer(): Konva.Layer {
  return new Konva.Layer({ name: "chart" });
}

export function createOverlayLayer(): Konva.Layer {
  return new Konva.Layer({ name: "overlay" });
}

export function getJournalStyle(config: RenderConfig) {
  const preset = JOURNAL_PRESETS[config.journal ?? "custom"];
  return preset;
}

export function resolveColor(index: number, config: RenderConfig): string {
  const palette = config.colors?.length ? config.colors : JOURNAL_COLORS;
  return palette[index % palette.length]!;
}

export function drawTitle(
  layer: Konva.Layer,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  config: RenderConfig,
): void {
  const style = getJournalStyle(config);
  const title = new Konva.Text({
    x,
    y,
    text,
    fontSize: style.titleSize,
    fontFamily: style.fontFamily,
    fontStyle: "bold",
    fill: style.axisColor,
    width: maxWidth,
    align: "left",
    listening: false,
  });
  layer.add(title);
}

export function drawCaption(
  layer: Konva.Layer,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  config: RenderConfig,
): void {
  const style = getJournalStyle(config);
  const caption = new Konva.Text({
    x,
    y,
    text,
    fontSize: 9,
    fontFamily: style.fontFamily,
    fill: style.axisColor,
    width: maxWidth,
    align: "left",
    listening: false,
  });
  layer.add(caption);
}

export function drawBackground(
  layer: Konva.Layer,
  ctx: ChartRenderContext,
  config: RenderConfig,
): void {
  const style = getJournalStyle(config);
  const bg = new Konva.Rect({
    x: 0,
    y: 0,
    width: ctx.width / ctx.dpr,
    height: ctx.height / ctx.dpr,
    fill: style.backgroundColor,
    listening: false,
  });
  layer.add(bg);
}

export function drawGrid(
  layer: Konva.Layer,
  layout: PlotLayout,
  yTicks: { value: number; label: string }[],
  config: RenderConfig,
): void {
  if (config.showGrid === false) return;
  const style = getJournalStyle(config);

  for (const tick of yTicks) {
    const y = layout.plotY + layout.plotHeight - tick.value;
    layer.add(
      new Konva.Line({
        points: [layout.plotX, y, layout.plotX + layout.plotWidth, y],
        stroke: style.gridColor,
        strokeWidth: 0.5,
        dash: [3, 3],
        listening: false,
      }),
    );
  }
}

export function drawAxes(
  layer: Konva.Layer,
  layout: PlotLayout,
  config: RenderConfig,
  xScale: (v: number | string) => number,
  yScale: (v: number) => number,
  xTicks: { value: number | string; label: string }[],
  yTicks: { value: number; label: string }[],
): void {
  const style = getJournalStyle(config);

  // X axis line
  layer.add(
    new Konva.Line({
      points: [
        layout.plotX,
        layout.plotY + layout.plotHeight,
        layout.plotX + layout.plotWidth,
        layout.plotY + layout.plotHeight,
      ],
      stroke: style.axisColor,
      strokeWidth: 1,
      listening: false,
    }),
  );

  // Y axis line
  layer.add(
    new Konva.Line({
      points: [layout.plotX, layout.plotY, layout.plotX, layout.plotY + layout.plotHeight],
      stroke: style.axisColor,
      strokeWidth: 1,
      listening: false,
    }),
  );

  // X axis ticks (inward)
  const tickLength = 4;
  for (const tick of xTicks) {
    const x = xScale(tick.value);
    if (x < layout.plotX || x > layout.plotX + layout.plotWidth) continue;
    layer.add(
      new Konva.Line({
        points: [
          x,
          layout.plotY + layout.plotHeight,
          x,
          layout.plotY + layout.plotHeight + tickLength,
        ],
        stroke: style.axisColor,
        strokeWidth: 1,
        listening: false,
      }),
    );
    layer.add(
      new Konva.Text({
        x: x,
        y: layout.plotY + layout.plotHeight + tickLength + 2,
        text: tick.label,
        fontSize: style.tickSize,
        fontFamily: style.fontFamily,
        fill: style.axisColor,
        align: "center",
        width: 80,
        offsetX: 40,
        rotation: tick.label.length > 4 ? -30 : 0,
        listening: false,
      }),
    );
  }

  // Y axis ticks (inward)
  for (const tick of yTicks) {
    const y = layout.plotY + layout.plotHeight - yScale(tick.value);
    layer.add(
      new Konva.Line({
        points: [layout.plotX - tickLength, y, layout.plotX, y],
        stroke: style.axisColor,
        strokeWidth: 1,
        listening: false,
      }),
    );
    layer.add(
      new Konva.Text({
        x: layout.plotX - tickLength - 4,
        y: y,
        text: tick.label,
        fontSize: style.tickSize,
        fontFamily: style.fontFamily,
        fill: style.axisColor,
        align: "right",
        verticalAlign: "middle",
        width: layout.plotX - tickLength - 8,
        offsetX: layout.plotX - tickLength - 8,
        listening: false,
      }),
    );
  }

  // X axis label
  if (config.xLabel) {
    layer.add(
      new Konva.Text({
        x: layout.plotX + layout.plotWidth / 2,
        y: layout.plotY + layout.plotHeight + 36,
        text: config.xLabel,
        fontSize: style.labelSize,
        fontFamily: style.fontFamily,
        fill: style.axisColor,
        align: "center",
        offsetX: 0,
        listening: false,
      }),
    );
  }

  // Y axis label
  if (config.yLabel) {
    const labelText = new Konva.Text({
      x: 14,
      y: layout.plotY + layout.plotHeight / 2,
      text: config.yLabel,
      fontSize: style.labelSize,
      fontFamily: style.fontFamily,
      fill: style.axisColor,
      rotation: -90,
      align: "center",
      listening: false,
    });
    labelText.offsetX(labelText.width() / 2);
    labelText.offsetY(labelText.height() / 2);
    layer.add(labelText);
  }
}

export function computeLinearTicks(
  min: number,
  max: number,
  count = 5,
): { value: number; label: string }[] {
  const range = max - min;
  if (range === 0) return [{ value: min, label: formatNumber(min) }];

  const rawStep = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;

  let step: number;
  if (residual <= 1.5) step = magnitude;
  else if (residual <= 3) step = 2 * magnitude;
  else if (residual <= 7) step = 5 * magnitude;
  else step = 10 * magnitude;

  const start = Math.ceil(min / step) * step;
  const ticks: { value: number; label: string }[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push({ value: v, label: formatNumber(v) });
  }
  return ticks;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) < 0.01 || Math.abs(n) >= 10000) return n.toExponential(1);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function createLinearScale(
  domain: [number, number],
  range: [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const scale = (r1 - r0) / (d1 - d0 || 1);
  return (v: number) => r0 + (v - d0) * scale;
}

export function createBandScale(
  categories: string[],
  range: [number, number],
  padding = 0.2,
): {
  scale: (v: string) => number;
  bandwidth: number;
} {
  const [r0, r1] = range;
  const bandwidth = ((r1 - r0) / categories.length) * (1 - padding);
  const step = (r1 - r0) / categories.length;
  const scale = (v: string) => {
    const i = categories.indexOf(v);
    return r0 + i * step + (step - bandwidth) / 2;
  };
  return { scale, bandwidth };
}

export function getElementStyle(
  key: string,
  config: RenderConfig,
  defaults?: Partial<{ color: string; strokeWidth: number; fillOpacity: number }>,
): Required<NonNullable<typeof defaults>> & { color: string } {
  const style = config.elementStyles?.[key];
  return {
    color: style?.color ?? defaults?.color ?? JOURNAL_COLORS[0]!,
    strokeWidth: style?.strokeWidth ?? defaults?.strokeWidth ?? 0,
    fillOpacity: style?.fillOpacity ?? defaults?.fillOpacity ?? 1,
  };
}
