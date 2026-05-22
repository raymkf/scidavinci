import { chartElementId } from "@/lib/chart-element-styles";
import type {
  ChartAction,
  ChartConfig,
  ChartElementMetadata,
  SelectedChartElement,
  VisualAsset,
} from "@/lib/chart-types";

type SemanticAction = Extract<ChartAction, { type: "select_by_semantic_query" }>;

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function selectedFromMetadata(meta: ChartElementMetadata): SelectedChartElement {
  return {
    elementId: meta.elementId,
    chartType: meta.chartType,
    series: meta.series,
    category: meta.category,
    value: meta.value,
    label: meta.label,
    sourceRow: meta.sourceRow,
  };
}

function metadata(
  config: ChartConfig,
  chartId: string,
  series: string,
  category: string | number,
  value: number,
  sourceRow?: Record<string, unknown>,
  label?: string,
): ChartElementMetadata {
  return {
    elementId: chartElementId(chartId, series, category),
    chartType: config.type,
    series,
    category,
    value,
    unit: config.unit,
    sourceRow,
    label: label ?? `${category} ${series}: ${value}${config.unit ?? ""}`,
  };
}

function boxOutlierValues(
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
  const { outliersField, minField, q1Field, q3Field, maxField } = fields;
  const raw = row[outliersField];
  if (Array.isArray(raw)) {
    explicit.push(...raw.flatMap((item) => {
      if (typeof item === "number" || typeof item === "string") {
        return [{ value: toNumber(item) }];
      }
      if (item && typeof item === "object") {
        const object = item as Record<string, unknown>;
        const value = toNumber(object.value ?? object.y ?? object.outlier);
        return Number.isFinite(value)
          ? [{ value, label: object.label ? String(object.label) : undefined }]
          : [];
      }
      return [];
    }));
  }
  if (explicit.length > 0) return explicit;

  const q1 = toNumber(row[q1Field]);
  const q3 = toNumber(row[q3Field]);
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return [];
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const min = toNumber(row[minField]);
  const max = toNumber(row[maxField]);
  const inferred: Array<{ value: number; label?: string }> = [];
  if (min < lowerFence) inferred.push({ value: min, label: `low outlier: ${min}` });
  if (max > upperFence) inferred.push({ value: max, label: `high outlier: ${max}` });
  return inferred;
}

export function buildChartSelectableElements(
  config: ChartConfig,
  chartId: string,
): ChartElementMetadata[] {
  const data = config.data as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];

  if (config.type === "pie") {
    const nameKey = config.nameField ?? "name";
    const valueKey = config.valueField ?? "value";
    return data.map((row) => {
      const name = String(row[nameKey] ?? "");
      const value = toNumber(row[valueKey]);
      return metadata(config, chartId, name, name, value, row);
    });
  }

  if (config.type === "volcano") {
    const xField = config.xValueField ?? "log2FoldChange";
    const yField = config.yValueField ?? "negLog10P";
    const pField = config.pValueField ?? "pvalue";
    const labelField = config.labelField ?? "gene";
    const groupField = config.groupField;
    const xThreshold = config.xThreshold ?? 1;
    const yThreshold = config.yThreshold ?? -Math.log10(0.05);
    return data.map((row, index) => {
      const x = toNumber(row[xField]);
      const y = row[yField] !== undefined
        ? toNumber(row[yField])
        : -Math.log10(Math.max(toNumber(row[pField]) || 1, Number.MIN_VALUE));
      const label = String(row[labelField] ?? row.id ?? `Point ${index + 1}`);
      const group = groupField ? String(row[groupField] ?? "") : "";
      const series = group || (Math.abs(x) >= xThreshold && y >= yThreshold
        ? (x > 0 ? "up" : "down")
        : "not significant");
      return metadata(
        config,
        chartId,
        series,
        label,
        y,
        row,
        `${label}: ${xField}=${x.toFixed(2)}, ${yField}=${y.toFixed(2)}`,
      );
    });
  }

  if (config.type === "box") {
    const xKey = config.xField ?? "group";
    const minField = config.minField ?? "min";
    const q1Field = config.q1Field ?? "q1";
    const medianField = config.medianField ?? "median";
    const q3Field = config.q3Field ?? "q3";
    const maxField = config.maxField ?? "max";
    const outliersField = config.outliersField ?? "outliers";
    return data.flatMap((row, index) => {
      const category = String(row[xKey] ?? `Group ${index + 1}`);
      const box = metadata(
        config,
        chartId,
        "box",
        category,
        toNumber(row[medianField]),
        row,
        `${category}: median ${row[medianField] ?? ""}`,
      );
      const outliers = boxOutlierValues(row, { outliersField, minField, q1Field, q3Field, maxField }).map((item, outlierIndex) =>
        metadata(
          config,
          chartId,
          "outlier",
          `${category}_${outlierIndex + 1}`,
          item.value,
          row,
          item.label ?? `${category} outlier ${outlierIndex + 1}: ${item.value}${config.unit ?? ""}`,
        ),
      );
      return [box, ...outliers];
    });
  }

  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const xKey = config.xField ?? "name";
  return data.flatMap((row) =>
    fields.map((field) => {
      const category = String(row[xKey] ?? "");
      const value = toNumber(row[field]);
      return metadata(config, chartId, field, category, value, row);
    }),
  );
}

