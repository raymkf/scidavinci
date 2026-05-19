import { Download, ImageIcon, MousePointer2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { DataKey } from "recharts/types/util/types";

import { InteractiveChart } from "@/components/InteractiveChart";
import { Button } from "@/components/ui/button";
import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { JOURNAL_CHART_STYLE, JOURNAL_COLORS, journalColor } from "@/lib/chart-style";
import type { ChartConfig, VisualAnchor } from "@/lib/chart-types";
import { cn } from "@/lib/utils";

export function VisualWorkspacePanel() {
  const exportTargetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const {
    assets,
    activeAsset,
    anchors,
    activeAssetId,
    openAsset,
    removeAsset,
    updateAssetAspectRatio,
    getAssetAspectRatio,
    addImageAnchor,
  } = useVisualWorkspace();
  const { elementStyles } = useChartSelection();

  const activeAnchors = useMemo(
    () => anchors.filter((item) => item.assetId === activeAsset?.id),
    [activeAsset?.id, anchors],
  );
  const activeAspectRatio = activeAsset ? (getAssetAspectRatio(activeAsset.id) ?? "4:3") : "4:3";

  if (assets.length === 0 || !activeAsset) return null;

  const exportActiveAsset = async () => {
    if (!activeAsset || exporting) return;
    setExporting(true);
    try {
      const filename = `${safeFilename(activeAsset.title)}.png`;
      if (activeAsset.kind === "image" && activeAsset.url) {
        await exportImageWithAnchors(
          activeAsset.url,
          activeAsset.title,
          activeAnchors,
          filename,
        );
        return;
      }

      if (activeAsset.kind === "chart" && activeAsset.chartConfig) {
        await exportChartConfigToPng(
          activeAsset.id,
          activeAsset.chartConfig,
          elementStyles,
          filename,
        );
        return;
      }

      const svg = exportTargetRef.current?.querySelector("svg");
      if (svg) {
        await exportSvgToPng(svg, filename);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <aside
      className={cn(
        "hidden h-full w-[21rem] shrink-0 border-l border-border/70 bg-background lg:flex",
        "flex-col overflow-hidden",
      )}
      aria-label="Visual workspace"
    >
      <div className="flex h-11 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">Visual workspace</span>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {assets.length}
        </span>
      </div>

      <div className="border-b border-border/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-medium text-foreground/90">
            {activeAsset.title}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={exportActiveAsset}
              disabled={exporting}
              className="h-7 w-7 rounded-full"
              aria-label="Export current visual"
              title="Export current visual"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => removeAsset(activeAsset.id)}
              className="h-7 w-7 rounded-full"
              aria-label="Remove visual"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mb-2 flex items-center gap-1 rounded-md bg-muted/45 p-1">
          {["1:1", "4:3", "16:9"].map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => updateAssetAspectRatio(activeAsset.id, ratio)}
              className={cn(
                "h-6 rounded px-2 text-[11px] font-medium transition-colors",
                activeAspectRatio === ratio
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ratio}
            </button>
          ))}
        </div>

        <div
          ref={exportTargetRef}
          className="relative overflow-hidden rounded-md border border-border/70 bg-muted/30"
          style={{ aspectRatio: ratioCss(activeAspectRatio), minHeight: "15rem" }}
        >
          {activeAsset.kind === "image" && activeAsset.url ? (
            <button
              type="button"
              className="relative block h-full w-full cursor-crosshair"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const xPct = ((event.clientX - rect.left) / rect.width) * 100;
                const yPct = ((event.clientY - rect.top) / rect.height) * 100;
                addImageAnchor(activeAsset.id, xPct, yPct);
              }}
              aria-label="Add image anchor"
            >
              <img
                src={activeAsset.url}
                alt={activeAsset.title}
                draggable={false}
                className="h-full w-full object-contain"
              />
              {activeAnchors.map((anchor, index) => (
                <span
                  key={anchor.id}
                  className={cn(
                    "absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center",
                    "rounded-full border border-white bg-primary text-[11px] font-semibold text-primary-foreground",
                    "shadow-[0_4px_16px_rgba(0,0,0,0.25)]",
                  )}
                  style={{
                    left: `${anchor.xPct ?? 50}%`,
                    top: `${anchor.yPct ?? 50}%`,
                  }}
                >
                  {index + 1}
                </span>
              ))}
            </button>
          ) : null}

          {activeAsset.kind === "chart" && activeAsset.chartConfig ? (
            <div className="bg-card p-2">
              <InteractiveChart
                config={activeAsset.chartConfig}
                assetId={activeAsset.id}
                sourceMessageId={activeAsset.sourceMessageId}
                registerInWorkspace={false}
                className="my-0 border-0 p-0"
              />
            </div>
          ) : null}
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MousePointer2 className="h-3 w-3" aria-hidden />
          点击图片位置生成锚点；点击图表元素生成精确数据标签。
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        <div className="grid grid-cols-2 gap-2.5">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => openAsset(asset.id)}
              title={asset.title}
              className={cn(
                "group relative overflow-hidden rounded-md border bg-muted/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                activeAssetId === asset.id
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border/70 hover:border-foreground/25",
              )}
              style={{ aspectRatio: ratioCss(getAssetAspectRatio(asset.id) ?? "4:3") }}
            >
              {asset.kind === "image" && asset.url ? (
                <img
                  src={asset.url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : asset.kind === "chart" && asset.chartConfig ? (
                <ChartThumbnail
                  assetId={asset.id}
                  config={asset.chartConfig}
                  elementStyles={elementStyles}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-[11px] font-medium text-muted-foreground">
                  Chart
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-0.5 text-[10px] text-foreground/80">
                {asset.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ChartThumbnail({
  assetId,
  config,
  elementStyles,
}: {
  assetId: string;
  config: ChartConfig;
  elementStyles: Map<string, { color?: string; stroke?: string; strokeWidth?: number }>;
}) {
  const data = config.data as Record<string, unknown>[];

  if (config.type === "volcano") {
    return <VolcanoThumbnail config={config} />;
  }

  if (config.type === "box") {
    return <BoxThumbnail config={config} />;
  }

  if (config.type === "pie") {
    const nameKey = config.nameField ?? "name";
    const valueKey = config.valueField ?? "value";
    return (
      <div className="h-full w-full bg-card px-1 pb-5 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey as DataKey<unknown>}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              outerRadius="72%"
              innerRadius="0%"
              isAnimationActive={false}
              stroke="hsl(var(--background))"
              strokeWidth={1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`${entry[nameKey] ?? "slice"}-${index}`}
                  fill={
                    elementColor(
                      elementStyles,
                      assetId,
                      String(entry[nameKey] ?? ""),
                      String(entry[nameKey] ?? ""),
                      config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
                    )
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const xKey = config.xField ?? "name";

  if (config.type === "line") {
    return (
      <div className="h-full w-full bg-card px-1 pb-5 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey={xKey} hide />
            <YAxis hide />
            {fields.map((field, index) => (
              <Line
                key={field}
                type="monotone"
                dataKey={field}
                dot={false}
                isAnimationActive={false}
                stroke={seriesColor(
                  elementStyles,
                  assetId,
                  field,
                  data,
                  xKey,
                  config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
                )}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === "area") {
    return (
      <div className="h-full w-full bg-card px-1 pb-5 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey={xKey} hide />
            <YAxis hide />
            {fields.map((field, index) => {
              const color = seriesColor(
                elementStyles,
                assetId,
                field,
                data,
                xKey,
                config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
              );
              return (
                <Area
                  key={field}
                  type="monotone"
                  dataKey={field}
                  isAnimationActive={false}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.24}
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-card px-1 pb-5 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey={xKey} hide />
          <YAxis hide />
          {fields.map((field, index) => (
            <Bar
              key={field}
              dataKey={field}
              isAnimationActive={false}
              fill={config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length]}
              radius={[1, 1, 0, 0]}
            >
              {data.map((entry, entryIndex) => (
                <Cell
                  key={`${field}-${entryIndex}`}
                  fill={elementColor(
                    elementStyles,
                    assetId,
                    field,
                    String(entry[xKey] ?? ""),
                    config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
                  )}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VolcanoThumbnail({ config }: { config: ChartConfig }) {
  const data = (config.data as Record<string, unknown>[]).slice(0, 900);
  const xField = config.xValueField ?? config.xField ?? "log2FoldChange";
  const yField = config.yValueField ?? config.yField ?? "negLog10P";
  const pField = config.pValueField ?? "pValue";
  const points = data.map((row) => {
    const x = Number(row[xField] ?? 0) || 0;
    const y = row[yField] !== undefined
      ? Number(row[yField])
      : -Math.log10(Math.max(Number(row[pField] ?? 1) || 1, Number.MIN_VALUE));
    return { x, y: Number.isFinite(y) ? y : 0 };
  });
  const maxAbsX = Math.max(...points.map((p) => Math.abs(p.x)), 1);
  const maxY = Math.max(...points.map((p) => p.y), 1);
  return (
    <svg viewBox="0 0 100 75" className="h-full w-full bg-card">
      <line x1="8" x2="96" y1="66" y2="66" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1" />
      <line x1="50" x2="50" y1="8" y2="66" stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 2" />
      {points.map((point, index) => {
        const x = 8 + ((point.x + maxAbsX) / (maxAbsX * 2)) * 88;
        const y = 66 - (point.y / maxY) * 56;
        const sig = Math.abs(point.x) >= (config.xThreshold ?? 1) && point.y >= (config.yThreshold ?? 1.3);
        return <circle key={index} cx={x} cy={y} r="1.1" fill={sig ? (point.x > 0 ? journalColor(1) : journalColor(0)) : "#9CA3AF"} opacity="0.75" />;
      })}
    </svg>
  );
}

function BoxThumbnail({ config }: { config: ChartConfig }) {
  const data = (config.data as Record<string, unknown>[]).slice(0, 8);
  const minField = config.minField ?? "min";
  const q1Field = config.q1Field ?? "q1";
  const medField = config.medianField ?? "median";
  const q3Field = config.q3Field ?? "q3";
  const maxField = config.maxField ?? "max";
  const values = data.flatMap((row) => [minField, q1Field, medField, q3Field, maxField].map((field) => Number(row[field] ?? 0) || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const yFor = (value: number) => 66 - ((value - min) / Math.max(1, max - min)) * 56;
  return (
    <svg viewBox="0 0 100 75" className="h-full w-full bg-card">
      <line x1="8" x2="96" y1="66" y2="66" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1" />
      {data.map((row, index) => {
        const cx = 12 + ((index + 0.5) / data.length) * 80;
        const w = Math.min(10, 44 / data.length);
        return (
          <g key={index}>
            <line x1={cx} x2={cx} y1={yFor(Number(row[maxField] ?? 0))} y2={yFor(Number(row[minField] ?? 0))} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1" />
            <rect x={cx - w / 2} y={yFor(Number(row[q3Field] ?? 0))} width={w} height={Math.max(1, yFor(Number(row[q1Field] ?? 0)) - yFor(Number(row[q3Field] ?? 0)))} fill={config.colors?.[index] ?? journalColor(index)} opacity="0.7" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="0.8" />
            <line x1={cx - w / 2} x2={cx + w / 2} y1={yFor(Number(row[medField] ?? 0))} y2={yFor(Number(row[medField] ?? 0))} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1.2" />
          </g>
        );
      })}
    </svg>
  );
}

const DEFAULT_THUMB_COLORS = [
  ...JOURNAL_COLORS,
];

function elementId(chartId: string, series: string, category: string | number): string {
  return `${chartId}_${series}_${category}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function elementColor(
  styles: Map<string, { color?: string }>,
  chartId: string,
  series: string,
  category: string | number,
  fallback: string,
): string {
  return styles.get(elementId(chartId, series, category))?.color ?? fallback;
}

function seriesColor(
  styles: Map<string, { color?: string }>,
  chartId: string,
  series: string,
  data: Record<string, unknown>[],
  xKey: string,
  fallback: string,
): string {
  for (const entry of data) {
    const color = styles.get(elementId(chartId, series, String(entry[xKey] ?? "")))?.color;
    if (color) return color;
  }
  return fallback;
}

function safeFilename(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "visual-export";
}

function ratioCss(value: string | number): string {
  if (typeof value === "number") return String(value);
  const [w, h] = value.split(":").map(Number);
  if (w > 0 && h > 0) return `${w} / ${h}`;
  return "4 / 3";
}

function ratioNumber(value: string | number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return 4 / 3;
  const [w, h] = value.split(":").map(Number);
  if (w > 0 && h > 0) return w / h;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 4 / 3;
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function exportImageWithAnchors(
  url: string,
  title: string,
  anchors: VisualAnchor[],
  filename: string,
): Promise<void> {
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || img.width || 1200;
    const height = img.naturalHeight || img.height || 800;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    drawAnchors(ctx, anchors, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 1),
    );
    if (!blob) throw new Error("PNG export failed");
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    triggerDownload(url, `${safeFilename(title)}-original`);
  }
}

function drawAnchors(
  ctx: CanvasRenderingContext2D,
  anchors: VisualAnchor[],
  width: number,
  height: number,
): void {
  anchors.forEach((anchor, index) => {
    if (typeof anchor.xPct !== "number" || typeof anchor.yPct !== "number") {
      return;
    }
    const x = (anchor.xPct / 100) * width;
    const y = (anchor.yPct / 100) * height;
    const r = Math.max(12, Math.min(width, height) * 0.018);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.max(12, r * 0.9)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), x, y + r * 0.03);
  });
}

async function exportSvgToPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || 960));
  const height = Math.max(1, Math.round(rect.height || 540));
  const clone = inlineSvgForExport(svg);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#ffffff");
  clone.insertBefore(background, clone.firstChild);

  const svgText = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgText], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 1),
    );
    if (!blob) throw new Error("PNG export failed");
    const pngUrl = URL.createObjectURL(blob);
    triggerDownload(pngUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function inlineSvgForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sourceElements = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];

  sourceElements.forEach((source, index) => {
    const target = cloneElements[index];
    if (!target) return;
    const computed = window.getComputedStyle(source);
    const sourceFill = source.getAttribute("fill");
    const sourceStroke = source.getAttribute("stroke");
    const tag = target.tagName.toLowerCase();

    target.removeAttribute("class");
    target.removeAttribute("style");

    target.setAttribute("font-family", computed.fontFamily || "sans-serif");
    target.setAttribute("font-size", computed.fontSize || "12px");
    target.setAttribute("font-weight", computed.fontWeight || "400");
    target.setAttribute("opacity", computed.opacity || "1");

    if (tag === "text" || (sourceFill && sourceFill !== "none")) {
      const fill = exportColor(computed.fill, sourceFill);
      if (fill) target.setAttribute("fill", fill);
    }

    if (sourceStroke && sourceStroke !== "none") {
      const stroke = exportColor(computed.stroke, sourceStroke);
      if (stroke) target.setAttribute("stroke", stroke);
    }

    const strokeWidth = computed.strokeWidth;
    if (strokeWidth && strokeWidth !== "0px") {
      target.setAttribute("stroke-width", strokeWidth);
    }

    const fillOpacity = computed.fillOpacity;
    if (fillOpacity && fillOpacity !== "1") {
      target.setAttribute("fill-opacity", fillOpacity);
    }

    const strokeOpacity = computed.strokeOpacity;
    if (strokeOpacity && strokeOpacity !== "1") {
      target.setAttribute("stroke-opacity", strokeOpacity);
    }
  });

  return clone;
}

function exportColor(computed: string, original: string | null): string | null {
  if (computed && computed !== "none" && !computed.includes("var(")) {
    return computed;
  }
  if (original && original !== "none" && !original.includes("var(")) {
    return original;
  }
  return null;
}

async function exportChartConfigToPng(
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, { color?: string; stroke?: string; strokeWidth?: number }>,
  filename: string,
): Promise<void> {
  const canvas = document.createElement("canvas");
  const aspect = ratioNumber(config.aspectRatio ?? "4:3");
  canvas.width = 1600;
  canvas.height = Math.round(canvas.width / aspect);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = JOURNAL_CHART_STYLE.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.font = `700 34px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  if (config.title) {
    ctx.fillText(config.title, 72, 44);
  }

  if (config.type === "pie") {
    drawPieExport(ctx, assetId, config, elementStyles);
  } else if (config.type === "volcano") {
    drawVolcanoExport(ctx, assetId, config, elementStyles);
  } else if (config.type === "box") {
    drawBoxExport(ctx, assetId, config, elementStyles);
  } else {
    drawCartesianExport(ctx, assetId, config, elementStyles);
  }

  if (config.caption || config.description) {
    ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
    ctx.font = `22px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.fillText(config.caption ?? config.description ?? "", 72, canvas.height - 70);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 1),
  );
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawCartesianExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, { color?: string }>,
): void {
  const data = config.data as Record<string, unknown>[];
  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const xKey = config.xField ?? "name";
  if (data.length === 0 || fields.length === 0) return;

  const plot = { x: 120, y: 150, w: 1340, h: Math.max(360, ctx.canvas.height - 320) };
  const values = data.flatMap((row) => fields.map((field) => Number(row[field] ?? 0) || 0));
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const span = Math.max(1, maxValue - minValue);
  const yFor = (value: number) => plot.y + ((maxValue - value) / span) * plot.h;

  ctx.strokeStyle = JOURNAL_CHART_STYLE.gridColor;
  ctx.lineWidth = 1;
  ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
  ctx.font = `18px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const value = minValue + (span * i) / 5;
    const y = yFor(value);
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillText(formatExportNumber(value), plot.x - 14, y);
  }

  ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();

  if (config.yLabel || config.unit) {
    ctx.save();
    ctx.translate(34, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
    ctx.font = `24px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.yLabel ?? `Value (${config.unit})`, 0, 0);
    ctx.restore();
  }

  if (config.xLabel || config.xField) {
    ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
    ctx.font = `24px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(config.xLabel ?? config.xField ?? "", plot.x + plot.w / 2, plot.y + plot.h + 58);
  }

  if (config.type === "bar") {
    const groupW = plot.w / data.length;
    const barGap = Math.max(6, groupW * 0.08);
    const barW = Math.max(8, (groupW - barGap * 2) / fields.length);
    const barCenters = new Map<string, { x: number; y: number; value: number }>();
    data.forEach((row, rowIndex) => {
      fields.forEach((field, fieldIndex) => {
        const category = String(row[xKey] ?? "");
        const value = Number(row[field] ?? 0) || 0;
        const x = plot.x + rowIndex * groupW + barGap + fieldIndex * barW;
        const y = yFor(value);
        const baseline = yFor(0);
        const w = barW * 0.82;
        ctx.fillStyle = elementColor(
          elementStyles,
          assetId,
          field,
          category,
          config.colors?.[fieldIndex] ?? DEFAULT_THUMB_COLORS[fieldIndex % DEFAULT_THUMB_COLORS.length],
        );
        ctx.fillRect(x, Math.min(y, baseline), w, Math.abs(baseline - y));
        barCenters.set(`${field}@@${category}`, { x: x + w / 2, y, value });
        const error = errorValue(config, row, field);
        if (error !== null) {
          drawErrorBar(ctx, x + w / 2, yFor(value + error), yFor(value - error));
        }
      });
    });
    drawSignificanceExport(ctx, config, barCenters, plot.y);
  } else {
    fields.forEach((field, fieldIndex) => {
      const baseColor = seriesColor(
        elementStyles,
        assetId,
        field,
        data,
        xKey,
        config.colors?.[fieldIndex] ?? DEFAULT_THUMB_COLORS[fieldIndex % DEFAULT_THUMB_COLORS.length],
      );
      const points = data.map((row, rowIndex) => {
        const x = plot.x + (data.length <= 1 ? plot.w / 2 : (rowIndex / (data.length - 1)) * plot.w);
        const y = yFor(Number(row[field] ?? 0) || 0);
        return { x, y };
      });

      if (config.type === "area" && points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, yFor(0));
        points.forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.lineTo(points[points.length - 1].x, yFor(0));
        ctx.closePath();
        ctx.fillStyle = hexToRgba(baseColor, 0.22);
        ctx.fill();
      }

      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      points.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();
      });

      points.forEach((point, pointIndex) => {
        const row = data[pointIndex];
        const value = Number(row[field] ?? 0) || 0;
        const error = errorValue(config, row, field);
        if (error !== null) {
          drawErrorBar(ctx, point.x, yFor(value + error), yFor(value - error));
        }
      });
    });
  }

  ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
  ctx.font = `19px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  data.forEach((row, rowIndex) => {
    const groupW = plot.w / data.length;
    const x = plot.x + rowIndex * groupW + groupW / 2;
    ctx.fillText(String(row[xKey] ?? ""), x, plot.y + plot.h + 18);
  });

  drawLegend(ctx, fields, config.colors, plot.x, 870);
}

function drawPieExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, { color?: string }>,
): void {
  const data = config.data as Record<string, unknown>[];
  const nameKey = config.nameField ?? "name";
  const valueKey = config.valueField ?? "value";
  const total = data.reduce((sum, row) => sum + Math.max(0, Number(row[valueKey] ?? 0) || 0), 0);
  if (total <= 0) return;

  const cx = 740;
  const cy = 520;
  const r = 300;
  let start = -Math.PI / 2;

  data.forEach((row, index) => {
    const name = String(row[nameKey] ?? "");
    const value = Math.max(0, Number(row[valueKey] ?? 0) || 0);
    const end = start + (value / total) * Math.PI * 2;
    const color = elementColor(
      elementStyles,
      assetId,
      name,
      name,
      config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
    );
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();
    start = end;
  });

  drawLegend(
    ctx,
    data.map((row) => String(row[nameKey] ?? "")),
    data.map((row, index) =>
      elementColor(
        elementStyles,
        assetId,
        String(row[nameKey] ?? ""),
        String(row[nameKey] ?? ""),
        config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
      ),
    ),
    1120,
    280,
  );
}

function drawVolcanoExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, { color?: string }>,
): void {
  const data = config.data as Record<string, unknown>[];
  const xField = config.xValueField ?? config.xField ?? "log2FoldChange";
  const yField = config.yValueField ?? config.yField ?? "negLog10P";
  const pField = config.pValueField ?? "pValue";
  const labelField = config.labelField ?? config.idField ?? "gene";
  const groupField = config.groupField;
  const points = data.map((row, index) => {
    const x = Number(row[xField] ?? 0) || 0;
    const yRaw = row[yField] !== undefined
      ? Number(row[yField])
      : -Math.log10(Math.max(Number(row[pField] ?? 1) || 1, Number.MIN_VALUE));
    return { row, index, x, y: Number.isFinite(yRaw) ? yRaw : 0 };
  });
  const plot = { x: 130, y: 150, w: 1290, h: Math.max(360, ctx.canvas.height - 320) };
  const xThreshold = config.xThreshold ?? 1;
  const yThreshold = config.yThreshold ?? -Math.log10(0.05);
  const maxAbsX = Math.max(...points.map((p) => Math.abs(p.x)), Math.abs(xThreshold), 1);
  const maxY = Math.max(...points.map((p) => p.y), yThreshold, 1);
  const xToPx = (x: number) => plot.x + ((x + maxAbsX) / (maxAbsX * 2)) * plot.w;
  const yToPx = (y: number) => plot.y + plot.h - (y / maxY) * plot.h;

  drawExportAxes(ctx, plot, config.xLabel ?? "log2 fold change", config.yLabel ?? "-log10(p-value)");
  ctx.strokeStyle = "#9CA3AF";
  ctx.setLineDash([8, 8]);
  [-xThreshold, xThreshold].forEach((x) => {
    const px = xToPx(x);
    ctx.beginPath();
    ctx.moveTo(px, plot.y);
    ctx.lineTo(px, plot.y + plot.h);
    ctx.stroke();
  });
  const py = yToPx(yThreshold);
  ctx.beginPath();
  ctx.moveTo(plot.x, py);
  ctx.lineTo(plot.x + plot.w, py);
  ctx.stroke();
  ctx.setLineDash([]);

  points.forEach(({ row, index, x, y }) => {
    const label = String(row[labelField] ?? row.id ?? `Point ${index + 1}`);
    const group = groupField ? String(row[groupField] ?? "") : "";
    const series = group || (Math.abs(x) >= xThreshold && y >= yThreshold ? (x > 0 ? "up" : "down") : "not significant");
    const id = `${assetId}_${series}_${label}`.replace(/[^a-zA-Z0-9_]/g, "_");
    const color = elementStyles.get(id)?.color ?? (series === "up" ? journalColor(1) : series === "down" ? journalColor(0) : "#9CA3AF");
    ctx.fillStyle = color;
    ctx.globalAlpha = series === "not significant" ? 0.45 : 0.82;
    ctx.beginPath();
    ctx.arc(xToPx(x), yToPx(y), 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawBoxExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, { color?: string }>,
): void {
  const data = config.data as Record<string, unknown>[];
  const xKey = config.xField ?? "group";
  const minField = config.minField ?? "min";
  const q1Field = config.q1Field ?? "q1";
  const medField = config.medianField ?? "median";
  const q3Field = config.q3Field ?? "q3";
  const maxField = config.maxField ?? "max";
  const values = data.flatMap((row) => [minField, q1Field, medField, q3Field, maxField].map((field) => Number(row[field] ?? 0) || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const plot = { x: 130, y: 150, w: 1290, h: Math.max(360, ctx.canvas.height - 320) };
  const yFor = (value: number) => plot.y + ((max - value) / Math.max(1, max - min)) * plot.h;
  drawExportAxes(ctx, plot, config.xLabel ?? config.xField ?? "", config.yLabel ?? (config.unit ? `Value (${config.unit})` : ""));

  data.forEach((row, index) => {
    const category = String(row[xKey] ?? `Group ${index + 1}`);
    const id = `${assetId}_box_${category}`.replace(/[^a-zA-Z0-9_]/g, "_");
    const color = elementStyles.get(id)?.color ?? config.colors?.[index] ?? journalColor(index);
    const cx = plot.x + ((index + 0.5) / data.length) * plot.w;
    const boxW = Math.min(110, (plot.w / data.length) * 0.48);
    const yMin = yFor(Number(row[minField] ?? 0));
    const yQ1 = yFor(Number(row[q1Field] ?? 0));
    const yMed = yFor(Number(row[medField] ?? 0));
    const yQ3 = yFor(Number(row[q3Field] ?? 0));
    const yMax = yFor(Number(row[maxField] ?? 0));
    ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, yMax);
    ctx.lineTo(cx, yMin);
    ctx.moveTo(cx - boxW * 0.28, yMax);
    ctx.lineTo(cx + boxW * 0.28, yMax);
    ctx.moveTo(cx - boxW * 0.28, yMin);
    ctx.lineTo(cx + boxW * 0.28, yMin);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(color, 0.62);
    ctx.fillRect(cx - boxW / 2, yQ3, boxW, Math.max(1, yQ1 - yQ3));
    ctx.strokeRect(cx - boxW / 2, yQ3, boxW, Math.max(1, yQ1 - yQ3));
    ctx.beginPath();
    ctx.moveTo(cx - boxW / 2, yMed);
    ctx.lineTo(cx + boxW / 2, yMed);
    ctx.stroke();
    ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
    ctx.font = `20px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText(category, cx, plot.y + plot.h + 32);
  });
}

function drawExportAxes(
  ctx: CanvasRenderingContext2D,
  plot: { x: number; y: number; w: number; h: number },
  xLabel: string,
  yLabel: string,
): void {
  ctx.strokeStyle = JOURNAL_CHART_STYLE.gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i += 1) {
    const y = plot.y + (plot.h * i) / 5;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();
  ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.font = `24px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "center";
  ctx.fillText(xLabel, plot.x + plot.w / 2, plot.y + plot.h + 68);
  ctx.save();
  ctx.translate(44, plot.y + plot.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  labels: string[],
  colors: string[] | undefined,
  x: number,
  y: number,
): void {
  ctx.font = `22px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  labels.forEach((label, index) => {
    const itemX = x + (index % 4) * 300;
    const itemY = y + Math.floor(index / 4) * 34;
    ctx.fillStyle = colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length];
    ctx.fillRect(itemX, itemY - 8, 18, 18);
    ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
    ctx.fillText(label, itemX + 28, itemY + 1);
  });
}

function errorField(config: ChartConfig, series: string): string | null {
  const explicit = config.errorBars?.find((item) => item.series === series)?.field;
  if (explicit) return explicit;
  const candidates = [
    `${series}_sem`,
    `${series}_se`,
    `${series}_sd`,
    `${series}_ci`,
    `${series}Error`,
    `${series}_error`,
  ];
  return candidates.find((field) =>
    (config.data as Record<string, unknown>[]).some((row) => row[field] !== undefined),
  ) ?? null;
}

function errorValue(
  config: ChartConfig,
  row: Record<string, unknown>,
  series: string,
): number | null {
  const field = errorField(config, series);
  if (!field) return null;
  const value = Number(row[field]);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function drawErrorBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  yBottom: number,
): void {
  ctx.save();
  ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x, yBottom);
  ctx.moveTo(x - 9, yTop);
  ctx.lineTo(x + 9, yTop);
  ctx.moveTo(x - 9, yBottom);
  ctx.lineTo(x + 9, yBottom);
  ctx.stroke();
  ctx.restore();
}

function drawSignificanceExport(
  ctx: CanvasRenderingContext2D,
  config: ChartConfig,
  centers: Map<string, { x: number; y: number; value: number }>,
  plotTop: number,
): void {
  if (!config.significance?.length) return;
  ctx.save();
  ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.lineWidth = 2;
  ctx.font = `700 22px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  config.significance.forEach((item, index) => {
    const from = centers.get(`${item.from.series}@@${item.from.category}`);
    const to = centers.get(`${item.to.series}@@${item.to.category}`);
    if (!from || !to) return;
    const y = Math.max(plotTop + 18, Math.min(from.y, to.y) - 38 - index * 32);
    const tick = 14;
    ctx.beginPath();
    ctx.moveTo(from.x, y + tick);
    ctx.lineTo(from.x, y);
    ctx.lineTo(to.x, y);
    ctx.lineTo(to.x, y + tick);
    ctx.stroke();
    ctx.fillText(item.label, (from.x + to.x) / 2, y - 4);
  });

  ctx.restore();
}

function formatExportNumber(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function hexToRgba(color: string, alpha: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  const full = hex.length === 3
    ? hex.split("").map((char) => `${char}${char}`).join("")
    : hex;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return color;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
