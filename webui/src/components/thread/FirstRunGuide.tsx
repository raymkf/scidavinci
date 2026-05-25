import { Download, Grid3X3, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "scidavinci.webui.firstRunGuide.v1";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore storage errors
  }
}

export function FirstRunGuide() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (dismissed) return null;

  const close = () => {
    persistDismissed();
    setDismissed(true);
  };

  return (
    <section
      className="rounded-lg border border-border/75 bg-card p-3 shadow-sm"
      aria-label={t("thread.firstRun.aria")}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-5">
              {t("thread.firstRun.title")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("thread.firstRun.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          className="h-7 w-7 shrink-0 rounded-full"
          aria-label={t("thread.firstRun.dismiss")}
          title={t("thread.firstRun.dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <GuideStep
          index="1"
          title={t("thread.firstRun.steps.generate.title")}
          body={t("thread.firstRun.steps.generate.body")}
        />
        <GuideStep
          index="2"
          icon={<Grid3X3 className="h-3.5 w-3.5" aria-hidden />}
          title={t("thread.firstRun.steps.collage.title")}
          body={t("thread.firstRun.steps.collage.body")}
        />
        <GuideStep
          index="3"
          icon={<Download className="h-3.5 w-3.5" aria-hidden />}
          title={t("thread.firstRun.steps.export.title")}
          body={t("thread.firstRun.steps.export.body")}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="h-8 justify-center"
          onClick={close}
        >
          {t("thread.firstRun.dismiss")}
        </Button>
      </div>
    </section>
  );
}

function GuideStep({
  index,
  title,
  body,
  icon,
}: {
  index: string;
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/65 bg-background/55 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="grid h-5 w-5 place-items-center rounded bg-muted text-[11px] font-semibold text-foreground/75">
          {icon ?? index}
        </span>
        <p className="min-w-0 truncate text-xs font-semibold">{title}</p>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">{body}</p>
    </div>
  );
}
