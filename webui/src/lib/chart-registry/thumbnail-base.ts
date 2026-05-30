/**
 * Off-screen thumbnail renderer for chart types.
 * Each chart type registers a thumbnailRenderer that draws a simplified
 * miniature version of the chart on a 2D canvas context.
 *
 * Thumbnails are used in: PlotSelectionPanel, ChartTypeBrowser,
 * VisualWorkspacePanel, PlanCard.
 *
 * Dimensions: 120x90px (4:3 aspect)
 */

export const THUMBNAIL_SIZE = { width: 120, height: 90 };

const THUMBNAIL_BG = "#F9FAFB";
const THUMBNAIL_PLOT = "#FFFFFF";
const THUMBNAIL_AXIS = "#D1D5DB";
const THUMBNAIL_INK = "#374151";

export function createThumbnailCanvas(
  width = THUMBNAIL_SIZE.width,
  height = THUMBNAIL_SIZE.height,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width * 2; // retina
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  return { canvas, ctx };
}

export function drawThumbnailBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Outer background
  ctx.fillStyle = THUMBNAIL_BG;
  ctx.fillRect(0, 0, w, h);

  // Inner plot area
  const margin = 12;
  ctx.fillStyle = THUMBNAIL_PLOT;
  ctx.fillRect(margin, margin, w - margin * 2, h - margin * 2);

  // Axis lines
  ctx.strokeStyle = THUMBNAIL_AXIS;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  // Y axis
  ctx.moveTo(margin, margin);
  ctx.lineTo(margin, h - margin);
  // X axis
  ctx.moveTo(margin, h - margin);
  ctx.lineTo(w - margin, h - margin);
  ctx.stroke();
}

export function drawThumbnailBar(
  ctx: CanvasRenderingContext2D,
  values: number[],
  w = THUMBNAIL_SIZE.width,
  h = THUMBNAIL_SIZE.height,
): void {
  drawThumbnailBackground(ctx, w, h);
  const margin = 14;
  const plotW = w - margin * 2;
  const plotH = h - margin * 2;
  const maxVal = Math.max(...values, 1);
  const barW = Math.max(2, (plotW / values.length) * 0.6);
  const gap = plotW / values.length;

  for (let i = 0; i < values.length; i++) {
    const barH = (values[i]! / maxVal) * plotH * 0.85;
    const x = margin + i * gap + (gap - barW) / 2;
    const y = h - margin - barH;
    ctx.fillStyle = i % 2 === 0 ? "#0072B2" : "#D55E00";
    ctx.fillRect(x, y, barW, barH);
  }
}

export function drawThumbnailLine(
  ctx: CanvasRenderingContext2D,
  series: number[][],
  w = THUMBNAIL_SIZE.width,
  h = THUMBNAIL_SIZE.height,
): void {
  drawThumbnailBackground(ctx, w, h);
  const margin = 14;
  const plotW = w - margin * 2;
  const plotH = h - margin * 2;
  const colors = ["#0072B2", "#D55E00"];

  for (let s = 0; s < series.length; s++) {
    const data = series[s]!;
    if (data.length < 2) continue;
    const maxVal = Math.max(...data, 1);
    const stepX = plotW / (data.length - 1);

    ctx.strokeStyle = colors[s % colors.length]!;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = margin + i * stepX;
      const y = h - margin - (data[i]! / maxVal) * plotH * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dots
    ctx.fillStyle = colors[s % colors.length]!;
    for (let i = 0; i < data.length; i++) {
      const x = margin + i * stepX;
      const y = h - margin - (data[i]! / maxVal) * plotH * 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawThumbnailPie(
  ctx: CanvasRenderingContext2D,
  values: number[],
  w = THUMBNAIL_SIZE.width,
  h = THUMBNAIL_SIZE.height,
): void {
  ctx.fillStyle = THUMBNAIL_BG;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 10;
  const total = values.reduce((a, b) => a + b, 0);
  const colors = ["#0072B2", "#D55E00", "#009E73", "#CC79A7"];

  let angle = -Math.PI / 2;
  for (let i = 0; i < values.length; i++) {
    const sliceAngle = (values[i]! / total) * Math.PI * 2;
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sliceAngle);
    ctx.closePath();
    ctx.fill();
    angle += sliceAngle;
  }
}

export function drawThumbnailScatter(
  ctx: CanvasRenderingContext2D,
  pointCount: number,
  w = THUMBNAIL_SIZE.width,
  h = THUMBNAIL_SIZE.height,
): void {
  drawThumbnailBackground(ctx, w, h);
  const margin = 14;
  const plotW = w - margin * 2;
  const plotH = h - margin * 2;

  ctx.fillStyle = THUMBNAIL_INK;
  for (let i = 0; i < Math.min(pointCount, 30); i++) {
    const x = margin + Math.random() * plotW;
    const y = margin + Math.random() * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawThumbnailHeatmap(
  ctx: CanvasRenderingContext2D,
  w = THUMBNAIL_SIZE.width,
  h = THUMBNAIL_SIZE.height,
): void {
  ctx.fillStyle = THUMBNAIL_BG;
  ctx.fillRect(0, 0, w, h);

  const margin = 10;
  const cols = 6;
  const rows = 5;
  const cellW = (w - margin * 2) / cols;
  const cellH = (h - margin * 2) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const intensity = 0.2 + Math.random() * 0.7;
      const v = Math.floor(intensity * 255);
      ctx.fillStyle = `rgb(${v},${Math.floor(v*0.5)},${Math.floor(255-v*0.5)})`;
      ctx.fillRect(margin + c * cellW + 1, margin + r * cellH + 1, cellW - 2, cellH - 2);
    }
  }
}

export function drawThumbnailViolin(
  ctx: CanvasRenderingContext2D,
  w = THUMBNAIL_SIZE.width,
  h = THUMBNAIL_SIZE.height,
): void {
  drawThumbnailBackground(ctx, w, h);
  const margin = 14;
  const plotW = w - margin * 2;
  const plotH = h - margin * 2;
  const colors = ["#0072B2", "#D55E00", "#009E73"];

  for (let i = 0; i < 3; i++) {
    const cx = margin + plotW * (0.2 + i * 0.3);
    const cy = margin + plotH / 2;
    const maxR = plotH * 0.35;
    const points: { x: number; y: number }[] = [];

    for (let t = -1; t <= 1; t += 0.1) {
      const r = maxR * (1 - t * t) * (0.6 + 0.4 * Math.random());
      const x = cx + r * (i === 1 ? 0.7 : i === 2 ? 0.5 : 0.6);
      const y = cy + t * maxR;
      points.push({ x, y });
    }

    ctx.fillStyle = colors[i]!;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let p = 0; p < points.length; p++) {
      if (p === 0) ctx.moveTo(points[p]!.x, points[p]!.y);
      else ctx.lineTo(points[p]!.x, points[p]!.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Median line
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.stroke();
  }
}
