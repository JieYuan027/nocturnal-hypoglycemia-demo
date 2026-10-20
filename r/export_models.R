#!/usr/bin/env Rscript
# Export fitted M1/M2 models and all data needed by the static web app.

suppressPackageStartupMessages({
  library(glmnet)
  library(xgboost)
})

source(file.path(dirname(normalizePath(sub("^--file=", "",
  grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]))), "common.R"))

out_dir <- file.path(demo_dir, "src", "generated")
public_models <- file.path(demo_dir, "public", "models")
dir.create(public_models, recursive = TRUE, showWarnings = FALSE)

cat("Demo dir:       ", demo_dir, "\n")
cat("Modeling source:", model_project, "\n")

fits <- readRDS(file.path(data_dir, "05_model_fits.rds"))
train <- readRDS(file.path(data_dir, "04_imputed_train_m1.rds"))
test <- readRDS(file.path(data_dir, "04_imputed_test.rds"))

feats <- fits$features
wl <- feature_whitelist()
stopifnot(identical(wl$feature, feats))
stopifnot(length(feats) == 155)

x_train <- build_x(train, feats, fits$gender_levels)
x_test <- build_x(test, feats, fits$gender_levels)
stopifnot(!anyNA(x_train), !anyNA(x_test))

cat("Features:", length(feats), "| train rows:", nrow(x_train),
    "| test rows:", nrow(x_test), "\n")

# ---- M1 coefficients --------------------------------------------------------
co <- as.matrix(coef(fits$m1$fit, s = fits$m1$lambda))
coef_named <- setNames(as.numeric(co[, 1]), rownames(co))
if ("gender_male" %in% names(coef_named)) {
  names(coef_named)[names(coef_named) == "gender_male"] <- "gender"
}
intercept <- unname(coef_named["(Intercept)"])
betas <- coef_named[setdiff(names(coef_named), "(Intercept)")]
missing_beta <- setdiff(feats, names(betas))
stopifnot(length(missing_beta) == 0)
betas <- betas[feats]

p_m1 <- as.numeric(predict(fits$m1$fit, newx = x_test, s = fits$m1$lambda,
                           type = "response"))
p_m2 <- as.numeric(predict(fits$m2$booster, xgboost::xgb.DMatrix(x_test)))

stopifnot(length(p_m1) == nrow(x_test), length(p_m2) == nrow(x_test))

# ---- M2 tree JSON -----------------------------------------------------------
m2_path <- file.path(public_models, "m2.json")
xgboost::xgb.save(fits$m2$booster, m2_path)
cat("M2 JSON:", round(file.info(m2_path)$size / 1e6, 3), "MB\n")

# ---- Full parity file (kept outside the repository) ------------------------
parity_path <- Sys.getenv("PARITY_OUT", "/private/tmp/hypo_parity.csv")
parity <- data.frame(x_test, check.names = FALSE)
parity$label <- as.integer(test$label)
parity$p_m1 <- p_m1
parity$p_m2 <- p_m2
data.table::fwrite(parity, parity_path)
cat("Parity rows:", nrow(parity), "->", parity_path, "\n")

# ---- Threshold curves -------------------------------------------------------
thresholds <- seq(0.05, 0.80, by = 0.005)
y <- as.integer(test$label)
curve_rows <- rbindlist(lapply(c("M1", "M2"), function(m) {
  p <- if (m == "M1") p_m1 else p_m2
  data.table(
    model = m,
    threshold = thresholds,
    sensitivity = vapply(thresholds, function(t) mean(p[y == 1] >= t), numeric(1)),
    specificity = vapply(thresholds, function(t) mean(p[y == 0] < t), numeric(1))
  )
}))

# ---- Feature metadata -------------------------------------------------------
feature_meta <- rbindlist(lapply(seq_along(feats), function(j) {
  v <- x_train[, j]
  q <- as.numeric(stats::quantile(v, probs = c(0.01, 0.50, 0.99), na.rm = TRUE))
  data.table(
    name = feats[j],
    group = wl$group[j],
    min = min(v),
    p01 = q[1],
    median = q[2],
    p99 = q[3],
    max = max(v),
    sd = stats::sd(v)
  )
}))

