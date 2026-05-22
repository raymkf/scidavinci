import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AskUserPrompt } from "@/components/thread/AskUserPrompt";
import { ThreadComposer } from "@/components/thread/ThreadComposer";
import { ThreadHeader } from "@/components/thread/ThreadHeader";
import { StreamErrorNotice } from "@/components/thread/StreamErrorNotice";
import { ThreadViewport } from "@/components/thread/ThreadViewport";
import { VisualWorkspacePanel } from "@/components/VisualWorkspacePanel";
import { ChartSelectionProvider, useChartSelection } from "@/contexts/ChartSelectionContext";
import { VisualWorkspaceProvider, useVisualWorkspace } from "@/contexts/VisualWorkspaceContext";
import { useNanobotStream } from "@/hooks/useNanobotStream";
import { useSessionHistory } from "@/hooks/useSessions";
import { parseChartActionsFromContent } from "@/lib/chart-actions";
import { resolveSemanticSelectionAction } from "@/lib/chart-semantic-selection";
import type { ChatSummary, UIMessage } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

interface ThreadShellProps {
  session: ChatSummary | null;
  title: string;
  onToggleSidebar: () => void;
  onGoHome: () => void;
  onNewChat: () => Promise<string | null>;
  hideSidebarToggleOnDesktop?: boolean;
}

/**
 * Watches assistant messages for embedded chartActions JSON and applies them.
 */
function ChartActionWatcher({ messages }: { messages: UIMessage[] }) {
  const { applyActions } = useChartSelection();
  const { activeAsset, updateAssetBackground } = useVisualWorkspace();
  const appliedRef = useRef(new Set<string>());

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant" || appliedRef.current.has(msg.id)) continue;
      const actions = parseChartActionsFromContent(msg.content);
      if (actions.length > 0) {
        const resolvedActions = actions.flatMap((action) => {
          if (action.type !== "select_by_semantic_query") return [action];
          const resolved = resolveSemanticSelectionAction(action, activeAsset);
          return resolved ? [resolved] : [];
        });
        if (activeAsset?.kind === "image") {
          resolvedActions.forEach((action) => {
            if (action.type === "update_background") {
              updateAssetBackground(activeAsset.id, action.patch);
            }
          });
        }
        applyActions(resolvedActions);
        appliedRef.current.add(msg.id);
      }
    }
  }, [activeAsset, applyActions, messages, updateAssetBackground]);

  return null;
}

function toModelBadgeLabel(modelName: string | null): string | null {
  if (!modelName) return null;
  const trimmed = modelName.trim();
  if (!trimmed) return null;
  const leaf = trimmed.split("/").pop() ?? trimmed;
  return leaf || trimmed;
}

