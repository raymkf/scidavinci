import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  AnnotationSpec,
  ChartAction,
  ChartElementMetadata,
  ChartElementStyle,
  FigureInteractionOverrides,
  FigureObjectRef,
  SelectedChartElement,
  SelectionSet,
} from "@/lib/chart-types";

interface ChartSelectionContextValue {
  selectedElements: SelectedChartElement[];
  /** Toggle an element's selection state. */
  toggleElement: (meta: ChartElementMetadata) => void;
  /** Remove a single element from selection. */
  removeElement: (elementId: string) => void;
  /** Clear all selected elements. */
  clearSelection: () => void;
  /** Applied chart actions (e.g. color overrides). */
  elementStyles: Map<string, ChartElementStyle>;
  selectionSets: SelectionSet[];
  annotations: AnnotationSpec[];
  figureOverrides: FigureInteractionOverrides;
  activeFigureObject: FigureObjectRef | null;
  selectFigureObject: (object: FigureObjectRef | null) => void;
  /** Apply one or more chart actions. */
  applyActions: (actions: ChartAction[]) => void;
  /** Reset all applied styles. */
  resetStyles: () => void;
}

const ChartSelectionContext = createContext<ChartSelectionContextValue | null>(null);

type ElementStyle = ChartElementStyle;

interface PersistedChartState {
  styles?: Array<[string, ElementStyle]>;
  selectionSets?: SelectionSet[];
  annotations?: AnnotationSpec[];
  figureOverrides?: FigureInteractionOverrides;
}

function applyStyleField<K extends keyof ElementStyle>(
  style: ElementStyle,
  key: K,
  value: ElementStyle[K] | undefined,
) {
  if (value === undefined) {
    delete style[key];
  } else {
    style[key] = value;
  }
}

function readPersistedState(key?: string | null): {
  styles: Map<string, ElementStyle>;
  selectionSets: SelectionSet[];
  annotations: AnnotationSpec[];
  figureOverrides: FigureInteractionOverrides;
} {
  if (!key || typeof window === "undefined") {
    return {
      styles: new Map(),
      selectionSets: [],
      annotations: [],
      figureOverrides: {},
    };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return {
        styles: new Map(),
        selectionSets: [],
        annotations: [],
        figureOverrides: {},
      };
    }
    const parsed = JSON.parse(raw) as PersistedChartState | Array<[string, ElementStyle]>;
    if (Array.isArray(parsed)) {
      return {
        styles: new Map(parsed),
        selectionSets: [],
        annotations: [],
        figureOverrides: {},
      };
    }
    return {
      styles: new Map(Array.isArray(parsed.styles) ? parsed.styles : []),
      selectionSets: Array.isArray(parsed.selectionSets) ? parsed.selectionSets : [],
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
      figureOverrides: parsed.figureOverrides ?? {},
    };
  } catch {
    return {
      styles: new Map(),
      selectionSets: [],
      annotations: [],
      figureOverrides: {},
    };
  }
}

function persistState(
  key: string | null | undefined,
  state: {
    styles: Map<string, ElementStyle>;
    selectionSets: SelectionSet[];
    annotations: AnnotationSpec[];
    figureOverrides: FigureInteractionOverrides;
  },
) {
  if (!key || typeof window === "undefined") return;
  try {
    if (
      state.styles.size === 0
      && state.selectionSets.length === 0
      && state.annotations.length === 0
      && Object.keys(state.figureOverrides).length === 0
    ) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify({
      styles: Array.from(state.styles.entries()),
      selectionSets: state.selectionSets,
      annotations: state.annotations,
      figureOverrides: state.figureOverrides,
    }));
  } catch {
    // localStorage can be unavailable in private browsing or full storage.
  }
}

