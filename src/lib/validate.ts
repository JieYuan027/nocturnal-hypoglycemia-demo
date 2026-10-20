import Papa from "papaparse";
import type { DataRow, ModelMeta, RowError, ValidationResult } from "../types";

const PASSTHROUGH = ["patient_id", "date", "label"];

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseGender(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (["female", "f", "woman", "women", "女", "女性", "0"].includes(text)) return 0;
  if (["male", "m", "man", "men", "男", "男性", "1"].includes(text)) return 1;
  const value = Number(text);
  if (value === 0 || value === 1) return value;
  return null;
}

function fail(message: string, fields: string[] = []): ValidationResult {
  return {
    rows: [],
    errors: [{ row: 1, patientId: "", fields, message }],
    warnings: [],
    total: 0,
    headers: [],
  };
}

export function parseCsv(text: string, meta: ModelMeta): ValidationResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });

  const headers = parsed.meta.fields?.map((field) => field.trim()) ?? [];
  if (!headers.length) return fail("The CSV has no header row.");

  const historySet = new Set(meta.historyFeatures);
  const presentHistory = meta.historyFeatures.filter((name) => headers.includes(name));
  if (presentHistory.length > 0 && presentHistory.length < meta.historyFeatures.length) {
    const missing = meta.historyFeatures.filter((name) => !headers.includes(name));
    return fail(
      "The history block is incomplete. Provide all 13 history columns or omit all of them.",
      missing,
    );
  }
  const historySupplied = presentHistory.length === meta.historyFeatures.length;

  const requiredFeatures = meta.featureNames.filter((name) => !historySet.has(name));
  const missingHeaders = requiredFeatures.filter((name) => !headers.includes(name));
  if (missingHeaders.length) {
    return fail(
      `The CSV is missing ${missingHeaders.length} required feature column${
        missingHeaders.length === 1 ? "" : "s"
      }.`,
      missingHeaders,
    );
  }

  const featureMeta = new Map(meta.features.map((item) => [item.name, item]));
  const errors: RowError[] = [];
  const rows: DataRow[] = [];
  const warnings: string[] = [];

  parsed.data.forEach((rawRow, offset) => {
    const rowNumber = offset + 2;
    const patientId = rawRow.patient_id?.trim() || `Row ${rowNumber}`;
    const values: Record<string, number> = {};
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const name of meta.featureNames) {
      if (historySet.has(name) && !historySupplied) continue;
      const raw = rawRow[name];
      if (name === "gender") {
        const gender = parseGender(raw ?? "");
        if (gender === null) {
          if (!raw?.trim()) missing.push(name);
          else invalid.push(name);
        } else {
          values[name] = gender;
        }
        continue;
      }
      const value = parseNumber(raw);
      if (value === null) {
        if (!raw?.trim()) missing.push(name);
        else invalid.push(name);
      } else {
        values[name] = value;
      }
    }

    if (missing.length || invalid.length) {
      const parts: string[] = [];
      if (missing.length) parts.push(`missing ${missing.length} value${missing.length === 1 ? "" : "s"}`);
      if (invalid.length) parts.push(`non-numeric in ${invalid.length} field${invalid.length === 1 ? "" : "s"}`);
      errors.push({
        row: rowNumber,
        patientId,
        fields: [...missing, ...invalid],
        message: `Row ${rowNumber}: ${parts.join("; ")}.`,
      });
      return;
    }

    let historyLimited = false;
    if (!historySupplied) {
      historyLimited = true;
      values.has_history = 0;
      values.hist_n_days = 0;
      for (const [name, value] of Object.entries(meta.historyFallback)) {
        values[name] = value;
      }
    } else if ((values.has_history ?? 0) < 0.5) {
      historyLimited = true;
    }

    const outOfRange: string[] = [];
    for (const [name, value] of Object.entries(values)) {
      if (historyLimited && historySet.has(name)) continue;
      const item = featureMeta.get(name);
      if (!item || name === "gender") continue;
      if (value < item.min || value > item.max) outOfRange.push(name);
    }

    const labelValue = parseNumber(rawRow.label);
    rows.push({
      index: rows.length + 1,
      values,
      patientId,
      date: rawRow.date?.trim() ?? "",
      label: labelValue,
      historyLimited,
      outOfRange,
    });
  });

  const historyLimitedCount = rows.filter((row) => row.historyLimited).length;
  if (historyLimitedCount > 0) {
    warnings.push(
      `${historyLimitedCount} row${
        historyLimitedCount === 1 ? "" : "s"
      } lack prior-day history. A fixed training-set reference is used for the history block; predictions are approximate.`,
    );
  }
  const outOfRangeCount = rows.filter((row) => row.outOfRange.length > 0).length;
  if (outOfRangeCount > 0) {
    warnings.push(
      `${outOfRangeCount} row${
        outOfRangeCount === 1 ? " has" : "s have"
      } values outside the training range. They are scored, but review the inputs.`,
    );
  }
  if (parsed.errors.length) {
    warnings.push(
      `${parsed.errors.length} CSV parsing warning${
        parsed.errors.length === 1 ? "" : "s"
      } detected. Check quoted fields and row lengths.`,
    );
  }

  return {
    rows,
    errors,
    warnings,
    total: parsed.data.length,
    headers,
  };
}

export function ignoredColumns(headers: string[], meta: ModelMeta): string[] {
  const known = new Set([...meta.featureNames, ...PASSTHROUGH]);
  return headers.filter((header) => !known.has(header));
}
