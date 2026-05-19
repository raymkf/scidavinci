import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { cn } from "@/lib/utils";

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: "📊",
  line: "📈",
  pie: "🥧",
  area: "📉",
};

interface ChartElementChipsProps {
  className?: string;
}

/**
 * Dismissible chips showing currently selected chart elements.
 * Renders below the textarea area in the composer, above the action buttons.
 */
export function ChartElementChips({ className }: ChartElementChipsProps) {
  const { selectedElements, removeElement, clearSelection } = useChartSelection();

  if (selectedElements.length === 0) return null;

  const icon = selectedElements.length > 0
    ? (CHART_TYPE_LABELS[selectedElements[0].chartType] ?? "📊")
    : "📊";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 px-3 pt-2",
        className,
      )}
      role="list"
      aria-label="Selected chart elements"
    >
      <span className="mr-0.5 text-xs opacity-60" aria-hidden>{icon}</span>
      {selectedElements.map((el) => (
        <button
          key={el.elementId}
          type="button"
          onClick={() => removeElement(el.elementId)}
          role="listitem"
          aria-label={`Remove ${el.label}`}
          title={el.label}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
            "border-primary/30 bg-primary/8 text-[11px] font-medium text-foreground/90",
            "hover:bg-primary/15 hover:border-primary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "transition-colors motion-reduce:transition-none",
            "max-w-[14rem]",
          )}
        >
          <span className="truncate">{el.label}</span>
          <span
            className={cn(
              "ml-0.5 inline-flex h-3.5 w-3.5 flex-none items-center justify-center",
              "rounded-full text-[10px] leading-none opacity-50",
              "group-hover:opacity-90 transition-opacity",
            )}
          >
            ✕
          </span>
        </button>
      ))}
      {selectedElements.length > 1 ? (
        <button
          type="button"
          onClick={clearSelection}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5",
            "text-[10.5px] font-medium text-muted-foreground/70",
            "hover:text-foreground hover:bg-muted/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "transition-colors",
          )}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
