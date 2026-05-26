import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { DataKey } from "recharts/types/util/types";

import { useChartSelection } from "@/contexts/ChartSelectionContext";
import { chartElementId, resolveElementColor } from "@/lib/chart-element-styles";
import type { VisualAsset } from "@/lib/chart-types";
import { JOURNAL_CHART_STYLE, journalColor } from "@/lib/chart-style";

function aspectCss(ratio?: string | number): string {
  if (typeof ratio === "number" && ratio > 0) return String(ratio);
  if (typeof ratio === "string") {
    const [w, h] = ratio.split(":").map(Number);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  return "4 / 3";
}

/**
 * Chart preview for collage items. Maintains the chart's original aspect
 * ratio centered inside the item, using the same rendering as gallery thumbnails.
 */
export function CollageChartPreview({ asset }: { asset: VisualAsset }) {
  const config = asset.chartConfig;
  if (!config) return null;

  return (
    <div className="grid h-full w-full place-items-center bg-card">
      <div
        className="relative"
        style={{
          aspectRatio: aspectCss(config.aspectRatio),
          width: "100%",
        }}
      >
        <ChartBody assetId={asset.id} config={config} />
      </div>
    </div>
  );
}

function ChartBody({
  assetId,
  config,
}: {
  assetId: string;
  config: NonNullable<VisualAsset["chartConfig"]>;
}) {
  switch (config.type) {
    case "volcano":
      return <VolcanoThumb config={config} assetId={assetId} />;
    case "box":
      return <BoxThumb config={config} assetId={assetId} />;
    case "pie":
      return <PieThumb config={config} assetId={assetId} />;
    default:
      return <RechartsThumb config={config} assetId={assetId} />;
  }
}

/* ── Recharts-based thumbnails (bar / line / area) ── */

function RechartsThumb({
  assetId,
  config,
}: {
  assetId: string;
  config: NonNullable<VisualAsset["chartConfig"]>;
}) {
  const { elementStyles } = useChartSelection();
  const data = config.data as Record<string, unknown>[];
  const xKey = config.xField ?? "name";
  const fields = config.yFields ?? [config.yField].filter(Boolean) as string[];
  const colors = config.colors ?? DEFAULT_COLORS;
  const M = { top: 6, right: 8, bottom: 0, left: -16 };

  if (data.length === 0 || fields.length === 0) {
    return (
      <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">
        {config.title ?? "Chart"}
      </div>
    );
  }

  if (config.type === "line") {
    return (
      <div className="h-full w-full px-1 pb-5 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={M}>
            <XAxis dataKey={xKey} hide />
            <YAxis hide />
            {fields.map((field, i) => (
              <Line
                key={field}
                type="monotone"
                dataKey={field}
                dot={false}
                isAnimationActive={false}
                stroke={seriesColor(elementStyles, assetId, field, data, xKey, colors[i % colors.length])}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === "area") {
    return (
      <div className="h-full w-full px-1 pb-5 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={M}>
            <XAxis dataKey={xKey} hide />
            <YAxis hide />
            {fields.map((field, i) => {
              const c = seriesColor(elementStyles, assetId, field, data, xKey, colors[i % colors.length]);
              return (
                <Area
                  key={field}
                  type="monotone"
                  dataKey={field}
                  isAnimationActive={false}
                  stroke={c}
                  fill={c}
                  fillOpacity={0.24}
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // bar
  return (
    <div className="h-full w-full px-1 pb-5 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={M}>
          <XAxis dataKey={xKey} hide />
          <YAxis hide />
          {fields.map((field) => (
            <Bar key={field} dataKey={field} isAnimationActive={false} radius={[1, 1, 0, 0]}>
              {data.map((row, ri) => {
                const category = String(row[xKey] ?? "");
                const fallback =
                  config.elementStyles?.[category]?.color ??
                  config.elementStyles?.[`${field}@@${category}`]?.color ??
                  colors[ri % colors.length];
                return (
                  <Cell
                    key={`${field}-${ri}`}
                    fill={resolveElementColor(config, elementStyles, assetId, field, category, fallback, row)}
                  />
                );
              })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieThumb({
  assetId,
  config,
}: {
  assetId: string;
  config: NonNullable<VisualAsset["chartConfig"]>;
}) {
  const { elementStyles } = useChartSelection();
  const data = config.data as Record<string, unknown>[];
  const nameKey = config.nameField ?? "name";
  const valueKey = config.valueField ?? "value";
  const colors = config.colors ?? DEFAULT_COLORS;

  return (
    <div className="h-full w-full px-1 pb-5 pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey as DataKey<unknown>}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius="72%"
            innerRadius="0%"
            isAnimationActive={false}
            stroke="hsl(var(--background))"
            strokeWidth={1}
          >
            {data.map((row, i) => {
              const name = String(row[nameKey] ?? "");
              const fallback = config.elementStyles?.[name]?.color ?? colors[i % colors.length];
              return (
                <Cell
                  key={i}
                  fill={resolveElementColor(config, elementStyles, assetId, name, name, fallback, row)}
                />
              );
            })}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── SVG-based thumbnails (volcano / box) ── */

function VolcanoThumb({
  assetId,
  config,
}: {
  assetId: string;
  config: NonNullable<VisualAsset["chartConfig"]>;
}) {
  const { elementStyles } = useChartSelection();
  const points = useMemo(() => {
    const data = (config.data as Record<string, unknown>[]).slice(0, 900);
    const xField = config.xValueField ?? "log2FoldChange";
    const yField = config.yValueField ?? "negLog10P";
    const pField = config.pValueField ?? "pValue";
    const labelField = config.labelField ?? config.idField ?? "gene";
    const groupField = config.groupField;
    return data.map((row) => {
      const x = Number(row[xField] ?? 0) || 0;
      const y =
        row[yField] !== undefined
          ? Number(row[yField])
          : -Math.log10(Math.max(Number(row[pField] ?? 1) || 1, Number.MIN_VALUE));
      const label = String(row[labelField] ?? "");
      const group = groupField ? String(row[groupField] ?? "") : "";
      const series =
        group ||
        (Math.abs(x) >= (config.xThreshold ?? 1) && y >= (config.yThreshold ?? 1.301)
          ? x > 0
            ? "up"
            : "down"
          : "not significant");
      return { x, y: Number.isFinite(y) ? y : 0, series, label };
    });
  }, [config]);

  const maxAbsX = Math.max(...points.map((p) => Math.abs(p.x)), 1);
  const maxY = Math.max(...points.map((p) => p.y), 1);

  return (
    <svg viewBox="0 0 100 75" className="h-full w-full">
      <line x1="8" x2="96" y1="66" y2="66" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1" />
      <line x1="50" x2="50" y1="8" y2="66" stroke={JOURNAL_CHART_STYLE.gridColor} strokeDasharray="2 2" />
      {points.map((p, i) => {
        const cx = 8 + ((p.x + maxAbsX) / (maxAbsX * 2)) * 88;
        const cy = 66 - (p.y / maxY) * 56;
        const sig = Math.abs(p.x) >= (config.xThreshold ?? 1) && p.y >= (config.yThreshold ?? 1.301);
        const defaultColor = sig ? (p.x > 0 ? journalColor(1) : journalColor(0)) : "#9CA3AF";
        const color = resolveElementColor(config, elementStyles, assetId, p.series, p.label, defaultColor);
        return <circle key={i} cx={cx} cy={cy} r="1.1" fill={color} opacity="0.75" />;
      })}
    </svg>
  );
}

function BoxThumb({
  assetId,
  config,
}: {
  assetId: string;
  config: NonNullable<VisualAsset["chartConfig"]>;
}) {
  const { elementStyles } = useChartSelection();
  const data = (config.data as Record<string, unknown>[]).slice(0, 8);
  const xKey = config.xField ?? "group";
  const minField = config.minField ?? "min";
  const q1Field = config.q1Field ?? "q1";
  const medField = config.medianField ?? "median";
  const q3Field = config.q3Field ?? "q3";
  const maxField = config.maxField ?? "max";
  const colors = config.colors ?? DEFAULT_COLORS;

  const allVals = data.flatMap((row) =>
    [minField, q1Field, medField, q3Field, maxField].map((f) => Number(row[f] ?? 0) || 0),
  );
  const min = Math.min(...allVals, 0);
  const max = Math.max(...allVals, 1);
  const yFor = (v: number) => 66 - ((v - min) / Math.max(1, max - min)) * 56;

  return (
    <svg viewBox="0 0 100 75" className="h-full w-full">
      <line x1="8" x2="96" y1="66" y2="66" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1" />
      {data.map((row, i) => {
        const category = String(row[xKey] ?? `Group ${i + 1}`);
        const cx = 12 + ((i + 0.5) / data.length) * 80;
        const w = Math.min(10, 44 / data.length);
        const color = resolveElementColor(config, elementStyles, assetId, "box", category, colors[i % colors.length], row);
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={yFor(Number(row[maxField] ?? 0))} y2={yFor(Number(row[minField] ?? 0))} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1" />
            <rect x={cx - w / 2} y={yFor(Number(row[q3Field] ?? 0))} width={w} height={Math.max(1, yFor(Number(row[q1Field] ?? 0)) - yFor(Number(row[q3Field] ?? 0)))} fill={color} opacity="0.7" stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="0.8" />
            <line x1={cx - w / 2} x2={cx + w / 2} y1={yFor(Number(row[medField] ?? 0))} y2={yFor(Number(row[medField] ?? 0))} stroke={JOURNAL_CHART_STYLE.axisColor} strokeWidth="1.2" />
          </g>
        );
      })}
    </svg>
  );
}

/* ── helpers ── */

function seriesColor(
  styles: Map<string, { color?: string }>,
  chartId: string,
  series: string,
  data: Record<string, unknown>[],
  xKey: string,
  fallback: string,
): string {
  // Series-level override (from clicking a line/area dot) takes priority
  const sc = styles.get(chartElementId(chartId, series, "__series__"))?.color;
  if (sc) return sc;
  for (const row of data) {
    const c = styles.get(chartElementId(chartId, series, String(row[xKey] ?? "")))?.color;
    if (c) return c;
  }
  return fallback;
}

const DEFAULT_COLORS = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#E69F00",
  "#56B4E9",
  "#F0E442",
  "#000000",
];
