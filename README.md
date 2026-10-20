# Nocturnal Hypoglycemia Risk

An interactive research demo that estimates the probability of a hypoglycemic night
(at least 15 minutes below 3.9 mmol/L) from CGM-derived daytime features.

**Live demo:** https://jieyuan027.github.io/nocturnal-hypoglycemia-demo/

> Research prototype. Not a medical device. Not for clinical decisions, insulin dosing,
> triage, or patient alarms. All predictions run in the visitor's browser; no record is
> uploaded or stored.

## What is included

- Three selectable models: a clinical rule baseline (M0), an elastic net (M1), and a
  400-tree gradient boosted model (M2).
- Batch CSV scoring and a single-row editor.
- An adjustable decision threshold with holdout sensitivity and specificity.
- A synthetic, distribution-matched sample of 40 patient-days.
- A model and validation page with holdout metrics, calibration, and a model card.

## Model summary

| Model | Description | AUPRC | AUROC | Brier |
|---|---|---:|---:|---:|
| M0 | Previous-night TBR >= 15 min | 0.327 | 0.732 | 0.140 |
| M1 | Elastic-net logistic regression | 0.642 | 0.870 | 0.157 |
| M2 | Gradient boosted trees | 0.654 | 0.876 | 0.098 |

Metrics come from a patient-level holdout: 79 patients, 1,419 patient-days, and 174 events.
Development data: 395 patients and 8,742 patient-days (14.87% event rate).

Absolute probabilities are not individually calibrated. M2 has a calibration slope of 0.846
and an intercept of -1.425; both models overpredict risk. Use the demo for ranking and
threshold exploration, not for personal risk communication.

## Input data

The app accepts a CSV with the 155 model features. Optional columns are `patient_id`,
`date`, and `label`. See [docs/schema.md](docs/schema.md) for the full validation rules.

The 13 history columns may be omitted as a block. When they are omitted, the app uses a
fixed training-set reference for the history features and labels the prediction as
history-limited.

The public sample is synthetic and is not derived from an identifiable patient record:

- `public/samples/sample-features.csv` - 40 synthetic patient-days
- `public/samples/template.csv` - empty 155-feature template

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm test
npm run build
npm run preview
```

The Vite base path is `/nocturnal-hypoglycemia-demo/`, matching the GitHub Pages project URL.

## Rebuilding model artifacts

The demo repository expects the modeling workspace as a sibling directory
(`../modeling/data/05_model_fits.rds`). Set `MODEL_PROJECT` if it lives elsewhere.

```bash
Rscript r/export_models.R
Rscript r/make_synthetic_sample.R
```

`export_models.R` produces:

- `src/generated/model-meta.json` - features, M1 coefficients, thresholds, curves,
  importance, metrics, calibration, and cohort metadata.
- `public/models/m2.json` - exported xgboost tree ensemble.
- `/private/tmp/hypo_parity.csv` - held-out predictions for local parity checks.

To convert a Gplus daily-summary export into the 155-column demo format:

```bash
Rscript r/build_feature_template.R standardized_daily_stats.csv features_for_demo.csv
```

## Parity checks

```bash
npm test          # synthetic fixture parity and CSV validation
npm run parity    # full 1,419-record R-vs-TypeScript check
```

Current results:

| Check | Result |
|---|---|
| M1 max absolute probability difference | 6.7e-16 |
| M2 max absolute probability difference | 8.4e-8 |
| M1 AUROC / AUPRC | 0.8701 / 0.6417 |
| M2 AUROC / AUPRC | 0.8761 / 0.6543 |

The M2 implementation uses float32 comparisons and accumulation because xgboost stores
inputs and split thresholds as float32. Float64 evaluation produces material differences
on values that sit exactly on a split point.

## Privacy

- The site is static; predictions run as client-side JavaScript.
- No uploads, analytics, cookies, accounts, or server-side storage.
- The production build adds a Content-Security-Policy that allows connections only to the
  site's own origin.
- Files are parsed locally with Papa Parse.

## Intended use and limitations

The underlying model was developed in hospitalized adults with CGM. It is a retrospective
research model. The 140 daytime metrics are vendor-derived; this repository does not claim
that every metric can be reproduced from an arbitrary raw CGM series. The sample data are
synthetic. There has been no prospective evaluation of this interactive tool.

See [docs/model-card.md](docs/model-card.md) for the full model card.

## Repository layout

```text
src/                  React application and model runtime
public/models/        exported M2 tree ensemble
public/samples/       synthetic sample and empty template
r/                    model export, synthetic data, and feature-template scripts
scripts/parity.ts     full R-vs-TypeScript parity check
docs/                 schema, model card, parity log
.github/workflows/    GitHub Pages deployment
```

## License

Code is released under the MIT License. Documentation and the model card are licensed under
CC BY 4.0.
