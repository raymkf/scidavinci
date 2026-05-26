import { useCallback, useEffect, useState } from "react";

import { currentLocale } from "@/i18n";
import {
  localeOption,
  normalizeLocale,
  supportedLocales,
  type SupportedLocale,
} from "@/i18n/config";

const MODEL_LANGUAGE_STORAGE_KEY = "scidavinci.modelLanguage";
const MODEL_LANGUAGE_EVENT = "scidavinci:model-language-change";

export type ModelLanguage = "auto" | SupportedLocale;

export const modelLanguageOptions: Array<{
  code: ModelLanguage;
  label: string;
  nativeLabel: string;
}> = [
  { code: "auto", label: "Auto", nativeLabel: "Auto" },
  ...supportedLocales,
];

export function modelLanguageLabel(language: ModelLanguage): string {
  if (language === "auto") return "Auto";
  return localeOption(language).nativeLabel;
}

export function modelLanguageInstruction(language: ModelLanguage): string | null {
  if (language === "auto") return null;
  const option = localeOption(language);
  return `Reply to the user in ${option.label} (${option.nativeLabel}) unless the user explicitly asks for another language.`;
}

function readStoredModelLanguage(): ModelLanguage {
  if (typeof window === "undefined") return currentLocale();
  try {
    const raw = window.localStorage.getItem(MODEL_LANGUAGE_STORAGE_KEY);
    if (!raw || raw === "auto") return raw === "auto" ? "auto" : currentLocale();
    return normalizeLocale(raw);
  } catch {
    return currentLocale();
  }
}

function persistModelLanguage(language: ModelLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODEL_LANGUAGE_STORAGE_KEY, language);
    window.dispatchEvent(new CustomEvent(MODEL_LANGUAGE_EVENT, { detail: language }));
  } catch {
    // Ignore storage/event errors; the in-memory caller state still updates.
  }
}

export function useModelLanguage(): [ModelLanguage, (language: ModelLanguage) => void] {
  const [language, setLanguageState] = useState<ModelLanguage>(() => readStoredModelLanguage());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ModelLanguage>).detail;
      setLanguageState(detail ?? readStoredModelLanguage());
    };
    window.addEventListener(MODEL_LANGUAGE_EVENT, onChange);
    return () => window.removeEventListener(MODEL_LANGUAGE_EVENT, onChange);
  }, []);

  const setLanguage = useCallback((next: ModelLanguage) => {
    setLanguageState(next);
    persistModelLanguage(next);
  }, []);

  return [language, setLanguage];
}
