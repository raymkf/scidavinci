import { useEffect, useRef, useState } from "react";
import { ChevronRight, FileIcon, PlaySquare, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MarkdownText } from "@/components/MarkdownText";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { cn } from "@/lib/utils";
import type { UIImage, UIMediaAttachment, UIMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: UIMessage;
}

/**
 * Render a single message. Following agent-chat-ui: user turns are a rounded
 * "pill" right-aligned with a muted fill; assistant turns render as bare
 * markdown so prose/code read like a document rather than a chat bubble.
 * Each turn fades+slides in for a touch of motion polish.
 *
 * Trace rows (tool-call hints, progress breadcrumbs) render as a subdued
 * collapsible group so intermediate steps never masquerade as replies.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const baseAnim = "animate-in fade-in-0 slide-in-from-bottom-1 duration-300";

  if (message.kind === "trace") {
    return <TraceGroup message={message} animClass={baseAnim} />;
  }

  if (message.role === "user") {
    const images = message.images ?? [];
    const media = message.media ?? [];
    const visibleImages = mergeImages(
      images,
      media.filter((item) => item.kind === "image").map(({ url, name }) => ({ url, name })),
    );
    const hasMedia = media.length > 0;
    const hasText = message.content.trim().length > 0;
    return (
      <div
        data-message-id={message.id}
        className={cn(
          "group ml-auto flex max-w-[min(85%,36rem)] flex-col items-end gap-1.5",
          baseAnim,
        )}
      >
        <WorkspaceImageRegistrars
          images={visibleImages}
          sourceMessageId={message.id}
          assetPrefix={`message-${message.id}-user-image`}
          defaultTitle="Uploaded image"
        />
        <MessageImages images={visibleImages} align="right" />
        {hasMedia ? (
          <MessageMedia media={media} align="right" />
        ) : null}
        {hasText ? (
          <p
            className={cn(
              "ml-auto w-fit rounded-[18px] bg-secondary/70 px-4 py-2",
              "text-left text-[18px]/[1.8] whitespace-pre-wrap break-words",
            )}
          >
            {message.content}
          </p>
        ) : null}
      </div>
    );
  }

  const empty = message.content.trim().length === 0;
  const media = message.media ?? [];
  const visibleImages = mergeImages(
    media.filter((item) => item.kind === "image").map(({ url, name }) => ({ url, name })),
  );
  const visibleContent = stripChartActionJson(message.content);
  return (
    <div data-message-id={message.id} className={cn("w-full text-sm", baseAnim)} style={{ lineHeight: "var(--cjk-line-height)" }}>
      {empty && message.isStreaming ? (
        <TypingDots />
      ) : (
        <>
          <WorkspaceImageRegistrars
            images={visibleImages}
            sourceMessageId={message.id}
            assetPrefix={`message-${message.id}-assistant-image`}
            defaultTitle="Generated image"
          />
          <MessageImages images={visibleImages} align="left" />
          {visibleContent.trim().length > 0 ? (
            <MarkdownText sourceId={message.id}>{visibleContent}</MarkdownText>
          ) : !message.isStreaming ? (
            <p className="text-sm text-muted-foreground">已应用到工作台。</p>
          ) : null}
          {message.isStreaming && <StreamCursor />}
          {media.length > 0 ? (
            <MessageMedia media={media} align="left" />
          ) : null}
        </>
      )}
    </div>
  );
}

function mergeImages(...groups: UIImage[][]): UIImage[] {
  const seen = new Set<string>();
  const merged: UIImage[] = [];
  for (const image of groups.flat()) {
    const key = image.url ?? image.name ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(image);
  }
  return merged;
}

function MessageImages({
  images,
  align,
}: {
  images: UIImage[];
  align: "left" | "right";
}) {
  if (images.length === 0) return null;
  return (
    <div
      className={cn(
        "mt-2 grid max-w-[min(100%,34rem)] gap-2",
        images.length === 1 ? "grid-cols-1" : "grid-cols-2",
        align === "right" ? "justify-items-end" : "justify-items-start",
      )}
    >
      {images.map((image, index) => (
        <figure
          key={`${image.url ?? image.name ?? "image"}-${index}`}
          className="max-w-full overflow-hidden rounded-[14px] border border-border/60 bg-muted/30"
        >
          {image.url ? (
            <img
              src={image.url}
              alt={image.name ?? "Image attachment"}
              className="block max-h-[28rem] w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="grid min-h-28 min-w-40 place-items-center px-4 text-xs text-muted-foreground">
              {image.name ?? "Image attachment"}
            </div>
          )}
          {image.name ? (
            <figcaption className="truncate px-3 py-1.5 text-[11.5px] text-muted-foreground">
              {image.name}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function MessageMedia({
  media,
  align,
}: {
  media: UIMediaAttachment[];
  align: "left" | "right";
}) {
  if (media.length === 0) return null;
  const nonImages = media.filter((item) => item.kind !== "image");
  if (nonImages.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap gap-2",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      {nonImages.map((item, i) => (
        <MediaCell key={`${item.url ?? item.name ?? item.kind}-${i}`} media={item} />
      ))}
    </div>
  );
}

function WorkspaceImageRegistrars({
  images,
  sourceMessageId,
  assetPrefix,
  defaultTitle,
}: {
  images: UIImage[];
  sourceMessageId?: string;
  assetPrefix: string;
  defaultTitle: string;
}) {
  const { registerAsset } = useVisualWorkspace();
  const registeredRef = useRef(new Set<string>());

  useEffect(() => {
    images.forEach((image, index) => {
      if (!image.url) return;
      const id = `${assetPrefix}-${stableHash(image.url)}-${index}`;
      if (registeredRef.current.has(id)) return;
      registeredRef.current.add(id);
      registerAsset({
        id,
        kind: "image",
        title: image.name ?? `${defaultTitle} ${index + 1}`,
        sourceMessageId,
        createdAt: Date.now(),
        url: image.url,
      });
    });
  }, [assetPrefix, defaultTitle, images, registerAsset, sourceMessageId]);

  return null;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function stripChartActionJson(content: string): string {
  let result = content;
  let cursor = 0;
  while (cursor < result.length) {
    const start = result.indexOf("{", cursor);
    if (start === -1) break;
    const end = findJsonObjectEnd(result, start);
    if (end === -1) break;
    const candidate = result.slice(start, end);
    if (looksLikeOperationalJson(candidate)) {
      result = `${result.slice(0, start)}${result.slice(end)}`;
      cursor = start;
    } else {
      cursor = end;
    }
  }
  return result
    .replace(/```(?:json)?\s*```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeOperationalJson(jsonText: string): boolean {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return hasOperationalKey(parsed);
  } catch {
    return /"(chartActions|imageActions|activeAssetId|targetAssetId|editTarget|assetId)"\s*:/.test(jsonText);
  }
}

function hasOperationalKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasOperationalKey);
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.some((key) => [
    "chartActions",
    "imageActions",
    "activeAssetId",
    "targetAssetId",
    "editTarget",
  ].includes(key))) {
    return true;
  }
  if (
    keys.includes("assetId")
    && keys.some((key) => ["action", "type", "prompt", "edits", "style"].includes(key))
  ) {
    return true;
  }
  return Object.values(object).some(hasOperationalKey);
}

function findJsonObjectEnd(content: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i += 1) {
    const char = content[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function MediaCell({ media }: { media: UIMediaAttachment }) {
  const { t } = useTranslation();
  const hasUrl = typeof media.url === "string" && media.url.length > 0;

  if (media.kind === "video" && hasUrl) {
    return (
      <figure className="max-w-[min(100%,32rem)] overflow-hidden rounded-[14px] border border-border/60 bg-muted/40">
        <video
          src={media.url}
          controls
          preload="metadata"
          className="block max-h-[26rem] w-full bg-black"
          aria-label={media.name ? `${t("message.videoAttachment", { defaultValue: "Video attachment" })}: ${media.name}` : t("message.videoAttachment", { defaultValue: "Video attachment" })}
        />
        {media.name ? (
          <figcaption className="truncate px-3 py-1.5 text-[11.5px] text-muted-foreground">
            {media.name}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  const label =
    media.kind === "video"
      ? t("message.videoAttachment", { defaultValue: "Video attachment" })
      : t("message.fileAttachment", { defaultValue: "File attachment" });
  const Icon = media.kind === "video" ? PlaySquare : FileIcon;

  return (
    <div
      className="flex max-w-[18rem] items-center gap-2 rounded-[14px] border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      title={media.name ?? undefined}
      aria-label={label}
    >
      <Icon className="h-4 w-4 flex-none" aria-hidden />
      <span className="truncate">{media.name ?? label}</span>
    </div>
  );
}

/** Blinking cursor appended at the end of streaming text. */
function StreamCursor() {
  const { t } = useTranslation();
  return (
    <span
      aria-label={t("message.streaming")}
      className={cn(
        "ml-0.5 inline-block h-[1em] w-[3px] translate-y-[2px] align-middle",
        "rounded-sm bg-foreground/70 animate-pulse",
      )}
    />
  );
}

