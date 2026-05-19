/** Structured metadata bound to each clickable chart element. */
export interface ChartElementMetadata {
  elementId: string;
  chartType: "bar" | "line" | "pie" | "area" | "radar" | "scatter" | "heatmap" | "volcano" | "box";
  series: string;
  category: string | number;
  value: number;
  unit?: string;
  sourceRow?: Record<string, unknown>;
  label: string;
}

/** A chart element currently selected by the user. */
export interface SelectedChartElement {
  elementId: string;
  chartType: ChartElementMetadata["chartType"];
  series: string;
  category: string | number;
  value: number;
  label: string;
  sourceRow?: Record<string, unknown>;
  color?: string;
}

/** A chart action returned by the model or parsed from user intent. */
export interface ChartAction {
  type: "update_element_style" | "add_annotation";
  targetElementIds: string[];
  style?: {
    color?: string;
    stroke?: string;
    strokeWidth?: number;
  };
  text?: string;
}

export interface ChartElementStyle {
  color?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface ChartErrorBar {
  /** Series name this uncertainty belongs to, e.g. "treatment". */
  series: string;
  /** Symmetric uncertainty field in each row, e.g. "treatment_sem". */
  field?: string;
  /** Optional label such as SEM, SD, 95% CI. */
  label?: string;
}

export interface ChartSignificanceRef {
  series: string;
  category: string | number;
}

export interface ChartSignificance {
  from: ChartSignificanceRef;
  to: ChartSignificanceRef;
  label: string;
  pValue?: string | number;
}

/** Chart rendering configuration from a chart-json code block. */
export interface ChartConfig {
  type: "bar" | "line" | "pie" | "area" | "volcano" | "box";
  title?: string;
  /** Figure aspect ratio, e.g. "4:3", "1:1", "16:9", or a number. */
  aspectRatio?: string | number;
  /** Manuscript figure axis title. */
  xLabel?: string;
  /** Manuscript figure axis title. */
  yLabel?: string;
  /** Figure caption or concise legend text. */
  caption?: string;
  data: Record<string, unknown>[];
  xField?: string;
  yFields?: string[];
  yField?: string;
  nameField?: string;
  valueField?: string;
  /** Optional unique row id for dense point charts. */
  idField?: string;
  /** Optional label field for point/box semantic chips. */
  labelField?: string;
  /** Optional grouping field for point colors. */
  groupField?: string;
  seriesField?: string;
  /** Volcano/scatter x field. Defaults to log2FoldChange for volcano. */
  xValueField?: string;
  /** Volcano/scatter y field. Defaults to negLog10P for volcano. */
  yValueField?: string;
  /** Volcano p-value field, used when neg-log10 field is absent. */
  pValueField?: string;
  /** Volcano x threshold, e.g. 1 for |log2FC| >= 1. */
  xThreshold?: number;
  /** Volcano y threshold, e.g. 1.301 for p <= 0.05. */
  yThreshold?: number;
  /** Box plot fields. */
  minField?: string;
  q1Field?: string;
  medianField?: string;
  q3Field?: string;
  maxField?: string;
  outliersField?: string;
  unit?: string;
  sourceColumns?: string[];
  /** Uncertainty values, usually SEM/SD/CI, keyed per data row. */
  errorBars?: ChartErrorBar[];
  /** Statistical comparison brackets to preserve in export/caption. */
  significance?: ChartSignificance[];
  /** Color palette (optional). */
  colors?: string[];
  /**
   * Optional per-element styles for single bars, slices, points, or boxes.
   *
   * Keys may be a full generated element id, a semantic key
   * `${series}@@${category}`, `${series}:${category}`, or just the category
   * label. Runtime chartActions still override these defaults.
   */
  elementStyles?: Record<string, ChartElementStyle>;
  /** Human-readable description of the chart. */
  description?: string;
}

export type VisualAssetKind = "image" | "chart";

export interface VisualAsset {
  id: string;
  kind: VisualAssetKind;
  title: string;
  aspectRatio?: string;
  sourceMessageId?: string;
  createdAt: number;
  url?: string;
  chartConfig?: ChartConfig;
}

export interface VisualAnchor {
  id: string;
  assetId: string;
  assetTitle: string;
  kind: VisualAssetKind;
  xPct?: number;
  yPct?: number;
  label: string;
}
