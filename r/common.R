# Shared helpers for exporting the nocturnal hypoglycemia model artifacts.
# Run from the demo repository root: Rscript r/<script>.R

suppressPackageStartupMessages({
  library(data.table)
  library(jsonlite)
})

demo_dir <- local({
  ca <- commandArgs(trailingOnly = FALSE)
  f <- grep("^--file=", ca, value = TRUE)
  if (length(f)) {
    normalizePath(dirname(dirname(sub("^--file=", "", f[1]))))
  } else {
    normalizePath(".")
  }
})

model_project <- normalizePath(
  Sys.getenv("MODEL_PROJECT", file.path(demo_dir, "..")),
  mustWork = TRUE
)

modeling_dir <- file.path(model_project, "modeling")
results_dir <- file.path(modeling_dir, "results")
data_dir <- file.path(modeling_dir, "data")

read_result <- function(name) {
  utils::read.csv(file.path(results_dir, paste0(name, ".csv")),
                  check.names = FALSE, stringsAsFactors = FALSE)
}

feature_whitelist <- function() {
  read_result("01_feature_whitelist")
}

history_cols <- c(
  "has_history", "hist_n_days", "lag1_night_tbr", "lag1_night_hypo",
  "lag1_day_lbgi", "roll3_mean_night_tbr", "roll3_max_night_tbr",
  "roll3_sum_night_hypo", "roll3_mean_day_lbgi", "roll7_mean_night_tbr",
  "roll7_max_night_tbr", "roll7_sum_night_hypo", "roll7_mean_day_lbgi"
)

# Build the exact 155-column numeric matrix used by R05. Gender is encoded with
# the training factor levels (female = 0, male = 1).
build_x <- function(dt, feats, gender_levels) {
  df <- as.data.frame(dt)
  x <- matrix(NA_real_, nrow = nrow(df), ncol = length(feats),
              dimnames = list(NULL, feats))
  for (f in feats) {
    if (f == "gender") {
      x[, f] <- as.numeric(factor(df$gender, levels = gender_levels)) - 1
    } else {
      x[, f] <- as.numeric(df[[f]])
    }
  }
  x
}

write_json_file <- function(x, path) {
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(
    x, path,
    auto_unbox = TRUE,
    dataframe = "rows",
    digits = NA,
    pretty = TRUE,
    null = "null"
  )
  invisible(path)
}

round_safe <- function(x, digits = 6) {
  ifelse(is.finite(x), round(x, digits), NA_real_)
}