function valueFor(element: ChartElementMetadata, field?: string): number {
  if (field && element.sourceRow && element.sourceRow[field] !== undefined) {
    return toNumber(element.sourceRow[field]);
  }
  return element.value;
}

function compare(value: number, threshold: number, operator = ">="): boolean {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  if (operator === "=") return value === threshold;
  if (operator === "!=") return value !== threshold;
  return false;
}

function semanticMatches(
  element: ChartElementMetadata,
  action: SemanticAction,
  all: ChartElementMetadata[],
): boolean {
  const plan = action.plan ?? {};
  const query = action.query ?? {};
  const labels = plan.labels ?? (Array.isArray(query.labels) ? query.labels.map(String) : []);
  const categoryValue = plan.categoryValue ?? query.categoryValue ?? query.category;
  const valueField = plan.valueField ?? (typeof query.valueField === "string" ? query.valueField : undefined);

  if (action.intent === "outliers") {
    return element.series === "outlier";
  }

  if (action.intent === "significant") {
    const direction = plan.direction ?? normalizedText(categoryValue);
    if (direction === "up" || direction === "upregulated") return element.series === "up";
    if (direction === "down" || direction === "downregulated") return element.series === "down";
    return element.series === "up" || element.series === "down";
  }

  if (action.intent === "category") {
    const target = normalizedText(categoryValue);
    if (!target) return false;
    return (
      normalizedText(element.series) === target
      || normalizedText(element.category) === target
      || normalizedText(element.sourceRow?.[String(plan.groupField ?? "")]) === target
    );
  }

  if (action.intent === "label_match") {
    if (labels.length === 0) return false;
    const haystack = normalizedText([
      element.label,
      element.category,
      element.series,
      element.sourceRow ? JSON.stringify(element.sourceRow) : "",
    ].join(" "));
    return labels.some((label) => haystack.includes(normalizedText(label)));
  }

  if (action.intent === "threshold") {
    const threshold = typeof plan.threshold === "number"
      ? plan.threshold
      : toNumber(query.threshold);
    return compare(valueFor(element, valueField), threshold, plan.operator ?? String(query.operator ?? ">="));
  }

  if (action.intent === "top_n" || action.intent === "bottom_n") {
    const n = Math.max(1, Math.floor((plan.n ?? toNumber(query.n)) || 5));
    const sorted = [...all].sort((a, b) =>
      action.intent === "top_n"
        ? valueFor(b, valueField) - valueFor(a, valueField)
        : valueFor(a, valueField) - valueFor(b, valueField),
    );
    return new Set(sorted.slice(0, n).map((item) => item.elementId)).has(element.elementId);
  }

  return false;
}

export function resolveSemanticSelectionAction(
  action: SemanticAction,
  activeAsset: VisualAsset | null,
): Extract<ChartAction, { type: "select_elements" }> | null {
  if (!activeAsset || activeAsset.kind !== "chart" || !activeAsset.chartConfig) return null;
  if (action.assetId && action.assetId !== "active" && action.assetId !== activeAsset.id) return null;
  const elements = buildChartSelectableElements(activeAsset.chartConfig, activeAsset.id);
  const selected = elements
    .filter((element) => semanticMatches(element, action, elements))
    .map(selectedFromMetadata);
  return {
    type: "select_elements",
    elements: selected,
    targetElementIds: selected.map((element) => element.elementId),
    mode: action.plan?.mode,
  };
}

export function chartSemanticSelectionSummary(config: ChartConfig): Record<string, unknown> {
  const base = {
    type: config.type,
    title: config.title,
    fields: {
      xField: config.xField,
      yField: config.yField,
      yFields: config.yFields,
      valueField: config.valueField,
      labelField: config.labelField,
      groupField: config.groupField,
    },
  };
  return {
    ...base,
    supportedSelectionActions: [
      { type: "select_by_semantic_query", intent: "outliers", plan: { method: "explicit_outliers_field" } },
      { type: "select_by_semantic_query", intent: "top_n", plan: { n: 5, valueField: "<field>" } },
      { type: "select_by_semantic_query", intent: "bottom_n", plan: { n: 5, valueField: "<field>" } },
      { type: "select_by_semantic_query", intent: "threshold", plan: { valueField: "<field>", operator: ">=", threshold: 0 } },
      { type: "select_by_semantic_query", intent: "category", plan: { categoryValue: "<series-or-category>" } },
      { type: "select_by_semantic_query", intent: "label_match", plan: { labels: ["<label>"] } },
      { type: "select_by_semantic_query", intent: "significant", plan: { direction: "both" } },
      { type: "style_current_selection", style: { color: "#D55E00" } },
    ],
  };
}
