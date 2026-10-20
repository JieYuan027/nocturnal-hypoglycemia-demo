import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import metaJson from "../generated/model-meta.json";
import { scoreM1, scoreM2 } from "../lib/models";
import { parseCsv } from "../lib/validate";
import type { ModelMeta, XgbBoosterJson } from "../types";

const meta = metaJson as unknown as ModelMeta;
const booster = JSON.parse(
  readFileSync(new URL("../../public/models/m2.json", import.meta.url), "utf8"),
) as XgbBoosterJson;
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/synthetic-parity.json", import.meta.url), "utf8"),
) as {
  rows: { id: string; features: Record<string, number>; pM1: number; pM2: number; label: number }[];
};

describe("model parity on synthetic rows", () => {
  it("reproduces R probabilities", () => {
    let maxM1 = 0;
    let maxM2 = 0;
    for (const row of fixture.rows) {
      maxM1 = Math.max(maxM1, Math.abs(scoreM1(row.features, meta) - row.pM1));
      maxM2 = Math.max(maxM2, Math.abs(scoreM2(row.features, booster) - row.pM2));
    }
    expect(maxM1).toBeLessThan(1e-9);
    expect(maxM2).toBeLessThan(1e-6);
  });
});

describe("CSV validation", () => {
  it("parses the bundled synthetic sample", () => {
    const text = readFileSync(
      new URL("../../public/samples/sample-features.csv", import.meta.url),
      "utf8",
    );
    const result = parseCsv(text, meta);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(40);
  });

  it("accepts an omitted history block and applies the fallback", () => {
    const text = readFileSync(
      new URL("../../public/samples/sample-features.csv", import.meta.url),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines[0].split(",");
    const keep = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => !meta.historyFeatures.includes(header));
    const reduced = [
      keep.map((item) => item.header).join(","),
      ...lines.slice(1).map((line) => {
        const cells = line.split(",");
        return keep.map((item) => cells[item.index]).join(",");
      }),
    ].join("\n");
    const result = parseCsv(reduced, meta);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].historyLimited).toBe(true);
    expect(result.rows[0].values.has_history).toBe(0);
    expect(result.rows[0].values.lag1_day_lbgi).toBeCloseTo(
      meta.historyFallback.lag1_day_lbgi,
      10,
    );
  });

  it("rejects a row with a missing required feature", () => {
    const text = readFileSync(
      new URL("../../public/samples/sample-features.csv", import.meta.url),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(",");
    const index = header.indexOf("mean_glucose_day");
    const row = lines[1].split(",");
    row[index] = "";
    const broken = [lines[0], row.join(",")].join("\n");
    const result = parseCsv(broken, meta);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].fields).toContain("mean_glucose_day");
  });
});
