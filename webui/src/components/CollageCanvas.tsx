import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import type { CollageItem, CollageSpec, FillSpec } from "@/lib/chart-types";
import { cn } from "@/lib/utils";
import { CollageChartPreview } from "@/components/CollageChartPreview";

const HANDLE_SIZE = 8;
const HANDLES = [
  { dir: "nw" as const, cursor: "nwse-resize", style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
  { dir: "n" as const, cursor: "ns-resize", style: { top: -HANDLE_SIZE / 2, left: "50%", marginLeft: -HANDLE_SIZE / 2 } },
  { dir: "ne" as const, cursor: "nesw-resize", style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  { dir: "e" as const, cursor: "ew-resize", style: { top: "50%", marginTop: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  { dir: "se" as const, cursor: "nwse-resize", style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  { dir: "s" as const, cursor: "ns-resize", style: { bottom: -HANDLE_SIZE / 2, left: "50%", marginLeft: -HANDLE_SIZE / 2 } },
  { dir: "sw" as const, cursor: "nesw-resize", style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
  { dir: "w" as const, cursor: "ew-resize", style: { top: "50%", marginTop: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
];

interface DragState {
  itemIndex: number;
  startX: number;
  startY: number;
  itemStartX: number;
  itemStartY: number;
  itemStartW: number;
  itemStartH: number;
  handle: (typeof HANDLES)[number]["dir"] | "move" | "rotate";
  startAngle: number;
  itemStartRotation: number;
  centerX: number;
  centerY: number;
}

export function CollageCanvas({
  collage,
  selectedItemIndex,
  onSelectItem,
  onUpdateItem,
  onRemoveItem,
}: {
  collage: CollageSpec;
  selectedItemIndex: number | null;
  onSelectItem: (index: number | null) => void;
  onUpdateItem: (index: number, patch: Partial<CollageItem>) => void;
  onRemoveItem: (index: number) => void;
}) {
  const { assets } = useVisualWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [scale, setScale] = useState(1);

  const canvasW = collage.canvasWidth;
  const canvasH = collage.canvasHeight;

  // Track the container's actual rendered width to compute scale
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (rect.width > 0) {
          setScale(rect.width / canvasW);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasW]);

  // Compute effective item positions based on layout mode
  const effectiveItems = useMemo(() => {
    if (collage.layout === "freeform") return collage.items;
    return computeTemplatePositions(
      collage.items,
      collage.layout,
      collage.gap ?? 12,
      canvasW,
      canvasH,
    );
  }, [collage.items, collage.layout, collage.gap, canvasW, canvasH]);

  // Compute unoccupied template cell positions for dashed placeholders
  const emptyTemplateCells = useMemo(() => {
    if (collage.layout === "freeform") return [];
    const { cols, rows } = templateGrid(collage.layout);
    const totalCells = cols * rows;
    const cells: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let i = 0; i < totalCells; i++) {
      if (i < collage.items.length) continue;
      const gap = collage.gap ?? 12;
      const cellW = (canvasW - gap * (cols + 1)) / cols;
      const cellH = (canvasH - gap * (rows + 1)) / rows;
      const col = i % cols;
      const row = Math.floor(i / cols);
      cells.push({
        x: gap + col * (cellW + gap),
        y: gap + row * (cellH + gap),
        width: cellW,
        height: cellH,
      });
    }
    return cells;
  }, [collage.layout, collage.items.length, collage.gap, canvasW, canvasH]);

  // Asset lookup by assetId
  const assetLookup = useMemo(() => {
    const map = new Map<string, { url?: string; title: string; kind: string }>();
    for (const asset of assets) {
      if (asset.kind === "image" || asset.kind === "chart") {
        map.set(asset.id, { url: asset.url, title: asset.title, kind: asset.kind });
      }
    }
    return map;
  }, [assets]);

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || scale <= 0) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale],
  );

  // Pointer event handlers
  const onPointerDown = useCallback(
    (e: React.PointerEvent, itemIndex: number, handle: DragState["handle"]) => {
      e.preventDefault();
      e.stopPropagation();
      const item = effectiveItems[itemIndex];
      if (!item) return;
      const canvas = toCanvas(e.clientX, e.clientY);
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      dragRef.current = {
        itemIndex,
        startX: canvas.x,
        startY: canvas.y,
        itemStartX: item.x,
        itemStartY: item.y,
        itemStartW: item.width,
        itemStartH: item.height,
        handle,
        startAngle: Math.atan2(canvas.y - centerY, canvas.x - centerX),
        itemStartRotation: item.rotation ?? 0,
        centerX,
        centerY,
      };
      onSelectItem(itemIndex);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [effectiveItems, toCanvas, onSelectItem],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const canvas = toCanvas(e.clientX, e.clientY);
      const dx = canvas.x - drag.startX;
      const dy = canvas.y - drag.startY;

      if (drag.handle === "move") {
        onUpdateItem(drag.itemIndex, {
          x: drag.itemStartX + dx,
          y: drag.itemStartY + dy,
        });
      } else if (drag.handle === "rotate") {
        const angle = Math.atan2(canvas.y - drag.centerY, canvas.x - drag.centerX);
        let rotation = drag.itemStartRotation + (angle - drag.startAngle) * (180 / Math.PI);
        // Snap to 15-degree increments with shift
        if (e.shiftKey) {
          rotation = Math.round(rotation / 15) * 15;
        }
        onUpdateItem(drag.itemIndex, { rotation });
      } else {
        // Resize handles
        const patch: Partial<CollageItem> = {};
        const minW = 40;
        const minH = 40;

        if (drag.handle.includes("e")) {
          patch.width = Math.max(minW, drag.itemStartW + dx);
        }
        if (drag.handle.includes("w")) {
          const newW = Math.max(minW, drag.itemStartW - dx);
          patch.width = newW;
          patch.x = drag.itemStartX + drag.itemStartW - newW;
        }
        if (drag.handle.includes("s")) {
          patch.height = Math.max(minH, drag.itemStartH + dy);
        }
        if (drag.handle.includes("n")) {
          const newH = Math.max(minH, drag.itemStartH - dy);
          patch.height = newH;
          patch.y = drag.itemStartY + drag.itemStartH - newH;
        }
        onUpdateItem(drag.itemIndex, patch);
      }
    },
    [toCanvas, onUpdateItem],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Keyboard
  useEffect(() => {
    if (selectedItemIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        onRemoveItem(selectedItemIndex);
        return;
      }
      if (collage.layout !== "freeform") return;
      const item = effectiveItems[selectedItemIndex];
      if (!item) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") onUpdateItem(selectedItemIndex, { x: item.x - step });
      if (e.key === "ArrowRight") onUpdateItem(selectedItemIndex, { x: item.x + step });
      if (e.key === "ArrowUp") onUpdateItem(selectedItemIndex, { y: item.y - step });
      if (e.key === "ArrowDown") onUpdateItem(selectedItemIndex, { y: item.y + step });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItemIndex, effectiveItems, collage.layout, onUpdateItem, onRemoveItem]);

  // Canvas click to deselect
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === containerRef.current || (e.target as HTMLElement).dataset.canvasBg === "true") {
        onSelectItem(null);
      }
    },
    [onSelectItem],
  );

  const bg = collage.background;

  return (
    <div
      ref={containerRef}
      data-canvas-bg="true"
      className="relative w-full select-none overflow-hidden rounded-md border border-border/70"
      style={{
        aspectRatio: `${canvasW} / ${canvasH}`,
        ...canvasBackgroundStyle(bg),
      }}
      onClick={onCanvasClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {effectiveItems.map((item, index) => {
        const asset = assetLookup.get(item.assetId);
        const selected = selectedItemIndex === index;
        const isFreeform = collage.layout === "freeform";

        return (
          <div
            key={`${item.assetId}-${index}`}
            className={cn(
              "absolute overflow-hidden",
              selected && "ring-2 ring-primary",
            )}
            style={{
              left: item.x * scale,
              top: item.y * scale,
              width: item.width * scale,
              height: item.height * scale,
              transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              zIndex: item.zIndex ?? index,
            }}
            onPointerDown={(e) => {
              if (isFreeform) onPointerDown(e, index, "move");
            }}
          >
            {asset?.url ? (
              <img
                src={asset.url}
                alt={asset.title}
                draggable={false}
                className="h-full w-full"
                style={{ objectFit: item.fit }}
              />
            ) : asset?.kind === "chart" ? (
              <CollageChartPreview asset={assets.find((a) => a.id === item.assetId)!} />
            ) : (
              <div className="grid h-full w-full place-items-center bg-muted/40 text-[10px] text-muted-foreground">
                Missing
              </div>
            )}

            {/* Resize handles (freeform only, when selected) */}
            {selected && isFreeform
              ? HANDLES.map((h) => (
                  <div
                    key={h.dir}
                    className="absolute z-10 rounded-full border-2 border-primary bg-background"
                    style={{ ...h.style, width: HANDLE_SIZE, height: HANDLE_SIZE, cursor: h.cursor }}
                    onPointerDown={(e) => onPointerDown(e, index, h.dir)}
                  />
                ))
              : null}

            {/* Rotation handle (freeform only, when selected) */}
            {selected && isFreeform ? (
              <div
                className="absolute left-1/2 z-10 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border-2 border-primary bg-background"
                style={{ top: -18 }}
                onPointerDown={(e) => onPointerDown(e, index, "rotate")}
              />
            ) : null}
          </div>
        );
      })}

      {/* Dashed placeholders for empty template cells */}
      {emptyTemplateCells.map((cell, i) => (
        <div
          key={`empty-cell-${i}`}
          className="pointer-events-none absolute border border-dashed border-muted-foreground/25"
          style={{
            left: cell.x * scale,
            top: cell.y * scale,
            width: cell.width * scale,
            height: cell.height * scale,
          }}
        />
      ))}

      {collage.items.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          添加图像开始拼图
        </div>
      ) : null}
    </div>
  );
}

function templateGrid(layout: string): { cols: number; rows: number } {
  const [c, r] = layout.split("x").map(Number);
  return { cols: c || 1, rows: r || 1 };
}

export function computeTemplatePositions(
  items: CollageItem[],
  layout: string,
  gap: number,
  canvasW: number,
  canvasH: number,
): CollageItem[] {
  const { cols, rows } = templateGrid(layout);
  const cellW = (canvasW - gap * (cols + 1)) / cols;
  const cellH = (canvasH - gap * (rows + 1)) / rows;
  return items.map((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      ...item,
      x: gap + col * (cellW + gap),
      y: gap + row * (cellH + gap),
      width: cellW,
      height: cellH,
    };
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((c) => `${c}${c}`).join("")
    : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) return hex;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function canvasBackgroundStyle(bg?: FillSpec): React.CSSProperties {
  if (!bg) return { backgroundColor: "#ffffff" };
  if (bg.transparent) return { backgroundColor: "transparent" };
  const opacity = bg.opacity ?? 1;
  const color = bg.color ?? "#ffffff";
  const base: React.CSSProperties = {
    backgroundColor: opacity < 1 ? hexToRgba(color, opacity) : color,
  };
  const pattern = bg.pattern ?? "none";
  if (pattern === "none") return base;
  const patternColor = hexToRgba(bg.patternColor ?? "#E5E7EB", bg.patternOpacity ?? 0.8);
  const size = bg.patternSize ?? 20;
  if (pattern === "lines") {
    return {
      ...base,
      backgroundImage: `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
    };
  }
  return {
    ...base,
    backgroundImage: [
      `linear-gradient(to right, ${patternColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
    ].join(", "),
    backgroundSize: `${size}px ${size}px`,
  };
}
