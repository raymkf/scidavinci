import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Konva from "konva";

import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { JOURNAL_CHART_STYLE } from "@/lib/chart-style";
import type {
  ChartConfig,
  ChartImageConfig,
  ChartElementMetadata,
} from "@/lib/chart-types";
import { cn } from "@/lib/utils";
import {
  createOverlayLayer,
  buildOverlay,
  updateOverlaySelections,
} from "@/lib/chart-registry";
import type { OverlayConfig, OverlayZone } from "@/lib/chart-registry/types";
import type { OverlayCallbacks } from "@/lib/chart-registry/overlay-engine";

// Import all chart type registrations (side-effect: registers in global registry)
import "@/lib/chart-registry/charts/area";
import "@/lib/chart-registry/charts/bar";
import "@/lib/chart-registry/charts/box";
import "@/lib/chart-registry/charts/bubble";
import "@/lib/chart-registry/charts/density";
import "@/lib/chart-registry/charts/heatmap";
import "@/lib/chart-registry/charts/histogram";
import "@/lib/chart-registry/charts/line";
import "@/lib/chart-registry/charts/pca";
import "@/lib/chart-registry/charts/pie";
import "@/lib/chart-registry/charts/scatter";
import "@/lib/chart-registry/charts/upset";
import "@/lib/chart-registry/charts/venn";
import "@/lib/chart-registry/charts/violin";
import "@/lib/chart-registry/charts/volcano";

interface InteractiveChartKonvaProps {
  config: ChartConfig;
  className?: string;
  assetId?: string;
  sourceMessageId?: string;
  registerInWorkspace?: boolean;
  imageConfig?: ChartImageConfig;
}

