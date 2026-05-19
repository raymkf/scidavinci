import type { ChartAction, SelectedChartElement } from "./chart-types";

const COLOR_KEYWORDS: Record<string, string> = {
  red: "#D55E00",
  blue: "#0072B2",
  green: "#009E73",
  yellow: "#F0E442",
  orange: "#E69F00",
  purple: "#CC79A7",
  pink: "#CC79A7",
  brown: "#8C6D31",
  gray: "#6B7280",
  grey: "#6B7280",
  black: "#000000",
  white: "#FFFFFF",
  cyan: "#56B4E9",
  teal: "#009688",
};

const COLOR_KEYWORDS_ZH: Record<string, string> = {
  红: "#D55E00",
  红色: "#D55E00",
  蓝: "#0072B2",
  蓝色: "#0072B2",
  绿: "#009E73",
  绿色: "#009E73",
  黄: "#F0E442",
  黄色: "#F0E442",
  橙: "#E69F00",
  橙色: "#E69F00",
  紫: "#CC79A7",
  紫色: "#CC79A7",
  粉: "#CC79A7",
  粉色: "#CC79A7",
  棕: "#8C6D31",
  棕色: "#8C6D31",
  灰: "#6B7280",
  灰色: "#6B7280",
  黑: "#000000",
  黑色: "#000000",
  白: "#FFFFFF",
  白色: "#FFFFFF",
  青: "#56B4E9",
  青色: "#56B4E9",
};

/** Detect color-change intent from a user message and return chart actions. */
export function detectColorChangeFromMessage(
  message: string,
  selectedElements: SelectedChartElement[],
): ChartAction[] {
  if (selectedElements.length === 0) return [];

  // Check for Chinese color keywords first
  for (const [keyword, hex] of Object.entries(COLOR_KEYWORDS_ZH)) {
    if (message.includes(keyword)) {
      return createColorActions(selectedElements, hex);
    }
  }

  // Check for English color keywords
  const lower = message.toLowerCase();
  for (const [keyword, hex] of Object.entries(COLOR_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return createColorActions(selectedElements, hex);
    }
  }

  return [];
}

function createColorActions(
  elements: SelectedChartElement[],
  color: string,
): ChartAction[] {
  return [
    {
      type: "update_element_style",
      targetElementIds: elements.map((e) => e.elementId),
      style: { color },
    },
  ];
}

/** Parse chartActions JSON from assistant message content. */
export function parseChartActionsFromContent(
  content: string,
): ChartAction[] {
  // Try to find a JSON block containing chartActions
  const jsonMatch = content.match(/\{[^{]*"chartActions"\s*:/);
  if (!jsonMatch) return [];

  try {
    // Find the complete JSON object
    const startIdx = jsonMatch.index!;
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    const jsonStr = content.slice(startIdx, endIdx);
    const parsed = JSON.parse(jsonStr);
    if (parsed.chartActions && Array.isArray(parsed.chartActions)) {
      return parsed.chartActions as ChartAction[];
    }
  } catch {
    // Not valid JSON, skip
  }

  return [];
}
