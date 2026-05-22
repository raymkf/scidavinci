import {
  Download,
  Grid3X3,
  ImageIcon,
  Layers3,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  MousePointer2,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { CollageCanvas, computeTemplatePositions } from "@/components/CollageCanvas";
import { CollageToolbar } from "@/components/CollageToolbar";
import { Button } from "@/components/ui/button";
import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import {
  chartElementId,
  resolveElementBarWidthScale,
  resolveElementColor,
  resolveElementFillOpacity,
  resolveElementOpacity,
  resolveElementPointSize,
  resolveElementStroke,
  resolveElementStrokeWidth,
  resolveElementVisible,
} from "@/lib/chart-element-styles";
import { applyFigureInteractionOverrides, normalizeFigureModel } from "@/lib/chart-normalize";
import { JOURNAL_CHART_STYLE, JOURNAL_COLORS, journalColor } from "@/lib/chart-style";
import type {
  ChartAction,
  ChartConfig,
  ChartElementStyle,
  FigureModel,
  FigureObjectRef,
  FillSpec,
  CollageSpec,
  SelectedChartElement,
  VisualAnchor,
  VisualAsset,
} from "@/lib/chart-types";
import { cn } from "@/lib/utils";

const WORKSPACE_STORAGE_KEY = "scidavinci.workspace.layout";
const MIN_WIDTH = 260;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 336;

function readLayoutPrefs(): { width: number; collapsed: boolean } {
  if (typeof window === "undefined") return { width: DEFAULT_WIDTH, collapsed: false };
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return { width: DEFAULT_WIDTH, collapsed: false };
    const parsed = JSON.parse(raw);
    return {
      width: typeof parsed.width === "number" ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width)) : DEFAULT_WIDTH,
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { width: DEFAULT_WIDTH, collapsed: false };
  }
}

function persistLayoutPrefs(width: number, collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ width, collapsed }));
  } catch {
    // ignore
  }
}

