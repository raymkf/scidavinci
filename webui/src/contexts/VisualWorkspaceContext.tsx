import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CollageItem, CollageSpec, FillSpec, VisualAnchor, VisualAsset } from "@/lib/chart-types";

interface VisualWorkspaceContextValue {
  assets: VisualAsset[];
  activeAssetId: string | null;
  activeAsset: VisualAsset | null;
  anchors: VisualAnchor[];
  registerAsset: (asset: VisualAsset) => void;
  openAsset: (assetId: string) => void;
  removeAsset: (assetId: string) => void;
  updateAssetAspectRatio: (assetId: string, aspectRatio: string) => void;
  updateAssetBackground: (assetId: string, patch: FillSpec) => void;
  getAssetAspectRatio: (assetId: string) => string | undefined;
  addImageAnchor: (assetId: string, xPct: number, yPct: number) => void;
  removeAnchor: (anchorId: string) => void;
  clearAnchors: () => void;
  createCollage: (title: string) => string;
  addItemToCollage: (assetId: string, imageAssetId: string) => void;
  updateCollageItem: (assetId: string, itemIndex: number, patch: Partial<CollageItem>) => void;
  removeCollageItem: (assetId: string, itemIndex: number) => void;
  updateCollageSpec: (assetId: string, patch: Partial<CollageSpec>) => void;
}

const VisualWorkspaceContext =
  createContext<VisualWorkspaceContextValue | null>(null);

interface PersistedWorkspace {
  assets: VisualAsset[];
  activeAssetId: string | null;
  anchors: VisualAnchor[];
}

function readPersisted(sessionId?: string | null): PersistedWorkspace {
  if (!sessionId || typeof window === "undefined") {
    return { assets: [], activeAssetId: null, anchors: [] };
  }
  try {
    const raw = window.localStorage.getItem(`nanobot.workspace.${sessionId}`);
    if (!raw) return { assets: [], activeAssetId: null, anchors: [] };
    const parsed = JSON.parse(raw) as PersistedWorkspace;
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      activeAssetId: parsed.activeAssetId ?? null,
      anchors: Array.isArray(parsed.anchors) ? parsed.anchors : [],
    };
  } catch {
    return { assets: [], activeAssetId: null, anchors: [] };
  }
}

function persist(sessionId: string | null | undefined, state: PersistedWorkspace) {
  if (!sessionId || typeof window === "undefined") return;
  try {
    if (state.assets.length === 0 && state.anchors.length === 0) {
      window.localStorage.removeItem(`nanobot.workspace.${sessionId}`);
      return;
    }
    window.localStorage.setItem(
      `nanobot.workspace.${sessionId}`,
      JSON.stringify(state),
    );
  } catch {
    // localStorage may be unavailable
  }
}

