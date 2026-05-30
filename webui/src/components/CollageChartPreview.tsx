import { useEffect, useRef } from "react";

import type { VisualAsset } from "@/lib/chart-types";
import { getChartType } from "@/lib/chart-registry";
import { THUMBNAIL_SIZE } from "@/lib/chart-registry/thumbnail-base";

function aspectCss(ratio?: string | number): string {
  if (typeof ratio === "number" && ratio > 0) return String(ratio);
  if (typeof ratio === "string") {
    const [w, h] = ratio.split(":").map(Number);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  return "4 / 3";
}

/**
 * Chart preview for collage items using the chart registry's thumbnail renderer.
 * Maintains the chart's original aspect ratio centered inside the item.
 */
export function CollageChartPreview({ asset }: { asset: VisualAsset }) {
  const config = asset.chartConfig;
  if (!config) return null;

  return (
    <div className="grid h-full w-full place-items-center bg-card">
      <div
        className="relative"
        style={{
          aspectRatio: aspectCss(config.aspectRatio),
          width: "100%",
        }}
      >
        <CanvasThumb config={config} />
      </div>
    </div>
  );
}

function CanvasThumb({ config }: { config: NonNullable<VisualAsset["chartConfig"]> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reg = getChartType(config.type);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !reg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = THUMBNAIL_SIZE;
    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
    reg.thumbnailRenderer(ctx, width, height);
  }, [config.type, reg]);

  if (!reg) {
    return (
      <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">
        {config.title ?? config.type ?? "Chart"}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full object-contain"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}
