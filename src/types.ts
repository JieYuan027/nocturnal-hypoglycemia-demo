export type ModelId = "M0" | "M1" | "M2";

export interface FeatureMeta {
  name: string;
  group: "day_CGM" | "history" | "quality" | "static";
  min: number;
  p01: number;
  median: number;
  p99: number;
  max: number;
  sd: number;
}

export interface MetricRow {
  model: ModelId;
  n: number;
  events: number;
  auprc: number;
  auroc: number;
  brier: number;
  sens_at_spec80: number;
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
}

export interface MetricCiRow {
  model: ModelId;
  metric: string;
  estimate: number;
  lower: number;
  upper: number;
  n_valid_boot: number;
}

export interface CalibrationPoint {
  g: number;
  n: number;
  mean_pred: number;
  observed: number;
  model: ModelId;
  intercept: number;
  slope: number;
}

export interface CurvePoint {
  model: ModelId;
  threshold: number;
  sensitivity: number;
  specificity: number;
}

export interface ImportanceItem {
  feature: string;
  value: number;
  signed?: number;
}

export interface ModelMeta {
  version: string;
  generatedAt: string;
  generator: Record<string, string>;
  modelHash: string;
  features: FeatureMeta[];
  featureNames: string[];
  historyFeatures: string[];
  historyFallback: Record<string, number>;
  genderLevels: string[];
  thresholds: Record<ModelId, number | null>;
  m1: {
    intercept: number;
    betas: Record<string, number>;
    alpha: number;
    lambda: number;
  };
  m2FeatureNames: string[];
  curves: CurvePoint[];
  importance: Record<"M1" | "M2", ImportanceItem[]>;
  metrics: MetricRow[];
  metricsCi: MetricCiRow[];
  calibration: CalibrationPoint[];
  cohort: {
    patients: number;
    patientDays: number;
    events: number;
    eventPct: number;
    testPatients: number;
    testPatientDays: number;
    testEvents: number;
    testEventPct: number;
  };
  notes: Record<string, string>;
}

export interface DataRow {
  index: number;
  values: Record<string, number>;
  patientId: string;
  date: string;
  label: number | null;
  historyLimited: boolean;
  outOfRange: string[];
}

export interface RowError {
  row: number;
  patientId: string;
  fields: string[];
  message: string;
}

export interface ValidationResult {
  rows: DataRow[];
  errors: RowError[];
  warnings: string[];
  total: number;
  headers: string[];
}

export interface ScoredRow extends DataRow {
  probability: number | null;
  m0: boolean | null;
  unavailable?: string;
}

export interface XgbTree {
  left_children: number[];
  right_children: number[];
  split_indices: number[];
  split_conditions: number[];
  default_left: number[];
}

export interface XgbBoosterJson {
  learner: {
    feature_names: string[] | null;
    learner_model_param: { base_score: string };
    objective?: { name?: string } | string;
    gradient_booster: { model: { trees: XgbTree[] } };
  };
}
