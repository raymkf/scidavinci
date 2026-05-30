import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getChartType, THUMBNAIL_SIZE } from "@/lib/chart-registry";
import type { PlotPlan, PlotRecommendation } from "@/lib/chart-registry/types";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: PlotPlan;
  onConfirm: (selectedTypes: string[]) => void;
  className?: string;
}

function ThumbnailPreview({ chartType }: { chartType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reg = getChartType(chartType);
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
      className="rounded object-contain"
      style={{ width: THUMBNAIL_SIZE.width, height: THUMBNAIL_SIZE.height }}
    />
  );
}

function PriorityBadge({ priority }: { priority: PlotRecommendation["priority"] }) {
  const label =
    priority === "recommended" ? "推荐" : priority === "alternative" ? "备选" : "条件";
  const color =
    priority === "recommended"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : priority === "alternative"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400";

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", color)}>
      {label}
    </span>
  );
}

export function PlanCard({ plan, onConfirm, className }: PlanCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const toggle = (chartType: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chartType)) next.delete(chartType);
      else next.add(chartType);
      return next;
    });
  };

  const selectAll = () => {
    const allRecommended = plan.recommendations
      .filter((r) => r.priority === "recommended")
      .map((r) => r.chart_type);
    setSelected(new Set(allRecommended));
  };

  const confirmed = () => {
    const types = selected.size > 0 ? Array.from(selected) : plan.recommendations.map((r) => r.chart_type);
    onConfirm(types);
  };

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">{plan.title}</h4>
            {plan.description ? (
              <p className="text-xs text-muted-foreground">{plan.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 rounded-lg text-xs">
            全选推荐
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Chart list */}
      {expanded ? (
        <div className="divide-y divide-border/30">
          {plan.recommendations.map((rec) => {
            const checked = selected.has(rec.chart_type);

            return (
              <button
                key={rec.chart_type}
                type="button"
                onClick={() => toggle(rec.chart_type)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  checked && "bg-primary/5",
                )}
              >
                {/* Checkbox */}
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border-2 transition-colors",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </div>

                {/* Thumbnail */}
                <div className="flex h-12 w-16 flex-none items-center justify-center overflow-hidden rounded-md border border-border/50 bg-background">
                  <ThumbnailPreview chartType={rec.chart_type} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {rec.display_name}
                    </span>
                    <PriorityBadge priority={rec.priority} />
                  </div>
                  {rec.rationale ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {rec.rationale}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {rec.required_fields.map((f) => (
                      <span
                        key={f.field}
                        className={cn(
                          "inline-flex items-center rounded border px-1.5 py-0 text-[10px]",
                          f.available
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : "border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
                        )}
                      >
                        {f.field}
                        {!f.available ? " (需要计算)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Footer */}
      <div className="border-t border-border/50 bg-muted/20 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0
              ? `已选 ${selected.size} / ${plan.recommendations.length} 种图表`
              : `点击选择图表（默认全部生成）`}
          </span>
          <Button size="sm" onClick={confirmed} className="rounded-lg">
            确认并生成图表
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Parse a plot_plan JSON block from model output */
export function parsePlanFromText(text: string): PlotPlan | null {
  // Try <plot_plan>...</plot_plan> wrapper
  const tagMatch = text.match(/<plot_plan>([\s\S]*?)<\/plot_plan>/i);
  if (tagMatch) {
    try {
      return JSON.parse(tagMatch[1]!);
    } catch { /* fall through */ }
  }

  // Try standalone JSON block with plan_id field
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g);
  if (jsonMatch) {
    for (const block of jsonMatch) {
      try {
        const inner = block.replace(/```(?:json)?\s*\n?/g, "").replace(/\n?```/g, "");
        const parsed = JSON.parse(inner);
        if (parsed.plan_id && parsed.recommendations) {
          return parsed as PlotPlan;
        }
      } catch { continue; }
    }
  }

  return null;
}
