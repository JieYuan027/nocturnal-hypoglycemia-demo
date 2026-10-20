# Model card

## Model details

| Item | Value |
|---|---|
| Version | 1.0.0 |
| Task | Patient-day prediction of nocturnal hypoglycemia |
| Outcome | At least 15 minutes below 3.9 mmol/L during the coming night |
| Models | M0 clinical rule, M1 elastic net, M2 gradient boosted trees |
| M1 hyperparameters | alpha 0.25, lambda 0.393 |
| M2 ensemble | 400 trees, max depth 3-5, learning rate 0.05-0.10 |
| Default thresholds | M1 0.472, M2 0.248 |

## Intended use

This demo is intended for research communication: reviewers, conference attendees, and
collaborators can inspect how CGM-derived daytime features map to next-night risk.

It is **not** intended for clinical decision-making, insulin adjustment, triage, alarms,
patient self-management, or any use that could delay care.

## Development data

- 395 patients
- 8,742 patient-days
- 1,300 events
- Event rate 14.87%
- Hospitalized adults with CGM

The analysis pipeline used patient-grouped splits and a leakage audit. Daytime features
were used to predict the night outcome; same-night data were excluded from the feature
whitelist.

## Evaluation

Patient-level holdout:

- 79 patients
- 1,419 patient-days
- 174 events (12.26%)

| Model | AUPRC | AUROC | Brier | Sensitivity | Specificity | PPV | NPV |
|---|---:|---:|---:|---:|---:|---:|---:|
| M0 | 0.327 | 0.732 | 0.140 | 56.3% | 90.1% | 44.3% | 93.7% |
| M1 | 0.642 | 0.870 | 0.157 | 73.6% | 86.8% | 43.7% | 95.9% |
| M2 | 0.654 | 0.876 | 0.098 | 85.6% | 72.0% | 29.9% | 97.3% |

Bootstrap intervals are patient-clustered and available in the Model & validation page.

## Calibration

| Model | Calibration slope | Calibration intercept |
|---|---:|---:|
| M1 | 3.139 | -1.458 |
| M2 | 0.846 | -1.425 |

Both models overpredict absolute risk. M2 has the more plausible slope but still needs
recalibration before individual risk communication. The demo therefore emphasizes rank,
threshold trade-offs, and explicit uncertainty.

## Inputs

155 features:

- 140 daytime CGM summary metrics
- 1 reading-count quality feature
- Sex
- 13 prior-day history features (lag-1 and 3/7-day rolling summaries)

The day metrics come from a vendor reporting pipeline. This repository does not guarantee
that MAGE, MODD, GRI, and every TIR boundary can be reproduced from an arbitrary raw CGM
series.

## History-limited mode

The modeling pipeline used MICE for rows without prior days. Browser-side row-wise MICE is
not available. When the history block is omitted, the app substitutes the median imputed
value from the training subgroup with no history and flags the prediction as approximate.

## Known limitations

- Retrospective, single-study modeling data; no prospective evaluation of the demo.
- Hospitalized adult CGM population; transportability is unknown.
- Vendor-dependent feature definitions.
- Absolute probabilities are miscalibrated.
- Synthetic sample rows are for interface demonstration only.
- No record-level explanation; the interface shows global importance, not SHAP for the
  selected record.
- M0 is a deterministic rule with no probability and no threshold response.

## Reproducibility

The repository includes:

- `r/export_models.R` to export model artifacts from the fitted R objects
- `r/build_feature_template.R` to build the 155-column input format
- `r/make_synthetic_sample.R` to regenerate the synthetic sample
- `npm run parity` for the full R-vs-TypeScript held-out comparison

Current parity:

- 1,419 held-out records
- M1 maximum absolute probability difference: 6.7e-16
- M2 maximum absolute probability difference: 8.4e-8
- AUROC and AUPRC reproduce the R06 evaluation to four decimals
