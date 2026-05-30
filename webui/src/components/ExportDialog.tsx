import { useState } from "react";
import { Download, FileImage, FileText, Image } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ExportFormat = "png" | "svg" | "pdf";
type ExportDpi = 72 | 150 | 300 | 600;
type SizePreset = "single" | "one-half" | "double" | "custom";

interface SizePresetMeta {
  key: SizePreset;
  label: string;
  width: number;
  unit: string;
  description: string;
}

const SIZE_PRESETS: SizePresetMeta[] = [
  { key: "single", label: "单栏", width: 85, unit: "mm", description: "85mm — 大多数期刊单栏宽度" },
  { key: "one-half", label: "1.5栏", width: 115, unit: "mm", description: "115mm" },
  { key: "double", label: "双栏", width: 180, unit: "mm", description: "180mm — 全页宽度" },
  { key: "custom", label: "自定义", width: 0, unit: "mm", description: "手动输入尺寸" },
];

const DPI_OPTIONS: ExportDpi[] = [72, 150, 300, 600];

const FORMAT_META: { key: ExportFormat; label: string; icon: typeof FileImage; mime: string }[] = [
  { key: "png", label: "PNG", icon: Image, mime: "image/png" },
  { key: "svg", label: "SVG", icon: FileImage, mime: "image/svg+xml" },
  { key: "pdf", label: "PDF", icon: FileText, mime: "application/pdf" },
];

interface ExportDialogProps {
  stageRef?: React.RefObject<unknown>;
  className?: string;
  onExport?: (options: ExportOptions) => void;
}

export interface ExportOptions {
  format: ExportFormat;
  dpi: ExportDpi;
  sizePreset: SizePreset;
  customWidth?: number;
  transparent: boolean;
  scale: number;
}

export default function ExportDialog({
  onExport,
  className,
}: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [dpi, setDpi] = useState<ExportDpi>(300);
  const [sizePreset, setSizePreset] = useState<SizePreset>("double");
  const [customWidth, setCustomWidth] = useState(180);
  const [transparent, setTransparent] = useState(false);

  const handleExport = () => {
    const options: ExportOptions = {
      format,
      dpi,
      sizePreset,
      customWidth: sizePreset === "custom" ? customWidth : undefined,
      transparent: format === "png" ? transparent : false,
      scale: dpi / 72,
    };
    onExport?.(options);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)}>
          <Download className="h-3.5 w-3.5" />
          <span className="text-xs">导出</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导出图表</DialogTitle>
          <DialogDescription>
            选择导出格式、分辨率和尺寸。SVG/PDF 为矢量格式，DPI 不影响质量。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Format */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">格式</legend>
            <div className="flex gap-2">
              {FORMAT_META.map((fmt) => (
                <button
                  key={fmt.key}
                  type="button"
                  onClick={() => setFormat(fmt.key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                    format === fmt.key
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                      : "border-border/60 hover:bg-accent",
                  )}
                >
                  <fmt.icon className="h-4 w-4" />
                  {fmt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* DPI (only for PNG) */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              DPI
              {format !== "png" && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (矢量格式无需 DPI)
                </span>
              )}
            </legend>
            <div className="flex gap-2">
              {DPI_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDpi(d)}
                  disabled={format !== "png"}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    dpi === d
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                      : "border-border/60 hover:bg-accent",
                    format !== "png" && "opacity-40",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Size preset */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">尺寸</legend>
            <div className="grid grid-cols-2 gap-2">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setSizePreset(preset.key)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    sizePreset === preset.key
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border/60 hover:bg-accent",
                  )}
                >
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Custom width */}
          {sizePreset === "custom" && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">
                宽度 (mm)
              </label>
              <input
                type="number"
                value={customWidth}
                onChange={(e) => setCustomWidth(Number(e.target.value) || 80)}
                min={20}
                max={500}
                className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>
          )}

          {/* Transparent background (PNG only) */}
          {format === "png" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              透明背景
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleExport}>
            导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
