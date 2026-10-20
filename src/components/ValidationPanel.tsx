import { useState } from "react";
import type { ReactNode } from "react";
import type { ModelMeta } from "../types";
import { Chart } from "./Chart";
import { ciFor, fixed, metricFor, percent } from "../lib/metrics";

interface ValidationPanelProps {
  meta: ModelMeta;
}

export function ValidationPanel({ meta }: ValidationPanelProps) {
  const [curveModel, setCurveModel] = useState<"M1" | "M2">("M2");
  const calibration = (model: "M1" | "M2") =>
    meta.calibration
      .filter((point) => point.model === model)
      .sort((a, b) => a.mean_pred - b.mean_pred)
      .map((point) => ({ x: point.mean_pred, y: point.observed }));

  const curve = meta.curves.filter((point) => point.model === curveModel);
  const defaultThreshold = meta.thresholds[curveModel] ?? 0.25;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
          Model documentation
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#102f38]">
          Performance, calibration, and intended use
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          M0 is a clinical rule baseline. M1 is an elastic-net logistic model. M2 is a gradient
          boosted tree model. All metrics below come from the patient-level holdout described in the
          analysis report.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CohortCard value={meta.cohort.patients.toLocaleString()} label="Development patients" />
        <CohortCard value={meta.cohort.patientDays.toLocaleString()} label="Development patient-days" />
        <CohortCard value={`${meta.cohort.eventPct.toFixed(2)}%`} label="Development event rate" />
        <CohortCard
          value={meta.cohort.testPatientDays.toLocaleString()}
          label={`Holdout patient-days · ${meta.cohort.testEvents} events`}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h3 className="text-lg font-semibold text-[#102f38]">Holdout performance</h3>
        <p className="mt-1 text-sm text-slate-500">
          {meta.cohort.testPatients} patients and {meta.cohort.testPatientDays.toLocaleString()}{" "}
          patient-days were held out at the patient level. Bootstrap intervals are patient-clustered.
        </p>
        <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Model</th>
                <th className="px-3 py-2.5 font-medium">AUPRC (95% CI)</th>
                <th className="px-3 py-2.5 font-medium">AUROC (95% CI)</th>
                <th className="px-3 py-2.5 font-medium">Brier</th>
                <th className="px-3 py-2.5 font-medium">Sens.</th>
                <th className="px-3 py-2.5 font-medium">Spec.</th>
                <th className="px-3 py-2.5 font-medium">PPV</th>
                <th className="px-3 py-2.5 font-medium">NPV</th>
              </tr>
            </thead>
            <tbody>
              {(["M0", "M1", "M2"] as const).map((model) => {
                const row = metricFor(meta, model);
                if (!row) return null;
                const ap = ciFor(meta, model, "auprc");
                const au = ciFor(meta, model, "auroc");
                return (
                  <tr
                    key={model}
                    className={`border-t border-slate-100 ${
                      model === "M2" ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <td className="px-3 py-3 font-semibold text-[#102f38]">
                      {model}
                      {model === "M2" ? (
                        <span className="ml-2 rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                          primary
                        </span>
                      ) : null}
                    </td>
                    <MetricCell value={row.auprc} ci={ap} />
                    <MetricCell value={row.auroc} ci={au} />
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                      {row.brier.toFixed(3)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                      {percent(row.sensitivity)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                      {percent(row.specificity)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                      {percent(row.ppv)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                      {percent(row.npv)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Sensitivity and specificity use each model&apos;s prespecified threshold: M1{" "}
          {meta.thresholds.M1?.toFixed(3)}, M2 {meta.thresholds.M2?.toFixed(3)}.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[#102f38]">Calibration</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Decile means. Both models overpredict absolute risk; M2 tracks the observed slope more
            closely but still needs recalibration before individual risk communication.
          </p>
          <div className="mt-3">
            <Chart
              series={[
                {
                  name: "Perfect calibration",
                  color: "#94a3b8",
                  dashed: true,
                  points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                  ],
                },
                { name: "M1", color: "#0f766e", points: calibration("M1"), dots: true },
                { name: "M2", color: "#c2410c", points: calibration("M2"), dots: true },
              ]}
              xLabel="Mean predicted probability"
              yLabel="Observed event rate"
              xDomain={[0, 1]}
              yDomain={[0, 1]}
              xTicks={[0, 0.25, 0.5, 0.75, 1]}
              yTicks={[0, 0.25, 0.5, 0.75, 1]}
              formatX={(value) => `${Math.round(value * 100)}%`}
              formatY={(value) => `${Math.round(value * 100)}%`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[#102f38]">Threshold trade-off</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Sensitivity and specificity on the holdout set as the alert threshold moves.
              </p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
              {(["M1", "M2"] as const).map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => setCurveModel(model)}
                  className={`rounded-md px-2.5 py-1.5 ${
                    curveModel === model ? "bg-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <Chart
              series={[
                {
                  name: "Sensitivity",
                  color: "#0f766e",
                  points: curve.map((point) => ({ x: point.threshold, y: point.sensitivity })),
                },
                {
                  name: "Specificity",
                  color: "#c2410c",
                  points: curve.map((point) => ({ x: point.threshold, y: point.specificity })),
                },
              ]}
              xLabel="Decision threshold"
              yLabel="Proportion"
              xDomain={[0.05, 0.8]}
              yDomain={[0, 1]}
              xTicks={[0.05, 0.2, 0.35, 0.5, 0.65, 0.8]}
              yTicks={[0, 0.25, 0.5, 0.75, 1]}
              formatX={(value) => value.toFixed(2)}
              formatY={(value) => `${Math.round(value * 100)}%`}
              marker={{ x: defaultThreshold, label: "default" }}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h3 className="text-lg font-semibold text-[#102f38]">Model card</h3>
          <dl className="mt-4 space-y-4 text-sm leading-6">
            <ModelCardItem term="Intended use">
              Research demonstration of a patient-day model that estimates whether the coming night
              will include at least 15 minutes below 3.9 mmol/L in hospitalized adults with CGM.
            </ModelCardItem>
            <ModelCardItem term="Not intended for">
              Insulin dosing, triage, alarms, or any clinical decision. The model has not been
              prospectively evaluated as a medical device.
            </ModelCardItem>
            <ModelCardItem term="Predictors">
              140 daytime CGM summary metrics, reading count, sex, and 13 prior-day history
              features. The full list and accepted units are in the repository documentation.
            </ModelCardItem>
            <ModelCardItem term="Development data">
              {meta.cohort.patients} patients and {meta.cohort.patientDays.toLocaleString()}{" "}
              patient-days, with {meta.cohort.events.toLocaleString()} events (
              {meta.cohort.eventPct.toFixed(2)}%).
            </ModelCardItem>
            <ModelCardItem term="Calibration">
              M2 calibration slope 0.846, intercept -1.425; M1 slope 3.139, intercept -1.458.
              Absolute probabilities are systematically high and should not be quoted as personal
              risk.
            </ModelCardItem>
            <ModelCardItem term="Main limitations">
              Retrospective design; hospitalized CGM population; vendor-dependent day metrics;
              history-limited inputs are approximate; no external prospective validation of this
              exact endpoint; demo rows are synthetic.
            </ModelCardItem>
          </dl>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-[#102f38]">Privacy and reproducibility</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>Static site: predictions run as client-side JavaScript in your browser.</li>
              <li>No uploads, analytics, cookies, accounts, or server-side storage.</li>
              <li>
                M2 is exported as a 0.48 MB tree ensemble; M1 coefficients are evaluated analytically.
              </li>
              <li>
                Browser predictions are checked against R on every held-out record during the build.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#fbfcfa] p-5 text-sm leading-6 text-slate-600">
            <p className="font-semibold text-[#102f38]">Artifact provenance</p>
            <p className="mt-2">
              Model version {meta.version} · generated {meta.generatedAt.slice(0, 10)}
            </p>
            <p className="mt-1 font-mono text-[11px] break-all text-slate-500">
              hash {meta.modelHash}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              R {meta.generator.R} · glmnet {meta.generator.glmnet} · xgboost{" "}
              {meta.generator.xgboost}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function CohortCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="font-mono text-2xl font-semibold text-[#102f38]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{label}</p>
    </div>
  );
}

function MetricCell({
  value,
  ci,
}: {
  value: number;
  ci?: { lower: number; upper: number };
}) {
  return (
    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
      {fixed(value)}
      {ci ? (
        <span className="ml-1 text-xs text-slate-400">
          ({ci.lower.toFixed(2)}–{ci.upper.toFixed(2)})
        </span>
      ) : null}
    </td>
  );
}

function ModelCardItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}
