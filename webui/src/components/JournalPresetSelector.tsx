import { Check, Paintbrush } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JournalPreset } from "@/lib/chart-registry/types";
import { cn } from "@/lib/utils";

interface PresetMeta {
  key: JournalPreset;
  label: string;
  description: string;
  family: string;
  accent: string;
}

const PRESETS: PresetMeta[] = [
  {
    key: "nature",
    label: "Nature",
    description: "Bold titles, Arial 12pt, clean white",
    family: "Arial, Helvetica",
    accent: "#333333",
  },
  {
    key: "science",
    label: "Science",
    description: "Compact, Helvetica 11pt, minimalist",
    family: "Helvetica, Arial",
    accent: "#222222",
  },
  {
    key: "cell",
    label: "Cell",
    description: "Arial 11pt, more color-friendly",
    family: "Arial, Helvetica",
    accent: "#0072B2",
  },
  {
    key: "lancet",
    label: "Lancet",
    description: "Serif titles, Times New Roman",
    family: "Times New Roman, serif",
    accent: "#000000",
  },
  {
    key: "custom",
    label: "自定义",
    description: "Custom styling",
    family: "System default",
    accent: "#6B7280",
  },
];

interface JournalPresetSelectorProps {
  value?: JournalPreset;
  onChange?: (preset: JournalPreset) => void;
  className?: string;
}

export default function JournalPresetSelector({
  value = "nature",
  onChange,
  className,
}: JournalPresetSelectorProps) {
  const current = PRESETS.find((p) => p.key === value) ?? PRESETS[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", className)}
        >
          <Paintbrush className="h-3.5 w-3.5" />
          <span className="text-xs">{current.label}</span>
          <span
            className="ml-1 inline-block h-2.5 w-2.5 rounded-full border"
            style={{ backgroundColor: current.accent }}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-semibold">
          期刊风格预设
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.key}
            onClick={() => onChange?.(preset.key)}
            className={cn(
              "flex items-start gap-3 py-2",
              value === preset.key && "bg-accent",
            )}
          >
            <div className="flex-none pt-0.5">
              {value === preset.key ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <div className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{preset.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {preset.family}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {preset.description}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
