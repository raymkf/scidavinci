export { registerChartType, getChartType, getAllChartTypes, getChartTypesByFamily, getChartFamilies, findSuitableCharts, isChartTypeRegistered, clearRegistry } from "./registry";
export type { ChartFamily, JournalPreset, JournalConvention, FieldRequirement, OverlayZone, OverlayConfig, ChartRenderContext, ChartData, RenderConfig, ChartTypeRegistration, PlotRecommendation, PlotPlan } from "./types";
export { createStage, createChartLayer, createOverlayLayer, computePlotLayout, getJournalStyle, resolveColor, drawTitle, drawCaption, drawBackground, drawGrid, drawAxes, computeLinearTicks, formatNumber, createLinearScale, createBandScale, getElementStyle, JOURNAL_PRESETS } from "./renderer-base";
export { buildOverlay, updateOverlaySelections, clearOverlay } from "./overlay-engine";
export type { OverlayCallbacks } from "./overlay-engine";
export { createThumbnailCanvas, drawThumbnailBackground, drawThumbnailBar, drawThumbnailLine, drawThumbnailPie, drawThumbnailScatter, drawThumbnailHeatmap, drawThumbnailViolin, THUMBNAIL_SIZE } from "./thumbnail-base";
