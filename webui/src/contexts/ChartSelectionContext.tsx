import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ChartAction, ChartElementMetadata, SelectedChartElement } from "@/lib/chart-types";

interface ChartSelectionContextValue {
  selectedElements: SelectedChartElement[];
  /** Toggle an element's selection state. */
  toggleElement: (meta: ChartElementMetadata) => void;
  /** Remove a single element from selection. */
  removeElement: (elementId: string) => void;
  /** Clear all selected elements. */
  clearSelection: () => void;
  /** Applied chart actions (e.g. color overrides). */
  elementStyles: Map<string, { color?: string; stroke?: string; strokeWidth?: number }>;
  /** Apply one or more chart actions. */
  applyActions: (actions: ChartAction[]) => void;
  /** Reset all applied styles. */
  resetStyles: () => void;
}

const ChartSelectionContext = createContext<ChartSelectionContextValue | null>(null);

type ElementStyle = { color?: string; stroke?: string; strokeWidth?: number };

function readPersistedStyles(key?: string | null): Map<string, ElementStyle> {
  if (!key || typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map();
    const entries = JSON.parse(raw) as Array<[string, ElementStyle]>;
    if (!Array.isArray(entries)) return new Map();
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function persistStyles(key: string | null | undefined, styles: Map<string, ElementStyle>) {
  if (!key || typeof window === "undefined") return;
  try {
    if (styles.size === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(Array.from(styles.entries())));
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
  const [selected, setSelected] = useState<SelectedChartElement[]>([]);
  const [elementStyles, setElementStyles] = useState<Map<string, ElementStyle>>(
    () => readPersistedStyles(persistenceKey),
  );

  useEffect(() => {
    setSelected([]);
    setElementStyles(readPersistedStyles(persistenceKey));
  }, [persistenceKey]);

  useEffect(() => {
    persistStyles(persistenceKey, elementStyles);
  }, [elementStyles, persistenceKey]);

  const toggleElement = useCallback((meta: ChartElementMetadata) => {
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
  }, []);

  const applyActions = useCallback((actions: ChartAction[]) => {
    setElementStyles((prev) => {
      const next = new Map(prev);
      for (const action of actions) {
        if (action.type === "update_element_style" && action.style) {
          for (const id of action.targetElementIds) {
            const existing = next.get(id) ?? {};
            next.set(id, { ...existing, ...action.style });
          }
        }
      }
      return next;
    });
  }, []);

  const resetStyles = useCallback(() => {
    setElementStyles(new Map());
  }, []);

  const value = useMemo(
    () => ({
      selectedElements: selected,
      toggleElement,
      removeElement,
      clearSelection,
      elementStyles,
      applyActions,
      resetStyles,
    }),
    [selected, toggleElement, removeElement, clearSelection, elementStyles, applyActions, resetStyles],
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
      applyActions: () => {},
      resetStyles: () => {},
    };
  }
  return ctx;
}
