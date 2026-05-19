import { MapPin, X } from "lucide-react";

import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { cn } from "@/lib/utils";

interface VisualAnchorChipsProps {
  className?: string;
}

export function VisualAnchorChips({ className }: VisualAnchorChipsProps) {
  const { anchors, removeAnchor, clearAnchors } = useVisualWorkspace();

  if (anchors.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5 px-3 pt-2", className)}
      role="list"
      aria-label="Selected visual anchors"
    >
      <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {anchors.map((anchor) => (
        <button
          key={anchor.id}
          type="button"
          onClick={() => removeAnchor(anchor.id)}
          role="listitem"
          aria-label={`Remove ${anchor.label}`}
          title={anchor.label}
          className={cn(
            "group inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5",
            "border-foreground/15 bg-foreground/[0.035] text-[11px] font-medium text-foreground/90",
            "hover:border-foreground/25 hover:bg-foreground/[0.06]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
          )}
        >
          <span className="truncate">{anchor.label}</span>
          <X className="h-3 w-3 flex-none opacity-50 group-hover:opacity-90" />
        </button>
      ))}
      {anchors.length > 1 ? (
        <button
          type="button"
          onClick={clearAnchors}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5",
            "text-[10.5px] font-medium text-muted-foreground/70",
            "hover:bg-muted/60 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
          )}
        >
          Clear anchors
        </button>
      ) : null}
    </div>
  );
}
