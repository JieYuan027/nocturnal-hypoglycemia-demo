import type { CurvePoint, MetricCiRow, MetricRow, ModelId, ModelMeta } from "../types";

export function metricFor(meta: ModelMeta, model: ModelId): MetricRow | undefined {
  return meta.metrics.find((row) => row.model === model);
}

export function ciFor(
  meta: ModelMeta,
  model: ModelId,
  metric: string,
): MetricCiRow | undefined {
  return meta.metricsCi.find((row) => row.model === model && row.metric === metric);
}

export function sensSpecAt(
  meta: ModelMeta,
  model: "M1" | "M2",
  threshold: number,
): { sensitivity: number; specificity: number } {
  const points = meta.curves.filter((row) => row.model === model);
  if (!points.length) return { sensitivity: 0, specificity: 0 };
  let best: CurvePoint = points[0];
  let distance = Math.abs(best.threshold - threshold);
  for (const point of points) {
    const d = Math.abs(point.threshold - threshold);
    if (d < distance) {
      best = point;
      distance = d;
    }
  }
  return { sensitivity: best.sensitivity, specificity: best.specificity };
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function fixed(value: number, digits = 3): string {
  return value.toFixed(digits);
}
