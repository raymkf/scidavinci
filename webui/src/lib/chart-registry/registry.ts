import type { ChartData, ChartTypeRegistration } from "./types";

const registry = new Map<string, ChartTypeRegistration>();

export function registerChartType(reg: ChartTypeRegistration): void {
  if (registry.has(reg.type)) {
    console.warn(`Chart type "${reg.type}" is already registered. Overwriting.`);
  }
  registry.set(reg.type, reg);
}

export function getChartType(type: string): ChartTypeRegistration | undefined {
  return registry.get(type);
}

export function getAllChartTypes(): ChartTypeRegistration[] {
  return Array.from(registry.values());
}

export function getChartTypesByFamily(family: string): ChartTypeRegistration[] {
  return getAllChartTypes().filter((r) => r.family === family);
}

export function getChartFamilies(): { family: string; types: ChartTypeRegistration[] }[] {
  const map = new Map<string, ChartTypeRegistration[]>();
  for (const r of registry.values()) {
    const list = map.get(r.family) ?? [];
    list.push(r);
    map.set(r.family, list);
  }
  return Array.from(map.entries()).map(([family, types]) => ({ family, types }));
}

export function findSuitableCharts(data: ChartData, minScore = 0.3): Array<{
  registration: ChartTypeRegistration;
  score: number;
  reason?: string;
}> {
  const results: Array<{ registration: ChartTypeRegistration; score: number; reason?: string }> = [];
  for (const reg of registry.values()) {
    const { suitable, score, reason } = reg.canHandle(data);
    if (suitable && score >= minScore) {
      results.push({ registration: reg, score, reason });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function isChartTypeRegistered(type: string): boolean {
  return registry.has(type);
}

export function clearRegistry(): void {
  registry.clear();
}
