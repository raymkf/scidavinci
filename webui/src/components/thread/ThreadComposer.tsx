import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowUp,
  FileIcon,
  ImageIcon,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ChartElementChips } from "@/components/ChartElementChips";
import {
  PlotSelectionPanel,
  type PlotDatasetChoice,
  type PlotSelection,
} from "@/components/thread/PlotSelectionPanel";
import {
  modelLanguageInstruction,
  type ModelLanguage,
} from "@/hooks/useModelLanguage";
import { Button } from "@/components/ui/button";
import { VisualAnchorChips } from "@/components/VisualAnchorChips";
import {
  useAttachedImages,
  type AttachedImage,
  type AttachmentError,
  MAX_IMAGES_PER_MESSAGE,
} from "@/hooks/useAttachedImages";
import { useClipboardAndDrop } from "@/hooks/useClipboardAndDrop";
import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { detectColorChangeFromMessage } from "@/lib/chart-actions";
import { chartSemanticSelectionSummary } from "@/lib/chart-semantic-selection";
import type { OutboundMedia } from "@/lib/types";
import type { SendImage } from "@/hooks/useScidavinciStream";
import { cn } from "@/lib/utils";

const MAX_DOCUMENTS_PER_MESSAGE = 5;
const SPREADSHEET_EXTENSIONS = new Set([".csv", ".tsv", ".xlsx", ".xls", ".ods"]);

/** Server-side ``_DOCUMENT_MIME_ALLOWED`` mirror. */
const DOC_MIME_TYPES: ReadonlySet<string> = new Set([
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/json",
  "application/pdf",
  "text/plain",
]);

const DOC_MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

/** ``<input accept>``: aligned with the server's MIME whitelist. SVG is
 * deliberately excluded to avoid an embedded-script XSS surface. */
const ACCEPT_ATTR = [
  "image/png,image/jpeg,image/webp,image/gif",
  ".csv,.tsv,.xlsx,.xls,.ods",
  ".docx,.pptx,.json,.pdf,.txt",
].join(",");

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function documentMimeFor(file: File): string | null {
  const byExt = DOC_MIME_BY_EXT[fileExtension(file.name)];
  if (byExt) return byExt;
  return DOC_MIME_TYPES.has(file.type) ? file.type : null;
}

function isSpreadsheetName(name?: string): boolean {
  if (!name) return false;
  return SPREADSHEET_EXTENSIONS.has(fileExtension(name));
}

interface DocumentAttachment {
  id: string;
  file: File;
  dataUrl: string;
}

