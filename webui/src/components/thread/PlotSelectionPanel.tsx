import { useMemo, useState } from "react";
import {
  AreaChart,
  BarChart3,
  Boxes,
  GalleryThumbnails,
  LineChart,
  PieChart,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SupportedPlotType = "bar" | "line" | "pie" | "area" | "box" | "volcano";

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

const CHARTS: Array<{
  type: SupportedPlotType;
  label: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  { type: "bar", label: "Bar", description: "分组比较、Top N、统计量对比", icon: BarChart3 },
  { type: "line", label: "Line", description: "时间序列、趋势变化", icon: LineChart },
  { type: "pie", label: "Pie", description: "类别占比、汇总比例", icon: PieChart },
  { type: "area", label: "Area", description: "连续变化、累积趋势", icon: AreaChart },
  { type: "box", label: "Box", description: "组间分布、离群点", icon: Boxes },
  { type: "volcano", label: "Volcano", description: "差异表达、显著性与 fold change", icon: GalleryThumbnails },
];

function chartPreview(type: SupportedPlotType) {
  if (type === "line") {
    return (
      <svg viewBox="0 0 84 42" className="h-full w-full" aria-hidden>
        <polyline points="6,31 22,24 38,28 54,13 78,9" fill="none" stroke="currentColor" strokeWidth="3" />
        {[6, 22, 38, 54, 78].map((x, i) => (
          <circle key={x} cx={x} cy={[31, 24, 28, 13, 9][i]} r="2.8" fill="currentColor" />
        ))}
      </svg>
    );
  }
  if (type === "pie") {
    return (
      <svg viewBox="0 0 84 42" className="h-full w-full" aria-hidden>
        <circle cx="42" cy="21" r="15" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="42 52" />
        <circle cx="42" cy="21" r="15" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="20 74" strokeDashoffset="-44" opacity=".45" />
      </svg>
    );
  }
  if (type === "area") {
    return (
      <svg viewBox="0 0 84 42" className="h-full w-full" aria-hidden>
        <path d="M6 33 L6 30 L24 23 L42 25 L61 13 L78 10 L78 33 Z" fill="currentColor" opacity=".22" />
        <polyline points="6,30 24,23 42,25 61,13 78,10" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    );
  }
  if (type === "box") {
    return (
      <svg viewBox="0 0 84 42" className="h-full w-full" aria-hidden>
        {[18, 42, 66].map((x, i) => (
          <g key={x}>
            <line x1={x} x2={x} y1="7" y2="35" stroke="currentColor" strokeWidth="2" opacity=".45" />
            <rect x={x - 7} y={11 + i * 2} width="14" height="17" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1={x - 7} x2={x + 7} y1={20 + i} y2={20 + i} stroke="currentColor" strokeWidth="2" />
          </g>
        ))}
      </svg>
    );
  }
  if (type === "volcano") {
    return (
      <svg viewBox="0 0 84 42" className="h-full w-full" aria-hidden>
        {[
          [12, 29], [20, 22], [28, 30], [36, 18], [42, 32], [48, 19], [56, 29], [64, 20], [72, 28],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="currentColor" opacity={y < 23 ? ".9" : ".45"} />
        ))}
        <line x1="42" x2="42" y1="8" y2="34" stroke="currentColor" strokeWidth="1" opacity=".35" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 84 42" className="h-full w-full" aria-hidden>
      {[12, 28, 44, 60, 76].map((x, i) => (
        <rect key={x} x={x - 5} y={30 - i * 4} width="10" height={8 + i * 4} rx="1.5" fill="currentColor" />
      ))}
    </svg>
  );
}

export function PlotSelectionPanel({
  datasets,
  onConfirm,
  disabled,
}: PlotSelectionPanelProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, Set<SupportedPlotType>>>({});

  const usableDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.name.trim()),
    [datasets],
  );
  const selectedCount = Object.values(selected).reduce((sum, set) => sum + set.size, 0);

  const toggle = (datasetId: string, chartType: SupportedPlotType) => {
    setSelected((prev) => {
      const nextSet = new Set(prev[datasetId] ?? []);
      if (nextSet.has(chartType)) nextSet.delete(chartType);
      else nextSet.add(chartType);
      return { ...prev, [datasetId]: nextSet };
    });
  };

  const confirm = () => {
    const selections = usableDatasets.flatMap((dataset) => {
      const chartTypes = Array.from(selected[dataset.id] ?? []);
      return chartTypes.length > 0 ? [{ dataset, chartTypes }] : [];
    });
    if (selections.length === 0) return;
    onConfirm(selections);
    setSelected({});
    setOpen(false);
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
        <div className="mt-2 max-h-[22rem] overflow-y-auto rounded-[12px] border border-border/70 bg-background/80 p-2">
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
                <div className="grid gap-2 sm:grid-cols-2">
                  {CHARTS.map((chart) => {
                    const checked = selected[dataset.id]?.has(chart.type) ?? false;
                    const Icon = chart.icon;
                    return (
                      <button
                        key={chart.type}
                        type="button"
                        onClick={() => toggle(dataset.id, chart.type)}
                        className={cn(
                          "flex min-h-[4.6rem] items-stretch gap-2 rounded-[10px] border p-2 text-left transition-colors",
                          checked
                            ? "border-primary/60 bg-primary/8 text-foreground"
                            : "border-border/70 bg-card hover:bg-muted/70",
                        )}
                        aria-pressed={checked}
                      >
                        <div
                          className={cn(
                            "flex h-14 w-20 flex-none items-center justify-center rounded-md border",
                            "border-border/70 bg-background text-primary",
                          )}
                        >
                          {chartPreview(chart.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Icon className="h-3.5 w-3.5 flex-none" aria-hidden />
                            <span>{chart.label}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
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
