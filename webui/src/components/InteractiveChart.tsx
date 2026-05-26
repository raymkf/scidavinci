import { useCallback, useEffect, useId, useMemo, type CSSProperties } from "react";

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
import {
  chartElementId,
  resolveElementBarWidthScale,
  resolveElementColor,
  resolveElementFillOpacity,
  resolveElementOpacity,
  resolveElementStroke,
  resolveElementStrokeWidth,
  resolveElementVisible,
} from "@/lib/chart-element-styles";
import { applyFigureInteractionOverrides, normalizeChartConfig, normalizeFigureModel } from "@/lib/chart-normalize";
import { JOURNAL_CHART_STYLE, journalColor } from "@/lib/chart-style";
import type { ChartConfig, ChartElementMetadata, FigureObjectRef, FillSpec } from "@/lib/chart-types";
import { cn } from "@/lib/utils";

const CHART_ENTRY_ANIMATION_ACTIVE = false;

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
    unit: displayText(config.unit) ?? config.unit,
    sourceRow,
    label: `${category} ${series}: ${value}${displayText(config.unit) ?? config.unit ?? ""}`,
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

function backgroundStyle(background?: FillSpec): CSSProperties | undefined {
  if (!background) return undefined;
  if (background.transparent) return { backgroundColor: "transparent" };
  const opacity = background.opacity ?? 1;
  const color = background.color ?? JOURNAL_CHART_STYLE.background;
  const base: CSSProperties = {
    backgroundColor: opacity < 1 ? hexToRgba(color, opacity) : color,
  };
  const pattern = background.pattern ?? "none";
  if (pattern === "none") return base;
  const patternColor = hexToRgba(background.patternColor ?? "#E5E7EB", background.patternOpacity ?? 0.8);
  const size = background.patternSize ?? 20;
  if (pattern === "lines") {
    return {
      ...base,
      backgroundImage: `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
    };
  }
  return {
    ...base,
    backgroundImage: [
      `linear-gradient(to right, ${patternColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
    ].join(", "),
    backgroundSize: `${size}px ${size}px`,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const value = Number.parseInt(expanded, 16);
  if (!Number.isFinite(value)) return `rgba(229, 231, 235, ${alpha})`;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function displayText(value: unknown): string | undefined {
  let current = value;
  while (current) {
    if (typeof current === "string") return current;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>).text;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function boxOutlierValuesForRow(
  row: Record<string, unknown>,
  fields: {
    outliersField: string;
    minField: string;
    q1Field: string;
    q3Field: string;
    maxField: string;
  },
): Array<{ value: number; label?: string }> {
  const explicit: Array<{ value: number; label?: string }> = [];
  const raw = row[fields.outliersField];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "number" || typeof item === "string") {
        explicit.push({ value: Number(item) || 0 });
      } else if (item && typeof item === "object") {
        const object = item as Record<string, unknown>;
        explicit.push({
          value: Number(object.value ?? object.y ?? object.outlier ?? 0) || 0,
          label: object.label ? String(object.label) : undefined,
        });
      }
    }
  }
  if (explicit.length > 0) return explicit;

  const q1 = Number(row[fields.q1Field] ?? 0) || 0;
  const q3 = Number(row[fields.q3Field] ?? 0) || 0;
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return [];
  const min = Number(row[fields.minField] ?? 0) || 0;
  const max = Number(row[fields.maxField] ?? 0) || 0;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const inferred: Array<{ value: number; label?: string }> = [];
  if (min < lowerFence) inferred.push({ value: min, label: `low outlier: ${min}` });
  if (max > upperFence) inferred.push({ value: max, label: `high outlier: ${max}` });
  return inferred;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: string | number;
  opacity?: string | number;
  stroke?: string;
  strokeWidth?: string | number;
  payload?: Record<string, unknown>;
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
  const {
    toggleElement,
    selectedElements,
    elementStyles,
    annotations,
    figureOverrides,
    activeFigureObject,
    selectFigureObject,
  } = useChartSelection();
  const { registerAsset, getAssetAspectRatio, openAsset } = useVisualWorkspace();
  const configKey = useMemo(() => JSON.stringify(config), [config]);
  const figure = useMemo(
    () => applyFigureInteractionOverrides(
      config.figure ?? normalizeFigureModel(config),
      figureOverrides,
      annotations,
    ),
    [annotations, config, figureOverrides],
  );
  const resolvedAspectRatio = getAssetAspectRatio(chartId)
    ?? figure.layout?.aspectRatio
    ?? config.aspectRatio
    ?? "4:3";
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

  const handleElementToggle = useCallback(
    (meta: ChartElementMetadata) => {
      toggleElement(meta);
      if (registerInWorkspace) {
        openAsset(chartId);
      }
    },
    [toggleElement, registerInWorkspace, openAsset, chartId],
  );

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
  const selectObject = useCallback((object: FigureObjectRef) => {
    selectFigureObject(object);
  }, [selectFigureObject]);

  const resolveSelectionStroke = useCallback(
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

  const xLabel = figure.axes?.x?.visible === false ? undefined : displayText(figure.axes?.x?.title) ?? displayText(config.xLabel) ?? config.xField;
  const yLabel = figure.axes?.y?.visible === false
    ? undefined
    : displayText(figure.axes?.y?.title) ?? displayText(config.yLabel) ?? (config.unit ? `Value (${displayText(config.unit) ?? config.unit})` : undefined);
  const showGrid = figure.grid?.visible !== false;

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

  const resolveSelectionStrokeWidth = useCallback(
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
          {showGrid ? <CartesianGrid vertical={false} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" /> : null}
          <XAxis dataKey={xKey} hide={figure.axes?.x?.visible === false} {...axisProps}>
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
          <YAxis hide={figure.axes?.y?.visible === false} {...axisProps}>
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
          {figure.legend?.visible === false ? null : <Legend {...legendProps} />}
          {fields.map((field, fi) => {
            const color = config.colors?.[fi] ?? journalColor(fi);
            const errField = errorBarField(config, field);
            const renderShape = (shapeProps: BarShapeProps) => {
              const payload = shapeProps.payload;
              const category = String(payload?.[xKey] ?? "");
              const value = Number(payload?.[field] ?? 0) || 0;
              if (!payload || !resolveElementVisible(config, elementStyles, chartId, field, category, true, payload)) {
                return <g />;
              }
              const width = Number(shapeProps.width ?? 0);
              const height = Number(shapeProps.height ?? 0);
              const x = Number(shapeProps.x ?? 0);
              const y = Number(shapeProps.y ?? 0);
              const scale = resolveElementBarWidthScale(config, elementStyles, chartId, field, category, 1, payload);
              const scaledWidth = width * scale;
              const adjustedX = x + (width - scaledWidth) / 2;
              const meta = buildMetadata(config, chartId, field, category, value, payload);
              return (
                <rect
                  x={adjustedX}
                  y={y}
                  width={scaledWidth}
                  height={height}
                  rx={2}
                  ry={2}
                  fill={shapeProps.fill}
                  fillOpacity={shapeProps.fillOpacity}
                  opacity={shapeProps.opacity}
                  stroke={shapeProps.stroke}
                  strokeWidth={shapeProps.strokeWidth}
                  className="transition-[fill,stroke,opacity,width,x] duration-200"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleElementToggle(meta);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleElement(meta);
                    }
                  }}
                />
              );
            };
            return (
              <Bar
                key={field}
                dataKey={field}
                name={field}
                cursor="pointer"
                isAnimationActive={false}
                radius={[2, 2, 0, 0]}
                shape={renderShape}
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
                  handleElementToggle(meta);
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
                      fillOpacity={resolveElementFillOpacity(config, elementStyles, chartId, field, cat, 1, entry)}
                      opacity={resolveElementOpacity(config, elementStyles, chartId, field, cat, 1, entry)}
                      stroke={resolveSelectionStroke(elemid) ?? resolveElementStroke(config, elementStyles, chartId, field, cat, entry) ?? "none"}
                      strokeWidth={resolveSelectionStrokeWidth(elemid) ?? resolveElementStrokeWidth(config, elementStyles, chartId, field, cat, entry) ?? 0}
                      style={{ transition: "fill 0.2s, stroke 0.2s, opacity 0.2s" }}
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
          {showGrid ? <CartesianGrid vertical={false} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" /> : null}
          <XAxis dataKey={config.xField ?? "name"} hide={figure.axes?.x?.visible === false} {...axisProps}>
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </XAxis>
          <YAxis hide={figure.axes?.y?.visible === false} {...axisProps}>
            {yLabel ? <Label value={yLabel} angle={-90} position="insideLeft" offset={0} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </YAxis>
          <RechartsTooltip {...tooltipProps} />
          {figure.legend?.visible === false ? null : <Legend {...legendProps} />}
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
                isAnimationActive={CHART_ENTRY_ANIMATION_ACTIVE}
                onClick={(pointData) => {
                  if (!pointData) return;
                  const payload = pointData as unknown as Record<string, unknown>;
                  const value = payload[field] as number ?? 0;
                  const cat = String(payload[config.xField ?? "name"] ?? "");
                  const meta = buildMetadata(config, chartId, field, cat, Number(value), payload);
                  handleElementToggle(meta);
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
            isAnimationActive={false}
            cursor="pointer"
            label={({ name, value }: { name?: string; value?: number }) =>
              `${name ?? ""}: ${value ?? 0}${displayText(config.unit) ?? config.unit ?? ""}`
            }
            onClick={(pointData) => {
              if (!pointData) return;
              const payload = pointData as unknown as Record<string, unknown>;
              const name = String(payload[nameKey] ?? "");
              const value = Number(payload[valueKey] ?? 0);
              const meta = buildMetadata(config, chartId, name, name, value);
              handleElementToggle(meta);
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
                  fillOpacity={resolveElementFillOpacity(config, elementStyles, chartId, name, name, 1, entry)}
                  opacity={resolveElementOpacity(config, elementStyles, chartId, name, name, 1, entry)}
                  stroke={resolveSelectionStroke(elemid) ?? resolveElementStroke(config, elementStyles, chartId, name, name, entry) ?? JOURNAL_CHART_STYLE.background}
                  strokeWidth={resolveSelectionStrokeWidth(elemid) ?? resolveElementStrokeWidth(config, elementStyles, chartId, name, name, entry) ?? 1}
                  style={{ transition: "fill 0.2s, stroke 0.2s, opacity 0.2s" }}
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
          {showGrid ? <CartesianGrid vertical={false} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" /> : null}
          <XAxis dataKey={config.xField ?? "name"} hide={figure.axes?.x?.visible === false} {...axisProps}>
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </XAxis>
          <YAxis hide={figure.axes?.y?.visible === false} {...axisProps}>
            {yLabel ? <Label value={yLabel} angle={-90} position="insideLeft" offset={0} fill={JOURNAL_CHART_STYLE.axisColor} fontSize={12} fontFamily={JOURNAL_CHART_STYLE.fontFamily} /> : null}
          </YAxis>
          <RechartsTooltip {...tooltipProps} />
          {figure.legend?.visible === false ? null : <Legend {...legendProps} />}
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
                isAnimationActive={CHART_ENTRY_ANIMATION_ACTIVE}
                onClick={(pointData) => {
                  if (!pointData) return;
                  const payload = pointData as unknown as Record<string, unknown>;
                  const value = payload[field] as number ?? 0;
                  const cat = String(payload[config.xField ?? "name"] ?? "");
                  const meta = buildMetadata(config, chartId, field, cat, Number(value), payload);
                  handleElementToggle(meta);
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
        return <VolcanoSvgPlot config={config} chartId={chartId} onElementToggle={handleElementToggle} />;
      case "box":
        return <BoxPlotSvg config={config} chartId={chartId} aspect={aspect} onElementToggle={handleElementToggle} />;
      case "bar":
      default:
        return renderBarChart();
    }
  })();
  const titleText = figure.title?.visible === false
    ? undefined
    : displayText(figure.title?.text) ?? displayText(config.title);
  const captionText = figure.caption?.visible === false
    ? undefined
    : displayText(figure.caption?.text) ?? displayText(config.caption) ?? displayText(config.description);
  const bg = figure.layout?.background;
  const canvasBackground = backgroundStyle(bg);

  return (
    <div
      className={cn(
        "my-4 rounded-md border border-border/60 p-4",
        canvasBackground ? "" : "bg-card",
        className,
      )}
      style={canvasBackground}
    >
      {titleText ? (
        <h4
          className={cn(
            "mb-3 cursor-pointer rounded-sm text-sm font-semibold text-foreground/90",
            isActiveFigureObject(activeFigureObject, "title", "title") ? "ring-2 ring-primary/30" : "",
          )}
          onClick={(event) => {
            event.stopPropagation();
            selectObject({ kind: "title", id: "title" });
          }}
        >
          {titleText}
        </h4>
      ) : null}
      <div className="relative rounded-sm">
        {chartContent}
        <FigureHitZones
          activeObject={activeFigureObject}
          showLegend={figure.legend?.visible !== false && config.type !== "pie"}
          onSelect={selectObject}
        />
      </div>
      {figure.annotations?.filter((annotation) => annotation.visible !== false).length ? (
        <div className="mt-2 space-y-1 border-l-2 border-primary/40 pl-2 text-[11px] text-muted-foreground">
          {figure.annotations
            .filter((annotation) => annotation.visible !== false)
            .map((annotation) => (
              <button
                key={annotation.id}
                type="button"
                className={cn(
                  "block w-full rounded-sm text-left hover:text-foreground",
                  isActiveFigureObject(activeFigureObject, "annotation", annotation.id) ? "bg-primary/10 text-foreground" : "",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  selectObject({ kind: "annotation", id: annotation.id });
                }}
              >
                {displayText(annotation.text) ?? annotation.text}
              </button>
            ))}
        </div>
      ) : null}
      {config.significance?.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {config.significance.map((item, index) => (
            <span key={`${item.from.series}-${item.to.series}-${index}`}>
              {significanceLabel(item)}
            </span>
          ))}
        </div>
      ) : null}
      {captionText ? (
        <p
          className={cn(
            "mt-2 cursor-pointer rounded-sm text-xs leading-5 text-muted-foreground/85",
            isActiveFigureObject(activeFigureObject, "caption", "caption") ? "ring-2 ring-primary/30" : "",
          )}
          onClick={(event) => {
            event.stopPropagation();
            selectObject({ kind: "caption", id: "caption" });
          }}
        >
          {captionText}
        </p>
      ) : null}
    </div>
  );
}

function isActiveFigureObject(
  active: FigureObjectRef | null,
  kind: FigureObjectRef["kind"],
  id: string,
): boolean {
  return active?.kind === kind && active.id === id;
}

function FigureHitZones({
  activeObject,
  showLegend,
  onSelect,
}: {
  activeObject: FigureObjectRef | null;
  showLegend: boolean;
  onSelect: (object: FigureObjectRef) => void;
}) {
  const hitClass = (kind: FigureObjectRef["kind"], id: string) =>
    cn(
      "absolute z-10 rounded border px-1.5 py-0.5 text-[10px] font-medium",
      "border-border/70 bg-background/80 text-muted-foreground shadow-sm backdrop-blur",
      "opacity-0 transition-opacity hover:opacity-100 focus:opacity-100",
      isActiveFigureObject(activeObject, kind, id) ? "opacity-100 border-primary bg-primary/10 text-foreground" : "",
    );

  const hit = (object: FigureObjectRef, label: string, className: string) => (
    <button
      key={`${object.kind}:${object.id}`}
      type="button"
      className={cn(hitClass(object.kind, object.id), className)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(object);
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      {hit({ kind: "background", id: "background" }, "背景", "left-1 top-1")}
      {hit({ kind: "axis", id: "axis.y" }, "Y 轴", "left-1 top-1/2 -translate-y-1/2")}
      {hit({ kind: "axis", id: "axis.x" }, "X 轴", "bottom-1 left-1/2 -translate-x-1/2")}
      {hit({ kind: "grid", id: "grid" }, "网格", "right-1 top-1")}
      {showLegend ? hit({ kind: "legend", id: "legend" }, "图例", "bottom-1 right-1") : null}
    </>
  );
}

const VOLCANO_MAX_POINTS = 3000;

function VolcanoSvgPlot({ config, chartId, onElementToggle }: { config: ChartConfig; chartId: string; onElementToggle: (meta: ChartElementMetadata) => void }) {
  const { selectedElements, elementStyles } = useChartSelection();
  const aspect = aspectNumber(config.aspectRatio ?? "4:3");
  const xField = config.xValueField ?? config.xField ?? "log2FoldChange";
  const yField = config.yValueField ?? config.yField ?? "negLog10P";
  const pField = config.pValueField ?? "pValue";
  const labelField = config.labelField ?? config.idField ?? "gene";
  const groupField = config.groupField;

  const { points, xThreshold, yThreshold, maxAbsX, maxY } = useMemo(() => {
    const data = config.data as Record<string, unknown>[];
    const xThreshold = config.xThreshold ?? 1;
    const yThreshold = config.yThreshold ?? -Math.log10(0.05);

    const rows = data.map((row, index) => {
      const x = Number(row[xField] ?? 0) || 0;
      const yRaw = row[yField] !== undefined
        ? Number(row[yField])
        : -Math.log10(Math.max(Number(row[pField] ?? 1) || 1, Number.MIN_VALUE));
      return { row, index, x, y: Number.isFinite(yRaw) ? yRaw : 0 };
    });

    const maxAbsX = Math.max(...rows.map((p) => Math.abs(p.x)), Math.abs(xThreshold), 1);
    const maxY = Math.max(...rows.map((p) => p.y), yThreshold, 1);

    const points = rows.map(({ row, index, x, y }) => {
      const label = String(row[labelField] ?? row.id ?? `Point ${index + 1}`);
      const group = groupField ? String(row[groupField] ?? "") : "";
      const series = group || (Math.abs(x) >= xThreshold && y >= yThreshold ? (x > 0 ? "up" : "down") : "not significant");
      const elementId = chartElementId(chartId, series, label);
      const meta: ChartElementMetadata = {
        elementId,
        chartType: "volcano",
        series,
        category: label,
        value: y,
        sourceRow: row,
        label: `${label}: ${xField}=${x.toFixed(2)}, ${yField}=${y.toFixed(2)}`,
      };
      return { x, y, meta };
    });

    return { points, xThreshold, yThreshold, maxAbsX, maxY };
  }, [chartId, config, groupField, labelField, pField, xField, yField]);

  const tooMany = points.length > VOLCANO_MAX_POINTS;
  const displayPoints = tooMany ? points.slice(0, VOLCANO_MAX_POINTS) : points;

  const width = 900;
  const height = width / aspect;
  const plot = { x: 70, y: 24, w: width - 100, h: height - 95 };

  const xToPx = (x: number) => plot.x + ((x + maxAbsX) / (maxAbsX * 2)) * plot.w;
  const yToPx = (y: number) => plot.y + plot.h - (y / maxY) * plot.h;

  const selectedIds = useMemo(() => new Set(selectedElements.map((e) => e.elementId)), [selectedElements]);
  const hasSelection = selectedElements.length > 0;

  return (
    <div className="w-full" style={{ aspectRatio: String(aspect) }}>
      {tooMany && (
        <div className="mb-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-800 border border-amber-200">
          Too many points ({points.length}). Showing first {VOLCANO_MAX_POINTS}. Consider filtering or downsampling your data.
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="figure">
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = plot.y + (plot.h * i) / 4;
          return <line key={`grid-${i}`} x1={plot.x} x2={plot.x + plot.w} y1={y} y2={y} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" />;
        })}

        {/* Axes */}
        <path d={`M${plot.x},${plot.y} V${plot.y + plot.h} H${plot.x + plot.w}`} fill="none" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.4} />

        {/* Threshold lines */}
        <line x1={xToPx(-xThreshold)} x2={xToPx(-xThreshold)} y1={plot.y} y2={plot.y + plot.h} stroke="#9CA3AF" strokeDasharray="4 4" strokeWidth={1} />
        <line x1={xToPx(xThreshold)} x2={xToPx(xThreshold)} y1={plot.y} y2={plot.y + plot.h} stroke="#9CA3AF" strokeDasharray="4 4" strokeWidth={1} />
        <line x1={plot.x} x2={plot.x + plot.w} y1={yToPx(yThreshold)} y2={yToPx(yThreshold)} stroke="#9CA3AF" strokeDasharray="4 4" strokeWidth={1} />

        {/* Points */}
        {displayPoints.map((point) => {
          const { meta, x, y } = point;
          const px = xToPx(x);
          const py = yToPx(y);
          const isSelected = selectedIds.has(meta.elementId);
          const style = elementStyles.get(meta.elementId);
          const baseColor = meta.series === "up" ? journalColor(1) : meta.series === "down" ? journalColor(0) : "#9CA3AF";
          const color = style?.color ?? baseColor;
          const opacity = hasSelection && !isSelected ? 0.28 : (style?.opacity ?? 0.82);
          const radius = isSelected ? Math.max(4.5, style?.pointSize ?? 0) : (style?.pointSize ?? 2.4);
          const stroke = isSelected ? (style?.stroke ?? JOURNAL_CHART_STYLE.selectedStroke) : (style?.stroke ?? "none");
          const strokeWidth = isSelected ? (style?.strokeWidth ?? 1.4) : (style?.strokeWidth ?? 0);

          if (style?.visible === false) return null;

          return (
            <circle
              key={meta.elementId}
              cx={px}
              cy={py}
              r={radius}
              fill={color}
              opacity={opacity}
              stroke={stroke}
              strokeWidth={strokeWidth}
              className="cursor-pointer transition-[fill,opacity,stroke,r] duration-200"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onElementToggle(meta);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onElementToggle(meta);
                }
              }}
            />
          );
        })}

        {/* Axis labels */}
        <text x={plot.x + plot.w / 2} y={height - 12} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.axisColor} fontFamily={JOURNAL_CHART_STYLE.fontFamily}>
          {displayText(config.xLabel) ?? "log2 fold change"}
        </text>
        <text transform={`translate(16 ${plot.y + plot.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.axisColor} fontFamily={JOURNAL_CHART_STYLE.fontFamily}>
          {displayText(config.yLabel) ?? "-log10(p-value)"}
        </text>
      </svg>
    </div>
  );
}

function BoxPlotSvg({ config, chartId, aspect, onElementToggle }: { config: ChartConfig; chartId: string; aspect: number; onElementToggle: (meta: ChartElementMetadata) => void }) {
  const { selectedElements, elementStyles } = useChartSelection();
  const data = config.data as Record<string, unknown>[];
  const xKey = config.xField ?? "group";
  const minField = config.minField ?? "min";
  const q1Field = config.q1Field ?? "q1";
  const medianField = config.medianField ?? "median";
  const q3Field = config.q3Field ?? "q3";
  const maxField = config.maxField ?? "max";
  const outliersField = config.outliersField ?? "outliers";
  const width = 900;
  const height = width / aspect;
  const plot = { x: 70, y: 24, w: width - 100, h: height - 95 };
  const values = data.flatMap((row) => [
    ...[minField, q1Field, medianField, q3Field, maxField].map((field) => Number(row[field] ?? 0) || 0),
    ...boxOutlierValuesForRow(row, { outliersField, minField, q1Field, q3Field, maxField }).map((item) => item.value),
  ]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  const yFor = (value: number) => plot.y + ((max - value) / span) * plot.h;
  const selected = new Set(selectedElements.map((item) => item.elementId));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ aspectRatio: String(aspect) }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const y = plot.y + (plot.h * i) / 4;
        return <line key={i} x1={plot.x} x2={plot.x + plot.w} y1={y} y2={y} stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 4" />;
      })}
      <path d={`M${plot.x},${plot.y} V${plot.y + plot.h} H${plot.x + plot.w}`} fill="none" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.4} />
      {data.map((row, index) => {
        const category = String(row[xKey] ?? `Group ${index + 1}`);
        const elementId = `${chartId}_box_${category}`.replace(/[^a-zA-Z0-9_]/g, "_");
        const style = elementStyles.get(elementId);
        const color = style?.color ?? config.colors?.[index] ?? journalColor(index);
        const isSelected = selected.has(elementId);
        const cx = plot.x + ((index + 0.5) / data.length) * plot.w;
        const boxW = Math.min(74, (plot.w / data.length) * 0.48);
        const yMin = yFor(Number(row[minField] ?? 0));
        const yQ1 = yFor(Number(row[q1Field] ?? 0));
        const yMed = yFor(Number(row[medianField] ?? 0));
        const yQ3 = yFor(Number(row[q3Field] ?? 0));
        const yMax = yFor(Number(row[maxField] ?? 0));
        const outliers = boxOutlierValuesForRow(row, { outliersField, minField, q1Field, q3Field, maxField });
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
          <g key={elementId} role="button" tabIndex={0} className="cursor-pointer" onClick={() => onElementToggle(meta)}>
            <line x1={cx} x2={cx} y1={yMax} y2={yMin} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.5} />
            <line x1={cx - boxW * 0.28} x2={cx + boxW * 0.28} y1={yMax} y2={yMax} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.5} />
            <line x1={cx - boxW * 0.28} x2={cx + boxW * 0.28} y1={yMin} y2={yMin} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={1.5} />
            <rect
              x={cx - boxW / 2}
              y={yQ3}
              width={boxW}
              height={Math.max(1, yQ1 - yQ3)}
              fill={color}
              fillOpacity={style?.fillOpacity ?? (isSelected ? 0.9 : 0.64)}
              opacity={style?.opacity ?? 1}
              stroke={isSelected ? (style?.stroke ?? JOURNAL_CHART_STYLE.selectedStroke) : (style?.stroke ?? JOURNAL_CHART_STYLE.axisColor)}
              strokeWidth={isSelected ? (style?.strokeWidth ?? 2.4) : (style?.strokeWidth ?? 1.4)}
            />
            <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={yMed} y2={yMed} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth={2.2} />
            {outliers.map((item, outlierIndex) => {
              const value = item.value;
              const outlierId = chartElementId(chartId, "outlier", `${category}_${outlierIndex + 1}`);
              const outlierStyle = elementStyles.get(outlierId);
              const outlierSelected = selected.has(outlierId);
              const outlierMeta: ChartElementMetadata = {
                elementId: outlierId,
                chartType: "box",
                series: "outlier",
                category: `${category}_${outlierIndex + 1}`,
                value,
                sourceRow: row,
                label: item.label ?? `${category} outlier ${outlierIndex + 1}: ${value}${displayText(config.unit) ?? config.unit ?? ""}`,
              };
              return (
                <circle
                  key={outlierId}
                  cx={cx + ((outlierIndex % 3) - 1) * 8}
                  cy={yFor(value)}
                  r={outlierSelected ? 5.2 : 3.8}
                  fill={outlierStyle?.color ?? JOURNAL_CHART_STYLE.background}
                  stroke={outlierSelected ? (outlierStyle?.stroke ?? JOURNAL_CHART_STYLE.selectedStroke) : (outlierStyle?.stroke ?? color)}
                  strokeWidth={outlierSelected ? (outlierStyle?.strokeWidth ?? 2.4) : (outlierStyle?.strokeWidth ?? 1.4)}
                  opacity={outlierStyle?.opacity ?? (selected.size > 0 && !outlierSelected ? 0.32 : 1)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onElementToggle(outlierMeta);
                  }}
                />
              );
            })}
            <text x={cx} y={plot.y + plot.h + 20} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.mutedText}>{category}</text>
          </g>
        );
      })}
      <text x={plot.x + plot.w / 2} y={height - 12} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.axisColor}>{displayText(config.xLabel) ?? config.xField ?? ""}</text>
      <text transform={`translate(16 ${plot.y + plot.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={JOURNAL_CHART_STYLE.axisColor}>{displayText(config.yLabel) ?? (displayText(config.unit) ?? config.unit ? `Value (${displayText(config.unit) ?? config.unit})` : "")}</text>
    </svg>
  );
}

/** Parse chart data from a ``chart-json`` code block string. */
export function parseChartCodeBlock(code: string): ChartConfig | null {
  try {
    const parsed = JSON.parse(code);
    const configVal = canonicalizeChartConfig(parsed.chart ?? parsed);
    if (!configVal.type || !configVal.data) return null;
    return normalizeChartConfig(configVal as unknown as ChartConfig);
  } catch {
    return null;
  }
}

function canonicalizeChartConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const config: Record<string, unknown> = { ...input };

  const rawType = String(config.type ?? config.chartType ?? config.kind ?? "bar").toLowerCase();
  const typeAliases: Record<string, ChartConfig["type"]> = {
    bar: "bar",
    bars: "bar",
    "bar-chart": "bar",
    bar_chart: "bar",
    column: "bar",
    column_chart: "bar",
    line: "line",
    lines: "line",
    line_chart: "line",
    pie: "pie",
    pie_chart: "pie",
    area: "area",
    area_chart: "area",
    volcano: "volcano",
    volcano_plot: "volcano",
    box: "box",
    boxplot: "box",
    box_plot: "box",
  };
  config.type = typeAliases[rawType] ?? "bar";

  const data = firstArray(
    config.data,
    config.values,
    config.rows,
    config.dataset,
    config.table,
  );
  if (data) config.data = data;

  config.xField ??= firstString(config.xField, config.x, config.xAxis, config.x_axis, config.categoryField, config.category);
  config.yField ??= firstString(config.yField, config.y, config.yAxis, config.y_axis, config.valueField, config.value);
  const yFields = firstStringArray(config.yFields, config.y_fields, config.series, config.seriesFields);
  if (yFields) config.yFields = yFields;
  if (!config.yFields && typeof config.yField === "string" && config.type !== "pie") {
    config.yFields = [config.yField];
  }

  if (config.type === "pie") {
    config.nameField ??= firstString(config.nameField, config.labelField, config.categoryField, config.xField, "name");
    config.valueField ??= firstString(config.valueField, config.yField, "value");
  }

  if (Array.isArray(config.data)) {
    inferMissingFields(config);
  }
  return config;
}

function firstArray(...values: unknown[]): Record<string, unknown>[] | null {
  for (const value of values) {
    if (Array.isArray(value) && value.every((item) => item && typeof item === "object")) {
      return value as Record<string, unknown>[];
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstStringArray(...values: unknown[]): string[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim());
      if (items.length > 0) return items;
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return undefined;
}

function inferMissingFields(config: Record<string, unknown>): void {
  const data = config.data as Record<string, unknown>[];
  const firstRow = data[0];
  if (!firstRow) return;
  const keys = Object.keys(firstRow);
  if (keys.length === 0) return;

  const stringKeys = keys.filter((key) => typeof firstRow[key] === "string");
  const numericFields = keys.filter((key) => {
    return data.some((row) => {
      const value = row[key];
      return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
    });
  });

  if (config.type === "pie") {
    if (!config.nameField || !keys.includes(config.nameField as string)) {
      config.nameField = (typeof config.xField === "string" ? config.xField : stringKeys[0]) ?? keys[0];
    }
    if (!config.valueField || !keys.includes(config.valueField as string)) {
      config.valueField = numericFields.find((k) => k !== config.nameField) ?? keys.find((k) => k !== config.nameField) ?? "value";
    }
    return;
  }

  if (config.type === "volcano") {
    // Volcano needs numeric x (fold change), numeric y (-log10p), and string labels.
    // The generic inference would set xField to a string column like "gene", which is wrong.
    if (!config.xField) {
      config.xField = numericFields.find((k) => /fold|log|fc|lfc|ratio/i.test(k)) ?? numericFields[0] ?? keys[0];
    }
    if (!config.pValueField) {
      config.pValueField = keys.find((k) => /pval|p_val|p[._-]?value/i.test(k)) ?? undefined;
    }
    if (!config.labelField && !config.idField) {
      config.labelField = stringKeys[0] ?? keys[0];
    }
    config.yFields = undefined;
    return;
  }

  if (config.type === "box") {
    if (!config.xField) {
      config.xField = stringKeys[0] ?? keys[0];
    }
    // Box plots use min/q1/median/q3/max fields, not yFields.
    config.yFields = undefined;
    return;
  }

  // Bar, line, area: xField is categorical (string), yFields are numeric.
  if (!config.xField) {
    config.xField = stringKeys[0] ?? keys[0];
  }

  const xField = typeof config.xField === "string" ? config.xField : undefined;
  const yNumericFields = numericFields.filter((k) => k !== xField);

  if (!config.yFields && !config.yField && yNumericFields.length > 0) {
    config.yFields = yNumericFields;
  }
}
