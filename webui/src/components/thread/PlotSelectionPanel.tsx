import { useEffect, useMemo, useRef, useState } from "react";
import { Check, GalleryThumbnails } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAllChartTypes, THUMBNAIL_SIZE } from "@/lib/chart-registry";
import { cn } from "@/lib/utils";

export type SupportedPlotType = string;

export interface PlotDatasetChoice {
  id: string;
  name: string;
  source: "attached" | "uploaded";
}

export interface PlotSelection {
  dataset: PlotDatasetChoice;
  chartTypes: SupportedPlotType[];
}

interface PlotSelectionPanelProps {
  datasets: PlotDatasetChoice[];
  onConfirm: (selections: PlotSelection[]) => void;
  disabled?: boolean;
}

function ThumbnailPreview({ chartType }: { chartType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reg = getAllChartTypes().find((r) => r.type === chartType);
    if (!reg) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = THUMBNAIL_SIZE.width * 2;
    canvas.height = THUMBNAIL_SIZE.height * 2;
    ctx.scale(2, 2);
    reg.thumbnailRenderer(ctx, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
  }, [chartType]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded object-contain"
      style={{ width: THUMBNAIL_SIZE.width, height: THUMBNAIL_SIZE.height }}
    />
  );
}

export function PlotSelectionPanel({
  datasets,
  onConfirm,
  disabled,
}: PlotSelectionPanelProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const chartTypes = useMemo(() => getAllChartTypes(), []);

  const usableDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.name.trim()),
    [datasets],
  );
  const selectedCount = Object.values(selected).reduce((sum, set) => sum + set.size, 0);

  const toggle = (datasetId: string, chartType: string) => {
    setSelected((prev) => {
      const nextSet = new Set(prev[datasetId] ?? []);
      if (nextSet.has(chartType)) nextSet.delete(chartType);
      else nextSet.add(chartType);
      return { ...prev, [datasetId]: nextSet };
    });
  };

  const confirm = () => {
    const selections = usableDatasets.flatMap((dataset) => {
      const types = Array.from(selected[dataset.id] ?? []);
      return types.length > 0 ? [{ dataset, chartTypes: types }] : [];
    });
    if (selections.length === 0) return;
    onConfirm(selections);
    setSelected({});
    setOpen(false);
  };

  // Group chart types by family
  const families = useMemo(() => {
    const map = new Map<string, typeof chartTypes>();
    for (const ct of chartTypes) {
      const list = map.get(ct.family) ?? [];
      list.push(ct);
      map.set(ct.family, list);
    }
    return Array.from(map.entries()).map(([family, types]) => ({ family, types }));
  }, [chartTypes]);

  const familyLabels: Record<string, string> = {
    distribution: "分布",
    relationship: "关系",
    composition: "构成",
    comparison: "比较",
    genomics: "组学",
    "multi-set": "多集合",
    pathway: "通路",
  };

  if (usableDatasets.length === 0) return null;

  return (
    <div className="border-t border-border/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="h-8 rounded-[10px] px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <GalleryThumbnails className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          选择作图
        </Button>
        {selectedCount > 0 ? (
          <span className="text-[11px] text-muted-foreground">{selectedCount} selected</span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 max-h-[28rem] overflow-y-auto rounded-[12px] border border-border/70 bg-background/80 p-2">
          <div className="space-y-3">
            {usableDatasets.map((dataset) => (
              <div key={dataset.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="min-w-0 text-xs font-medium text-foreground">
                    <span className="truncate">{dataset.name}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {dataset.source === "attached" ? "待上传" : "已上传"}
                  </span>
                </div>

                {families.map(({ family, types }) => (
                  <div key={family} className="space-y-1">
                    <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {familyLabels[family] ?? family}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {types.map((chart) => {
                        const checked = selected[dataset.id]?.has(chart.type) ?? false;
                        return (
                          <button
                            key={chart.type}
                            type="button"
                            onClick={() => toggle(dataset.id, chart.type)}
                            className={cn(
                              "flex min-h-[4.2rem] items-stretch gap-2 rounded-[10px] border p-2 text-left transition-colors",
                              checked
                                ? "border-primary/60 bg-primary/8 text-foreground"
                                : "border-border/70 bg-card hover:bg-muted/70",
                            )}
                            aria-pressed={checked}
                          >
                            <div
                              className={cn(
                                "flex h-12 w-16 flex-none items-center justify-center rounded-md border",
                                "border-border/70 bg-background text-primary",
                              )}
                            >
                              <ThumbnailPreview chartType={chart.type} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-xs font-medium">
                                {checked && <Check className="h-3 w-3 flex-none text-primary" />}
                                <span>{chart.displayName}</span>
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                                {chart.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={selectedCount === 0}
              onClick={confirm}
              className="rounded-[10px]"
            >
              确认并生成
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
