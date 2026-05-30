import type Konva from "konva";
import type { ChartElementStyle, FigureModel } from "@/lib/chart-types";

// Chart families for organizational grouping
export type ChartFamily =
  | "distribution"
  | "relationship"
  | "composition"
  | "comparison"
  | "genomics"
  | "multi-set"
  | "pathway";

// Journal style presets
export type JournalPreset = "nature" | "science" | "cell" | "lancet" | "custom";

export interface JournalConvention {
  journal: JournalPreset;
  fontFamily?: string;
  titleSize?: number;
  labelSize?: number;
  tickSize?: number;
  legendPosition?: "top" | "right" | "bottom" | "left" | "inside" | "none";
  axisStyle?: "boxed" | "open" | "classic";
  colorPalette?: string[];
  dpi?: number;
}

export interface FieldRequirement {
  field: string;
  role: "x" | "y" | "group" | "label" | "value" | "size" | "color" | "pValue" | "id";
  required: boolean;
  description: string;
  autoDetect?: {
    patterns?: string[]; // column name patterns, e.g. ["log2FoldChange", "logFC"]
    types?: ("string" | "number" | "boolean")[];
  };
}

export interface OverlayZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  metadata: Record<string, unknown>;
  hitTolerance?: number; // px expansion for small elements
  cursor?: "pointer" | "crosshair" | "default";
}

export interface OverlayConfig {
  zones: OverlayZone[];
  selections?: string[];
  hoveredZone?: string | null;
  boxSelectEnabled?: boolean;
  zoomEnabled?: boolean;
  panEnabled?: boolean;
}

export interface ChartRenderContext {
  stage: Konva.Stage;
  chartLayer: Konva.Layer;
  overlayLayer: Konva.Layer;
  width: number;
  height: number;
  plotArea: { x: number; y: number; width: number; height: number };
  dpr: number; // device pixel ratio
}

export interface ChartData {
  rows: Record<string, unknown>[];
  xField?: string;
  yFields?: string[];
  yField?: string;
  groupField?: string;
  labelField?: string;
  valueField?: string;
  nameField?: string;
  // Volcano-specific
  xValueField?: string;
  yValueField?: string;
  pValueField?: string;
  xThreshold?: number;
  yThreshold?: number;
  // Box-specific
  minField?: string;
  q1Field?: string;
  medianField?: string;
  q3Field?: string;
  maxField?: string;
  outliersField?: string;
}

export interface RenderConfig {
  title?: string;
  xLabel?: string;
  yLabel?: string;
  caption?: string;
  aspectRatio?: string | number;
  colors?: string[];
  unit?: string;
  elementStyles?: Record<string, ChartElementStyle>;
  journal?: JournalPreset;
  significance?: Array<{
    from: { series: string; category: string | number };
    to: { series: string; category: string | number };
    label: string;
    pValue?: string | number;
  }>;
  errorBars?: Array<{
    series: string;
    field?: string;
    label?: string;
  }>;
  figure?: FigureModel;
  // Grid/axis toggles
  showGrid?: boolean;
  showLegend?: boolean;
  showTitle?: boolean;
}

export interface ChartTypeRegistration {
  type: string;
  family: ChartFamily;
  displayName: string;
  description: string;
  icon: string; // lucide icon name
  requiredFields: FieldRequirement[];
  defaultStyle: Partial<RenderConfig>;
  journalConventions: Partial<Record<JournalPreset, Partial<JournalConvention>>>;
  renderer: (ctx: ChartRenderContext, data: ChartData, config: RenderConfig) => OverlayConfig;
  thumbnailRenderer: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  // Auto-detect: does this chart type fit the data?
  canHandle: (data: ChartData) => { suitable: boolean; score: number; reason?: string };
}

// Plan mode types
export interface PlotRecommendation {
  chart_type: string;
  display_name: string;
  rationale: string;
  required_fields: { field: string; role: string; available: boolean }[];
  suggested_config: Record<string, unknown>;
  priority: "recommended" | "alternative" | "conditional";
}

export interface PlotPlan {
  plan_id: string;
  title: string;
  description: string;
  datasets: string[];
  recommendations: PlotRecommendation[];
}
