#!/usr/bin/env Rscript
# Generate distribution-matched synthetic patient-days for the public demo.
# No source patient rows are copied; values are sampled through a Gaussian
# copula fitted to the held-out test feature distribution.

suppressPackageStartupMessages({
  library(glmnet)
  library(xgboost)
})

source(file.path(dirname(normalizePath(sub("^--file=", "",
  grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]))), "common.R"))

set.seed(20261020)

fits <- readRDS(file.path(data_dir, "05_model_fits.rds"))
test <- readRDS(file.path(data_dir, "04_imputed_test.rds"))
feats <- fits$features
wl <- feature_whitelist()
x <- build_x(test, feats, fits$gender_levels)
n_syn <- 40L

# Rank-normal scores preserve each feature's empirical marginal distribution.
z <- apply(x, 2, function(v) {
  qnorm((rank(v, ties.method = "average") - 0.5) / length(v))
})
cm <- cor(z)
cm <- cm + diag(1e-4, ncol(cm))
chol_cm <- tryCatch(chol(cm), error = function(e) {
  ev <- eigen(cm, symmetric = TRUE)
  vals <- pmax(ev$values, 1e-6)
  chol(ev$vectors %*% diag(vals, nrow = length(vals)) %*% t(ev$vectors))
})
raw <- matrix(rnorm(n_syn * ncol(z)), n_syn, ncol(z)) %*% chol_cm
scores <- pnorm(raw)

syn <- matrix(NA_real_, nrow = n_syn, ncol = length(feats),
              dimnames = list(NULL, feats))
for (j in seq_along(feats)) {
  syn[, j] <- as.numeric(stats::quantile(x[, j], probs = scores[, j],
                                         type = 1, names = FALSE))
}

# ---- Structural clean-up ----------------------------------------------------
# Percentile ordering: p10 <= p25 <= median <= p75 <= p90.
pct_cols <- c("percentile10_day", "percentile25_day", "median_day",
              "percentile75_day", "percentile90_day")
if (all(pct_cols %in% feats)) {
  syn[, pct_cols] <- t(apply(syn[, pct_cols, drop = FALSE], 1, sort))
}
if (all(c("min_day", "max_day") %in% feats)) {
  syn[, "min_day"] <- pmin(syn[, "min_day"], syn[, pct_cols[1]])
  syn[, "max_day"] <- pmax(syn[, "max_day"], syn[, pct_cols[5]])
}

# Keep every minutes/percent TIR pair internally consistent.
for (f in grep("__min_day$", feats, value = TRUE)) {
  pf <- sub("__min_day$", "__pct_day", f)
  if (pf %in% feats && !grepl("^tir_below", f)) {
    syn[, pf] <- pmin(pmax(syn[, f] / 1440, 0), 1)
  }
}
min_cols <- grep("(tir_.*__min|_min)_day$", feats, value = TRUE)
min_cols <- setdiff(min_cols, c("mage_day", "modd_day", "lage_day"))
if (length(min_cols)) {
  syn[, min_cols] <- pmin(pmax(syn[, min_cols, drop = FALSE], 0), 1440)
}
pct_cols_all <- grep("__pct_day$", feats, value = TRUE)
if (length(pct_cols_all)) {
  syn[, pct_cols_all] <- pmin(pmax(syn[, pct_cols_all, drop = FALSE], 0), 1)
}

syn[, "n_readings"] <- pmin(pmax(round(syn[, "n_readings"]), 12), 288)
syn[, "valid_data_ratio_day"] <- pmin(pmax(syn[, "valid_data_ratio_day"], 0.7), 1)
syn[, "gender"] <- round(pmin(pmax(syn[, "gender"], 0), 1))

# Rebuild the history block from simulated prior nights.
emp_tbr <- test$tbr_night_min
emp_tbr <- emp_tbr[is.finite(emp_tbr)]
emp_lbgi <- test$lbgi_day
emp_lbgi <- emp_lbgi[is.finite(emp_lbgi)]

for (i in seq_len(n_syn)) {
  h_n <- sample(8:14, 1)
  series_tbr <- sample(emp_tbr, 7, replace = TRUE)
  series_lbgi <- sample(emp_lbgi, 7, replace = TRUE)
  lag1_tbr <- series_tbr[7]
  syn[i, "has_history"] <- 1
  syn[i, "hist_n_days"] <- h_n
  syn[i, "lag1_night_tbr"] <- lag1_tbr
  syn[i, "lag1_night_hypo"] <- as.numeric(lag1_tbr >= 15)
  syn[i, "lag1_day_lbgi"] <- series_lbgi[7]
  win3_tbr <- series_tbr[5:7]
  win7_tbr <- series_tbr
  win3_lbgi <- series_lbgi[5:7]
  syn[i, "roll3_mean_night_tbr"] <- mean(win3_tbr)
  syn[i, "roll3_max_night_tbr"] <- max(win3_tbr)
  syn[i, "roll3_sum_night_hypo"] <- sum(win3_tbr >= 15)
  syn[i, "roll3_mean_day_lbgi"] <- mean(win3_lbgi)
  syn[i, "roll7_mean_night_tbr"] <- mean(win7_tbr)
  syn[i, "roll7_max_night_tbr"] <- max(win7_tbr)
  syn[i, "roll7_sum_night_hypo"] <- sum(win7_tbr >= 15)
  syn[i, "roll7_mean_day_lbgi"] <- mean(series_lbgi)
}

# Predict with the exported models, then draw plausible labels from the
# calibration-corrected risk (M2 calibration intercept -1.425, slope 0.846).
p_m2 <- as.numeric(predict(fits$m2$booster, xgboost::xgb.DMatrix(syn)))
p_m1 <- as.numeric(predict(fits$m1$fit, newx = syn, s = fits$m1$lambda,
                           type = "response"))
p_label <- plogis(-1.425 + 0.846 * qlogis(pmin(pmax(p_m2, 1e-6), 1 - 1e-6)))
label <- rbinom(n_syn, 1, p_label)

sample_df <- data.frame(
  patient_id = sprintf("SYN-%03d", seq_len(n_syn)),
  date = as.character(as.Date("2026-01-01") + seq_len(n_syn) - 1),
  label = label,
  syn,
  check.names = FALSE
)

sample_path <- file.path(demo_dir, "public", "samples", "sample-features.csv")
dir.create(dirname(sample_path), recursive = TRUE, showWarnings = FALSE)
data.table::fwrite(sample_df, sample_path)

template_path <- file.path(demo_dir, "public", "samples", "template.csv")
data.table::fwrite(sample_df[0, ], template_path)

fixture <- lapply(seq_len(n_syn), function(i) {
  list(
    id = sample_df$patient_id[i],
    features = as.list(syn[i, ]),
    pM1 = p_m1[i],
    pM2 = p_m2[i],
    label = label[i]
  )
})
write_json_file(
  list(seed = 20261020, rows = fixture),
  file.path(demo_dir, "src", "test", "fixtures", "synthetic-parity.json")
)

cat("Synthetic rows:", n_syn, "| events:", sum(label),
    "| file:", sample_path, "\n")