export function VisualWorkspacePanel() {
  const exportTargetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [layout, setLayout] = useState(readLayoutPrefs);
  const [fullscreen, setFullscreen] = useState(false);
  const [collageSelectedItem, setCollageSelectedItem] = useState<number | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const layoutRef = useRef(layout);
  const {
    assets,
    activeAsset,
    anchors,
    activeAssetId,
    openAsset,
    updateAssetAspectRatio,
    updateAssetBackground,
    getAssetAspectRatio,
    addImageAnchor,
    createCollage,
    addItemToCollage,
    updateCollageItem,
    removeCollageItem,
    updateCollageSpec,
  } = useVisualWorkspace();

  const toggleCollapsed = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, collapsed: !prev.collapsed };
      persistLayoutPrefs(next.width, next.collapsed);
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Resize by dragging the left edge
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startWidth = layoutRef.current.width;
    resizeRef.current = { startX: e.clientX, startWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - ev.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + delta));
      setLayout((prev) => ({ ...prev, width: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Persist width on change
  useEffect(() => {
    persistLayoutPrefs(layout.width, layout.collapsed);
  }, [layout.width, layout.collapsed]);
  const {
    selectedElements,
    elementStyles,
    annotations,
    figureOverrides,
    activeFigureObject,
    selectFigureObject,
    applyActions,
    lastActionResults,
    dismissActionResults,
  } = useChartSelection();

  // Reset collage selection when active asset changes
  useEffect(() => {
    setCollageSelectedItem(null);
  }, [activeAsset?.id]);

  // Navigate chat to source message when a chart element is selected in the workspace
  useEffect(() => {
    if (
      activeFigureObject?.kind === "mark" &&
      activeAsset?.kind === "chart" &&
      activeAsset.sourceMessageId
    ) {
      window.dispatchEvent(
        new CustomEvent("scidavinci:navigateToMessage", {
          detail: { messageId: activeAsset.sourceMessageId },
        }),
      );
    }
  }, [activeFigureObject, activeAsset]);

  const activeAnchors = useMemo(
    () => anchors.filter((item) => item.assetId === activeAsset?.id),
    [activeAsset?.id, anchors],
  );
  const activeAspectRatio = activeAsset ? (getAssetAspectRatio(activeAsset.id) ?? "4:3") : "4:3";
  const imageBackground = activeAsset?.kind === "image" ? activeAsset.background : undefined;
  const hasCustomImageBackground = hasVisibleBackground(imageBackground);

  // Collapsed state: show a thin tab to re-expand
  if (layout.collapsed) {
    return (
      <aside
        className={cn(
          "hidden h-full shrink-0 border-l border-border/70 bg-background lg:flex",
          "flex-col items-center py-2",
        )}
        style={{ width: 36 }}
        aria-label="Visual workspace (collapsed)"
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Expand workspace"
          title="Expand workspace"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        {assets.length > 0 ? (
          <span className="mt-2 text-[10px] font-medium text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
            {assets.length}
          </span>
        ) : null}
      </aside>
    );
  }

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
          activeAsset.background,
        );
        return;
      }

      if (activeAsset.kind === "chart" && activeAsset.chartConfig) {
        await exportChartConfigToPng(
          activeAsset.id,
          activeAsset.chartConfig,
          elementStyles,
          filename,
          applyFigureInteractionOverrides(
            activeAsset.chartConfig.figure ?? normalizeFigureModel(activeAsset.chartConfig),
            figureOverrides,
            annotations,
          ),
        );
        return;
      }

      if (activeAsset.kind === "collage" && activeAsset.collage) {
        await exportCollageToPng(activeAsset.collage, assets, elementStyles, filename);
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

  const panelContent = (
    <>
      {/* Resize handle on left edge */}
      <div
        className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
        onMouseDown={onResizeStart}
        role="separator"
        aria-label="Resize workspace"
      />

      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">Visual workspace</span>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {assets.length}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleFullscreen}
            className="h-7 w-7 rounded-full"
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleCollapsed}
            className="h-7 w-7 rounded-full"
            aria-label="Collapse workspace"
            title="Collapse workspace"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Action result feedback */}
      {lastActionResults.length > 0 ? (
        <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {lastActionResults.filter((r) => r.status === "applied").length} applied
            {lastActionResults.filter((r) => r.status === "ignored").length > 0
              ? `, ${lastActionResults.filter((r) => r.status === "ignored").length} ignored`
              : ""}
          </span>
          <button
            type="button"
            onClick={dismissActionResults}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 scrollbar-thin [scrollbar-gutter:stable]">
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
            className={cn(
              "relative rounded-md border border-border/70 bg-muted/30",
              activeAsset.kind === "image" ? "overflow-hidden" : "overflow-visible",
            )}
            style={activeAsset.kind === "image"
              ? { aspectRatio: ratioCss(activeAspectRatio), minHeight: "15rem" }
              : { minHeight: "15rem" }}
          >
            {activeAsset.kind === "image" && activeAsset.url ? (
              <button
                type="button"
                className="relative block h-full w-full cursor-crosshair"
                style={imageBackgroundStyle(imageBackground)}
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
                  style={hasCustomImageBackground ? { mixBlendMode: "multiply" } : undefined}
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

            {activeAsset.kind === "collage" && activeAsset.collage ? (
              <div className="p-2">
                <CollageToolbar
                  collage={activeAsset.collage}
                  selectedItemIndex={collageSelectedItem}
                  onUpdateSpec={(patch) => updateCollageSpec(activeAsset.id, patch)}
                  onAddItem={(imageAssetId) => addItemToCollage(activeAsset.id, imageAssetId)}
                  onUpdateItem={(index, patch) => updateCollageItem(activeAsset.id, index, patch)}
                  onRemoveItem={(index) => removeCollageItem(activeAsset.id, index)}
                  onExport={exportActiveAsset}
                  exporting={exporting}
                />
                <div className="mt-2">
                  <CollageCanvas
                    collage={activeAsset.collage}
                    selectedItemIndex={collageSelectedItem}
                    onSelectItem={setCollageSelectedItem}
                    onUpdateItem={(index, patch) => updateCollageItem(activeAsset.id, index, patch)}
                    onRemoveItem={(index) => removeCollageItem(activeAsset.id, index)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MousePointer2 className="h-3 w-3" aria-hidden />
            点击图片位置生成锚点；点击图表元素生成精确数据标签。
          </p>
        </div>

        <ElementInspector
          selectedElements={selectedElements}
          elementStyles={elementStyles}
          onApply={(style) => {
            applyActions([
              {
                type: "update_element_style",
                targetElementIds: selectedElements.map((item) => item.elementId),
                style,
              },
            ]);
          }}
        />

        {activeAsset.kind === "image" ? (
          <ImageInspector
            background={activeAsset.background ?? {}}
            onBackgroundChange={(patch) => updateAssetBackground(activeAsset.id, patch)}
          />
        ) : null}

        {activeAsset.kind === "chart" && activeAsset.chartConfig ? (
          <FigureInspector
            config={activeAsset.chartConfig}
            selectedElements={selectedElements}
            activeObject={activeFigureObject}
            onSelectObject={selectFigureObject}
            figure={applyFigureInteractionOverrides(
              activeAsset.chartConfig.figure ?? normalizeFigureModel(activeAsset.chartConfig),
              figureOverrides,
              annotations,
            )}
            onAction={(action) => applyActions([action])}
          />
        ) : null}

        {/* Asset gallery */}
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => createCollage(`Collage ${assets.length + 1}`)}
            >
              <Plus className="h-3.5 w-3.5" />
              New Collage
            </Button>
          </div>
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
                ) : asset.kind === "collage" ? (
                  <CollageThumbnail collage={asset.collage} assets={assets} />
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
      </div>
    </>
  );

  const panel = (
    <aside
      className={cn(
        "hidden h-full shrink-0 border-l border-border/70 bg-background lg:flex",
        "flex-col overflow-hidden relative",
        fullscreen && "fixed inset-0 z-50",
      )}
      style={{ width: fullscreen ? "100%" : layout.width }}
      aria-label="Visual workspace"
    >
      {panelContent}
    </aside>
  );

  return panel;
}

function ElementInspector({
  selectedElements,
  elementStyles,
  onApply,
}: {
  selectedElements: SelectedChartElement[];
  elementStyles: Map<string, ChartElementStyle>;
  onApply: (style: ChartElementStyle) => void;
}) {
  if (selectedElements.length === 0) return null;

  const style = mergedSelectedStyle(selectedElements, elementStyles);
  const color = style.color ?? "#0072B2";
  const stroke = style.stroke ?? JOURNAL_CHART_STYLE.selectedStroke;
  const strokeWidth = style.strokeWidth ?? 2;
  const fillOpacity = style.fillOpacity ?? 1;
  const opacity = style.opacity ?? 1;
  const pointSize = style.pointSize ?? 4;
  const barWidthScale = style.barWidthScale ?? 1;
  const hasBarSelection = selectedElements.some((element) => element.chartType === "bar");

  return (
    <div className="border-b border-border/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <p className="truncate text-xs font-semibold text-foreground/90">
            元素属性
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {selectedElements.length} selected
        </span>
      </div>

      <div className="mb-2 truncate text-[11px] text-muted-foreground">
        {selectedElements[0].label}
        {selectedElements.length > 1 ? ` +${selectedElements.length - 1}` : ""}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
          填充
          <input
            type="color"
            value={color}
            onChange={(event) => onApply({ color: event.target.value })}
            className="h-8 w-full rounded border border-border bg-background p-1"
            aria-label="Fill color"
          />
        </label>
        <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
          描边
          <input
            type="color"
            value={stroke}
            onChange={(event) => onApply({ stroke: event.target.value })}
            className="h-8 w-full rounded border border-border bg-background p-1"
            aria-label="Stroke color"
          />
        </label>
        <NumberControl
          label="描边宽度"
          value={strokeWidth}
          min={0}
          max={12}
          step={0.5}
          onChange={(value) => onApply({ strokeWidth: value })}
        />
        <NumberControl
          label="点大小"
          value={pointSize}
          min={1}
          max={18}
          step={0.5}
          onChange={(value) => onApply({ pointSize: value })}
        />
        {hasBarSelection ? (
          <NumberControl
            label="柱宽比例"
            value={barWidthScale}
            min={0.1}
            max={2}
            step={0.05}
            onChange={(value) => onApply({ barWidthScale: value })}
          />
        ) : null}
        <NumberControl
          label="填充透明度"
          value={fillOpacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(value) => onApply({ fillOpacity: value })}
        />
        <NumberControl
          label="整体透明度"
          value={opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(value) => onApply({ opacity: value })}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-7 w-full justify-center gap-1.5 text-[11px]"
        onClick={() => onApply({
          color: undefined,
          stroke: undefined,
          strokeWidth: undefined,
          fillOpacity: undefined,
          opacity: undefined,
          pointSize: undefined,
          barWidthScale: undefined,
        })}
      >
        <RotateCcw className="h-3 w-3" />
        清除覆盖
      </Button>
    </div>
  );
}

function BackgroundInspector({
  background,
  gridVisible,
  onBackgroundChange,
  onGridChange,
}: {
  background: FillSpec;
  gridVisible: boolean;
  onBackgroundChange: (patch: FillSpec) => void;
  onGridChange: (checked: boolean) => void;
}) {
  const pattern = background.pattern ?? (gridVisible ? "grid" : "none");
  return (
    <div className="rounded border border-border/70 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Palette className="h-3 w-3" aria-hidden />
        背景
      </div>
      <div className="space-y-2">
        <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
          颜色
          <input
            type="color"
            value={background.color ?? "#ffffff"}
            onChange={(event) => onBackgroundChange({ color: event.target.value, transparent: false })}
            className="h-8 w-full rounded border border-border bg-background p-1"
            aria-label="Background color"
          />
        </label>
        <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
          透明度
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={background.opacity ?? 1}
            onChange={(event) => onBackgroundChange({ opacity: Number(event.target.value) })}
            className="h-5 w-full accent-primary"
            aria-label="Background opacity"
          />
        </label>
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">图案</span>
          <div className="flex gap-1">
            {(["none", "grid", "lines"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onBackgroundChange({ pattern: p });
                  onGridChange(p !== "none");
                }}
                className={cn(
                  "h-7 flex-1 rounded border text-[11px] transition-colors",
                  pattern === p
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "none" ? "无" : p === "grid" ? "网格" : "线条"}
              </button>
            ))}
          </div>
        </div>
        {pattern !== "none" ? (
          <>
            <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
              图案颜色
              <input
                type="color"
                value={background.patternColor ?? "#E5E7EB"}
                onChange={(event) => onBackgroundChange({ patternColor: event.target.value })}
                className="h-8 w-full rounded border border-border bg-background p-1"
                aria-label="Pattern color"
              />
            </label>
            <NumberControl
              label="图案大小"
              value={background.patternSize ?? 20}
              min={4}
              max={80}
              step={2}
              onChange={(value) => onBackgroundChange({ patternSize: value })}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function FigureInspector({
  config,
  figure,
  selectedElements,
  activeObject,
  onSelectObject,
  onAction,
}: {
  config: ChartConfig;
  figure: FigureModel;
  selectedElements: SelectedChartElement[];
  activeObject: FigureObjectRef | null;
  onSelectObject: (object: FigureObjectRef | null) => void;
  onAction: (action: ChartAction) => void;
}) {
  const [annotationText, setAnnotationText] = useState("");
  const activeAnnotation = activeObject?.kind === "annotation"
    ? figure.annotations?.find((annotation) => annotation.id === activeObject.id)
    : undefined;
  const titleText = figure.title?.text ?? config.title ?? "";
  const captionText = figure.caption?.text ?? config.caption ?? config.description ?? "";
  const xTitle = figure.axes?.x?.title ?? config.xLabel ?? config.xField ?? "";
  const yTitle = figure.axes?.y?.title ?? config.yLabel ?? (config.unit ? `Value (${config.unit})` : "");
  const showXAxis = figure.axes?.x?.visible !== false;
  const showYAxis = figure.axes?.y?.visible !== false;
  const showLegend = figure.legend?.visible !== false;
  const canAnnotate = selectedElements.length > 0 && annotationText.trim().length > 0;

  return (
    <div className="border-b border-border/70 p-3">
      <div className="mb-2 flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <p className="truncate text-xs font-semibold text-foreground/90">图像属性</p>
      </div>

      <FigureObjectList
        figure={figure}
        activeObject={activeObject}
        onSelectObject={onSelectObject}
      />

      <div className="space-y-2">
        {activeObject?.kind === "background" || activeObject?.kind === "grid" || !activeObject ? (
          <BackgroundInspector
            background={figure.layout?.background ?? {}}
            gridVisible={figure.grid?.visible !== false}
            onBackgroundChange={(patch) => onAction({ type: "update_background", patch })}
            onGridChange={(checked) => onAction({ type: "update_grid", patch: { visible: checked, y: checked } })}
          />
        ) : null}

        {activeObject?.kind === "title" ? (
          <TextBlockInspector
            label="标题"
            value={titleText}
            visible={figure.title?.visible !== false}
            onTextChange={(text) => onAction({ type: "update_text_block", target: "title", patch: { text, visible: text.trim().length > 0 } })}
            onVisibleChange={(visible) => onAction({ type: "update_text_block", target: "title", patch: { visible } })}
          />
        ) : null}

        {activeObject?.kind === "caption" ? (
          <TextBlockInspector
            label="说明"
            value={captionText}
            visible={figure.caption?.visible !== false}
            onTextChange={(text) => onAction({ type: "update_text_block", target: "caption", patch: { text, visible: text.trim().length > 0 } })}
            onVisibleChange={(visible) => onAction({ type: "update_text_block", target: "caption", patch: { visible } })}
          />
        ) : null}

        {activeObject?.id === "axis.x" || !activeObject ? (
          <AxisInspector
            label="X 轴"
            title={xTitle}
            visible={showXAxis}
            onTitleChange={(title) => onAction({ type: "update_axis", axis: "x", patch: { title } })}
            onVisibleChange={(visible) => onAction({ type: "update_axis", axis: "x", patch: { visible } })}
          />
        ) : null}

        {activeObject?.id === "axis.y" || !activeObject ? (
          <AxisInspector
            label="Y 轴"
            title={yTitle}
            visible={showYAxis}
            onTitleChange={(title) => onAction({ type: "update_axis", axis: "y", patch: { title } })}
            onVisibleChange={(visible) => onAction({ type: "update_axis", axis: "y", patch: { visible } })}
          />
        ) : null}

        {activeObject?.kind === "legend" || !activeObject ? (
          <ToggleControl
            label="图例"
            checked={showLegend}
            onChange={(checked) => onAction({ type: "update_legend", patch: { visible: checked } })}
          />
        ) : null}

        {activeAnnotation ? (
          <AnnotationInspector
            annotation={activeAnnotation}
            onUpdate={(patch) => onAction({ type: "update_annotation", annotationId: activeAnnotation.id, patch })}
            onDelete={() => {
              onAction({ type: "delete_annotation", annotationId: activeAnnotation.id });
              onSelectObject(null);
            }}
          />
        ) : null}

        <div className="rounded border border-border/70 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <MessageSquarePlus className="h-3 w-3" aria-hidden />
            注释
          </div>
          <input
            value={annotationText}
            onChange={(event) => setAnnotationText(event.target.value)}
            placeholder={selectedElements.length > 0 ? "给选中元素添加注释" : "先选择图表元素"}
            className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canAnnotate}
            className="mt-1 h-7 w-full justify-center gap-1.5 text-[11px]"
            onClick={() => {
              const text = annotationText.trim();
              if (!text) return;
              const id = `annotation-${Date.now()}-${(figure.annotations?.length ?? 0) + 1}`;
              onAction({
                type: "add_annotation",
                targetElementIds: selectedElements.map((item) => item.elementId),
                annotation: {
                  id,
                  text,
                  elementIds: selectedElements.map((item) => item.elementId),
                  connector: "arrow",
                },
              });
              setAnnotationText("");
              onSelectObject({ kind: "annotation", id });
            }}
          >
            <MessageSquarePlus className="h-3 w-3" />
            添加注释
          </Button>
        </div>
      </div>
    </div>
  );
}

function FigureObjectList({
  figure,
  activeObject,
  onSelectObject,
}: {
  figure: FigureModel;
  activeObject: FigureObjectRef | null;
  onSelectObject: (object: FigureObjectRef | null) => void;
}) {
  const objects: Array<{ ref: FigureObjectRef | null; label: string }> = [
    { ref: null, label: "全部" },
    { ref: { kind: "background", id: "background" }, label: "背景" },
    { ref: { kind: "title", id: "title" }, label: "标题" },
    { ref: { kind: "caption", id: "caption" }, label: "说明" },
    { ref: { kind: "axis", id: "axis.x" }, label: "X 轴" },
    { ref: { kind: "axis", id: "axis.y" }, label: "Y 轴" },
    { ref: { kind: "legend", id: "legend" }, label: "图例" },
    ...(figure.annotations ?? []).map((annotation, index) => ({
      ref: { kind: "annotation" as const, id: annotation.id },
      label: `注释 ${index + 1}`,
    })),
  ];

  return (
    <div className="mb-2 rounded border border-border/70 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Layers3 className="h-3 w-3" aria-hidden />
        对象
      </div>
      <div className="flex flex-wrap gap-1">
        {objects.map((object) => {
          const selected = object.ref === null
            ? activeObject === null
            : activeObject?.kind === object.ref.kind && activeObject.id === object.ref.id;
          return (
            <button
              key={object.ref ? `${object.ref.kind}:${object.ref.id}` : "all"}
              type="button"
              onClick={() => onSelectObject(object.ref)}
              className={cn(
                "h-6 rounded border px-2 text-[11px] transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {object.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImageInspector({
  background,
  onBackgroundChange,
}: {
  background: FillSpec;
  onBackgroundChange: (patch: FillSpec) => void;
}) {
  return (
    <div className="border-b border-border/70 p-3">
      <div className="mb-2 flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <p className="truncate text-xs font-semibold text-foreground/90">
          图像属性
        </p>
      </div>
      <BackgroundInspector
        background={background}
        gridVisible={(background.pattern ?? "none") !== "none"}
        onBackgroundChange={onBackgroundChange}
        onGridChange={(checked) => onBackgroundChange({ pattern: checked ? "grid" : "none" })}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-7 w-full justify-center gap-1.5 text-[11px]"
        onClick={() => onBackgroundChange({
          color: undefined,
          opacity: undefined,
          transparent: undefined,
          pattern: "none",
          patternColor: undefined,
          patternOpacity: undefined,
          patternSize: undefined,
        })}
      >
        <RotateCcw className="h-3 w-3" />
        清除背景覆盖
      </Button>
    </div>
  );
}

function TextBlockInspector({
  label,
  value,
  visible,
  onTextChange,
  onVisibleChange,
}: {
  label: string;
  value: string;
  visible: boolean;
  onTextChange: (value: string) => void;
  onVisibleChange: (visible: boolean) => void;
}) {
  return (
    <div className="rounded border border-border/70 p-2">
      <ToggleControl label={label} checked={visible} onChange={onVisibleChange} />
      <label className="mt-2 block space-y-1 text-[11px] font-medium text-muted-foreground">
        文本
        <input
          value={value}
          onChange={(event) => onTextChange(event.target.value)}
          className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
        />
      </label>
    </div>
  );
}

function AxisInspector({
  label,
  title,
  visible,
  onTitleChange,
  onVisibleChange,
}: {
  label: string;
  title: string;
  visible: boolean;
  onTitleChange: (title: string) => void;
  onVisibleChange: (visible: boolean) => void;
}) {
  return (
    <div className="rounded border border-border/70 p-2">
      <ToggleControl label={label} checked={visible} onChange={onVisibleChange} />
      <label className="mt-2 block space-y-1 text-[11px] font-medium text-muted-foreground">
        标题
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
        />
      </label>
    </div>
  );
}

function AnnotationInspector({
  annotation,
  onUpdate,
  onDelete,
}: {
  annotation: NonNullable<FigureModel["annotations"]>[number];
  onUpdate: (patch: Partial<NonNullable<FigureModel["annotations"]>[number]>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded border border-border/70 p-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">当前注释</div>
      <input
        value={annotation.text}
        onChange={(event) => onUpdate({ text: event.target.value })}
        className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <ToggleControl
          label="显示"
          checked={annotation.visible !== false}
          onChange={(visible) => onUpdate({ visible })}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 justify-center text-[11px]"
          onClick={onDelete}
        >
          删除
        </Button>
      </div>
    </div>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-8 items-center justify-between rounded border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {label === "网格" ? <Grid3X3 className="h-3 w-3" aria-hidden /> : null}
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
    </label>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        value={formatControlNumber(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
      />
    </label>
  );
}

function mergedSelectedStyle(
  selectedElements: SelectedChartElement[],
  elementStyles: Map<string, ChartElementStyle>,
): ChartElementStyle {
  const merged: ChartElementStyle = {};
  for (const item of selectedElements) {
    Object.assign(merged, elementStyles.get(item.elementId));
  }
  return merged;
}

function ChartThumbnail({
  assetId,
  config,
  elementStyles,
}: {
  assetId: string;
  config: ChartConfig;
  elementStyles: Map<string, ChartElementStyle>;
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
                      config,
                      elementStyles,
                      assetId,
                      String(entry[nameKey] ?? ""),
                      String(entry[nameKey] ?? ""),
                      config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
                      entry,
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
                    config,
                    elementStyles,
                    assetId,
                    field,
                    String(entry[xKey] ?? ""),
                    config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
                    entry,
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

function CollageThumbnail({
  collage,
  assets,
}: {
  collage?: CollageSpec;
  assets: VisualAsset[];
}) {
  if (!collage || collage.items.length === 0) {
    return (
      <div className="grid h-full w-full place-items-center text-[11px] font-medium text-muted-foreground">
        Collage
      </div>
    );
  }
  const imageMap = new Map(
    assets
      .filter((a) => a.kind === "image" && a.url)
      .map((a) => [a.id, a.url!]),
  );
  const previewItems = collage.items.slice(0, 4);
  return (
    <div className="grid h-full w-full grid-cols-2 gap-0.5 p-1">
      {previewItems.map((item, index) => {
        const url = imageMap.get(item.assetId);
        return (
          <div key={`${item.assetId}-${index}`} className="overflow-hidden rounded-sm bg-muted/60">
            {url ? (
              <img
                src={url}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
        );
      })}
      {collage.items.length > 4 ? (
        <div className="grid place-items-center text-[10px] text-muted-foreground">
          +{collage.items.length - 4}
        </div>
      ) : null}
    </div>
  );
}

const DEFAULT_THUMB_COLORS = [
  ...JOURNAL_COLORS,
];

function elementColor(
  config: ChartConfig,
  styles: Map<string, { color?: string }>,
  chartId: string,
  series: string,
  category: string | number,
  fallback: string,
  row?: Record<string, unknown>,
): string {
  return resolveElementColor(config, styles, chartId, series, category, fallback, row);
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
    const color = styles.get(chartElementId(chartId, series, String(entry[xKey] ?? "")))?.color;
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

function formatControlNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function hasVisibleBackground(background?: FillSpec): boolean {
  if (!background || background.transparent) return false;
  const color = (background.color ?? "").toLowerCase();
  return !!color && color !== "#ffffff" && color !== "#fff" && color !== "white";
}

function imageBackgroundStyle(background?: FillSpec): CSSProperties {
  if (!background || background.transparent) return { backgroundColor: "#ffffff" };
  const color = background.color ?? "#ffffff";
  const opacity = background.opacity ?? 1;
  const base: CSSProperties = {
    backgroundColor: color,
  };
  if ((background.pattern ?? "none") === "none") return base;
  const patternColor = hexToRgba(background.patternColor ?? "#E5E7EB", background.patternOpacity ?? 0.8);
  const size = background.patternSize ?? 20;
  if (background.pattern === "lines") {
    return {
      ...base,
      backgroundImage: `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
      opacity,
    };
  }
  return {
    ...base,
    backgroundImage: [
      `linear-gradient(to right, ${patternColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
    ].join(", "),
    backgroundSize: `${size}px ${size}px`,
    opacity,
  };
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

async function exportCollageToPng(
  collage: NonNullable<VisualAsset["collage"]>,
  assets: VisualAsset[],
  elementStyles: Map<string, ChartElementStyle>,
  filename: string,
): Promise<void> {
  const { canvasWidth: w, canvasHeight: h, items, background, layout, gap } = collage;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  // Background
  if (!background?.transparent) {
    ctx.fillStyle = background?.color ?? "#ffffff";
    ctx.globalAlpha = background?.opacity ?? 1;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // Resolve effective positions (template mode auto-arranges)
  const effectiveItems =
    layout !== "freeform"
      ? computeTemplatePositions(items, layout, gap ?? 12, w, h)
      : items;

  // Draw items sorted by zIndex
  const sorted = [...effectiveItems].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const item of sorted) {
    const asset = assets.find((a) => a.id === item.assetId);
    if (!asset) continue;

    if (asset.url) {
      try {
        const img = await loadImage(asset.url);
        ctx.save();
        if (item.rotation) {
          const cx = item.x + item.width / 2;
          const cy = item.y + item.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((item.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }
        if (item.fit === "cover") {
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const boxRatio = item.width / item.height;
          let sw: number;
          let sh: number;
          if (imgRatio > boxRatio) {
            sh = img.naturalHeight;
            sw = sh * boxRatio;
          } else {
            sw = img.naturalWidth;
            sh = sw / boxRatio;
          }
          const sx = (img.naturalWidth - sw) / 2;
          const sy = (img.naturalHeight - sh) / 2;
          ctx.drawImage(img, sx, sy, sw, sh, item.x, item.y, item.width, item.height);
        } else {
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const boxRatio = item.width / item.height;
          let dw: number;
          let dh: number;
          if (imgRatio > boxRatio) {
            dw = item.width;
            dh = dw / imgRatio;
          } else {
            dh = item.height;
            dw = dh * imgRatio;
          }
          const dx = item.x + (item.width - dw) / 2;
          const dy = item.y + (item.height - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
        }
        ctx.restore();
      } catch {
        drawPlaceholder(ctx, item, asset.title);
      }
    } else if (asset.chartConfig) {
      // Chart asset — render at default export resolution, then scale to fit
      try {
        const chartCanvas = await renderChartToCanvas(
          asset.id,
          asset.chartConfig,
          elementStyles,
        );
        ctx.save();
        if (item.rotation) {
          const cx = item.x + item.width / 2;
          const cy = item.y + item.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((item.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }
        ctx.drawImage(chartCanvas, item.x, item.y, item.width, item.height);
        ctx.restore();
      } catch {
        drawPlaceholder(ctx, item, asset.title);
      }
    } else {
      drawPlaceholder(ctx, item, asset.title);
    }
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 1),
  );
  if (!blob) throw new Error("PNG export failed");
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  item: { x: number; y: number; width: number; height: number; rotation?: number },
  title: string,
): void {
  ctx.save();
  if (item.rotation) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(item.x, item.y, item.width, item.height);
  ctx.strokeStyle = "#D1D5DB";
  ctx.lineWidth = 2;
  ctx.strokeRect(item.x, item.y, item.width, item.height);
  ctx.fillStyle = "#6B7280";
  ctx.font = `${Math.max(14, Math.min(item.width, item.height) * 0.08)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = item.width - 20;
  const words = title.split("");
  let line = "";
  let y = item.y + item.height / 2;
  const lineHeight = Math.max(16, Math.min(item.width, item.height) * 0.09);
  for (const char of words) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line, item.x + item.width / 2, y);
      y += lineHeight;
      line = char;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, item.x + item.width / 2, y);
  ctx.restore();
}

async function exportImageWithAnchors(
  url: string,
  title: string,
  anchors: VisualAnchor[],
  filename: string,
  background?: FillSpec,
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

    ctx.fillStyle = background?.transparent ? "rgba(255,255,255,0)" : background?.color ?? "#ffffff";
    ctx.globalAlpha = background?.opacity ?? 1;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    if (hasVisibleBackground(background)) {
      ctx.globalCompositeOperation = "multiply";
    }
    ctx.drawImage(img, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
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
  clone.setAttribute("width", String(width * 2));
  clone.setAttribute("height", String(height * 2));

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

async function renderChartToCanvas(
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, ChartElementStyle>,
  figure: FigureModel = normalizeFigureModel(config),
  targetWidth?: number,
  targetHeight?: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  const aspect = ratioNumber(figure.layout?.aspectRatio ?? config.aspectRatio ?? "4:3");
  const logicalW = targetWidth ?? figure.exportSettings?.width ?? 1600;
  const logicalH = targetHeight ?? figure.exportSettings?.height ?? Math.round(logicalW / aspect);
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.scale(dpr, dpr);

  const background = figure.layout?.background;
  if (!background?.transparent) {
    ctx.fillStyle = background?.color ?? JOURNAL_CHART_STYLE.background;
    ctx.globalAlpha = background?.opacity ?? 1;
    ctx.fillRect(0, 0, logicalW, logicalH);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.font = `700 34px ${JOURNAL_CHART_STYLE.fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const titleText = figure.title?.visible === false ? undefined : figure.title?.text ?? config.title;
  if (titleText) {
    ctx.fillText(titleText, 72, 44);
  }

  if (config.type === "pie") {
    drawPieExport(ctx, assetId, config, elementStyles, figure);
  } else if (config.type === "volcano") {
    drawVolcanoExport(ctx, assetId, config, elementStyles, logicalW, logicalH);
  } else if (config.type === "box") {
    drawBoxExport(ctx, assetId, config, elementStyles, logicalW, logicalH);
  } else {
    drawCartesianExport(ctx, assetId, config, elementStyles, figure, logicalW, logicalH);
  }

  const captionText = figure.caption?.visible === false ? undefined : figure.caption?.text ?? config.caption ?? config.description;
  if (captionText && figure.exportSettings?.includeCaption !== false) {
    ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
    ctx.font = `22px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.fillText(captionText, 72, logicalH - 70);
  }

  const visibleAnnotations = figure.annotations?.filter((annotation) => annotation.visible !== false) ?? [];
  if (visibleAnnotations.length > 0) {
    ctx.fillStyle = JOURNAL_CHART_STYLE.mutedText;
    ctx.font = `20px ${JOURNAL_CHART_STYLE.fontFamily}`;
    visibleAnnotations.slice(0, 4).forEach((annotation, index) => {
      ctx.fillText(`• ${annotation.text}`, 72, logicalH - 116 - index * 28);
    });
  }

  return canvas;
}

async function exportChartConfigToPng(
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, ChartElementStyle>,
  filename: string,
  figure: FigureModel = normalizeFigureModel(config),
): Promise<void> {
  const canvas = await renderChartToCanvas(assetId, config, elementStyles, figure);
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
  elementStyles: Map<string, ChartElementStyle>,
  figure: FigureModel,
  logicalW: number,
  logicalH: number,
): void {
  const data = config.data as Record<string, unknown>[];
  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const xKey = config.xField ?? "name";
  if (data.length === 0 || fields.length === 0) return;

  const legendRowCount = Math.ceil(fields.length / 4);
  const bottomMargin = 130 + legendRowCount * 34;
  const plot = { x: 120, y: 150, w: logicalW - 260, h: Math.max(360, logicalH - 150 - bottomMargin) };
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
    if (figure.grid?.visible !== false) {
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.fillText(formatExportNumber(value), plot.x - 14, y);
  }

  ctx.strokeStyle = JOURNAL_CHART_STYLE.axisColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();

  const xAxisTitle = figure.axes?.x?.visible === false ? "" : figure.axes?.x?.title ?? config.xLabel ?? config.xField ?? "";
  const yAxisTitle = figure.axes?.y?.visible === false ? "" : figure.axes?.y?.title ?? config.yLabel ?? (config.unit ? `Value (${config.unit})` : "");

  if (yAxisTitle) {
    ctx.save();
    ctx.translate(34, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
    ctx.font = `24px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(yAxisTitle, 0, 0);
    ctx.restore();
  }

  if (xAxisTitle) {
    ctx.fillStyle = JOURNAL_CHART_STYLE.axisColor;
    ctx.font = `24px ${JOURNAL_CHART_STYLE.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(xAxisTitle, plot.x + plot.w / 2, plot.y + plot.h + 58);
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
        const baseX = plot.x + rowIndex * groupW + barGap + fieldIndex * barW;
        const y = yFor(value);
        const baseline = yFor(0);
        const baseW = barW * 0.82;
        const elementStyle = elementStyles.get(chartElementId(assetId, field, category));
        if (!resolveElementVisible(config, elementStyles, assetId, field, category, true, row)) return;
        const widthScale = resolveElementBarWidthScale(config, elementStyles, assetId, field, category, 1, row);
        const w = baseW * widthScale;
        const x = baseX + (baseW - w) / 2;
        ctx.globalAlpha = elementStyle?.opacity ?? 1;
        ctx.fillStyle = elementColor(
          config,
          elementStyles,
          assetId,
          field,
          category,
          config.colors?.[fieldIndex] ?? DEFAULT_THUMB_COLORS[fieldIndex % DEFAULT_THUMB_COLORS.length],
          row,
        );
        const fillOpacity = resolveElementFillOpacity(config, elementStyles, assetId, field, category, 1, row);
        ctx.globalAlpha = (elementStyle?.opacity ?? 1) * fillOpacity;
        ctx.fillRect(x, Math.min(y, baseline), w, Math.abs(baseline - y));
        ctx.globalAlpha = 1;
        if (elementStyle?.stroke || elementStyle?.strokeWidth) {
          ctx.strokeStyle = elementStyle.stroke ?? JOURNAL_CHART_STYLE.axisColor;
          ctx.lineWidth = elementStyle.strokeWidth ?? 1.5;
          ctx.strokeRect(x, Math.min(y, baseline), w, Math.abs(baseline - y));
        }
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

      points.forEach((point, pointIndex) => {
        const category = String(data[pointIndex]?.[xKey] ?? "");
        const elementStyle = elementStyles.get(chartElementId(assetId, field, category));
        ctx.beginPath();
        ctx.arc(point.x, point.y, elementStyle?.pointSize ?? 5, 0, Math.PI * 2);
        ctx.fillStyle = elementStyle?.color ?? baseColor;
        ctx.globalAlpha = elementStyle?.opacity ?? 1;
        ctx.fill();
        ctx.globalAlpha = 1;
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

  if (figure.legend?.visible !== false) {
    drawLegend(ctx, fields, config.colors, plot.x, plot.y + plot.h + 50);
  }
}

function drawPieExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, ChartElementStyle>,
  figure: FigureModel,
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
      config,
      elementStyles,
      assetId,
      name,
      name,
      config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
      row,
    );
    const elementStyle = elementStyles.get(chartElementId(assetId, name, name));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = elementStyle?.opacity ?? 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = elementStyle?.stroke ?? "#ffffff";
    ctx.lineWidth = elementStyle?.strokeWidth ?? 4;
    ctx.stroke();
    start = end;
  });

  if (figure.legend?.visible !== false) {
    drawLegend(
      ctx,
      data.map((row) => String(row[nameKey] ?? "")),
      data.map((row, index) =>
        elementColor(
          config,
          elementStyles,
          assetId,
          String(row[nameKey] ?? ""),
          String(row[nameKey] ?? ""),
          config.colors?.[index] ?? DEFAULT_THUMB_COLORS[index % DEFAULT_THUMB_COLORS.length],
          row,
        ),
      ),
      1120,
      280,
    );
  }
}

function drawVolcanoExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, ChartElementStyle>,
  logicalW: number,
  logicalH: number,
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
  const plot = { x: 130, y: 150, w: logicalW - 310, h: Math.max(360, logicalH - 320) };
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
    const defaultColor = series === "up" ? journalColor(1) : series === "down" ? journalColor(0) : "#9CA3AF";
    const color = resolveElementColor(config, elementStyles, assetId, series, label, defaultColor, row);
    const opacity = resolveElementOpacity(config, elementStyles, assetId, series, label, series === "not significant" ? 0.45 : 0.82, row);
    const pointSize = resolveElementPointSize(config, elementStyles, assetId, series, label, 3.2, row);
    const stroke = resolveElementStroke(config, elementStyles, assetId, series, label, row);
    const strokeWidth = resolveElementStrokeWidth(config, elementStyles, assetId, series, label, row);
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(xToPx(x), yToPx(y), pointSize, 0, Math.PI * 2);
    ctx.fill();
    if (stroke || strokeWidth) {
      ctx.strokeStyle = stroke ?? JOURNAL_CHART_STYLE.axisColor;
      ctx.lineWidth = strokeWidth ?? 1.5;
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}

function drawBoxExport(
  ctx: CanvasRenderingContext2D,
  assetId: string,
  config: ChartConfig,
  elementStyles: Map<string, ChartElementStyle>,
  logicalW: number,
  logicalH: number,
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
  const plot = { x: 130, y: 150, w: logicalW - 310, h: Math.max(360, logicalH - 320) };
  const yFor = (value: number) => plot.y + ((max - value) / Math.max(1, max - min)) * plot.h;
  drawExportAxes(ctx, plot, config.xLabel ?? config.xField ?? "", config.yLabel ?? (config.unit ? `Value (${config.unit})` : ""));

  data.forEach((row, index) => {
    const category = String(row[xKey] ?? `Group ${index + 1}`);
    const fallbackColor = config.colors?.[index] ?? journalColor(index);
    const color = resolveElementColor(config, elementStyles, assetId, "box", category, fallbackColor, row);
    const fillOpacity = resolveElementFillOpacity(config, elementStyles, assetId, "box", category, 0.62, row);
    const opacity = resolveElementOpacity(config, elementStyles, assetId, "box", category, 1, row);
    const stroke = resolveElementStroke(config, elementStyles, assetId, "box", category, row);
    const strokeWidth = resolveElementStrokeWidth(config, elementStyles, assetId, "box", category, row);
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
    ctx.fillStyle = hexToRgba(color, fillOpacity);
    ctx.globalAlpha = opacity;
    ctx.fillRect(cx - boxW / 2, yQ3, boxW, Math.max(1, yQ1 - yQ3));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke ?? JOURNAL_CHART_STYLE.axisColor;
    ctx.lineWidth = strokeWidth ?? 2;
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
  ctx.save();
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
  ctx.restore();
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
