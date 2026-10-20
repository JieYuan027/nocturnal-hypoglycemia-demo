# Parity log

Run date: 2026-10-20

## Full held-out comparison

Command:

```bash
npm run parity
```

Input: `modeling/data/04_imputed_test.rds`, exported to a local-only CSV by
`r/export_models.R`. The feature file is not committed.

| Check | Result |
|---|---|
| Records | 1,419 |
| M1 max absolute probability difference | 6.661e-16 |
| M2 max absolute probability difference | 8.447e-8 |
| M1 AUROC | 0.8701196 |
| M1 AUPRC | 0.6417396 |
| M2 AUROC | 0.8760836 |
| M2 AUPRC | 0.6542914 |
| R06 M1 AUROC / AUPRC | 0.8701 / 0.6417 |
| R06 M2 AUROC / AUPRC | 0.8761 / 0.6543 |

## Why M2 uses float32

The first implementation evaluated tree splits in JavaScript numbers (float64). Several
hundred records crossed a different branch when a feature value sat exactly on a split
point, producing probability differences as large as 0.06.

xgboost stores input values and split thresholds as float32. Applying `Math.fround` to the
feature value and split threshold, and accumulating the margin in float32, reproduces the
R predictions.

## Feature-template check

`r/build_feature_template.R` was compared row by row with
`modeling/data/01_analysis_dataset.rds`:

- Rows compared: 8,690
- Features compared: 155
- Maximum absolute difference: 0