export default function InteractiveChartKonva({
  config,
  className,
  assetId,
  sourceMessageId,
  registerInWorkspace = true,
  imageConfig,
}: InteractiveChartKonvaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const overlayLayerRef = useRef<Konva.Layer | null>(null);
  const overlayGroupRef = useRef<Konva.Group | null>(null);
  const overlayConfigRef = useRef<OverlayConfig>({ zones: [] });
  const nativeSizeRef = useRef({ w: 800, h: 520 });
  const [ready, setReady] = useState(false);
  const [displayHeight, setDisplayHeight] = useState(520);

  const {
    selectedElements,
    toggleElement,
    removeElement,
  } = useChartSelection();

  // Keep a ref to the latest selectedElements so the click handler
  // (captured once at overlay-build time) never reads a stale snapshot.
  const selectedElementsRef = useRef(selectedElements);
  selectedElementsRef.current = selectedElements;

  const workspace = useVisualWorkspace();

  // Register in workspace. Data now comes directly from chart-image JSON,
  // so buildChartSelectableElements can resolve model-driven semantic selections
  // without needing to extract sourceRow from overlay zones.
  useEffect(() => {
    if (registerInWorkspace && assetId) {
      workspace.registerAsset({
        id: assetId,
        kind: "chart",
        title: config.title ?? config.figure?.title?.text ?? "Chart",
        aspectRatio: config.aspectRatio ? String(config.aspectRatio) : undefined,
        sourceMessageId,
        createdAt: Date.now(),
        chartConfig: config,
        chartImageConfig: imageConfig,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zone click handler
  const handleZoneClick = useCallback(
    (zone: OverlayZone) => {
      const meta = zone.metadata;
      const elementId = zone.id;
      const chartType = (meta.chartType as ChartElementMetadata["chartType"]) ?? config.type;
      const series = String(meta.series ?? "");
      const category = meta.category as string | number ?? "";
      const value = Number(meta.value ?? 0);
      const label = String(meta.label ?? "");

      const element: ChartElementMetadata = {
        elementId,
        chartType,
        series,
        category,
        value,
        label,
        sourceRow: meta.sourceRow as Record<string, unknown> | undefined,
      };

      const isSelected = selectedElementsRef.current.some((e) => e.elementId === elementId);
      if (isSelected) {
        removeElement(elementId);
      } else {
        toggleElement(element);
      }
    },
    [config.type, toggleElement, removeElement],
  );

  const handleBoxSelect = useCallback(
    (zones: OverlayZone[]) => {
      for (const zone of zones) {
        const meta = zone.metadata;
        toggleElement({
          elementId: zone.id,
          chartType: (meta.chartType as ChartElementMetadata["chartType"]) ?? config.type,
          series: String(meta.series ?? ""),
          category: meta.category as string | number ?? "",
          value: Number(meta.value ?? 0),
          label: String(meta.label ?? ""),
        });
      }
    },
    [config.type, toggleElement],
  );

  // Build stage ONCE when imageConfig arrives, never recreate
  useEffect(() => {
    const container = innerRef.current;
    if (!container || !imageConfig) return;

    // Clean up previous
    if (stageRef.current) {
      stageRef.current.destroy();
      stageRef.current = null;
      overlayGroupRef.current = null;
      overlayLayerRef.current = null;
    }
    setReady(false);

    // Use image's natural dimensions as render size
    const w = imageConfig.imageWidth || 800;
    const h = imageConfig.imageHeight || 520;

    const stage = new Konva.Stage({
      container,
      width: w,
      height: h,
    });

    const imageLayer = new Konva.Layer({ name: "image-layer" });
    const overlayLayer = createOverlayLayer();
    stage.add(imageLayer);
    stage.add(overlayLayer);

    // Load backend PNG
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const konvaImage = new Konva.Image({
        x: 0, y: 0,
        width: w, height: h,
        image: img,
        listening: false,  // let events pass through to overlay layer
      });
      imageLayer.add(konvaImage);
      imageLayer.draw();

      // Build overlay zones (1:1 with image, no scaling needed since we use native size)
      const zones: OverlayZone[] = imageConfig.zones.map((z) => ({
        id: z.id,
        x: z.x, y: z.y,
        width: z.width, height: z.height,
        metadata: z.metadata,
      }));

      const overlayCfg: OverlayConfig = {
        zones,
        boxSelectEnabled: zones.length > 0,
      };
      overlayConfigRef.current = overlayCfg;

      const callbacks: OverlayCallbacks = {
        onZoneClick: handleZoneClick,
        onBoxSelect: handleBoxSelect,
      };

      const overlayGroup = buildOverlay(overlayLayer, overlayCfg, callbacks);
      overlayGroupRef.current = overlayGroup;
      overlayLayer.draw();
      setReady(true);

      // Apply any pre-existing selections (e.g. from workspace re-mount)
      const current = selectedElementsRef.current;
      if (current.length > 0) {
        const selectedIds = current.map((e) => e.elementId);
        updateOverlaySelections(
          overlayGroup,
          { ...overlayCfg, selections: selectedIds },
          current,
        );
      }
    };
    img.onerror = () => {
      console.warn("Failed to load chart image:", imageConfig.imageUrl);
    };
    img.src = imageConfig.imageUrl;

    stageRef.current = stage;
    overlayLayerRef.current = overlayLayer;

    return () => {
      if (stageRef.current) {
        stageRef.current.destroy();
        stageRef.current = null;
      }
    };
  }, [imageConfig?.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selections to overlay
  useEffect(() => {
    if (!overlayGroupRef.current || !overlayLayerRef.current) return;
    const selectedIds = selectedElements.map((e) => e.elementId);
    updateOverlaySelections(
      overlayGroupRef.current,
      {
        ...overlayConfigRef.current,
        selections: selectedIds,
      },
      selectedElements,
    );
  }, [selectedElements, ready]);

  // Responsive scaling: resize Konva stage when container width changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stageRef.current || !ready) return;
    const stage = stageRef.current;
    const { w: iw, h: ih } = nativeSizeRef.current;

    const resize = () => {
      const cw = container.clientWidth;
      if (cw <= 0) return;
      const scale = Math.min(1, cw / iw);
      stage.width(iw * scale);
      stage.height(ih * scale);
      stage.scale({ x: scale, y: scale });
      setDisplayHeight(ih * scale);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [ready]);

  // Store native image size when imageConfig arrives
  useEffect(() => {
    if (imageConfig) {
      nativeSizeRef.current = {
        w: imageConfig.imageWidth,
        h: imageConfig.imageHeight,
      };
    }
  }, [imageConfig]);

  // Container is 100% width; Konva stage is scaled down via ResizeObserver.
  const containerStyle: CSSProperties = {
    width: "100%",
    height: ready ? `${displayHeight}px` : "auto",
    minHeight: !ready ? "200px" : undefined,
    overflow: "hidden",
    backgroundColor: config.figure?.layout?.background?.color ?? JOURNAL_CHART_STYLE.background,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "interactive-chart-konva relative rounded-lg border border-gray-200",
        className,
      )}
      style={containerStyle}
    >
      <div ref={innerRef} className="interactive-chart-inner" />
    </div>
  );
}

// ---- Code block parsers ----

export function parseChartCodeBlock(
  code: string,
  _language?: string,
): ChartConfig | null {
  try {
    const raw = JSON.parse(code);
    return canonicalizeChartConfig(raw);
  } catch {
    return null;
  }
}

export function parseChartImageCodeBlock(
  code: string,
): ChartImageConfig | null {
  try {
    const raw = JSON.parse(code);
    if (!raw.imageUrl || !raw.zones || !raw.imageWidth || !raw.imageHeight) {
      return null;
    }
    return raw as ChartImageConfig;
  } catch {
    return null;
  }
}

type ExtendedChartType = ChartConfig["type"] | "scatter" | "violin" | "heatmap" | "pca" | "bubble" | "venn" | "upset" | "histogram" | "density" | "stacked_bar" | "gsea" | "correlation_heatmap" | "enrichment_bar";

function canonicalizeChartConfig(raw: Record<string, unknown>): ChartConfig {
  const typeMap: Record<string, ExtendedChartType> = {
    bar: "bar", bars: "bar", "bar-chart": "bar", bar_chart: "bar", column: "bar", column_chart: "bar",
    line: "line", lines: "line", line_chart: "line",
    pie: "pie", pie_chart: "pie", donut: "pie",
    area: "area", area_chart: "area",
    volcano: "volcano", volcano_plot: "volcano",
    box: "box", boxplot: "box", box_plot: "box",
    scatter: "scatter", scatter_plot: "scatter",
    violin: "violin", violin_plot: "violin",
    heatmap: "heatmap", pca: "pca", bubble: "bubble",
    venn: "venn", upset: "upset",
    histogram: "histogram", density: "density",
    stacked_bar: "stacked_bar", gsea: "gsea",
    correlation_heatmap: "correlation_heatmap", enrichment_bar: "enrichment_bar",
  };

  const rawType = String(raw.type ?? "bar").toLowerCase().replace(/[\s-]/g, "_");
  const type = (typeMap[rawType] ?? "bar") as ChartConfig["type"];

  const data =
    (raw.data as Record<string, unknown>[]) ??
    (raw.values as Record<string, unknown>[]) ??
    (raw.rows as Record<string, unknown>[]) ??
    (raw.dataset as Record<string, unknown>[]) ??
    (raw.table as Record<string, unknown>[]) ??
    [];

  const xField = (raw.xField as string) ?? (raw.x as string) ?? (raw.xAxis as string) ?? (raw.categoryField as string);
  const yField = raw.yField as string ?? raw.y as string ?? raw.yAxis as string;
  const yFields = (raw.yFields as string[]) ?? (raw.y as string[]);

  return {
    type,
    title: raw.title as string | undefined,
    xLabel: (raw.xLabel as string) ?? (raw.xlabel as string),
    yLabel: (raw.yLabel as string) ?? (raw.ylabel as string),
    aspectRatio: raw.aspectRatio as string | number | undefined,
    caption: raw.caption as string | undefined,
    description: raw.description as string | undefined,
    data,
    xField: xField as string | undefined,
    yFields: yFields as string[] | undefined,
    yField: yField as string | undefined,
    nameField: raw.nameField as string | undefined,
    valueField: raw.valueField as string | undefined,
    idField: raw.idField as string | undefined,
    labelField: raw.labelField as string | undefined,
    groupField: raw.groupField as string | undefined,
    seriesField: raw.seriesField as string | undefined,
    xValueField: raw.xValueField as string | undefined,
    yValueField: raw.yValueField as string | undefined,
    pValueField: raw.pValueField as string | undefined,
    xThreshold: raw.xThreshold as number | undefined,
    yThreshold: raw.yThreshold as number | undefined,
    minField: raw.minField as string | undefined,
    q1Field: raw.q1Field as string | undefined,
    medianField: raw.medianField as string | undefined,
    q3Field: raw.q3Field as string | undefined,
    maxField: raw.maxField as string | undefined,
    outliersField: raw.outliersField as string | undefined,
    unit: raw.unit as string | undefined,
    sourceColumns: raw.sourceColumns as string[] | undefined,
    errorBars: raw.errorBars as ChartConfig["errorBars"],
    significance: raw.significance as ChartConfig["significance"],
    colors: raw.colors as string[] | undefined,
    elementStyles: raw.elementStyles as ChartConfig["elementStyles"],
    figure: raw.figure as ChartConfig["figure"],
  };
}
