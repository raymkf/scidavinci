import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ThreadMessages } from "@/components/thread/ThreadMessages";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "@/lib/types";

interface ThreadViewportProps {
  messages: UIMessage[];
  isStreaming: boolean;
  composer: ReactNode;
  emptyState?: ReactNode;
}

const SHOW_BOTTOM_BUTTON_PX = 96;
const AUTO_STICK_BOTTOM_PX = 4;
const USER_SCROLL_SETTLE_MS = 180;

export function ThreadViewport({
  messages,
  isStreaming,
  composer,
  emptyState,
}: ThreadViewportProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const autoStickRef = useRef(true);
  const userScrollingRef = useRef(false);
  const userScrollTimerRef = useRef<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const hasMessages = messages.length > 0;

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

  const markUserScrolling = useCallback(() => {
    userScrollingRef.current = true;
    if (userScrollTimerRef.current !== null) {
      window.clearTimeout(userScrollTimerRef.current);
    }
    userScrollTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false;
      userScrollTimerRef.current = null;
    }, USER_SCROLL_SETTLE_MS);
  }, []);

  useLayoutEffect(() => {
    if (!autoStickRef.current || userScrollingRef.current) return;
    scrollToBottom(false);
  }, [messages, isStreaming, scrollToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!autoStickRef.current || userScrollingRef.current) return;
      scrollToBottom(false);
      updateBottomState();
    });
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollToBottom, updateBottomState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => updateBottomState();
    const onKeyDown = (event: KeyboardEvent) => {
      if ([
        "ArrowDown",
        "ArrowUp",
        "End",
        "Home",
        "PageDown",
        "PageUp",
        " ",
      ].includes(event.key)) {
        markUserScrolling();
      }
    };

    updateBottomState();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", markUserScrolling, { passive: true });
    el.addEventListener("touchstart", markUserScrolling, { passive: true });
    el.addEventListener("pointerdown", markUserScrolling, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", markUserScrolling);
      el.removeEventListener("touchstart", markUserScrolling);
      el.removeEventListener("pointerdown", markUserScrolling);
      el.removeEventListener("keydown", onKeyDown);
      if (userScrollTimerRef.current !== null) {
        window.clearTimeout(userScrollTimerRef.current);
        userScrollTimerRef.current = null;
      }
    };
  }, [markUserScrolling, updateBottomState]);

  // Listen for workspace → chat navigation requests
  useEffect(() => {
    const handler = (e: Event) => {
      const { messageId } = (e as CustomEvent<{ messageId: string }>).detail ?? {};
      if (!messageId) return;
      const el = document.querySelector(`[data-message-id="${messageId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    window.addEventListener("scidavinci:navigateToMessage", handler);
    return () => window.removeEventListener("scidavinci:navigateToMessage", handler);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className={cn(
            "absolute inset-0 overflow-y-auto overscroll-contain scrollbar-thin",
            "[overflow-anchor:none] [scrollbar-gutter:stable]",
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
            "[&::-webkit-scrollbar-track]:bg-transparent",
          )}
        >
          <div ref={contentRef} className="min-h-full [overflow-anchor:none]">
            {hasMessages ? (
              <div className="mx-auto flex min-h-full w-full max-w-[64rem] flex-col">
                <div className="flex-1 px-4 pb-6 pt-4">
                  <div className="mx-auto w-full max-w-[49.5rem]">
                    <ThreadMessages messages={messages} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex min-h-full w-full max-w-[64rem] flex-col px-4">
                <div className="flex w-full flex-1 justify-center pb-16 pt-14 md:pt-[3.5rem]">
                  <div className="flex w-full max-w-[40rem] flex-col gap-5">
                    {emptyState}
                    <div className="w-full">{composer}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent"
        />
      </div>

      {hasMessages ? (
        <div className="shrink-0 bg-background px-4 pb-3">
          {composer}
        </div>
      ) : null}

      {!atBottom && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => scrollToBottom(true)}
          className={cn(
            "absolute bottom-28 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full shadow-md",
            "bg-background/90 backdrop-blur",
            "animate-in fade-in-0 zoom-in-95",
          )}
          aria-label={t("thread.scrollToBottom")}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