export function ThreadShell({
  session,
  title,
  onToggleSidebar,
  onGoHome,
  onNewChat,
  hideSidebarToggleOnDesktop = false,
}: ThreadShellProps) {
  const { t } = useTranslation();
  const chatId = session?.chatId ?? null;
  const historyKey = session?.key ?? null;
  const { messages: historical, loading } = useSessionHistory(historyKey);
  const { client, modelName } = useClient();
  const [booting, setBooting] = useState(false);
  const pendingFirstRef = useRef<string | null>(null);
  const messageCacheRef = useRef<Map<string, UIMessage[]>>(new Map());

  // Track chat switches. prevChatRef is updated during render so we can
  // detect the switch and override messages before stale InteractiveChart
  // components register assets into freshly-mounted providers.
  // prevCommittedChatRef is updated in the caching effect to avoid writing
  // old-session messages under the new chatId key.
  const prevChatRef = useRef(chatId);
  const prevCommittedChatRef = useRef(chatId);

  const initial = useMemo(() => {
    if (!chatId) return historical;
    return messageCacheRef.current.get(chatId) ?? historical;
  }, [chatId, historical]);
  const {
    messages: streamMessages,
    isStreaming,
    send,
    setMessages,
    streamError,
    dismissStreamError,
  } = useNanobotStream(chatId, initial);

  // When chatId changes during render, use initial (new session's msgs)
  // instead of streamMessages (still the old session's). This prevents
  // stale InteractiveChart components from the previous session from
  // registering their assets into the new session's providers.
  const switching = chatId !== prevChatRef.current;
  prevChatRef.current = chatId;
  const messages = switching ? initial : streamMessages;
  const showHeroComposer = messages.length === 0 && !loading;
  const pendingAsk = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.kind === "trace") continue;
      if (message.role === "user") return null;
      if (message.role === "assistant" && message.buttons?.some((row) => row.length > 0)) {
        return {
          question: message.content,
          buttons: message.buttons,
        };
      }
      if (message.role === "assistant") return null;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!chatId || loading) return;
    const cached = messageCacheRef.current.get(chatId);
    // When the user switches away and back, keep the local in-memory thread
    // state (including not-yet-persisted messages) instead of replacing it with
    // whatever the history endpoint currently knows about.
    setMessages(cached && cached.length > 0 ? cached : historical);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, chatId, historical]);

  useEffect(() => {
    if (chatId) return;
    setMessages(historical);
  }, [chatId, historical, setMessages]);

  useEffect(() => {
    if (!chatId) return;
    // When switching chats, first persist the old chat's messages under
    // its own key, then skip the write; streamMessages still belongs to
  // the previous chat until useNanobotStream resets it.
    if (prevCommittedChatRef.current !== chatId) {
      if (prevCommittedChatRef.current) {
        messageCacheRef.current.set(prevCommittedChatRef.current, streamMessages);
      }
      prevCommittedChatRef.current = chatId;
      return;
    }
    messageCacheRef.current.set(chatId, streamMessages);
  }, [chatId, streamMessages]);

  useEffect(() => {
    if (!chatId) return;
    const pending = pendingFirstRef.current;
    if (!pending) return;
    pendingFirstRef.current = null;
    client.sendMessage(chatId, pending);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: pending,
        createdAt: Date.now(),
      },
    ]);
    setBooting(false);
  }, [chatId, client, setMessages]);

  const handleWelcomeSend = useCallback(
    async (content: string) => {
      if (booting) return;
      setBooting(true);
      pendingFirstRef.current = content;
      const newId = await onNewChat();
      if (!newId) {
        pendingFirstRef.current = null;
        setBooting(false);
      }
    },
    [booting, onNewChat],
  );

  const emptyState = loading ? (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("thread.loadingConversation")}
    </div>
  ) : (
    <div className="flex w-full max-w-[40rem] flex-col gap-2 text-left animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <div className="inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <img
          src="/brand/nanobot_icon.png"
          alt=""
          aria-hidden
          draggable={false}
          className="h-4 w-4 rounded-sm opacity-90"
        />
        <span className="text-foreground/82">nanobot</span>
      </div>
      <p className="max-w-[28rem] text-[13px] leading-6 text-muted-foreground">
        {t("thread.empty.description")}
      </p>
    </div>
  );

  return (
    <ChartSelectionProvider
      key={chatId ?? "welcome"}
      persistenceKey={chatId ? `nanobot.chartStyles.${chatId}` : null}
    >
      <VisualWorkspaceProvider key={chatId ?? "welcome-workspace"} sessionId={chatId}>
        <ChartActionWatcher messages={messages} />
        <section className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            <ThreadHeader
              title={title}
              onToggleSidebar={onToggleSidebar}
              onGoHome={onGoHome}
              hideSidebarToggleOnDesktop={hideSidebarToggleOnDesktop}
            />
            <ThreadViewport
              messages={messages}
              isStreaming={isStreaming}
              emptyState={emptyState}
              composer={
                <>
                  {streamError ? (
                    <StreamErrorNotice
                      error={streamError}
                      onDismiss={dismissStreamError}
                    />
                  ) : null}
                  {pendingAsk ? (
                    <AskUserPrompt
                      question={pendingAsk.question}
                      buttons={pendingAsk.buttons}
                      onAnswer={send}
                    />
                  ) : null}
                  {session ? (
                    <ThreadComposer
                      onSend={send}
                      disabled={!chatId}
                      placeholder={
                        showHeroComposer
                          ? t("thread.composer.placeholderHero")
                          : t("thread.composer.placeholderThread")
                      }
                      modelLabel={toModelBadgeLabel(modelName)}
                      variant={showHeroComposer ? "hero" : "thread"}
                    />
                  ) : (
                    <ThreadComposer
                      onSend={handleWelcomeSend}
                      disabled={booting}
                      placeholder={
                        booting
                          ? t("thread.composer.placeholderOpening")
                          : t("thread.composer.placeholderHero")
                      }
                      modelLabel={toModelBadgeLabel(modelName)}
                      variant="hero"
                    />
                  )}
                </>
              }
            />
          </div>
          {chatId ? <VisualWorkspacePanel key={chatId} /> : null}
        </section>
      </VisualWorkspaceProvider>
    </ChartSelectionProvider>
  );
}
