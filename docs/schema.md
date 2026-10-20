# Input schema

The web app accepts a CSV with exactly the feature names listed in
`public/samples/template.csv`. Column order is not important, but names are.

## Optional columns

| Column | Purpose |
|---|---|
| `patient_id` | Label shown in the results table. Defaults to the row number. |
| `date` | Record date shown in the table. Not used by the model. |
| `label` | Recorded outcome (0/1). Shown as a reference column when present. |

Any other extra column is ignored and reported in the validation summary.

## Required features

There are 142 required features:

- 140 daytime CGM summary metrics (for example `mean_glucose_day`, `lbgi_day`,
  `mage_day`, and TIR thresholds)
- `n_readings`
- `gender`

`gender` accepts `female` / `male`, `f` / `m`, `0` / `1`, `女` / `男`, or `女性` / `男性`.
Internally, female is 0 and male is 1.

All values must be numeric and non-missing. The app does not impute missing required
features; a row with a missing or non-numeric required value is rejected with the affected
column names.

## History block

The 13 history columns may be supplied together or omitted together:

- `has_history`
- `hist_n_days`
- `lag1_night_tbr`
- `lag1_night_hypo`
- `lag1_day_lbgi`
- `roll3_mean_night_tbr`
- `roll3_max_night_tbr`
- `roll3_sum_night_hypo`
- `roll3_mean_day_lbgi`
- `roll7_mean_night_tbr`
- `roll7_max_night_tbr`
- `roll7_sum_night_hypo`
- `roll7_mean_day_lbgi`

If all 13 are omitted, the app sets `has_history = 0`, `hist_n_days = 0`, substitutes fixed
training-subgroup reference values for the remaining 11 fields, and flags the prediction as
history-limited. This is an approximation, not individual imputation.

If only part of the history block is present, the file is rejected before scoring.

## History construction for Gplus exports

`r/build_feature_template.R` mirrors the modeling pipeline:

1. Keep rows with a non-missing night TBR outcome, valid daytime data >= 70%, valid night
   data >= 70%, and a non-missing date.
2. Drop rows without a patient identifier.
3. Sort by patient and date.
4. Start a new history block when the gap is < 1 day or > 14 days.
5. Set `hist_n_days` to the number of preceding records in the block.
6. Build lag-1 values and adaptive 3-day / 7-day rolling features strictly from earlier
   records.

The script was checked against `modeling/data/01_analysis_dataset.rds` on all 8,690 rows
with a patient identifier. All 155 features matched exactly.

## Units

- Glucose-derived fields are in mmol/L.
- TIR fields ending in `__min_day` or `_min_day` are minutes per day.
- TIR fields ending in `__pct_day` are proportions from 0 to 1.
- `valid_data_ratio_day` is a proportion.
- `n_readings` is a count.
- `hist_n_days` is a count of preceding days in the current block.

The app warns when a value falls outside the observed training range but still scores the
row.
