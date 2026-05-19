export const JOURNAL_COLORS = [
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#009E73", // bluish green
  "#CC79A7", // reddish purple
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#F0E442", // yellow
  "#000000", // black
];

export const JOURNAL_CHART_STYLE = {
  fontFamily:
    'Arial, Helvetica, "Noto Sans", "Liberation Sans", sans-serif',
  axisColor: "#111827",
  mutedText: "#374151",
  gridColor: "#E5E7EB",
  background: "#FFFFFF",
  tooltipBorder: "#D1D5DB",
  selectedStroke: "#111827",
};

export function journalColor(index: number): string {
  return JOURNAL_COLORS[index % JOURNAL_COLORS.length];
}
