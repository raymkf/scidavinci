import { Suspense, lazy } from "react";

import { cn } from "@/lib/utils";

interface MarkdownTextProps {
  children: string;
  className?: string;
  sourceId?: string;
}

const loadMarkdownRenderer = () => import("@/components/MarkdownTextRenderer");
const LazyMarkdownRenderer = lazy(loadMarkdownRenderer);

function hideChartJsonWhileLoading(markdown: string): string {
  return markdown.replace(/```(?:chart-image|chart-canvas|canvas-chart)\b[\s\S]*?(?:```|$)/g, "Rendering interactive chart…");
}

export function preloadMarkdownText(): void {
  void loadMarkdownRenderer();
}

/**
 * Lightweight markdown renderer mirroring agent-chat-ui: GFM + math via
 * ``remark-math`` / ``rehype-katex``, and fenced code blocks delegated to
 * ``CodeBlock`` for copy-to-clipboard and syntax highlighting.
 */
export function MarkdownText({ children, className, sourceId }: MarkdownTextProps) {
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            "whitespace-pre-wrap break-words leading-relaxed text-foreground/92",
            className,
          )}
        >
          {hideChartJsonWhileLoading(children)}
        </div>
      }
    >
      <LazyMarkdownRenderer className={className} sourceId={sourceId}>
        {children}
      </LazyMarkdownRenderer>
    </Suspense>
  );
}
