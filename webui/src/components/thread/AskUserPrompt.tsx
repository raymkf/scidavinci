import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AskUserPromptProps {
  question: string;
  buttons: string[][];
  onAnswer: (answer: string) => void;
}

export function AskUserPrompt({
  question,
  buttons,
  onAnswer,
}: AskUserPromptProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const options = buttons.flat().filter(Boolean);
  const allowMultiple = /多选|一个或多个|多个图|multiple|one or more|select .*more/i.test(question);

  useEffect(() => {
    if (customOpen) {
      inputRef.current?.focus();
    }
  }, [customOpen]);

  const submitCustom = useCallback(() => {
    const answer = custom.trim();
    if (!answer) return;
    onAnswer(answer);
    setCustom("");
    setCustomOpen(false);
  }, [custom, onAnswer]);

  const toggleSelected = useCallback((option: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }, []);

  const submitSelected = useCallback(() => {
    if (selected.size === 0) return;
    onAnswer(`Selected: ${Array.from(selected).join(", ")}`);
    setSelected(new Set());
  }, [onAnswer, selected]);

  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "mx-auto mb-2 w-full max-w-[49.5rem] rounded-[16px] border border-primary/30",
        "bg-card/95 p-3 shadow-sm backdrop-blur",
      )}
      role="group"
      aria-label="Question"
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
        </div>
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-foreground">
          {question}
        </p>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((option) => {
          const checked = selected.has(option);
          return (
          <Button
            key={option}
            type="button"
            variant={checked ? "default" : "outline"}
            size="sm"
            onClick={() => allowMultiple ? toggleSelected(option) : onAnswer(option)}
            className="justify-start gap-2 rounded-[10px] px-3 text-left"
            aria-pressed={allowMultiple ? checked : undefined}
          >
            {allowMultiple ? (
              <span
                className={cn(
                  "grid h-4 w-4 flex-none place-items-center rounded border",
                  checked ? "border-primary-foreground/80" : "border-border",
                )}
                aria-hidden
              >
                {checked ? <Check className="h-3 w-3" /> : null}
              </span>
            ) : null}
            <span className="truncate">{option}</span>
          </Button>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCustomOpen((open) => !open)}
          className="justify-start rounded-[10px] px-3 text-muted-foreground"
        >
          Other...
        </Button>
      </div>

      {allowMultiple ? (
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={submitSelected}
            disabled={selected.size === 0}
            className="rounded-[10px]"
          >
            Confirm selection
          </Button>
        </div>
      ) : null}

      {customOpen ? (
        <div className="mt-2 flex gap-2">
          <textarea
            ref={inputRef}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitCustom();
              }
            }}
            rows={1}
            placeholder="Type your own answer..."
            className={cn(
              "min-h-9 flex-1 resize-none rounded-[10px] border border-border/70 bg-background",
              "px-3 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground",
              "focus-visible:ring-1 focus-visible:ring-primary/40",
            )}
          />
          <Button type="button" size="sm" onClick={submitCustom} disabled={!custom.trim()}>
            Send
          </Button>
        </div>
      ) : null}
    </div>
  );
}
