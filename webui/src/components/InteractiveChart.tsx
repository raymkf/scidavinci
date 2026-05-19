import { useCallback, useEffect, useId, useMemo, useRef } from "react";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ErrorBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Label,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DataKey } from "recharts/types/util/types";

import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { chartElementId, resolveElementColor } from "@/lib/chart-element-styles";
import { normalizeChartConfig } from "@/lib/chart-normalize";
import { JOURNAL_CHART_STYLE, journalColor } from "@/lib/chart-style";
import type { ChartConfig, ChartElementMetadata } from "@/lib/chart-types";
import { cn } from "@/lib/utils";

interface InteractiveChartProps {
  config: ChartConfig;
  className?: string;
  assetId?: string;
  sourceMessageId?: string;
  registerInWorkspace?: boolean;
}

function buildMetadata(
  config: ChartConfig,
  chartId: string,
  series: string,
  category: string | number,
  value: number,
  sourceRow?: Record<string, unknown>,
): ChartElementMetadata {
  return {
    elementId: chartElementId(chartId, series, category),
    chartType: config.type,
    series,
    category,
    value,
    unit: config.unit,
    sourceRow,
    label: `${category} ${series}: ${value}${config.unit ?? ""}`,
  };
}

function errorBarField(config: ChartConfig, series: string): string | null {
  const explicit = config.errorBars?.find((item) => item.series === series)?.field;
  if (explicit) return explicit;
  const data = config.data as Record<string, unknown>[];
  const candidates = [
    `${series}_sem`,
    `${series}_se`,
    `${series}_sd`,
    `${series}_ci`,
    `${series}Error`,
    `${series}_error`,
  ];
  return candidates.find((field) => data.some((row) => row[field] !== undefined)) ?? null;
}

function significanceLabel(item: NonNullable<ChartConfig["significance"]>[number]): string {
  const left = `${item.from.category} ${item.from.series}`;
  const right = `${item.to.category} ${item.to.series}`;
  const p = item.pValue ? `, p=${item.pValue}` : "";
  return `${left} vs ${right}: ${item.label}${p}`;
}

function aspectNumber(value?: string | number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const [w, h] = value.split(":").map(Number);
    if (w > 0 && h > 0) return w / h;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 4 / 3;
}

