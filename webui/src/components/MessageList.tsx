import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";

import { MessageBubble } from "@/components/MessageBubble";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "@/lib/types";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
}

const SHOW_BOTTOM_BUTTON_PX = 96;
const AUTO_STICK_BOTTOM_PX = 4;

/**
 * Scrollable message log. Auto-sticks to the bottom as new content arrives,
 * but only when the user was already at the bottom — preserving scroll
 * position when they've scrolled up to read earlier turns. A floating
 * "scroll to bottom" button appears whenever we're detached from the bottom.
 */
export function MessageList({ messages, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const autoStickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoStickRef.current = distance <= AUTO_STICK_BOTTOM_PX;
    setAtBottom(distance <= SHOW_BOTTOM_BUTTON_PX);
  }, []);

  useLayoutEffect(() => {
    if (!autoStickRef.current) return;
    scrollToBottom(false);
  }, [messages, isStreaming, scrollToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!autoStickRef.current) return;
      scrollToBottom(false);
      updateBottomState();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom, updateBottomState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateBottomState();
    updateBottomState();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [updateBottomState]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Say hi to get started.
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        className={cn(
          "h-full overflow-y-auto overscroll-contain",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
          "[&::-webkit-scrollbar-track]:bg-transparent",
        )}
      >
        <div ref={contentRef} className="mx-auto flex w-full max-w-[64rem] flex-col gap-6 px-4 pt-4 pb-8">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      </div>

      {/* Top fade so messages slide under the header gracefully. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent"
      />
      {/* Bottom fade so messages fade out behind the composer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
      />

      {!atBottom && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => scrollToBottom(true)}
          className={cn(
            "absolute bottom-2 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full shadow-md",
            "bg-background/90 backdrop-blur",
            "animate-in fade-in-0 zoom-in-95",
          )}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
