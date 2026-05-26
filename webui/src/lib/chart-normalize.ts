import { journalColor } from "@/lib/chart-style";
import type {
  AnnotationSpec,
  ChartConfig,
  ChartElementStyle,
  FigureInteractionOverrides,
  FigureModel,
  MarkSpec,
} from "@/lib/chart-types";

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Repair the common model mistake where a single-series bar chart with
 * differently colored bars is encoded as many one-bar series. Recharts renders
 * that as an ultra-thin grouped chart, so normalize it back to one value field
 * plus per-element colors.
 */
function normalizeSparseOneBarSeries(config: ChartConfig): ChartConfig {
  if (config.type !== "bar") return config;
  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const data = config.data as Record<string, unknown>[];
  if (fields.length < 4 || data.length < 4) return config;

  const hits = data.map((row) => {
    const rowHits = fields
      .map((field, fieldIndex) => ({ field, fieldIndex, value: numericValue(row[field]) }))
      .filter((item): item is { field: string; fieldIndex: number; value: number } => item.value !== null);
    return { row, rowHits };
  });
  const singleHitRows = hits.filter((item) => item.rowHits.length === 1);
  if (singleHitRows.length / data.length < 0.8) return config;

  const usedFields = new Set(singleHitRows.map((item) => item.rowHits[0].field));
  if (usedFields.size / fields.length < 0.8) return config;

  const xKey = config.xField ?? "name";
  const valueField = config.yField && !fields.includes(config.yField) ? config.yField : "value";
  const elementStyles: Record<string, ChartElementStyle> = { ...(config.elementStyles ?? {}) };
  const normalizedData = data.map((row, rowIndex) => {
    const hit = hits[rowIndex].rowHits[0];
    if (!hit) return row;
    const category = String(row[xKey] ?? hit.field);
    const color = config.colors?.[hit.fieldIndex] ?? journalColor(hit.fieldIndex);
    elementStyles[category] = { ...(elementStyles[category] ?? {}), color };
    elementStyles[`${valueField}@@${category}`] = {
      ...(elementStyles[`${valueField}@@${category}`] ?? {}),
      color,
    };
    return {
      ...row,
      [xKey]: row[xKey] ?? hit.field,
      [valueField]: hit.value,
    };
  });

  return {
    ...config,
    data: normalizedData,
    yField: valueField,
    yFields: [valueField],
    colors: config.colors?.length ? [config.colors[0]] : config.colors,
    elementStyles,
  };
}

