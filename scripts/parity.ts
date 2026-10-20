import { readFileSync } from "node:fs";
import Papa from "papaparse";
import metaJson from "../src/generated/model-meta.json";
import { scoreM1, scoreM2 } from "../src/lib/models";
import type { ModelMeta, XgbBoosterJson } from "../src/types";

const meta = metaJson as unknown as ModelMeta;
const booster = JSON.parse(
  readFileSync(new URL("../public/models/m2.json", import.meta.url), "utf8"),
) as XgbBoosterJson;
const parityPath = process.env.PARITY_FILE ?? "/private/tmp/hypo_parity.csv";
const csv = readFileSync(parityPath, "utf8");
const parsed = Papa.parse<Record<string, string>>(csv, {
  header: true,
  skipEmptyLines: "greedy",
});

const rows = parsed.data;
const y: number[] = [];
const pM1: number[] = [];
const pM2: number[] = [];
let maxM1 = 0;
let maxM2 = 0;

for (const row of rows) {
  const values: Record<string, number> = {};
  for (const name of meta.featureNames) values[name] = Number(row[name]);
  y.push(Number(row.label));
  const m1 = scoreM1(values, meta);
  const m2 = scoreM2(values, booster);
  pM1.push(m1);
  pM2.push(m2);
  maxM1 = Math.max(maxM1, Math.abs(m1 - Number(row.p_m1)));
  maxM2 = Math.max(maxM2, Math.abs(m2 - Number(row.p_m2)));
}

function auroc(labels: number[], scores: number[]): number {
  const order = scores.map((score, index) => ({ score, index })).sort((a, b) => a.score - b.score);
  const ranks = new Array<number>(scores.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].score === order[i].score) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = rank;
    i = j + 1;
  }
  const positives = labels.filter((value) => value === 1).length;
  const negatives = labels.length - positives;
  const positiveRankSum = labels.reduce(
    (sum, label, index) => sum + (label === 1 ? ranks[index] : 0),
    0,
  );
  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function auprc(labels: number[], scores: number[]): number {
  const order = scores
    .map((score, index) => ({ score, label: labels[index] }))
    .sort((a, b) => b.score - a.score);
  const positives = labels.filter((value) => value === 1).length;
  let tp = 0;
  let fp = 0;
  let previousRecall = 0;
  let area = 0;
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].score === order[i].score) j += 1;
    for (let k = i; k <= j; k += 1) {
      if (order[k].label === 1) tp += 1;
      else fp += 1;
    }
    const recall = tp / positives;
    const precision = tp / (tp + fp);
    area += (recall - previousRecall) * precision;
    previousRecall = recall;
    i = j + 1;
  }
  return area;
}

const expected = Object.fromEntries(meta.metrics.map((row) => [row.model, row]));
const results = {
  rows: rows.length,
  maxAbsDiffM1: maxM1,
  maxAbsDiffM2: maxM2,
  m1: { auroc: auroc(y, pM1), auprc: auprc(y, pM1) },
  m2: { auroc: auroc(y, pM2), auprc: auprc(y, pM2) },
};

console.log("Records:", results.rows);
console.log("Max |JS - R| M1:", maxM1.toExponential(3));
console.log("Max |JS - R| M2:", maxM2.toExponential(3));
console.log("M1 AUROC/AUPRC from JS:", results.m1);
console.log("M2 AUROC/AUPRC from JS:", results.m2);
console.log("R06 M1 AUROC/AUPRC:", expected.M1.auroc, expected.M1.auprc);
console.log("R06 M2 AUROC/AUPRC:", expected.M2.auroc, expected.M2.auprc);

const failures: string[] = [];
if (maxM1 > 1e-9) failures.push(`M1 probability mismatch: ${maxM1}`);
if (maxM2 > 1e-6) failures.push(`M2 probability mismatch: ${maxM2}`);
if (Math.abs(results.m1.auroc - expected.M1.auroc) > 1e-4) failures.push("M1 AUROC mismatch");
if (Math.abs(results.m1.auprc - expected.M1.auprc) > 1e-4) failures.push("M1 AUPRC mismatch");
if (Math.abs(results.m2.auroc - expected.M2.auroc) > 1e-4) failures.push("M2 AUROC mismatch");
if (Math.abs(results.m2.auprc - expected.M2.auprc) > 1e-4) failures.push("M2 AUPRC mismatch");

if (failures.length) {
  console.error("\nPARITY FAILED");
  for (const failure of failures) console.error("-", failure);
  process.exit(1);
}
console.log("\nPARITY PASSED");
