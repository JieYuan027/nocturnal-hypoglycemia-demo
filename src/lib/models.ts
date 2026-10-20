import type { DataRow, ModelId, ModelMeta, XgbBoosterJson } from "../types";

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function scoreM1(values: Record<string, number>, meta: ModelMeta): number {
  let margin = meta.m1.intercept;
  for (const name of meta.featureNames) {
    margin += (meta.m1.betas[name] ?? 0) * (values[name] ?? 0);
  }
  return sigmoid(margin);
}

function parseBaseScore(raw: string | undefined): number {
  if (!raw) return 0.5;
  const match = raw.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/);
  return match ? Number(match[0]) : 0.5;
}

export function scoreM2(
  values: Record<string, number>,
  booster: XgbBoosterJson,
): number {
  const learner = booster.learner;
  const trees = learner.gradient_booster.model.trees;
  const names = learner.feature_names;
  const vector = names
    ? names.map((name) => values[name === "gender_male" ? "gender" : name] ?? NaN)
    : [];

  let margin = 0;
  const base = parseBaseScore(learner.learner_model_param.base_score);
  if (base > 0 && base < 1) margin += Math.log(base / (1 - base));

  for (const tree of trees) {
    let node = 0;
    while (tree.left_children[node] !== -1) {
      const index = tree.split_indices[node];
      // xgboost stores inputs and split thresholds as float32. Using float64
      // here flips comparisons for values that sit exactly on a split point.
      const value = names ? Math.fround(vector[index]) : NaN;
      const threshold = Math.fround(tree.split_conditions[node]);
      const goLeft = Number.isNaN(value)
        ? tree.default_left[node] === 1
        : value < threshold;
      node = goLeft ? tree.left_children[node] : tree.right_children[node];
    }
    // Accumulate in float32 to mirror xgboost's CPU predictor.
    margin = Math.fround(margin + tree.split_conditions[node]);
  }
  return sigmoid(margin);
}

export function scoreRow(
  row: DataRow,
  model: ModelId,
  meta: ModelMeta,
  booster: XgbBoosterJson | null,
): { probability: number | null; m0: boolean | null; unavailable?: string } {
  if (model === "M0") {
    if (row.historyLimited) {
      return { probability: null, m0: null, unavailable: "Requires previous-night data" };
    }
    return { probability: null, m0: row.values.lag1_night_tbr >= 15 };
  }
  if (model === "M1") {
    return { probability: scoreM1(row.values, meta), m0: null };
  }
  if (!booster) {
    return { probability: null, m0: null, unavailable: "Loading M2 model" };
  }
  return { probability: scoreM2(row.values, booster), m0: null };
}
