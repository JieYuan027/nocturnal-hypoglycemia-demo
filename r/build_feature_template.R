#!/usr/bin/env Rscript
# Convert a Gplus daily-summary export (the 1,242-column standardized file)
# into the exact 155-column CSV accepted by the web app.
#
# Usage:
#   Rscript r/build_feature_template.R <standardized_daily_stats.csv> <out.csv>

suppressPackageStartupMessages(library(data.table))

source(file.path(dirname(normalizePath(sub("^--file=", "",
  grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]))), "common.R"))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) {
  stop("Usage: Rscript r/build_feature_template.R <standardized_daily_stats.csv> [out.csv]")
}
input_path <- normalizePath(args[1], mustWork = TRUE)
output_path <- if (length(args) >= 2) args[2] else "features_for_demo.csv"

wl <- feature_whitelist()
feats <- wl$feature
day_feats <- wl$feature[wl$group == "day_CGM"]

hdr <- names(data.table::fread(input_path, nrows = 0, showProgress = FALSE))
extra_needed <- c("patient_id", "date", "gender", "n_readings", "valid_data_ratio",
                  "valid_data_ratio_night", "tir_below_3_9__min_night",
                  "tir_below_3__min_night")
need <- unique(c(extra_needed, day_feats))
missing <- setdiff(need, hdr)
if (length(missing)) {
  stop("Input is missing required columns: ", paste(missing, collapse = ", "))
}

d <- data.table::fread(input_path, select = need, showProgress = FALSE)
d[, date := as.Date(date)]
d[, gender := trimws(as.character(gender))]
d[gender == "", gender := NA_character_]

n_bad_id <- sum(is.na(d$patient_id))
if (n_bad_id > 0) {
  message("Dropping ", n_bad_id, " rows without a patient identifier.")
  d <- d[!is.na(patient_id)]
}

# Same cohort filters as R01 before history construction.
keep <- !is.na(d$tir_below_3_9__min_night) &
  !is.na(d$valid_data_ratio) & d$valid_data_ratio >= 0.70 &
  !is.na(d$valid_data_ratio_night) & d$valid_data_ratio_night >= 0.70 &
  !is.na(d$date)
d <- d[keep]

d[, label := as.integer(tir_below_3_9__min_night >= 15)]
data.table::setorder(d, patient_id, date)

# ---- History features (mirrors modeling/scripts/R01_build_label_features.R) ----
gap_max <- 14L
d[, gap_prev_days := c(NA_real_, diff(as.numeric(date))), by = patient_id]
d[, block := cumsum(is.na(gap_prev_days) | gap_prev_days < 1 |
                      gap_prev_days > gap_max), by = patient_id]
d[, hist_n_days := seq_len(.N) - 1L, by = .(patient_id, block)]

d[, lag1_night_tbr := shift(tir_below_3_9__min_night, 1L),
  by = .(patient_id, block)]
d[, lag1_night_hypo := shift(label, 1L), by = .(patient_id, block)]
d[, lag1_day_lbgi := shift(lbgi_day, 1L), by = .(patient_id, block)]

first_rows <- d[, .I[1], by = .(patient_id, block)]$V1
for (k in c(3L, 7L)) {
  cols <- paste0("roll", k, c("_mean_night_tbr", "_max_night_tbr",
                              "_sum_night_hypo", "_mean_day_lbgi"))
  d[, win_k := pmin(seq_len(.N), k), by = .(patient_id, block)]
  d[, (cols[1]) := data.table::frollmean(lag1_night_tbr, win_k, align = "right",
                                         adaptive = TRUE, na.rm = TRUE),
    by = .(patient_id, block)]
  d[, (cols[2]) := data.table::frollmax(lag1_night_tbr, win_k, align = "right",
                                        adaptive = TRUE, na.rm = TRUE),
    by = .(patient_id, block)]
  d[, (cols[3]) := data.table::frollsum(lag1_night_hypo, win_k, align = "right",
                                        adaptive = TRUE, na.rm = TRUE),
    by = .(patient_id, block)]
  d[, (cols[4]) := data.table::frollmean(lag1_day_lbgi, win_k, align = "right",
                                         adaptive = TRUE, na.rm = TRUE),
    by = .(patient_id, block)]
  for (cc in cols) {
    data.table::set(d, i = first_rows, j = cc, value = NA_real_)
    bad <- which(is.nan(d[[cc]]) | is.infinite(d[[cc]]))
    if (length(bad)) data.table::set(d, i = bad, j = cc, value = NA_real_)
  }
}
d[, win_k := NULL]
d[hist_n_days == 0,
  c("lag1_night_tbr", "lag1_night_hypo", "lag1_day_lbgi") :=
    .(NA_real_, NA_integer_, NA_real_)]
d[, has_history := as.integer(hist_n_days > 0)]

# The browser cannot reproduce row-wise MICE. For no-history rows use the same
# fixed training-subgroup medians as the web app, so the exported template and
# the history-limited UI path agree.
meta_path <- file.path(demo_dir, "src", "generated", "model-meta.json")
fallback <- jsonlite::read_json(meta_path)$historyFallback
fallback <- vapply(fallback, as.numeric, numeric(1))
d[hist_n_days == 0, c(
  "lag1_night_tbr", "lag1_night_hypo", "lag1_day_lbgi",
  "roll3_mean_night_tbr", "roll3_max_night_tbr", "roll3_sum_night_hypo",
  "roll3_mean_day_lbgi", "roll7_mean_night_tbr", "roll7_max_night_tbr",
  "roll7_sum_night_hypo", "roll7_mean_day_lbgi"
) := as.list(fallback[names(fallback) != "has_history"])]

out <- d[, c("patient_id", "date", "label", feats), with = FALSE]
out[, date := as.character(date)]
data.table::fwrite(out, output_path)

cat("Rows written:", nrow(out), "| columns:", ncol(out), "| file:", output_path, "\n")