# ---- Model importance -------------------------------------------------------
imp_m1 <- read_result("05_importance_m1")
imp_m1$feature[imp_m1$feature == "gender_male"] <- "gender"
imp_m1 <- imp_m1[order(-abs(imp_m1$std_coef)), ]
imp_m1_rows <- lapply(seq_len(nrow(imp_m1)), function(i) {
  list(feature = imp_m1$feature[i],
       value = abs(imp_m1$std_coef[i]),
       signed = imp_m1$std_coef[i])
})

imp_m2 <- read_result("06_shap_importance")
imp_m2$feature[imp_m2$feature == "gender_male"] <- "gender"
imp_m2 <- imp_m2[order(-imp_m2$mean_abs_shap), ]
imp_m2_rows <- lapply(seq_len(nrow(imp_m2)), function(i) {
  list(feature = imp_m2$feature[i], value = imp_m2$mean_abs_shap[i])
})

# ---- Validation metrics -----------------------------------------------------
metrics <- read_result("06_test_metrics")
metrics_ci <- read_result("06_test_metrics_ci")
calibration <- read_result("06_calibration_table")
dca <- read_result("06_dca_table")

label_dist <- read_result("01_label_distribution")
main_dist <- label_dist[grepl("label_night_hypo_d", label_dist$label), ][1, ]
by_source <- read_result("01_label_by_source")
test_m1 <- metrics[metrics$model == "M1", ][1, ]
cohort <- list(
  patients = sum(by_source$patients),
  patientDays = main_dist$n,
  events = main_dist$events,
  eventPct = main_dist$pct,
  testPatients = length(unique(test$patient_id)),
  testPatientDays = test_m1$n,
  testEvents = test_m1$events,
  testEventPct = round(test_m1$events / test_m1$n * 100, 2)
)

# Fixed fallback for history-limited predictions. MICE was used for the 418
# training rows without prior days; the browser cannot reproduce row-wise MICE,
# so the app substitutes the median imputed value from that subgroup.
hist_value_cols <- setdiff(history_cols, c("has_history", "hist_n_days"))
history_fallback <- vapply(hist_value_cols, function(f) {
  stats::median(train[[f]][train$hist_n_days == 0], na.rm = TRUE)
}, numeric(1))

meta <- list(
  version = "1.0.0",
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  generator = list(
    R = paste(R.version$major, R.version$minor, sep = "."),
    glmnet = as.character(packageVersion("glmnet")),
    xgboost = as.character(packageVersion("xgboost"))
  ),
  modelHash = unname(tools::md5sum(file.path(data_dir, "05_model_fits.rds"))),
  features = feature_meta,
  featureNames = feats,
  historyFeatures = history_cols,
  historyFallback = as.list(history_fallback),
  genderLevels = fits$gender_levels,
  thresholds = list(M0 = NULL, M1 = unname(fits$thresholds["M1"]),
                    M2 = unname(fits$thresholds["M2"])),
  m1 = list(intercept = intercept, betas = as.list(betas),
            alpha = fits$m1$alpha, lambda = fits$m1$lambda),
  m2FeatureNames = feats,
  curves = curve_rows,
  importance = list(M1 = imp_m1_rows, M2 = imp_m2_rows),
  metrics = metrics,
  metricsCi = metrics_ci,
  calibration = calibration,
  dca = dca,
  cohort = cohort,
  notes = list(
    m0Rule = "Previous-night time below 3.9 mmol/L >= 15 minutes",
    thresholdSource = "05_model_fits.rds (as used by R06 final evaluation)",
    calibrationWarning = "Probabilities are not individually calibrated. Use for ranking and threshold exploration only."
  )
)

write_json_file(meta, file.path(out_dir, "model-meta.json"))
cat("Wrote model-meta.json\n")
cat("Default thresholds: M1", round(fits$thresholds["M1"], 4),
    "| M2", round(fits$thresholds["M2"], 4), "\n")
