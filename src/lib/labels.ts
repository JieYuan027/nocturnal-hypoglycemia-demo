const FEATURE_LABELS: Record<string, string> = {
  valid_data_ratio_day: "Valid daytime CGM data",
  mean_glucose_day: "Daytime mean glucose",
  median_day: "Daytime median glucose",
  sd_day: "Daytime glucose SD",
  cv_day: "Daytime glucose CV",
  mage_day: "Mean amplitude of glycemic excursions",
  modd_day: "Mean overnight difference",
  lage_day: "Largest amplitude of glycemic excursions",
  bgri_day: "Blood glucose risk index",
  lbgi_day: "Low blood glucose index (LBGI)",
  hbgi_day: "High blood glucose index (HBGI)",
  min_day: "Daytime minimum glucose",
  max_day: "Daytime maximum glucose",
  jindex_day: "J-index",
  adrr_day: "Average daily risk range",
  mvalue_day: "M-value",
  gmi_day: "Glucose management indicator",
  iqr_day: "Interquartile range",
  percentile10_day: "10th percentile glucose",
  percentile25_day: "25th percentile glucose",
  percentile75_day: "75th percentile glucose",
  percentile90_day: "90th percentile glucose",
  gri_day: "Glycemia risk index",
  n_readings: "CGM readings",
  gender: "Sex",
  has_history: "Prior-day history available",
  hist_n_days: "Days of prior history",
  lag1_night_tbr: "Previous-night time below 3.9",
  lag1_night_hypo: "Previous-night hypoglycemia",
  lag1_day_lbgi: "Previous-day LBGI",
  roll3_mean_night_tbr: "3-night mean time below 3.9",
  roll3_max_night_tbr: "3-night maximum time below 3.9",
  roll3_sum_night_hypo: "Hypoglycemia nights in last 3",
  roll3_mean_day_lbgi: "3-day mean LBGI",
  roll7_mean_night_tbr: "7-night mean time below 3.9",
  roll7_max_night_tbr: "7-night maximum time below 3.9",
  roll7_sum_night_hypo: "Hypoglycemia nights in last 7",
  roll7_mean_day_lbgi: "7-day mean LBGI",
};

export function featureLabel(name: string): string {
  if (FEATURE_LABELS[name]) return FEATURE_LABELS[name];
  return name
    .replace(/_/g, " ")
    .replace(/\bpct\b/g, "%")
    .replace(/\bmin\b/g, "minutes")
    .replace(/\btbr\b/gi, "time below range")
    .replace(/^./, (c) => c.toUpperCase());
}

export function featureUnit(name: string): string {
  if (name === "gender") return "";
  if (name === "n_readings") return "readings";
  if (name === "has_history" || name === "hist_n_days") return "days";
  if (name === "lag1_night_hypo" || name.includes("sum_night_hypo")) return "nights";
  if (name.includes("pct") || name.includes("ratio")) return "%";
  if (name.endsWith("_min_day") || name.endsWith("_min_night") || name.includes("_min_")) {
    return "min";
  }
  if (
    name.startsWith("mean") ||
    name.startsWith("median") ||
    name.startsWith("min_") ||
    name.startsWith("max_") ||
    name.startsWith("percentile") ||
    name === "iqr_day"
  ) {
    return "mmol/L";
  }
  return "";
}

export function formatFeatureValue(name: string, value: number): string {
  if (name === "gender") return value >= 0.5 ? "Male" : "Female";
  if (name === "has_history") return value >= 0.5 ? "Yes" : "No";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
