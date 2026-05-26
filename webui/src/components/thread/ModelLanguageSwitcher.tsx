import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  modelLanguageLabel,
  modelLanguageOptions,
  type ModelLanguage,
} from "@/hooks/useModelLanguage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ModelLanguageSwitcherProps {
  value: ModelLanguage;
  onChange: (language: ModelLanguage) => void;
}

export function ModelLanguageSwitcher({
  value,
  onChange,
}: ModelLanguageSwitcherProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("thread.modelLanguage.ariaLabel", {
            defaultValue: "Set model response language",
          })}
          className="h-7 gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent/35 hover:text-foreground"
        >
          <Languages className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden max-w-[7rem] truncate sm:inline">
            {modelLanguageLabel(value)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t("thread.modelLanguage.label", { defaultValue: "Model language" })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as ModelLanguage)}
        >
          {modelLanguageOptions.map((option) => (
            <DropdownMenuRadioItem key={option.code} value={option.code}>
              <span className="flex min-w-0 items-center gap-2">
                <span>{option.nativeLabel}</span>
                {option.nativeLabel !== option.label ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {option.label}
                  </span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