function toText(value: unknown): string | undefined {
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

export function normalizeChartConfig(config: ChartConfig): ChartConfig {
  const normalized = normalizeSparseOneBarSeries(config);
  return {
    ...normalized,
    figure: normalizeFigureModel(normalized),
  };
}

function chartFields(config: ChartConfig): string[] {
  if (config.type === "pie") return [config.valueField ?? "value"];
  if (config.type === "volcano") {
    return [
      config.xValueField ?? config.xField ?? "log2FoldChange",
      config.yValueField ?? config.yField ?? "negLog10P",
    ];
  }
  if (config.type === "box") {
    return [config.medianField ?? "median"];
  }
  return config.yFields ?? [config.yField].filter(Boolean) as string[];
}

function inferMarkType(config: ChartConfig): MarkSpec["type"] {
  switch (config.type) {
    case "pie":
      return "slice";
    case "line":
      return "line";
    case "area":
      return "area";
    case "volcano":
      return "point";
    case "box":
      return "box";
    case "bar":
    default:
      return "bar";
  }
}

export function normalizeFigureModel(config: ChartConfig): FigureModel {
  const existing = config.figure;
  const markType = inferMarkType(config);
  const fields = chartFields(config);
  const marks: MarkSpec[] = existing?.marks?.length
    ? existing.marks
    : fields.map((field) => ({
        id: `mark.${markType}.${field}`.replace(/[^a-zA-Z0-9_.-]/g, "_"),
        type: markType,
        series: field,
        encoding: {
          x: config.xField ?? config.nameField ?? "name",
          y: field,
        },
      }));

  return {
    ...existing,
    schemaVersion: 2,
    type: config.type,
    data: existing?.datasetRef ? existing.data : config.data,
    datasetRef: existing?.datasetRef,
    layout: {
      aspectRatio: config.aspectRatio ?? existing?.layout?.aspectRatio,
      plotArea: existing?.layout?.plotArea ?? "auto",
      background: {
        color: "#ffffff",
        ...(existing?.layout?.background ?? {}),
      },
      margin: existing?.layout?.margin,
    },
    title: {
      id: "title",
      text: toText(config.title),
      visible: Boolean(config.title),
      position: "top",
      ...(existing?.title ?? {}),
    },
    caption: {
      id: "caption",
      text: toText(config.caption) ?? toText(config.description),
      visible: false,
      position: "bottom",
      ...(existing?.caption ?? {}),
    },
    axes: {
      x: {
        id: "axis.x",
        channel: "x",
        title: toText(config.xLabel) ?? config.xField,
        visible: config.type !== "pie",
        ...(existing?.axes?.x ?? {}),
      },
      y: {
        id: "axis.y",
        channel: "y",
        title: toText(config.yLabel) ?? (config.unit ? `Value (${toText(config.unit) ?? config.unit})` : undefined),
        visible: config.type !== "pie",
        ...(existing?.axes?.y ?? {}),
      },
    },
    scales: {
      x: {
        id: "scale.x",
        channel: "x",
        type: config.type === "bar" || config.type === "box" ? "band" : "linear",
        ...(existing?.scales?.x ?? {}),
      },
      y: {
        id: "scale.y",
        channel: "y",
        type: "linear",
        zero: config.type === "bar" || config.type === "area",
        nice: true,
        ...(existing?.scales?.y ?? {}),
      },
      color: {
        id: "scale.color",
        channel: "color",
        type: "ordinal",
        range: config.colors,
        ...(existing?.scales?.color ?? {}),
      },
      size: existing?.scales?.size,
    },
    grid: {
      id: "grid",
      x: false,
      y: config.type !== "pie",
      visible: config.type !== "pie",
      ...(existing?.grid ?? {}),
    },
    legend: {
      id: "legend",
      visible: config.type !== "volcano",
      position: config.type === "pie" ? "right" : "bottom",
      ...(existing?.legend ?? {}),
    },
    marks,
    annotations: existing?.annotations ?? [],
    selections: existing?.selections ?? [],
    styleOverrides: {
      ...(config.elementStyles ?? {}),
      ...(existing?.styleOverrides ?? {}),
    },
    exportSettings: existing?.exportSettings ?? {
      format: "png",
      width: 1600,
      includeCaption: true,
    },
  };
}

export function applyFigureInteractionOverrides(
  figure: FigureModel,
  overrides: FigureInteractionOverrides,
  annotations: AnnotationSpec[] = [],
): FigureModel {
  return {
    ...figure,
    layout: {
      ...(figure.layout ?? {}),
      ...(overrides.layout ?? {}),
      background: {
        color: "#ffffff",
        ...(figure.layout?.background ?? {}),
        ...(overrides.layout?.background ?? {}),
        ...(overrides.background ?? {}),
      },
      plotArea: overrides.layout?.plotArea ?? figure.layout?.plotArea ?? "auto",
      margin: overrides.layout?.margin ?? figure.layout?.margin,
    },
    axes: {
      ...figure.axes,
      x: figure.axes?.x || overrides.axes?.x
        ? { id: "axis.x", channel: "x", ...(figure.axes?.x ?? {}), ...(overrides.axes?.x ?? {}) }
        : undefined,
      y: figure.axes?.y || overrides.axes?.y
        ? { id: "axis.y", channel: "y", ...(figure.axes?.y ?? {}), ...(overrides.axes?.y ?? {}) }
        : undefined,
    },
    scales: {
      ...figure.scales,
      x: figure.scales?.x || overrides.scales?.x
        ? { id: "scale.x", channel: "x", ...(figure.scales?.x ?? {}), ...(overrides.scales?.x ?? {}) }
        : undefined,
      y: figure.scales?.y || overrides.scales?.y
        ? { id: "scale.y", channel: "y", ...(figure.scales?.y ?? {}), ...(overrides.scales?.y ?? {}) }
        : undefined,
      color: figure.scales?.color || overrides.scales?.color
        ? { id: "scale.color", channel: "color", ...(figure.scales?.color ?? {}), ...(overrides.scales?.color ?? {}) }
        : undefined,
      size: figure.scales?.size || overrides.scales?.size
        ? { id: "scale.size", channel: "size", ...(figure.scales?.size ?? {}), ...(overrides.scales?.size ?? {}) }
        : undefined,
    },
    legend: figure.legend || overrides.legend
      ? { id: "legend", ...(figure.legend ?? {}), ...(overrides.legend ?? {}) }
      : undefined,
    grid: figure.grid || overrides.grid
      ? { id: "grid", ...(figure.grid ?? {}), ...(overrides.grid ?? {}) }
      : undefined,
    title: figure.title || overrides.title
      ? { id: "title", ...(figure.title ?? {}), ...(overrides.title ?? {}) }
      : undefined,
    caption: figure.caption || overrides.caption
      ? { id: "caption", ...(figure.caption ?? {}), ...(overrides.caption ?? {}) }
      : undefined,
    annotations: [...(figure.annotations ?? []), ...annotations],
    exportSettings: {
      ...(figure.exportSettings ?? {}),
      ...(overrides.exportSettings ?? {}),
    },
  };
}
