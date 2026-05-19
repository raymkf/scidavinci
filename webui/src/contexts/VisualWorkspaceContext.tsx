import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { VisualAnchor, VisualAsset } from "@/lib/chart-types";

interface VisualWorkspaceContextValue {
  assets: VisualAsset[];
  activeAssetId: string | null;
  activeAsset: VisualAsset | null;
  anchors: VisualAnchor[];
  registerAsset: (asset: VisualAsset) => void;
  openAsset: (assetId: string) => void;
  removeAsset: (assetId: string) => void;
  updateAssetAspectRatio: (assetId: string, aspectRatio: string) => void;
  getAssetAspectRatio: (assetId: string) => string | undefined;
  addImageAnchor: (assetId: string, xPct: number, yPct: number) => void;
  removeAnchor: (anchorId: string) => void;
  clearAnchors: () => void;
}

const VisualWorkspaceContext =
  createContext<VisualWorkspaceContextValue | null>(null);

export function VisualWorkspaceProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<VisualAnchor[]>([]);

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
      getAssetAspectRatio,
      addImageAnchor,
      removeAnchor,
      clearAnchors,
    }),
    [
      assets,
      activeAsset,
      anchors,
      registerAsset,
      openAsset,
      removeAsset,
      updateAssetAspectRatio,
      getAssetAspectRatio,
      addImageAnchor,
      removeAnchor,
      clearAnchors,
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
      getAssetAspectRatio: () => undefined,
      addImageAnchor: () => {},
      removeAnchor: () => {},
      clearAnchors: () => {},
    };
  }
  return ctx;
}