interface ThreadComposerProps {
  onSend: (content: string, images?: SendImage[], documents?: OutboundMedia[], displayContent?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  modelLabel?: string | null;
  variant?: "thread" | "hero";
  uploadedDatasets?: PlotDatasetChoice[];
  modelLanguage?: ModelLanguage;
}

export function ThreadComposer({
  onSend,
  disabled,
  placeholder,
  modelLabel = null,
  variant = "thread",
  uploadedDatasets = [],
  modelLanguage = "auto",
}: ThreadComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const isHero = variant === "hero";
  const resolvedPlaceholder =
    placeholder ?? t("thread.composer.placeholderThread");
  const {
    selectedElements,
    selectionSets,
    annotations,
    figureOverrides,
    activeFigureObject,
    clearSelection,
    applyActions,
  } = useChartSelection();
  const { anchors, activeAsset, clearAnchors } = useVisualWorkspace();

  const { images, enqueue, remove, clear, encoding, full } =
    useAttachedImages();

  const [docs, setDocs] = useState<DocumentAttachment[]>([]);
  const docsRef = useRef<DocumentAttachment[]>([]);
  docsRef.current = docs;
  const docsIdCounter = useRef(0);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const mime = documentMimeFor(file);
        if (typeof result !== "string" || !mime) {
          reject(new Error("io"));
          return;
        }
        const comma = result.indexOf(",");
        const payload = comma >= 0 ? result.slice(comma + 1) : "";
        resolve(`data:${mime};base64,${payload}`);
      };
      reader.onerror = () => reject(new Error("io"));
      reader.readAsDataURL(file);
    });
  }, []);

  const enqueueDocs = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const currentDocs = docsRef.current;
      const remaining = MAX_DOCUMENTS_PER_MESSAGE - currentDocs.length;
      if (remaining <= 0) {
        setInlineError(`Maximum ${MAX_DOCUMENTS_PER_MESSAGE} documents allowed`);
        return;
      }
      const toAdd = files.slice(0, remaining);
      const results: DocumentAttachment[] = [];
      for (const file of toAdd) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          docsIdCounter.current += 1;
          results.push({ id: `doc-${docsIdCounter.current}`, file, dataUrl });
        } catch {
          setInlineError(`Failed to read ${file.name}`);
        }
      }
      if (results.length > 0) {
        setDocs((prev) => [...prev, ...results]);
      }
    },
    [readFileAsDataUrl],
  );

  const formatRejection = useCallback(
    (reason: AttachmentError): string => {
      const key = `thread.composer.imageRejected.${reason}`;
      return t(key, { max: MAX_IMAGES_PER_MESSAGE });
    },
    [t],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const imageFiles: File[] = [];
      const docFiles: File[] = [];
      for (const f of files) {
        if (documentMimeFor(f)) {
          docFiles.push(f);
        } else {
          imageFiles.push(f);
        }
      }
      if (docFiles.length > 0) {
        void enqueueDocs(docFiles);
      }
      if (imageFiles.length > 0) {
        const { rejected } = enqueue(imageFiles);
        if (rejected.length > 0) {
          setInlineError(formatRejection(rejected[0].reason));
          return;
        }
      }
      setInlineError(null);
    },
    [enqueue, enqueueDocs, formatRejection],
  );

  const {
    isDragging,
    onPaste,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useClipboardAndDrop(addFiles);

  useEffect(() => {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.focus());
    return () => cancelAnimationFrame(id);
  }, [disabled]);

  const readyImages = useMemo(
    () => images.filter((img): img is AttachedImage & { dataUrl: string } =>
      img.status === "ready" && typeof img.dataUrl === "string",
    ),
    [images],
  );
  const hasErrors = images.some((img) => img.status === "error");

  const readyDocs = docs.filter((d) => d.dataUrl);
  const hasDocs = readyDocs.length > 0;
  const plotDatasets = useMemo<PlotDatasetChoice[]>(() => {
    const current = readyDocs
      .filter((doc) => isSpreadsheetName(doc.file.name))
      .map((doc) => ({
        id: `attached:${doc.id}`,
        name: doc.file.name,
        source: "attached" as const,
      }));
    const seen = new Set<string>();
    return [...current, ...uploadedDatasets].filter((dataset) => {
      const key = `${dataset.source}:${dataset.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [readyDocs, uploadedDatasets]);

  const canSend =
    !disabled
    && !encoding
    && !hasErrors
    && (value.trim().length > 0 || readyImages.length > 0 || hasDocs);

  const submit = useCallback(() => {
    if (!canSend) return;
    const trimmed = value.trim();

    // Apply local color changes if the user mentions a color
    if (selectedElements.length > 0) {
      const colorActions = detectColorChangeFromMessage(trimmed, selectedElements);
      if (colorActions.length > 0) {
        applyActions(colorActions);
      }
    }

    // Build structured context for the model (never shown to the user).
    // This is prepended to the wire content but excluded from the chat bubble.
    const contextBlocks: string[] = [];
    const languageInstruction = modelLanguageInstruction(modelLanguage);
    if (languageInstruction) {
      contextBlocks.push(`[Preferred Response Language]\n${languageInstruction}`);
    }

    // Active asset context (the user's edit target)
    if (activeAsset) {
      const chartSelectionInstructions = activeAsset.kind === "chart" && activeAsset.chartConfig
        ? {
            instruction:
              "When the user asks only to select/find chart elements, return chartActions JSON with select_by_semantic_query only. Do not change colors or other styles unless the user explicitly asks for a visual style change such as red/highlight/bold. Do not invent DOM coordinates or element ids. The frontend will map your semantic plan to exact elements.",
            examples: [
              {
                userIntent: "select outliers / 选中离异值",
                actions: [{ type: "select_by_semantic_query", assetId: "active", intent: "outliers", plan: { method: "iqr_1_5_or_explicit_outliers" } }],
              },
              {
                userIntent: "select outliers and make them red / 选中离异值并标红",
                actions: [
                  { type: "select_by_semantic_query", assetId: "active", intent: "outliers", plan: { method: "iqr_1_5_or_explicit_outliers" } },
                  { type: "style_current_selection", style: { color: "#D55E00", stroke: "#D55E00", pointSize: 5 } },
                ],
                onlyWhenUserExplicitlyRequestsStyle: true,
              },
              {
                userIntent: "select top 5 by value",
                actions: [{ type: "select_by_semantic_query", assetId: "active", intent: "top_n", plan: { n: 5, valueField: "<field>" } }],
              },
              {
                userIntent: "select significant upregulated volcano points",
                actions: [{ type: "select_by_semantic_query", assetId: "active", intent: "significant", plan: { direction: "up" } }],
              },
            ],
            responseShape: { chartActions: ["<one or more chart actions>"] },
          }
        : undefined;
      contextBlocks.push(
        `[Active Edit Target]\n${JSON.stringify({
          activeAssetId: activeAsset.id,
          kind: activeAsset.kind,
          title: activeAsset.title,
          sourceMessageId: activeAsset.sourceMessageId,
          url: activeAsset.url,
          chart: activeAsset.kind === "chart" && activeAsset.chartConfig
            ? chartSemanticSelectionSummary(activeAsset.chartConfig)
            : undefined,
          chartSelectionInstructions,
          supportedImageActions: activeAsset.kind === "image"
            ? [
                { type: "update_background", patch: { color: "#DDF4FF", opacity: 1 } },
              ]
            : undefined,
        })}`,
      );
    }

    // Selected chart elements
    if (selectedElements.length > 0) {
      const chartContext = selectedElements
        .map((el) => {
          const sourceRow = el.sourceRow
            ? `, sourceRow: ${JSON.stringify(el.sourceRow)}`
            : "";
          return `[${el.label}] (elementId: ${el.elementId}, chartType: ${el.chartType}, series: ${el.series}, category: ${el.category}, value: ${el.value}${sourceRow})`;
        })
        .join("\n");
      const styleContext = JSON.stringify({
        supportedStyleFields: [
          "color",
          "stroke",
          "strokeWidth",
          "fillOpacity",
          "opacity",
          "pointSize",
          "visible",
          "barWidthScale",
        ],
        examples: [
          { type: "style_by_ids", targetElementIds: ["<elementId>"], style: { barWidthScale: 0.5 } },
          { type: "style_by_ids", targetElementIds: ["<elementId>"], style: { visible: false } },
        ],
      });
      contextBlocks.push(`[Selected Chart Elements]\n${chartContext}\n[Chart Element Styling]\n${styleContext}`);
    }

    // Figure state summary
    if (selectionSets.length > 0 || annotations.length > 0 || Object.keys(figureOverrides).length > 0) {
      const figureContext = JSON.stringify({
        selectionSets,
        annotations,
        figureOverrides,
        activeFigureObject,
        supportedChartActions: [
          "style_by_ids",
          "update_axis",
          "update_scale",
          "update_legend",
          "update_grid",
          "update_text_block",
          "update_layout",
          "update_background",
          "add_annotation",
          "update_annotation",
          "delete_annotation",
          "create_selection_set",
          "select_by_semantic_query",
          "select_elements",
          "clear_selection",
          "style_current_selection",
          "update_export_settings",
        ],
      });
      contextBlocks.push(`[Interactive Figure State]\n${figureContext}`);
    }

    // Visual anchors
    if (anchors.length > 0) {
      const visualContext = anchors
        .map((anchor) => {
          const coords =
            typeof anchor.xPct === "number" && typeof anchor.yPct === "number"
              ? `, xPct: ${anchor.xPct.toFixed(1)}, yPct: ${anchor.yPct.toFixed(1)}`
              : "";
          return `[${anchor.label}] (assetId: ${anchor.assetId}, assetTitle: ${anchor.assetTitle}, kind: ${anchor.kind}${coords})`;
        })
        .join("\n");
      contextBlocks.push(`[Selected Visual Anchors]\n${visualContext}`);
    }

    // Wire content = structured context + user text. Chat bubble = user text only.
    const enrichedContent = contextBlocks.length > 0
      ? `${contextBlocks.join("\n\n")}\n\n${trimmed}`
      : trimmed;

    const payload: SendImage[] | undefined =
      readyImages.length > 0
        ? readyImages.map((img) => ({
            media: {
              data_url: img.dataUrl,
              name: img.file.name,
            },
            preview: { url: img.dataUrl, name: img.file.name },
          }))
        : undefined;
    const docPayload: OutboundMedia[] | undefined =
      readyDocs.length > 0
        ? readyDocs.map((d) => ({
            data_url: d.dataUrl,
            name: d.file.name,
          }))
        : undefined;
    const outboundDocPayload = docPayload && docPayload.length > 0 ? docPayload : undefined;

    // Pass clean user text as displayContent for the chat bubble
    onSend(enrichedContent, payload, outboundDocPayload, trimmed);
    setValue("");
    setInlineError(null);
    clearSelection();
    clearAnchors();
    clear();
    setDocs([]);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.focus();
      }
    });
  }, [
    canSend,
    clear,
    onSend,
    readyImages,
    readyDocs,
    value,
    selectedElements,
    selectionSets,
    annotations,
    figureOverrides,
    activeFigureObject,
    clearSelection,
    anchors,
    clearAnchors,
    applyActions,
    activeAsset,
    modelLanguage,
  ]);

  const submitPlotSelections = useCallback((selections: PlotSelection[]) => {
    if (selections.length === 0 || disabled || encoding) return;
    const selectedAttached = new Set(
      selections
        .filter((selection) => selection.dataset.source === "attached")
        .map((selection) => selection.dataset.name),
    );
    const docsToSend = readyDocs.filter((doc) => selectedAttached.has(doc.file.name));
    const docPayload: OutboundMedia[] | undefined =
      docsToSend.length > 0
        ? docsToSend.map((doc) => ({ data_url: doc.dataUrl, name: doc.file.name }))
        : undefined;
    const payload = {
      intent: "manual_plot_selection",
      preferredResponseLanguage: modelLanguageInstruction(modelLanguage),
      selectedCharts: selections.map((selection) => ({
        fileName: selection.dataset.name,
        datasetSource: selection.dataset.source,
        chartTypes: selection.chartTypes,
      })),
      instructions: [
        "Use list_datasets first and match each fileName to the available dataset_id.",
        "Only generate the chart types selected by the user.",
        "For each selected chart, inspect the dataset and ask the user for field/parameter choices if the mapping is ambiguous.",
        "If all required fields are clear, call plot_dataset for each confirmed chart and return the chart-json blocks in the selected order.",
      ],
    };
    const summary = selections
      .map((selection) => `${selection.dataset.name}: ${selection.chartTypes.join(", ")}`)
      .join("\n");
    const content = `[Manual Plot Selection]\n${JSON.stringify(payload, null, 2)}`;
    const displayContent = `选择作图：\n${summary}`;
    onSend(content, undefined, docPayload, displayContent);
    setInlineError(null);
    setDocs((prev) => prev.filter((doc) => !selectedAttached.has(doc.file.name)));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [disabled, encoding, modelLanguage, onSend, readyDocs]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onInput: React.FormEventHandler<HTMLTextAreaElement> = (e) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };

  const onFilePick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    addFiles(files);
  };

  const removeChip = useCallback(
    (id: string) => {
      const { nextFocusId } = remove(id);
      setInlineError(null);
      requestAnimationFrame(() => {
        const el = nextFocusId ? chipRefs.current.get(nextFocusId) : null;
        if (el) {
          el.focus();
        } else {
          textareaRef.current?.focus();
        }
      });
    },
    [remove],
  );

  const onChipKey = useCallback(
    (id: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (
        e.key === "Delete" ||
        e.key === "Backspace" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        removeChip(id);
      }
    },
    [removeChip],
  );

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setInlineError(null);
  }, []);

  const onDocChipKey = useCallback(
    (id: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (
        e.key === "Delete" ||
        e.key === "Backspace" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        removeDoc(id);
      }
    },
    [removeDoc],
  );

  const attachButtonDisabled = disabled || full;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn("w-full", isHero ? "px-0" : "px-1 pb-1.5 pt-1 sm:px-0")}
    >
      <div
        className={cn(
          "relative mx-auto flex w-full flex-col overflow-hidden transition-all duration-200",
          isHero
            ? "max-w-[40rem] rounded-[24px] border border-border/75 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.10)]"
            : "max-w-[49.5rem] rounded-[16px] border border-border/70 bg-card",
          "focus-within:ring-1 focus-within:ring-foreground/8",
          disabled && "opacity-60",
          isDragging && "ring-2 ring-primary/40 motion-reduce:ring-0 motion-reduce:border-primary",
        )}
      >
        {images.length > 0 || docs.length > 0 ? (
          <div
            className="flex flex-wrap gap-2 px-3 pt-3"
            aria-label={t("thread.composer.attachImage")}
          >
            {images.map((img) => (
              <AttachmentChip
                key={img.id}
                image={img}
                labelRemove={t("thread.composer.remove")}
                labelEncoding={t("thread.composer.encoding")}
                normalizedHint={(orig, current) =>
                  t("thread.composer.normalizedSizeHint", {
                    orig: formatBytes(orig),
                    current: formatBytes(current),
                  })
                }
                formatError={formatRejection}
                onRemove={() => removeChip(img.id)}
                onKeyDown={onChipKey(img.id)}
                registerRef={(el) => {
                  if (el) chipRefs.current.set(img.id, el);
                  else chipRefs.current.delete(img.id);
                }}
              />
            ))}
            {docs.map((d) => (
              <div
                key={d.id}
                className={cn(
                  "group relative flex items-center gap-2 rounded-[12px] border px-2 py-1.5",
                  "border-border/70 bg-muted/60 transition-colors motion-reduce:transition-none",
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex min-w-0 flex-col text-[11.5px] leading-4">
                  <span
                    className="max-w-[14rem] truncate font-medium"
                    title={d.file.name}
                  >
                    {d.file.name}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {formatBytes(d.file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  onKeyDown={onDocChipKey(d.id)}
                  aria-label={t("thread.composer.remove")}
                  className={cn(
                    "ml-1 grid h-5 w-5 flex-none place-items-center rounded-full",
                    "text-muted-foreground/80 hover:bg-foreground/8 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                  )}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <ChartElementChips className="px-3 pt-2" />
        <VisualAnchorChips className="px-3 pt-2" />
        <PlotSelectionPanel
          datasets={plotDatasets}
          disabled={disabled || encoding}
          onConfirm={submitPlotSelections}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          aria-label={t("thread.composer.inputAria")}
          className={cn(
            "w-full resize-none bg-transparent",
            isHero
              ? "min-h-[96px] px-4 pb-2 pt-4 text-[15px] leading-6"
              : "min-h-[50px] px-4 pb-1.5 pt-3 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus-visible:outline-none",
            "disabled:cursor-not-allowed",
          )}
        />
        {inlineError ? (
          <div
            role="alert"
            className={cn(
              "mx-3 mb-1 rounded-md border border-destructive/40 bg-destructive/8 px-2.5 py-1",
              "text-[11.5px] font-medium text-destructive",
            )}
          >
            {inlineError}
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-center justify-between gap-2",
            isHero ? "px-3.5 pb-3.5" : "px-3 pb-2",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              hidden
              onChange={onFilePick}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={attachButtonDisabled}
              aria-label={t("thread.composer.attachImage")}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "rounded-full text-muted-foreground hover:text-foreground",
                isHero ? "h-8.5 w-8.5" : "h-7.5 w-7.5",
              )}
            >
              <Paperclip className={cn(isHero ? "h-4 w-4" : "h-3.5 w-3.5")} />
            </Button>
            {modelLabel ? (
              <span
                title={modelLabel}
                className={cn(
                  "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1",
                  "border-foreground/10 bg-foreground/[0.035] font-medium text-foreground/80",
                  isHero ? "text-[11px]" : "text-[10.5px]",
                )}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 flex-none rounded-full bg-emerald-500/80"
                />
                <span className="truncate">{modelLabel}</span>
              </span>
            ) : null}
            <span className="hidden select-none text-[10.5px] text-muted-foreground/60 sm:inline">
              {t("thread.composer.sendHint")}
            </span>
          </div>
          <span className="sm:hidden" aria-hidden />
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            aria-label={t("thread.composer.send")}
            className={cn(
              "rounded-full border border-border/70 bg-secondary/85 text-secondary-foreground shadow-none transition-transform hover:bg-accent",
              isHero ? "h-8.5 w-8.5" : "h-7.5 w-7.5",
              canSend && "hover:scale-[1.03] active:scale-95",
            )}
          >
            <ArrowUp className={cn(isHero ? "h-4.5 w-4.5" : "h-4 w-4")} />
          </Button>
        </div>
      </div>
    </form>
  );
}

interface AttachmentChipProps {
  image: AttachedImage;
  labelRemove: string;
  labelEncoding: string;
  normalizedHint: (origBytes: number, currentBytes: number) => string;
  formatError: (reason: AttachmentError) => string;
  onRemove: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}

function AttachmentChip({
  image,
  labelRemove,
  labelEncoding,
  normalizedHint,
  formatError,
  onRemove,
  onKeyDown,
  registerRef,
}: AttachmentChipProps) {
  const sizeLabel =
    image.status === "ready" && image.normalized && image.encodedBytes
      ? normalizedHint(image.file.size, image.encodedBytes)
      : formatBytes(image.file.size);
  const tone =
    image.status === "error"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : "border-border/70 bg-muted/60";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-[12px] border px-2 py-1.5",
        "transition-colors motion-reduce:transition-none",
        tone,
      )}
      data-testid="composer-chip"
    >
      <div className="relative h-10 w-10 overflow-hidden rounded-md bg-background">
        {image.previewUrl ? (
          <img
            src={image.previewUrl}
            alt=""
            aria-hidden
            loading="eager"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        )}
        {image.status === "encoding" ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background/60"
            aria-label={labelEncoding}
          >
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col text-[11.5px] leading-4">
        <span className="truncate max-w-[14rem] font-medium" title={image.file.name}>
          {image.file.name}
        </span>
        <span className="truncate text-muted-foreground">
          {image.status === "error" && image.error
            ? formatError(image.error)
            : sizeLabel}
        </span>
      </div>
      <button
        type="button"
        ref={registerRef}
        onClick={onRemove}
        onKeyDown={onKeyDown}
        aria-label={labelRemove}
        className={cn(
          "ml-1 grid h-5 w-5 flex-none place-items-center rounded-full",
          "text-muted-foreground/80 hover:bg-foreground/8 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