export function VisualWorkspaceProvider({
  children,
  sessionId,
}: {
  children: ReactNode;
  sessionId?: string | null;
}) {
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<VisualAnchor[]>([]);
  const hydratedRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const prevKey = hydratedRef.current;
    if (prevKey !== sessionId) {
      // If there was a previous session, persist its final state before switching
      if (prevKey) {
        persist(prevKey, { assets, activeAssetId, anchors });
      }
      // Load new session state
      const next = readPersisted(sessionId);
      setAssets(next.assets);
      setActiveAssetId(next.activeAssetId);
      setAnchors(next.anchors);
      hydratedRef.current = sessionId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Persist on every state change
  useEffect(() => {
    if (hydratedRef.current === sessionId && sessionId) {
      persist(sessionId, { assets, activeAssetId, anchors });
    }
  }, [assets, activeAssetId, anchors, sessionId]);

  const registerAsset = useCallback((asset: VisualAsset) => {
    setAssets((prev) => {
      const existing = prev.find((item) => item.id === asset.id);
      if (existing) {
        return prev.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                ...asset,
                chartConfig: asset.chartConfig
                  ? {
                      ...asset.chartConfig,
                      aspectRatio:
                        item.chartConfig?.aspectRatio ?? asset.chartConfig.aspectRatio,
                    }
                  : asset.chartConfig,
                aspectRatio: item.aspectRatio ?? asset.aspectRatio,
              }
            : item,
        );
      }
      return [...prev, asset];
    });
    setActiveAssetId((current) => current ?? asset.id);
  }, []);

  const openAsset = useCallback((assetId: string) => {
    setActiveAssetId(assetId);
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    setAssets((prev) => prev.filter((item) => item.id !== assetId));
    setAnchors((prev) => prev.filter((item) => item.assetId !== assetId));
    setActiveAssetId((current) => (current === assetId ? null : current));
  }, []);

  const updateAssetAspectRatio = useCallback((assetId: string, aspectRatio: string) => {
    setAssets((prev) =>
      prev.map((item) => {
        if (item.id !== assetId) return item;
        if (item.kind === "chart" && item.chartConfig) {
          return {
            ...item,
            chartConfig: { ...item.chartConfig, aspectRatio },
          };
        }
        return { ...item, aspectRatio };
      }),
    );
  }, []);

  const updateAssetBackground = useCallback((assetId: string, patch: FillSpec) => {
    setAssets((prev) =>
      prev.map((item) =>
        item.id === assetId
          ? { ...item, background: { ...(item.background ?? {}), ...patch } }
          : item,
      ),
    );
  }, []);

  const createCollage = useCallback((title: string): string => {
    const id = `collage-${Date.now()}`;
    const asset: VisualAsset = {
      id,
      kind: "collage",
      title,
      createdAt: Date.now(),
      collage: {
        items: [],
        layout: "freeform",
        canvasWidth: 1600,
        canvasHeight: 1200,
        gap: 12,
      },
    };
    setAssets((prev) => [...prev, asset]);
    setActiveAssetId(id);
    return id;
  }, []);

  const addItemToCollage = useCallback((assetId: string, imageAssetId: string) => {
    setAssets((prev) =>
      prev.map((item) => {
        if (item.id !== assetId || !item.collage) return item;
        const defaultW = item.collage.canvasWidth * 0.4;
        const defaultH = item.collage.canvasHeight * 0.4;
        const index = item.collage.items.length;
        const gap = item.collage.gap ?? 12;
        const newItem: CollageItem = {
          assetId: imageAssetId,
          x: (index % 3) * (defaultW + gap) + 40,
          y: Math.floor(index / 3) * (defaultH + gap) + 40,
          width: defaultW,
          height: defaultH,
          fit: "contain",
          zIndex: index,
        };
        return {
          ...item,
          collage: { ...item.collage, items: [...item.collage.items, newItem] },
        };
      }),
    );
  }, []);

  const updateCollageItem = useCallback(
    (assetId: string, itemIndex: number, patch: Partial<CollageItem>) => {
      setAssets((prev) =>
        prev.map((item) => {
          if (item.id !== assetId || !item.collage) return item;
          const items = item.collage.items.map((ci, i) =>
            i === itemIndex ? { ...ci, ...patch } : ci,
          );
          return { ...item, collage: { ...item.collage, items } };
        }),
      );
    },
    [],
  );

  const removeCollageItem = useCallback((assetId: string, itemIndex: number) => {
    setAssets((prev) =>
      prev.map((item) => {
        if (item.id !== assetId || !item.collage) return item;
        const items = item.collage.items.filter((_, i) => i !== itemIndex);
        return { ...item, collage: { ...item.collage, items } };
      }),
    );
  }, []);

  const updateCollageSpec = useCallback(
    (assetId: string, patch: Partial<CollageSpec>) => {
      setAssets((prev) =>
        prev.map((item) => {
          if (item.id !== assetId || !item.collage) return item;
          return { ...item, collage: { ...item.collage, ...patch } };
        }),
      );
    },
    [],
  );

  const getAssetAspectRatio = useCallback(
    (assetId: string) =>
      {
        const asset = assets.find((item) => item.id === assetId);
        return (asset?.aspectRatio ?? asset?.chartConfig?.aspectRatio) as string | undefined;
      },
    [assets],
  );

  const addImageAnchor = useCallback(
    (assetId: string, xPct: number, yPct: number) => {
      setAnchors((prev) => {
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) return prev;
        const ordinal =
          prev.filter((item) => item.assetId === assetId).length + 1;
        const label = `${asset.title} @ ${Math.round(xPct)}%, ${Math.round(yPct)}%`;
        return [
          ...prev,
          {
            id: `${assetId}-anchor-${Date.now()}-${ordinal}`,
            assetId,
            assetTitle: asset.title,
            kind: asset.kind,
            xPct,
            yPct,
            label,
          },
        ];
      });
    },
    [assets],
  );

  const removeAnchor = useCallback((anchorId: string) => {
    setAnchors((prev) => prev.filter((item) => item.id !== anchorId));
  }, []);

  const clearAnchors = useCallback(() => {
    setAnchors([]);
  }, []);

  const activeAsset = useMemo(
    () => assets.find((item) => item.id === activeAssetId) ?? assets[0] ?? null,
    [activeAssetId, assets],
  );

  const value = useMemo(
    () => ({
      assets,
      activeAssetId: activeAsset?.id ?? null,
      activeAsset,
      anchors,
      registerAsset,
      openAsset,
      removeAsset,
      updateAssetAspectRatio,
      updateAssetBackground,
      getAssetAspectRatio,
      addImageAnchor,
      removeAnchor,
      clearAnchors,
      createCollage,
      addItemToCollage,
      updateCollageItem,
      removeCollageItem,
      updateCollageSpec,
    }),
    [
      assets,
      activeAsset,
      anchors,
      registerAsset,
      openAsset,
      removeAsset,
      updateAssetAspectRatio,
      updateAssetBackground,
      getAssetAspectRatio,
      addImageAnchor,
      removeAnchor,
      clearAnchors,
      createCollage,
      addItemToCollage,
      updateCollageItem,
      removeCollageItem,
      updateCollageSpec,
    ],
  );

  return (
    <VisualWorkspaceContext.Provider value={value}>
      {children}
    </VisualWorkspaceContext.Provider>
  );
}

export function useVisualWorkspace(): VisualWorkspaceContextValue {
  const ctx = useContext(VisualWorkspaceContext);
  if (!ctx) {
    return {
      assets: [],
      activeAssetId: null,
      activeAsset: null,
      anchors: [],
      registerAsset: () => {},
      openAsset: () => {},
      removeAsset: () => {},
      updateAssetAspectRatio: () => {},
      updateAssetBackground: () => {},
      getAssetAspectRatio: () => undefined,
      addImageAnchor: () => {},
      removeAnchor: () => {},
      clearAnchors: () => {},
      createCollage: () => "",
      addItemToCollage: () => {},
      updateCollageItem: () => {},
      removeCollageItem: () => {},
      updateCollageSpec: () => {},
    };
  }
  return ctx;
}
