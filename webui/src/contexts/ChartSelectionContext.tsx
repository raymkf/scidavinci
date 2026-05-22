import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

export interface ActionResult {
  type: string;
  status: "applied" | "ignored" | "failed";
  reason?: string;
  at: number;
}

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
  /** Results from the most recent action application. */
  lastActionResults: ActionResult[];
  /** Dismiss action results. */
  dismissActionResults: () => void;
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

function mergeSelection(
  current: SelectedChartElement[],
  incoming: SelectedChartElement[],
  mode: "replace" | "add" | "toggle",
): SelectedChartElement[] {
  if (mode === "add") {
    const existing = new Set(current.map((item) => item.elementId));
    return [...current, ...incoming.filter((item) => !existing.has(item.elementId))];
  }
  if (mode === "toggle") {
    const toggled = new Map(current.map((item) => [item.elementId, item]));
    for (const item of incoming) {
      if (toggled.has(item.elementId)) {
        toggled.delete(item.elementId);
      } else {
        toggled.set(item.elementId, item);
      }
    }
    return Array.from(toggled.values());
  }
  return incoming;
}

export function ChartSelectionProvider({
  children,
  persistenceKey,
}: {
  children: ReactNode;
  persistenceKey?: string | null;
}) {
  const [selected, setSelected] = useState<SelectedChartElement[]>([]);
  const [elementStyles, setElementStyles] = useState<Map<string, ElementStyle>>(
    () => readPersistedState(persistenceKey).styles,
  );
  const [selectionSets, setSelectionSets] = useState<SelectionSet[]>(
    () => readPersistedState(persistenceKey).selectionSets,
  );
  const [annotations, setAnnotations] = useState<AnnotationSpec[]>(
    () => readPersistedState(persistenceKey).annotations,
  );
  const [figureOverrides, setFigureOverrides] = useState<FigureInteractionOverrides>(
    () => readPersistedState(persistenceKey).figureOverrides,
  );
  const [activeFigureObject, setActiveFigureObject] = useState<FigureObjectRef | null>(null);
  const [lastActionResults, setLastActionResults] = useState<ActionResult[]>([]);

  const dismissActionResults = useCallback(() => setLastActionResults([]), []);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const stateRef = useRef({ styles: elementStyles, selectionSets, annotations, figureOverrides });
  stateRef.current = { styles: elementStyles, selectionSets, annotations, figureOverrides };

  // Track which persistence key's data is currently loaded. If this diverges
  // from persistenceKey the key-based remount didn't happen.
  const loadedKeyRef = useRef(persistenceKey);
  const keyRef = useRef(persistenceKey);
  keyRef.current = persistenceKey;

  // Persist on every state change, only while the loaded key matches the
  // current key, so cross-contamination is impossible.
  useEffect(() => {
    const key = keyRef.current;
    if (key && loadedKeyRef.current === key) {
      persistState(key, { styles: elementStyles, selectionSets, annotations, figureOverrides });
    }
  }, [annotations, elementStyles, figureOverrides, selectionSets]);

  // Defense-in-depth: if persistenceKey changes but the component didn't
  // remount (React key prop didn't trigger a fresh mount), switch manually.
  useEffect(() => {
    if (persistenceKey === loadedKeyRef.current) return;

    // Persist current state to the OLD key before switching.
    if (loadedKeyRef.current) {
      persistState(loadedKeyRef.current, stateRef.current);
    }

    // Load the new key's persisted state.
    const next = readPersistedState(persistenceKey);
    setElementStyles(next.styles);
    setSelectionSets(next.selectionSets);
    setAnnotations(next.annotations);
    setFigureOverrides(next.figureOverrides);
    setSelected([]);
    setActiveFigureObject(null);
    setLastActionResults([]);
    loadedKeyRef.current = persistenceKey;
  }, [persistenceKey]);

  // Persist on unmount, only when the loaded key still matches.
  useEffect(() => {
    return () => {
      const key = keyRef.current;
      if (key && loadedKeyRef.current === key) {
        persistState(key, stateRef.current);
      }
    };
  }, []);

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
    const results: ActionResult[] = [];
    const now = Date.now();
    let workingSelection = selectedRef.current;
    const expandedActions: ChartAction[] = [];
    let implicitSelectionStarted = false;

    for (const action of actions) {
      if (action.type === "select_elements") {
        const incoming = (action.elements ?? action.targetElementIds?.map((elementId) => ({
          elementId,
          chartType: "bar" as const,
          series: "",
          category: "",
          value: 0,
          label: elementId,
        })) ?? []);
        const mode = action.mode ?? (implicitSelectionStarted ? "add" : "replace");
        workingSelection = mergeSelection(workingSelection, incoming, mode);
        implicitSelectionStarted = true;
        expandedActions.push(action);
      } else if (action.type === "clear_selection") {
        workingSelection = [];
        implicitSelectionStarted = false;
        expandedActions.push(action);
      } else if (action.type === "style_current_selection") {
        expandedActions.push({
          type: "update_element_style",
          targetElementIds: workingSelection.map((item) => item.elementId),
          style: action.style,
        });
      } else {
        expandedActions.push(action);
      }
    }

    setElementStyles((prev) => {
      const next = new Map(prev);
      for (const action of expandedActions) {
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
    setSelected((prev) => {
      let next = prev;
      let implicitSelectionStarted = false;
      for (const action of expandedActions) {
        if (action.type === "clear_selection") {
          next = [];
          implicitSelectionStarted = false;
          continue;
        }
        if (action.type !== "select_elements") continue;
        const incoming = (action.elements ?? action.targetElementIds?.map((elementId) => ({
          elementId,
          chartType: "bar" as const,
          series: "",
          category: "",
          value: 0,
          label: elementId,
        })) ?? []);
        const mode = action.mode ?? (implicitSelectionStarted ? "add" : "replace");
        next = mergeSelection(next, incoming, mode);
        implicitSelectionStarted = true;
      }
      return next;
    });
    for (const action of expandedActions) {
      if (action.type === "clear_selection") {
        setActiveFigureObject(null);
      } else if (action.type === "select_elements") {
        const firstId = action.elements?.[0]?.elementId ?? action.targetElementIds?.[0];
        setActiveFigureObject(firstId ? { kind: "mark", id: firstId } : null);
      }
    }
    setSelectionSets((prev) => {
      let next = prev;
      for (const action of expandedActions) {
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
      for (const action of expandedActions) {
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
      for (const action of expandedActions) {
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
      for (const action of expandedActions) {
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
          next = {
            ...next,
            layout: {
              ...(next.layout ?? {}),
              background: { ...(next.layout?.background ?? {}), ...(next.background ?? {}), ...action.patch },
            },
            background: { ...(next.background ?? {}), ...action.patch },
          };
        } else if (action.type === "update_export_settings") {
          next = { ...next, exportSettings: { ...(next.exportSettings ?? {}), ...action.patch } };
        }
      }
      return next;
    });

    // Record results for each action applied
    for (const action of expandedActions) {
      const actionType = action.type;
      const hasTarget =
        (actionType === "style_by_ids" || actionType === "update_element_style") ? (action.targetElementIds?.length ?? 0) > 0
        : actionType === "select_elements" ? ((action.elements?.length ?? action.targetElementIds?.length ?? 0) > 0)
        : actionType === "add_annotation" ? true
        : actionType === "update_annotation" ? !!action.annotationId
        : actionType === "delete_annotation" ? !!action.annotationId
        : true;

      if (hasTarget) {
        results.push({ type: actionType, status: "applied", at: now });
      } else {
        results.push({ type: actionType, status: "ignored", reason: "No target element specified", at: now });
      }
    }

    if (results.length > 0) {
      setLastActionResults((prev) => [...prev, ...results].slice(-20));
    }
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
      lastActionResults,
      dismissActionResults,
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
      lastActionResults,
      dismissActionResults,
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
      lastActionResults: [],
      dismissActionResults: () => {},
      resetStyles: () => {},
    };
  }
  return ctx;
}
