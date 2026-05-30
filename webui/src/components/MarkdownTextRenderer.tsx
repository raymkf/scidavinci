import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CodeBlock } from "@/components/CodeBlock";
import InteractiveChartKonva, { parseChartCodeBlock as parseChartCanvasCodeBlock, parseChartImageCodeBlock } from "@/components/InteractiveChartKonva";
import { PlanCard, parsePlanFromText } from "@/components/thread/PlanCard";
import { useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import remarkTableToChart from "@/lib/remark-table-to-chart";
import { cn } from "@/lib/utils";

import "katex/dist/katex.min.css";

interface MarkdownTextRendererProps {
  children: string;
  className?: string;
  sourceId?: string;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function WorkspaceImageReference({
  assetId,
  title,
  sourceMessageId,
  src,
}: {
  assetId: string;
  title: string;
  sourceMessageId?: string;
  src: string;
}) {
  const { registerAsset } = useVisualWorkspace();

  useEffect(() => {
    if (!src) return;
    registerAsset({
      id: assetId,
      kind: "image",
      title,
      sourceMessageId,
      createdAt: Date.now(),
      url: src,
    });
  }, [assetId, registerAsset, sourceMessageId, src, title]);

  return (
    <img
      src={src}
      alt={title}
      className="my-3 max-h-[26rem] rounded-md border border-border/60 object-contain"
      loading="lazy"
    />
  );
}

/**
 * Heavy markdown stack (GFM, math, KaTeX, syntax highlighting) kept in a
 * separate chunk so the app shell can paint sooner on refresh.
 */
export default function MarkdownTextRenderer({
  children,
  className,
  sourceId = "message",
}: MarkdownTextRendererProps) {
  return (
    <div
      className={cn(
        "markdown-content prose prose-lg max-w-none dark:prose-invert",
        "prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm",
        "prose-p:my-2",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-blockquote:my-3 prose-blockquote:border-l-2 prose-blockquote:font-normal",
        "prose-blockquote:not-italic prose-blockquote:text-foreground/80",
        "prose-a:text-primary prose-a:underline-offset-2 hover:prose-a:opacity-80",
        "prose-hr:my-6",
        "prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0",
        "prose-code:before:content-none prose-code:after:content-none prose-code:font-normal",
        "prose-table:my-3 prose-th:text-left prose-th:font-medium",
        className,
      )}
      style={{ lineHeight: "var(--cjk-line-height)" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkTableToChart, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className: cls, children: kids, ...props }) {
            const match = /language-([\w-]+)/.exec(cls || "");
            if (!match) {
              return (
                <code
                  className={cn(
                    "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]",
                    cls,
                  )}
                  {...props}
                >
                  {kids}
                </code>
              );
            }
            const lang = match[1];
            const code = String(kids).replace(/\n$/, "");
            // Render chart-image code blocks (backend matplotlib PNG + Konva overlay)
            if (lang === "chart-image") {
              const chartImageConfig = parseChartImageCodeBlock(code);
              if (chartImageConfig) {
                const fieldMappings = (chartImageConfig.fieldMappings ?? {}) as Record<string, unknown>;
                return (
                  <InteractiveChartKonva
                    config={{
                      type: chartImageConfig.type,
                      data: chartImageConfig.data ?? [],
                      title: chartImageConfig.title,
                      ...fieldMappings,
                    }}
                    imageConfig={chartImageConfig}
                    assetId={`${sourceId}-chartimg-${stableHash(code)}`}
                    sourceMessageId={sourceId}
                  />
                );
              }
              return (
                <div className="my-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                  Rendering chart image...
                </div>
              );
            }
            // Render chart-canvas code blocks with Konva (Canvas+Overlay renderer)
            if (lang === "chart-canvas" || lang === "canvas-chart") {
              const chartConfig = parseChartCanvasCodeBlock(code, lang);
              if (chartConfig) {
                return (
                  <InteractiveChartKonva
                    config={chartConfig}
                    assetId={`${sourceId}-canvas-${stableHash(code)}`}
                    sourceMessageId={sourceId}
                  />
                );
              }
              return (
                <div className="my-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                  Rendering canvas chart…
                </div>
              );
            }
            // Render plot_plan code blocks as interactive plan cards
            if (lang === "plot_plan") {
              const plan = parsePlanFromText(code);
              if (plan) {
                return (
                  <PlanCard
                    plan={plan}
                    onConfirm={(_selectedTypes) => {
                      // Selection handled by PlanCard; actual send via MessageBubble
                    }}
                  />
                );
              }
              return (
                <div className="my-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                  Rendering plot plan…
                </div>
              );
            }
            return <CodeBlock language={lang} code={code} className="my-3" />;
          },
          pre({ children: markdownChildren }) {
            return <>{markdownChildren}</>;
          },
          a({ href, children: markdownChildren, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline underline-offset-2 hover:opacity-80"
                {...props}
              >
                {markdownChildren}
              </a>
            );
          },
          img({ src, alt }) {
            const source = typeof src === "string" ? src : "";
            const title = alt || source.split("/").pop() || "Generated image";
            return (
              <WorkspaceImageReference
                assetId={`${sourceId}-image-${stableHash(source)}`}
                title={title}
                sourceMessageId={sourceId}
                src={source}
              />
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