export function InteractiveChart({
  config,
  className,
  assetId,
  sourceMessageId,
  registerInWorkspace = true,
}: InteractiveChartProps) {
  const generatedChartId = useId();
  const chartId = assetId ?? `chart-${generatedChartId}`;
  const { toggleElement, selectedElements, elementStyles } = useChartSelection();
  const { registerAsset, getAssetAspectRatio } = useVisualWorkspace();
  const configKey = useMemo(() => JSON.stringify(config), [config]);
  const resolvedAspectRatio = getAssetAspectRatio(chartId) ?? config.aspectRatio ?? "4:3";
  const aspect = aspectNumber(resolvedAspectRatio);

  useEffect(() => {
    if (!registerInWorkspace) return;
    const parsedConfig = JSON.parse(configKey) as ChartConfig;
    registerAsset({
      id: chartId,
      kind: "chart",
      title: parsedConfig.title ?? "Interactive chart",
      sourceMessageId,
      createdAt: Date.now(),
      chartConfig: parsedConfig,
    });
  }, [chartId, configKey, registerAsset, registerInWorkspace, sourceMessageId]);

  const isSelected = useCallback(
    (elementId: string) => selectedElements.some((e) => e.elementId === elementId),
    [selectedElements],
  );

  // Resolve the display color for a given element: apply style overrides,
  // dim non-selected elements when any element is selected.
  const resolveColor = useCallback(
    (elementId: string, defaultColor: string) => {
      const style = elementStyles.get(elementId);
      if (style?.color) return style.color;
      if (selectedElements.length > 0 && !isSelected(elementId)) {
        return `${defaultColor}66`;
      }
      return defaultColor;
    },
    [elementStyles, selectedElements, isSelected],
  );

  const resolveStroke = useCallback(
    (elementId: string, defaultColor?: string) => {
      if (!isSelected(elementId)) return undefined;
      return elementStyles.get(elementId)?.stroke ?? defaultColor ?? JOURNAL_CHART_STYLE.selectedStroke;
    },
    [isSelected, elementStyles],
  );

  const axisProps = {
    tick: {
      fill: JOURNAL_CHART_STYLE.mutedText,
      fontSize: 12,
      fontFamily: JOURNAL_CHART_STYLE.fontFamily,
    },
    axisLine: { stroke: JOURNAL_CHART_STYLE.axisColor, strokeWidth: 1.2 },
    tickLine: { stroke: JOURNAL_CHART_STYLE.axisColor },
  };

  const xLabel = config.xLabel ?? config.xField;
  const yLabel = config.yLabel ?? (config.unit ? `Value (${config.unit})` : undefined);

  const tooltipProps = {
    contentStyle: {
      backgroundColor: JOURNAL_CHART_STYLE.background,
      border: `1px solid ${JOURNAL_CHART_STYLE.tooltipBorder}`,
      borderRadius: 4,
      boxShadow: "0 8px 22px rgba(15, 23, 42, 0.10)",
      fontFamily: JOURNAL_CHART_STYLE.fontFamily,
      fontSize: 12,
    },
    labelStyle: {
      color: JOURNAL_CHART_STYLE.axisColor,
      fontWeight: 700,
    },
  };

  const legendProps = {
    iconType: "rect" as const,
    wrapperStyle: {
      color: JOURNAL_CHART_STYLE.mutedText,
      fontFamily: JOURNAL_CHART_STYLE.fontFamily,
      fontSize: 12,
      paddingTop: 8,
    },
  };

  const resolveStrokeWidth = useCallback(
    (elementId: string) => {
      if (!isSelected(elementId)) return undefined;
      return elementStyles.get(elementId)?.strokeWidth ?? 3;
    },
    [isSelected, elementStyles],
  );

  const renderBarChart = () => {
    const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
    const xKey = config.xField ?? "name";
    const data = config.data as Record<string, unknown>[];

    return (
      <ResponsiveContainer width="100%" aspect={aspect}>
        <BarChart data={data} margin={{ top: 10, right: 18, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" />
          <XAxis dataKey={xKey} {...axisProps}>
            {xLabel ? (
              <Label
                value={xLabel}
                position="insideBottom"
                offset={-4}
                fill={JOURNAL_CHART_STYLE.axisColor}
                fontSize={12}
                fontFamily={JOURNAL_CHART_STYLE.fontFamily}
              />
            ) : null}
          </XAxis>
          <YAxis {...axisProps}>
            {yLabel ? (
              <Label
                value={yLabel}
                angle={-90}
                position="insideLeft"
                offset={0}
                fill={JOURNAL_CHART_STYLE.axisColor}
                fontSize={12}
                fontFamily={JOURNAL_CHART_STYLE.fontFamily}
              />
            ) : null}
          </YAxis>
          <RechartsTooltip {...tooltipProps} />
          <Legend {...legendProps} />
          {fields.map((field, fi) => {
            const color = config.colors?.[fi] ?? journalColor(fi);
            const errField = errorBarField(config, field);
            return (
              <Bar
                key={field}
                dataKey={field}
                name={field}
                cursor="pointer"
                isAnimationActive={false}
                radius={[2, 2, 0, 0]}
                onClick={(barData) => {
                  const payload = barData?.payload as Record<string, unknown> | undefined;
                  if (!payload) return;
                  const val = payload[field];
                  const meta = buildMetadata(
                    config, chartId,
                    field,
                    String(payload[xKey] ?? ""),
                    typeof val === "number" ? val : Number(val) || 0,
                    payload,
                  );
                  toggleElement(meta);
                }}
              >
                {data.map((entry, i) => {
                  const val = entry[field];
                  const numericVal = typeof val === "number" ? val : Number(val) || 0;
                  const cat = String(entry[xKey] ?? "");
                  const elemid = buildMetadata(config, chartId, field, cat, numericVal).elementId;
                  const configuredColor = resolveElementColor(
                    config,
                    elementStyles,
                    chartId,
                    field,
                    cat,
                    color,
                    entry,
                  );
                  return (
                    <Cell
                      key={i}
                      fill={resolveColor(elemid, configuredColor)}
                      stroke={resolveStroke(elemid) ?? "none"}
                      strokeWidth={resolveStrokeWidth(elemid) ?? 0}
                      style={{ transition: "fill 0.2s, stroke 0.2s" }}
                    />
                  );
                })}
                {errField ? (
                  <ErrorBar
                    dataKey={errField}
                    width={5}
                    stroke={JOURNAL_CHART_STYLE.axisColor}
                    strokeWidth={1.3}
                  />
                ) : null}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderLineChart = () => {
    const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
    return (
      <ResponsiveContainer width="100%" aspect={aspect}>
        <LineChart data={config.data as Record<string, unknown>[]} margin={{ top: 10, right: 18, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" />
          <XAxis dataKey={config.xField ?? "name"} {...axisProps}>
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </XAxis>
          <YAxis {...axisProps}>
            {yLabel ? <Label value={yLabel} angle={-90} position="insideLeft" offset={0} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </YAxis>
          <RechartsTooltip {...tooltipProps} />
          <Legend {...legendProps} />
          {fields.map((field, i) => {
            const color = config.colors?.[i] ?? journalColor(i);
            const errField = errorBarField(config, field);
            return (
              <Line
                key={field}
                type="monotone"
                dataKey={field}
                name={field}
                stroke={color}
                strokeWidth={2.4}
                activeDot={{ r: 6, cursor: "pointer" }}
                dot={{ r: 3.8, cursor: "pointer", strokeWidth: 1.4, fill: JOURNAL_CHART_STYLE.background }}
                cursor="pointer"
                onClick={(pointData) => {
                  if (!pointData) return;
                  const payload = pointData as unknown as Record<string, unknown>;
                  const value = payload[field] as number ?? 0;
                  const cat = String(payload[config.xField ?? "name"] ?? "");
                  const meta = buildMetadata(config, chartId, field, cat, Number(value));
                  toggleElement(meta);
                }}
              >
                {errField ? (
                  <ErrorBar dataKey={errField} width={5} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.2} />
                ) : null}
              </Line>
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderPieChart = () => {
    const nameKey = config.nameField ?? "name";
    const valueKey = config.valueField ?? "value";
    const data = config.data as Record<string, unknown>[];

    return (
      <ResponsiveContainer width="100%" aspect={aspect}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey as DataKey<unknown>}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius={112}
            cursor="pointer"
            label={({ name, value }: { name?: string; value?: number }) =>
              `${name ?? ""}: ${value ?? 0}${config.unit ?? ""}`
            }
            onClick={(pointData) => {
              if (!pointData) return;
              const payload = pointData as unknown as Record<string, unknown>;
              const name = String(payload[nameKey] ?? "");
              const value = Number(payload[valueKey] ?? 0);
              const meta = buildMetadata(config, chartId, name, name, value);
              toggleElement(meta);
            }}
          >
            {data.map((entry, i) => {
              const name = String(entry[nameKey] ?? "");
              const value = typeof entry[valueKey] === "number"
                ? (entry[valueKey] as number)
                : Number(entry[valueKey]) || 0;
              const elemid = buildMetadata(config, chartId, name, name, value).elementId;
              const color = config.colors?.[i] ?? journalColor(i);
              return (
                <Cell
                  key={name}
                  fill={resolveColor(elemid, color)}
                  stroke={resolveStroke(elemid) ?? JOURNAL_CHART_STYLE.background}
                  strokeWidth={resolveStrokeWidth(elemid) ?? 1}
                  style={{ transition: "fill 0.2s, stroke 0.2s" }}
                />
              );
            })}
          </Pie>
          <RechartsTooltip {...tooltipProps} />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  const renderAreaChart = () => {
    const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
    return (
      <ResponsiveContainer width="100%" aspect={aspect}>
        <AreaChart data={config.data as Record<string, unknown>[]} margin={{ top: 10, right: 18, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" />
          <XAxis dataKey={config.xField ?? "name"} {...axisProps}>
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </XAxis>
          <YAxis {...axisProps}>
            {yLabel ? <Label value={yLabel} angle={-90} position="insideLeft" offset={0} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </YAxis>
          <RechartsTooltip {...tooltipProps} />
          <Legend {...legendProps} />
          {fields.map((field, i) => {
            const color = config.colors?.[i] ?? journalColor(i);
            return (
              <Area
                key={field}
                type="monotone"
                dataKey={field}
                name={field}
                stroke={color}
                strokeWidth={2.2}
                fill={color}
                fillOpacity={0.16}
                cursor="pointer"
                onClick={(pointData) => {
                  if (!pointData) return;
                  const payload = pointData as unknown as Record<string, unknown>;
                  const value = payload[field] as number ?? 0;
                  const cat = String(payload[config.xField ?? "name"] ?? "");
                  const meta = buildMetadata(config, chartId, field, cat, Number(value));
                  toggleElement(meta);
                }}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const chartContent = (() => {
    switch (config.type) {
      case "line":
        return renderLineChart();
      case "pie":
        return renderPieChart();
      case "area":
        return renderAreaChart();
      case "volcano":
        return <VolcanoCanvas config={config} chartId={chartId} />;
      case "box":
        return <BoxPlotSvg config={config} chartId={chartId} aspect={aspect} />;
      case "bar":
      default:
        return renderBarChart();
    }
  })();

  return (
    <div
      className={cn(
        "my-4 rounded-md border border-border/60 bg-card p-4",
        className,
      )}
    >
      {config.title ? (
        <h4 className="mb-3 text-sm font-semibold text-foreground/90">
          {config.title}
        </h4>
      ) : null}
      {chartContent}
      {config.significance?.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {config.significance.map((item, index) => (
            <span key={`${item.from.series}-${item.to.series}-${index}`}>
              {significanceLabel(item)}
            </span>
          ))}
        </div>
      ) : null}
      {config.caption || config.description ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground/85">
          {config.caption ?? config.description}
        </p>
      ) : null}
    </div>
  );
}

function VolcanoCanvas({ config, chartId }: { config: ChartConfig; chartId: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Array<{ x: number; y: number; r: number; meta: ChartElementMetadata }>>([]);
  const { toggleElement, selectedElements, elementStyles } = useChartSelection();
  const aspect = aspectNumber(config.aspectRatio ?? "4:3");
  const xField = config.xValueField ?? config.xField ?? "log2FoldChange";
  const yField = config.yValueField ?? config.yField ?? "negLog10P";
  const pField = config.pValueField ?? "pValue";
  const labelField = config.labelField ?? config.idField ?? "gene";
  const groupField = config.groupField;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width);
      const height = Math.max(240, width / aspect);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = JOURNAL_CHART_STYLE.background;
      ctx.fillRect(0, 0, width, height);

      const data = config.data as Record<string, unknown>[];
      const rows = data.map((row, index) => {
        const x = Number(row[xField] ?? 0) || 0;
        const yRaw = row[yField] !== undefined
          ? Number(row[yField])
          : -Math.log10(Math.max(Number(row[pField] ?? 1) || 1, Number.MIN_VALUE));
        return { row, index, x, y: Number.isFinite(yRaw) ? yRaw : 0 };
      });
      const maxAbsX = Math.max(...rows.map((p) => Math.abs(p.x)), Math.abs(config.xThreshold ?? 1), 1);
      const maxY = Math.max(...rows.map((p) => p.y), config.yThreshold ?? 1.3, 1);
      const plot = { x: 54, y: 18, w: width - 76, h: height - 76 };
      const xToPx = (x: number) => plot.x + ((x + maxAbsX) / (maxAbsX * 2)) * plot.w;
      const yToPx = (y: number) => plot.y + plot.h - (y / maxY) * plot.h;

      ctx.strokeStyle = JOURNAL_CHART_STYLE.gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = plot.y + (plot.h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.w, y);
        ctx.stroke();
      }

      ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y);
      ctx.lineTo(plot.x, plot.y + plot.h);
      ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
      ctx.stroke();

      const xThreshold = config.xThreshold ?? 1;
      const yThreshold = config.yThreshold ?? -Math.log10(0.05);
      ctx.strokeStyle = "#9CA3AF";
      ctx.setLineDash([4, 4]);
      [-xThreshold, xThreshold].forEach((x) => {
        const px = xToPx(x);
        ctx.beginPath();
        ctx.moveTo(px, plot.y);
        ctx.lineTo(px, plot.y + plot.h);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(plot.x, yToPx(yThreshold));
      ctx.lineTo(plot.x + plot.w, yToPx(yThreshold));
      ctx.stroke();
      ctx.setLineDash([]);

      const selected = new Set(selectedElements.map((item) => item.elementId));
      const hitPoints: typeof pointsRef.current = [];
      rows.forEach(({ row, index, x, y }) => {
        const label = String(row[labelField] ?? row.id ?? `Point ${index + 1}`);
        const group = groupField ? String(row[groupField] ?? "") : "";
        const series = group || (Math.abs(x) >= xThreshold && y >= yThreshold ? (x > 0 ? "up" : "down") : "not significant");
        const meta = {
          elementId: `${chartId}_${series}_${label}`.replace(/[^a-zA-Z0-9_]/g, "_"),
          chartType: "volcano" as const,
          series,
          category: label,
          value: y,
          sourceRow: row,
          label: `${label}: ${xField}=${x.toFixed(2)}, ${yField}=${y.toFixed(2)}`,
        };
        const px = xToPx(x);
        const py = yToPx(y);
        const base = series === "up" ? journalColor(1) : series === "down" ? journalColor(0) : "#9CA3AF";
        const color = elementStyles.get(meta.elementId)?.color ?? base;
        const isSelected = selected.has(meta.elementId);
        ctx.globalAlpha = selected.size > 0 && !isSelected ? 0.28 : 0.82;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, isSelected ? 4.5 : 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = JOURNAL_CHART_STYLE.selectedStroke;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        hitPoints.push({ x: px, y: py, r: 7, meta });
      });
      ctx.globalAlpha = 1;
      pointsRef.current = hitPoints;

      ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
      ctx.font = `12px ${JOURNAL_CHART_STYLE.fontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText(config.xLabel ?? "log2 fold change", plot.x + plot.w / 2, height - 14);
      ctx.save();
      ctx.translate(15, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(config.yLabel ?? "-log10(p-value)", 0, 0);
      ctx.restore();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [aspect, chartId, config, elementStyles, groupField, labelField, pField, selectedElements, toggleElement, xField, yField]);

  return (
    <div ref={wrapRef} className="w-full" style={{ aspectRatio: String(aspect) }}>
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair rounded-sm"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          let best: { d: number; meta: ChartElementMetadata } | null = null;
          for (const point of pointsRef.current) {
            const d = Math.hypot(point.x - x, point.y - y);
            if (d <= point.r && (!best || d < best.d)) best = { d, meta: point.meta };
          }
          if (best) toggleElement(best.meta);
        }}
      />
    </div>
  );
}

function BoxPlotSvg({ config, chartId, aspect }: { config: ChartConfig; chartId: string; aspect: number }) {
  const { toggleElement, selectedElements, elementStyles } = useChartSelection();
  const data = config.data as Record<string, unknown>[];
  const xKey = config.xField ?? "group";
  const minField = config.minField ?? "min";
  const q1Field = config.q1Field ?? "q1";
  const medianField = config.medianField ?? "median";
  const q3Field = config.q3Field ?? "q3";
  const maxField = config.maxField ?? "max";
  const width = 900;
  const height = width / aspect;
  const plot = { x: 70, y: 24, w: width - 100, h: height - 95 };
  const values = data.flatMap((row) => [minField, q1Field, medianField, q3Field, maxField].map((field) => Number(row[field] ?? 0) || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  const yFor = (value: number) => plot.y + ((max - value) / span) * plot.h;
  const selected = new Set(selectedElements.map((item) => item.elementId));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ aspectRatio: String(aspect) }}>
      <rect width={width} height={height} fill={JOURNAL_CHART_STYLE.background} />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = plot.y + (plot.h * i) / 4;
        return <line key={i} x1={plot.x} x2={plot.x + plot.w} y1={y} y2={y} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" />;
      })}
      <path d={`M${plot.x},${plot.y} V${plot.y + plot.h} H${plot.x + plot.w}`} fill="none" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.4} />
      {data.map((row, index) => {
        const category = String(row[xKey] ?? `Group ${index + 1}`);
        const elementId = `${chartId}_box_${category}`.replace(/[^a-zA-Z0-9_]/g, "_");
        const color = elementStyles.get(elementId)?.color ?? config.colors?.[index] ?? journalColor(index);
        const isSelected = selected.has(elementId);
        const cx = plot.x + ((index + 0.5) / data.length) * plot.w;
        const boxW = Math.min(74, (plot.w / data.length) * 0.48);
        const yMin = yFor(Number(row[minField] ?? 0));
        const yQ1 = yFor(Number(row[q1Field] ?? 0));
        const yMed = yFor(Number(row[medianField] ?? 0));
        const yQ3 = yFor(Number(row[q3Field] ?? 0));
        const yMax = yFor(Number(row[maxField] ?? 0));
        const meta: ChartElementMetadata = {
          elementId,
          chartType: "box",
          series: "box",
          category,
          value: Number(row[medianField] ?? 0) || 0,
          sourceRow: row,
          label: `${category}: median ${row[medianField] ?? ""}`,
        };
        return (
          <g key={elementId} role="button" tabIndex={0} className="cursor-pointer" onClick={() => toggleElement(meta)}>
            <line x1={cx} x2={cx} y1={yMax} y2={yMin} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.5} />
            <line x1={cx - boxW * 0.28} x2={cx + boxW * 0.28} y1={yMax} y2={yMax} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.5} />
            <line x1={cx - boxW * 0.28} x2={cx + boxW * 0.28} y1={yMin} y2={yMin} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.5} />
            <rect x={cx - boxW / 2} y={yQ3} width={boxW} height={Math.max(1, yQ1 - yQ3)} fill={color} fillOpacity={isSelected ? 0.9 : 0.64} stroke={isSelected ? JOURNAL_CHART_STYLE.selectedStroke : JOURNAL_CHART_STYLE.axisColor} strokeWidth={isSelected ? 2.4 : 1.4} />
            <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={yMed} y2={yMed} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={2.2} />
            <text x={cx} y={plot.y + plot.h + 20} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.mutedText}>{category}</text>
          </g>
        );
      })}
      <text x={plot.x + plot.w / 2} y={height - 12} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.axisColor}>{config.xLabel ?? config.xField ?? ""}</text>
      <text transform={`translate(16 ${plot.y + plot.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.axisColor}>{config.yLabel ?? (config.unit ? `Value (${config.unit})` : "")}</text>
    </svg>
  );
}

/** Parse chart data from a ``chart-json`` code block string. */
export function parseChartCodeBlock(code: string): ChartConfig | null {
  try {
    const parsed = JSON.parse(code);
    const configVal: Record<string, unknown> = parsed.chart ?? parsed;
    if (!configVal.type || !configVal.data) return null;
    return normalizeChartConfig(configVal as unknown as ChartConfig);
  } catch {
    return null;
  }
}
