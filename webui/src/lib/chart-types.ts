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
export interface ChartElementStyle {
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  opacity?: number;
  pointSize?: number;
  visible?: boolean;
  zIndex?: number;
  barWidthScale?: number;
  fontSize?: number;
  fontWeight?: number | string;
  textColor?: string;
}

export type ChartObjectKind =
  | "figure"
  | "plotArea"
  | "background"
  | "title"
  | "caption"
  | "axis"
  | "scale"
  | "grid"
  | "legend"
  | "mark"
  | "annotation"
  | "export";

export type ChartMarkType =
  | "bar"
  | "point"
  | "line"
  | "area"
  | "box"
  | "slice"
  | "errorBar"
  | "significance";

export interface FigureObjectRef {
  kind: ChartObjectKind;
  id: string;
}

export interface BoxSpec {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FillSpec {
  color?: string;
  opacity?: number;
  transparent?: boolean;
}

export interface TextBlockSpec {
  id: string;
  text?: string;
  visible?: boolean;
  style?: ChartElementStyle;
  position?: "top" | "bottom" | "left" | "right" | "inside" | "custom";
  x?: number;
  y?: number;
}

export interface AxisSpec {
  id: string;
  channel: "x" | "y";
  title?: string;
  visible?: boolean;
  domain?: [number, number] | [string, string];
  tickCount?: number;
  tickFormat?: string;
  labelAngle?: number;
  style?: ChartElementStyle;
}

export interface ScaleSpec {
  id: string;
  channel: "x" | "y" | "color" | "size";
  type?: "linear" | "log" | "band" | "point" | "ordinal" | "time";
  domain?: unknown[];
  range?: unknown[];
  zero?: boolean;
  nice?: boolean;
}

export interface GridSpec {
  id: string;
  x?: boolean;
  y?: boolean;
  visible?: boolean;
  style?: ChartElementStyle;
}

export interface LegendSpec {
  id: string;
  visible?: boolean;
  title?: string;
  position?: "top" | "right" | "bottom" | "left" | "inside" | "none";
  style?: ChartElementStyle;
}

export interface MarkSpec {
  id: string;
  type: ChartMarkType;
  series?: string;
  dataId?: string;
  dataQuery?: Record<string, unknown>;
  encoding?: Record<string, string>;
  style?: ChartElementStyle;
}

export interface AnnotationSpec {
  id: string;
  text: string;
  target?: FigureObjectRef;
  elementIds?: string[];
  xPct?: number;
  yPct?: number;
  connector?: "none" | "line" | "arrow";
  style?: ChartElementStyle;
  visible?: boolean;
}

export interface SelectionSet {
  id: string;
  name: string;
  elementIds: string[];
  query?: Record<string, unknown>;
  createdAt: number;
}

export interface ExportSettings {
  format?: "png" | "svg";
  width?: number;
  height?: number;
  scale?: number;
  dpi?: number;
  transparent?: boolean;
  includeCaption?: boolean;
}

export interface FigureModel {
  schemaVersion: 2;
  id?: string;
  type: ChartConfig["type"];
  data?: Record<string, unknown>[];
  datasetRef?: {
    datasetId: string;
    rowIdField?: string;
  };
  layout?: {
    aspectRatio?: string | number;
    plotArea?: BoxSpec | "auto";
    background?: FillSpec;
    margin?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };
  title?: TextBlockSpec;
  caption?: TextBlockSpec;
  axes?: {
    x?: AxisSpec;
    y?: AxisSpec;
  };
  scales?: {
    x?: ScaleSpec;
    y?: ScaleSpec;
    color?: ScaleSpec;
    size?: ScaleSpec;
  };
  grid?: GridSpec;
  legend?: LegendSpec;
  marks?: MarkSpec[];
  annotations?: AnnotationSpec[];
  selections?: SelectionSet[];
  styleOverrides?: Record<string, ChartElementStyle>;
  exportSettings?: ExportSettings;
}

export interface FigureInteractionOverrides {
  axes?: {
    x?: Partial<AxisSpec>;
    y?: Partial<AxisSpec>;
  };
  scales?: {
    x?: Partial<ScaleSpec>;
    y?: Partial<ScaleSpec>;
    color?: Partial<ScaleSpec>;
    size?: Partial<ScaleSpec>;
  };
  legend?: Partial<LegendSpec>;
  grid?: Partial<GridSpec>;
  title?: Partial<TextBlockSpec>;
  caption?: Partial<TextBlockSpec>;
  layout?: NonNullable<FigureModel["layout"]>;
  background?: FillSpec;
  exportSettings?: ExportSettings;
}

export type ChartAction =
  | {
      type: "update_element_style" | "style_by_ids";
      targetElementIds: string[];
      style?: ChartElementStyle;
    }
  | {
      type: "style_by_query";
      query: Record<string, unknown>;
      style?: ChartElementStyle;
    }
  | {
      type: "add_annotation";
      targetElementIds?: string[];
      text?: string;
      annotation?: Partial<AnnotationSpec>;
    }
  | {
      type: "update_annotation";
      annotationId: string;
      patch: Partial<AnnotationSpec>;
    }
  | {
      type: "delete_annotation";
      annotationId: string;
    }
  | {
      type: "update_axis";
      axis: "x" | "y";
      patch: Partial<AxisSpec>;
    }
  | {
      type: "update_scale";
      scale: "x" | "y" | "color" | "size";
      patch: Partial<ScaleSpec>;
    }
  | {
      type: "update_legend";
      patch: Partial<LegendSpec>;
    }
  | {
      type: "update_grid";
      patch: Partial<GridSpec>;
    }
  | {
      type: "update_text_block";
      target: "title" | "caption";
      patch: Partial<TextBlockSpec>;
    }
  | {
      type: "update_layout";
      patch: NonNullable<FigureModel["layout"]>;
    }
  | {
      type: "update_background";
      patch: FillSpec;
    }
  | {
      type: "create_selection_set";
      name: string;
      elementIds: string[];
      query?: Record<string, unknown>;
    }
  | {
      type: "update_export_settings";
      patch: ExportSettings;
    };

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
  /** Structured editable figure model. Newer workbench features read this first. */
  figure?: FigureModel;
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