export function ChartSelectionProvider({
  children,
  persistenceKey,
}: {
  children: ReactNode;
  persistenceKey?: string | null;
}) {
  const persisted = useMemo(() => readPersistedState(persistenceKey), [persistenceKey]);
  const [selected, setSelected] = useState<SelectedChartElement[]>([]);
  const [elementStyles, setElementStyles] = useState<Map<string, ElementStyle>>(
    () => persisted.styles,
  );
  const [selectionSets, setSelectionSets] = useState<SelectionSet[]>(() => persisted.selectionSets);
  const [annotations, setAnnotations] = useState<AnnotationSpec[]>(() => persisted.annotations);
  const [figureOverrides, setFigureOverrides] = useState<FigureInteractionOverrides>(() => persisted.figureOverrides);
  const [activeFigureObject, setActiveFigureObject] = useState<FigureObjectRef | null>(null);

  useEffect(() => {
    const next = readPersistedState(persistenceKey);
    setSelected([]);
    setElementStyles(next.styles);
    setSelectionSets(next.selectionSets);
    setAnnotations(next.annotations);
    setFigureOverrides(next.figureOverrides);
    setActiveFigureObject(null);
  }, [persistenceKey]);

  useEffect(() => {
    persistState(persistenceKey, {
      styles: elementStyles,
      selectionSets,
      annotations,
      figureOverrides,
    });
  }, [annotations, elementStyles, figureOverrides, persistenceKey, selectionSets]);

  const toggleElement = useCallback((meta: ChartElementMetadata) => {
    setActiveFigureObject({ kind: "mark", id: meta.elementId });
    setSelected((prev) => {
      const existing = prev.findIndex((e) => e.elementId === meta.elementId);
      if (existing >= 0) {
        return prev.filter((_, i) => i !== existing);
      }
      return [
        ...prev,
        {
          elementId: meta.elementId,
          chartType: meta.chartType,
          series: meta.series,
          category: meta.category,
          value: meta.value,
          label: meta.label,
          sourceRow: meta.sourceRow,
        },
      ];
    });
  }, []);

  const removeElement = useCallback((elementId: string) => {
    setSelected((prev) => prev.filter((e) => e.elementId !== elementId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected([]);
    setActiveFigureObject(null);
  }, []);

  const selectFigureObject = useCallback((object: FigureObjectRef | null) => {
    setActiveFigureObject(object);
    if (object?.kind !== "mark") {
      setSelected([]);
    }
  }, []);

  const applyActions = useCallback((actions: ChartAction[]) => {
    setElementStyles((prev) => {
      const next = new Map(prev);
      for (const action of actions) {
        if ((action.type === "update_element_style" || action.type === "style_by_ids") && action.style) {
          for (const id of action.targetElementIds) {
            const existing = next.get(id) ?? {};
            const merged = { ...existing };
            if ("color" in action.style) applyStyleField(merged, "color", action.style.color);
            if ("stroke" in action.style) applyStyleField(merged, "stroke", action.style.stroke);
            if ("strokeWidth" in action.style) applyStyleField(merged, "strokeWidth", action.style.strokeWidth);
            if ("fillOpacity" in action.style) applyStyleField(merged, "fillOpacity", action.style.fillOpacity);
            if ("opacity" in action.style) applyStyleField(merged, "opacity", action.style.opacity);
            if ("pointSize" in action.style) applyStyleField(merged, "pointSize", action.style.pointSize);
            if ("visible" in action.style) applyStyleField(merged, "visible", action.style.visible);
            if ("zIndex" in action.style) applyStyleField(merged, "zIndex", action.style.zIndex);
            if ("barWidthScale" in action.style) applyStyleField(merged, "barWidthScale", action.style.barWidthScale);
            if ("fontSize" in action.style) applyStyleField(merged, "fontSize", action.style.fontSize);
            if ("fontWeight" in action.style) applyStyleField(merged, "fontWeight", action.style.fontWeight);
            if ("textColor" in action.style) applyStyleField(merged, "textColor", action.style.textColor);
            if (Object.keys(merged).length === 0) {
              next.delete(id);
            } else {
              next.set(id, merged);
            }
          }
        }
      }
      return next;
    });
    setSelectionSets((prev) => {
      let next = prev;
      for (const action of actions) {
        if (action.type !== "create_selection_set") continue;
        const set: SelectionSet = {
          id: `selection-${Date.now()}-${next.length + 1}`,
          name: action.name,
          elementIds: action.elementIds,
          query: action.query,
          createdAt: Date.now(),
        };
        next = [...next, set];
      }
      return next;
    });
    setAnnotations((prev) => {
      let next = prev;
      for (const action of actions) {
        if (action.type !== "add_annotation") continue;
        const id = action.annotation?.id ?? `annotation-${Date.now()}-${next.length + 1}`;
        next = [
          ...next,
          {
            id,
            text: action.annotation?.text ?? action.text ?? "Annotation",
            elementIds: action.annotation?.elementIds ?? action.targetElementIds,
            connector: action.annotation?.connector ?? "arrow",
            visible: action.annotation?.visible ?? true,
            target: action.annotation?.target,
            xPct: action.annotation?.xPct,
            yPct: action.annotation?.yPct,
            style: action.annotation?.style,
          },
        ];
      }
      for (const action of actions) {
        if (action.type === "update_annotation") {
          next = next.map((annotation) =>
            annotation.id === action.annotationId
              ? { ...annotation, ...action.patch, id: annotation.id }
              : annotation,
          );
        } else if (action.type === "delete_annotation") {
          next = next.filter((annotation) => annotation.id !== action.annotationId);
        }
      }
      return next;
    });
    setFigureOverrides((prev) => {
      let next = prev;
      for (const action of actions) {
        if (action.type === "update_axis") {
          next = {
            ...next,
            axes: {
              ...next.axes,
              [action.axis]: { ...(next.axes?.[action.axis] ?? {}), ...action.patch },
            },
          };
        } else if (action.type === "update_scale") {
          next = {
            ...next,
            scales: {
              ...next.scales,
              [action.scale]: { ...(next.scales?.[action.scale] ?? {}), ...action.patch },
            },
          };
        } else if (action.type === "update_legend") {
          next = { ...next, legend: { ...(next.legend ?? {}), ...action.patch } };
        } else if (action.type === "update_grid") {
          next = { ...next, grid: { ...(next.grid ?? {}), ...action.patch } };
        } else if (action.type === "update_text_block") {
          next = { ...next, [action.target]: { ...(next[action.target] ?? {}), ...action.patch } };
        } else if (action.type === "update_layout") {
          next = { ...next, layout: { ...(next.layout ?? {}), ...action.patch } };
        } else if (action.type === "update_background") {
          next = { ...next, background: { ...(next.background ?? {}), ...action.patch } };
        } else if (action.type === "update_export_settings") {
          next = { ...next, exportSettings: { ...(next.exportSettings ?? {}), ...action.patch } };
        }
      }
      return next;
    });
  }, []);

  const resetStyles = useCallback(() => {
    setElementStyles(new Map());
    setSelectionSets([]);
    setAnnotations([]);
    setFigureOverrides({});
    setActiveFigureObject(null);
  }, []);

  const value = useMemo(
    () => ({
      selectedElements: selected,
      toggleElement,
      removeElement,
      clearSelection,
      elementStyles,
      selectionSets,
      annotations,
      figureOverrides,
      activeFigureObject,
      selectFigureObject,
      applyActions,
      resetStyles,
    }),
    [
      selected,
      toggleElement,
      removeElement,
      clearSelection,
      elementStyles,
      selectionSets,
      annotations,
      figureOverrides,
      activeFigureObject,
      selectFigureObject,
      applyActions,
      resetStyles,
    ],
  );

  return <ChartSelectionContext.Provider value={value}>{children}</ChartSelectionContext.Provider>;
}

export function useChartSelection(): ChartSelectionContextValue {
  const ctx = useContext(ChartSelectionContext);
  if (!ctx) {
    // Return a noop default so tests and contexts without the provider don't crash.
    return {
      selectedElements: [],
      toggleElement: () => {},
      removeElement: () => {},
      clearSelection: () => {},
      elementStyles: new Map(),
      selectionSets: [],
      annotations: [],
      figureOverrides: {},
      activeFigureObject: null,
      selectFigureObject: () => {},
      applyActions: () => {},
      resetStyles: () => {},
    };
  }
  return ctx;
}
