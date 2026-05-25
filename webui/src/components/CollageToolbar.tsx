import { useCallback, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Grid3X3,
  ImagePlus,
  Layers,
  Trash2,
} from "lucide-react";

import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import type { CollageItem, CollageLayout, CollageSpec } from "@/lib/chart-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LAYOUTS: CollageLayout[] = ["freeform", "1x2", "2x1", "2x2", "2x3", "3x2"];

const LAYOUT_LABELS: Record<CollageLayout, string> = {
  freeform: "Free",
  "1x2": "1x2",
  "2x1": "2x1",
  "2x2": "2x2",
  "2x3": "2x3",
  "3x2": "3x2",
};

export function CollageToolbar({
  collage,
  selectedItemIndex,
  onUpdateSpec,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onExport,
  exporting,
}: {
  collage: CollageSpec;
  selectedItemIndex: number | null;
  onUpdateSpec: (patch: Partial<CollageSpec>) => void;
  onAddItem: (imageAssetId: string) => void;
  onUpdateItem: (index: number, patch: Partial<CollageItem>) => void;
  onRemoveItem: (index: number) => void;
  onExport: () => void;
  exporting?: boolean;
}) {
  const { assets } = useVisualWorkspace();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const addableAssets = useMemo(
    () =>
      assets
        .filter((a) => a.kind === "image" || a.kind === "chart")
        .map((a) => ({
          id: a.id,
          kind: a.kind,
          url: a.url,
          title: a.title,
        })),
    [assets],
  );

  const selectedItem = selectedItemIndex !== null ? collage.items[selectedItemIndex] : null;

  const handleFitToggle = useCallback(() => {
    if (selectedItemIndex === null || !selectedItem) return;
    onUpdateItem(selectedItemIndex, {
      fit: selectedItem.fit === "cover" ? "contain" : "cover",
    });
  }, [selectedItemIndex, selectedItem, onUpdateItem]);

  const handleBringToFront = useCallback(() => {
    if (selectedItemIndex === null) return;
    const maxZ = Math.max(0, ...collage.items.map((item) => item.zIndex ?? 0));
    onUpdateItem(selectedItemIndex, { zIndex: maxZ + 1 });
  }, [selectedItemIndex, collage.items, onUpdateItem]);

  const handleSendToBack = useCallback(() => {
    if (selectedItemIndex === null) return;
    const minZ = Math.min(0, ...collage.items.map((item) => item.zIndex ?? 0));
    onUpdateItem(selectedItemIndex, { zIndex: minZ - 1 });
  }, [selectedItemIndex, collage.items, onUpdateItem]);

  return (
    <div className="space-y-2">
      {/* Layout selector */}
      <div className="flex items-center gap-1.5">
        <Grid3X3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-[11px] text-muted-foreground">Layout</span>
        <div className="flex flex-1 items-center justify-end gap-0.5">
          {LAYOUTS.map((layout) => (
            <button
              key={layout}
              type="button"
              onClick={() => onUpdateSpec({ layout })}
              className={cn(
                "h-6 rounded px-1.5 text-[11px] font-medium transition-colors",
                collage.layout === layout
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LAYOUT_LABELS[layout]}
            </button>
          ))}
        </div>
      </div>

      {/* Gap control (template mode only) */}
      {collage.layout !== "freeform" ? (
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Gap
          <input
            type="range"
            min="0"
            max="48"
            step="2"
            value={collage.gap ?? 12}
            onChange={(e) => onUpdateSpec({ gap: Number(e.target.value) })}
            className="h-4 flex-1 accent-primary"
          />
          <span className="w-6 text-right tabular-nums">{collage.gap ?? 12}</span>
        </label>
      ) : null}

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {/* Add image */}
          <div className="relative" ref={pickerRef}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setShowPicker((prev) => !prev)}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Add
            </Button>
            {showPicker ? (
              <AssetPickerPopover
                assets={addableAssets}
                usedIds={new Set(collage.items.map((item) => item.assetId))}
                onSelect={(id) => {
                  onAddItem(id);
                  setShowPicker(false);
                }}
                onClose={() => setShowPicker(false)}
              />
            ) : null}
          </div>

          {/* Item operations (when selected) */}
          {selectedItem ? (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={handleFitToggle}
              >
                <FolderOpen className="h-3 w-3" />
                {selectedItem.fit === "cover" ? "Contain" : "Cover"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={handleBringToFront}
              >
                <Layers className="h-3 w-3" />
                Front
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={handleSendToBack}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
                onClick={() => {
                  if (selectedItemIndex !== null) onRemoveItem(selectedItemIndex);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          ) : null}
        </div>

        {/* Export */}
        <Button
          type="button"
          variant={collage.items.length > 0 ? "default" : "outline"}
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={onExport}
          disabled={exporting || collage.items.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export PNG
        </Button>
      </div>
    </div>
  );
}

function AssetPickerPopover({
  assets: addable,
  usedIds,
  onSelect,
  onClose,
}: {
  assets: { id: string; kind: string; url?: string; title: string }[];
  usedIds: Set<string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-lg border border-border bg-background p-2 shadow-lg">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          Workspace Assets
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      {addable.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-muted-foreground">
          No assets yet — generate images or charts first
        </p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {addable.map((asset) => {
            const used = usedIds.has(asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                disabled={used}
                onClick={() => onSelect(asset.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
                  used
                    ? "cursor-not-allowed opacity-40"
                    : "hover:bg-muted",
                )}
              >
                {asset.url ? (
                  <img
                    src={asset.url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-muted text-[10px] text-muted-foreground">
                    {asset.kind === "chart" ? "Ch" : "?"}
                  </div>
                )}
                <span className="min-w-0 truncate text-[11px]">{asset.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {asset.kind === "chart" ? "chart" : used ? "used" : "img"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
