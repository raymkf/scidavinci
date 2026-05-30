import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAllChartTypes,
  getChartFamilies,
  type ChartTypeRegistration,
} from "@/lib/chart-registry";
import type { ChartFamily } from "@/lib/chart-registry/types";
import { THUMBNAIL_SIZE } from "@/lib/chart-registry/thumbnail-base";
import { cn } from "@/lib/utils";

const FAMILY_LABELS: Record<ChartFamily, string> = {
  distribution: "分布",
  relationship: "关系",
  composition: "构成",
  comparison: "比较",
  genomics: "组学",
  "multi-set": "多集合",
  pathway: "通路",
};

interface ChartTypeBrowserProps {
  onSelect?: (chartType: string) => void;
  selectedTypes?: string[];
  className?: string;
}

function TypeThumbnail({ reg }: { reg: ChartTypeRegistration }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = THUMBNAIL_SIZE.width * 2;
    canvas.height = THUMBNAIL_SIZE.height * 2;
    ctx.scale(2, 2);
    reg.thumbnailRenderer(ctx, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
  }, [reg]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded object-contain"
      style={{ width: THUMBNAIL_SIZE.width, height: THUMBNAIL_SIZE.height }}
    />
  );
}

export default function ChartTypeBrowser({
  onSelect,
  selectedTypes = [],
  className,
}: ChartTypeBrowserProps) {
  const [search, setSearch] = useState("");
  const families = getChartFamilies();
  const allTypes = getAllChartTypes();

  const filteredFamilies =
    search.trim().length > 0
      ? families
          .map((f) => ({
            ...f,
            types: f.types.filter(
              (t) =>
                t.displayName.toLowerCase().includes(search.toLowerCase()) ||
                t.type.toLowerCase().includes(search.toLowerCase()) ||
                t.description.toLowerCase().includes(search.toLowerCase()),
            ),
          }))
          .filter((f) => f.types.length > 0)
      : families;

  if (allTypes.length === 0) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>
        No chart types registered.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索图表类型..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-8"
        />
        {search && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <ScrollArea className="h-[460px] pr-3">
        <div className="flex flex-col gap-4">
          {filteredFamilies.map(({ family, types }) => (
            <div key={family}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {FAMILY_LABELS[family as ChartFamily] ?? family}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {types.map((reg) => {
                  const selected = selectedTypes.includes(reg.type);
                  return (
                    <button
                      key={reg.type}
                      type="button"
                      onClick={() => onSelect?.(reg.type)}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-accent",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border/60",
                      )}
                    >
                      <div className="flex h-12 w-16 flex-none items-center justify-center overflow-hidden rounded border border-border/40 bg-background">
                        <TypeThumbnail reg={reg} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{reg.displayName}</p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {reg.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