/** Pre-token-arrival placeholder: three bouncing dots. */
function TypingDots() {
  const { t } = useTranslation();
  return (
    <span
      aria-label={t("message.assistantTyping")}
      className="inline-flex items-center gap-1 py-1"
    >
      <Dot delay="0ms" />
      <Dot delay="150ms" />
      <Dot delay="300ms" />
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      style={{ animationDelay: delay }}
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60",
        "animate-bounce",
      )}
    />
  );
}

interface TraceGroupProps {
  message: UIMessage;
  animClass: string;
}

/**
 * Collapsible group of tool-call / progress breadcrumbs. Defaults to
 * expanded for discoverability; a single click on the header folds the
 * group down to a one-line summary so it never dominates the thread.
 */
function TraceGroup({ message, animClass }: TraceGroupProps) {
  const { t } = useTranslation();
  const lines = message.traces ?? [message.content];
  const count = lines.length;
  const [open, setOpen] = useState(true);
  return (
    <div className={cn("w-full", animClass)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5",
          "text-xs text-muted-foreground transition-colors hover:bg-muted/45",
        )}
        aria-expanded={open}
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden />
        <span className="font-medium">
          {count === 1
            ? t("message.toolSingle")
            : t("message.toolMany", { count })}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <ul
          className={cn(
            "mt-1 space-y-0.5 border-l border-muted-foreground/20 pl-3",
            "animate-in fade-in-0 slide-in-from-top-1 duration-200",
          )}
        >
          {lines.map((line, i) => (
            <li
              key={i}
              className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-muted-foreground/90"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
