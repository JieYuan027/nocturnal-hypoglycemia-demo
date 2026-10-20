import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ModelId, ModelMeta, ScoredRow, ValidationResult, XgbBoosterJson } from "../types";
import { featureLabel, featureUnit, formatFeatureValue } from "../lib/labels";
import { fixed, metricFor, percent, sensSpecAt } from "../lib/metrics";
import { scoreRow } from "../lib/models";
import { ignoredColumns, parseCsv } from "../lib/validate";

interface PredictPanelProps {
  meta: ModelMeta;
  booster: XgbBoosterJson | null;
  boosterStatus: "loading" | "ready" | "error";
}

const MODELS: { id: ModelId; name: string; descriptor: string }[] = [
  { id: "M0", name: "M0 · Clinical rule", descriptor: "Previous-night TBR ≥ 15 min" },
  { id: "M1", name: "M1 · Elastic net", descriptor: "Regularized logistic model" },
  { id: "M2", name: "M2 · Gradient boosting", descriptor: "400 boosted trees" },
];

const PAGE_SIZE = 20;

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function riskFlag(row: ScoredRow, model: ModelId, threshold: number): boolean | null {
  if (row.unavailable) return null;
  if (model === "M0") return row.m0;
  return row.probability === null ? null : row.probability >= threshold;
}

export function PredictPanel({ meta, booster, boosterStatus }: PredictPanelProps) {
  const [mode, setMode] = useState<"upload" | "single">("upload");
  const [consent, setConsent] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [singleText, setSingleText] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [model, setModel] = useState<ModelId>("M2");
  const [threshold, setThreshold] = useState<number>(meta.thresholds.M2 ?? 0.248);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(0);
  const [loadError, setLoadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = meta.thresholds[model];
    if (next !== null) setThreshold(next);
    setSelectedIndex(0);
    setPage(0);
  }, [model, meta.thresholds]);

  const scored = useMemo<ScoredRow[]>(() => {
    if (!validation) return [];
    return validation.rows.map((row) => ({ ...row, ...scoreRow(row, model, meta, booster) }));
  }, [validation, model, meta, booster]);

  const ordered = useMemo(() => {
    const copy = [...scored];
    copy.sort((a, b) => {
      const av = model === "M0" ? Number(a.m0 ?? -1) : a.probability ?? -1;
      const bv = model === "M0" ? Number(b.m0 ?? -1) : b.probability ?? -1;
      return sortDesc ? bv - av : av - bv;
    });
    return copy;
  }, [scored, model, sortDesc]);

  const selected = ordered[selectedIndex] ?? ordered[0];
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const pageRows = ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const ignored = validation ? ignoredColumns(validation.headers, meta) : [];

  function analyse(text: string, label: string) {
    const result = parseCsv(text, meta);
    setValidation(result);
    setFileName(label);
    setSelectedIndex(0);
    setPage(0);
    setLoadError("");
  }

  async function loadSample() {
    try {
      const response = await fetch(asset("samples/sample-features.csv"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      setSampleText(text);
      const lines = text.split(/\r?\n/).filter(Boolean);
      setSingleText(lines.slice(0, 2).join("\n"));
      analyse(text, "synthetic sample · 40 records");
    } catch (error) {
      setLoadError(`Could not load the sample file: ${(error as Error).message}`);
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    analyse(text, file.name);
    const lines = text.split(/\r?\n/).filter(Boolean);
    setSingleText(lines.slice(0, 2).join("\n"));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function downloadResults() {
    if (!ordered.length) return;
    const header = [
      "patient_id",
      "date",
      "model",
      "probability",
      "threshold",
      "risk_flag",
      "rule_hit",
      "history_limited",
      "recorded_label",
    ];
    const lines = ordered.map((row) => {
      const flag = riskFlag(row, model, threshold);
      return [
        row.patientId,
        row.date,
        model,
        row.probability === null ? "" : row.probability.toFixed(6),
        model === "M0" ? "" : threshold.toFixed(4),
        flag === null ? "" : flag ? "1" : "0",
        row.m0 === null ? "" : row.m0 ? "1" : "0",
        row.historyLimited ? "1" : "0",
        row.label === null ? "" : row.label,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nocturnal-hypoglycemia-${model}-predictions.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <section className="overflow-hidden rounded-3xl bg-[#102f38] text-white shadow-xl shadow-slate-900/10">
        <div className="grid gap-8 px-7 py-8 lg:grid-cols-[1.6fr_1fr] lg:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9ff2e1]">
              Patient-day prediction
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Estimate the risk of a hypoglycemic night from today&apos;s CGM profile.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The model estimates whether the coming night will include at least 15 minutes below
              3.9 mmol/L. All computation happens in this browser; no record is uploaded or stored.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 self-end lg:grid-cols-1">
            <Stat value={meta.cohort.patients.toLocaleString()} label="development patients" />
            <Stat value={meta.cohort.patientDays.toLocaleString()} label="patient-days" />
            <Stat value={`${meta.cohort.eventPct.toFixed(1)}%`} label="event rate" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Step 1</p>
            <h3 className="mt-1 text-xl font-semibold text-[#102f38]">Provide feature data</h3>
            <p className="mt-1 text-sm text-slate-600">
              Upload a CSV with the 155 model features, or edit a single row. The history block may
              be omitted.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={loadSample} disabled={!consent}>
              Load synthetic sample
            </button>
            <a className="btn-secondary" href={asset("samples/template.csv")} download>
              Template
            </a>
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`rounded-lg px-4 py-2 ${mode === "upload" ? "bg-white shadow-sm" : "text-slate-600"}`}
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`rounded-lg px-4 py-2 ${mode === "single" ? "bg-white shadow-sm" : "text-slate-600"}`}
          >
            Edit one row
          </button>
        </div>

        {mode === "upload" ? (
          <div
            className="mt-4 grid place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-[#fafbf8] px-6 py-10 text-center transition hover:border-teal-500"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-teal-700" aria-hidden="true">
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-[#102f38]">
              Drop a CSV here, or choose a file
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Files are parsed locally. Nothing is transmitted.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => inputRef.current?.click()}
              disabled={!consent}
            >
              Choose CSV
            </button>
            {fileName ? <p className="mt-3 text-xs text-slate-500">Loaded: {fileName}</p> : null}
          </div>
        ) : (
          <div className="mt-4">
            <textarea
              value={singleText}
              onChange={(event) => setSingleText(event.target.value)}
              rows={7}
              spellCheck={false}
              className="w-full rounded-xl border border-slate-300 bg-[#fbfcfa] p-3 font-mono text-xs leading-5 text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
              placeholder="patient_id,date,label,valid_data_ratio_day,..."
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!consent || !singleText.trim()}
                onClick={() => analyse(singleText, "single row")}
              >
                Analyse row
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const lines = sampleText.split(/\r?\n/).filter(Boolean);
                  setSingleText(lines.slice(0, 2).join("\n"));
                }}
                disabled={!sampleText}
              >
                Use sample row
              </button>
            </div>
          </div>
        )}

        <label className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-teal-700"
          />
          <span>
            I understand this is a research prototype. It is not a medical device and must not be
            used for clinical decisions. No data leaves this browser.
          </span>
        </label>
        {loadError ? <p className="mt-3 text-sm text-red-700">{loadError}</p> : null}
      </section>

      {validation ? (
        <>
          <ValidationSummary
            validation={validation}
            ignored={ignored}
            boosterStatus={boosterStatus}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                  Step 2
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#102f38]">Choose a model</h3>
              </div>
              {model !== "M0" ? (
                <div className="w-full max-w-md">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">Decision threshold</span>
                    <span className="font-mono text-lg font-semibold text-[#102f38]">
                      {threshold.toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.8}
                    step={0.005}
                    value={threshold}
                    onChange={(event) => setThreshold(Number(event.target.value))}
                    className="mt-2 w-full accent-teal-700"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>more alerts</span>
                    <span>fewer alerts</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {MODELS.map((item) => {
                const metric = metricFor(meta, item.id);
                const active = model === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setModel(item.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-teal-700 bg-teal-50/70 ring-1 ring-teal-700"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#102f38]">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.descriptor}</p>
                    <div className="mt-3 flex gap-4 text-xs text-slate-600">
                      <span>
                        AUPRC <strong className="font-mono">{metric ? fixed(metric.auprc) : "—"}</strong>
                      </span>
                      <span>
                        AUROC <strong className="font-mono">{metric ? fixed(metric.auroc) : "—"}</strong>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-base font-semibold text-[#102f38]">
                    Predicted records
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {ordered.length} scored
                    </span>
                  </h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      onClick={() => setSortDesc((value) => !value)}
                    >
                      Sort: risk {sortDesc ? "high → low" : "low → high"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      onClick={downloadResults}
                    >
                      Download results
                    </button>
                  </div>
                </div>
                <ResultsTable
                  rows={pageRows}
                  model={model}
                  threshold={threshold}
                  selectedIndex={selectedIndex}
                  pageOffset={page * PAGE_SIZE}
                  onSelect={(index) => setSelectedIndex(index)}
                />
                {pageCount > 1 ? (
                  <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      disabled={page === 0}
                      onClick={() => setPage((value) => Math.max(0, value - 1))}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page + 1} of {pageCount}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      disabled={page >= pageCount - 1}
                      onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </div>
              <RecordDetail
                row={selected}
                model={model}
                meta={meta}
                threshold={threshold}
                onThreshold={setThreshold}
              />
            </div>
          </section>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
      <p className="font-mono text-2xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function ValidationSummary({
  validation,
  ignored,
  boosterStatus,
}: {
  validation: ValidationResult;
  ignored: string[];
  boosterStatus: "loading" | "ready" | "error";
}) {
  const [showErrors, setShowErrors] = useState(false);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span className="font-medium text-[#102f38]">
          {validation.rows.length} valid record{validation.rows.length === 1 ? "" : "s"}
        </span>
        <span className={validation.errors.length ? "text-red-700" : "text-slate-500"}>
          {validation.errors.length} rejected
        </span>
        <span className="text-slate-500">{validation.total} rows in file</span>
        <span className="text-slate-500">
          M2 model: {boosterStatus === "ready" ? "ready" : boosterStatus}
        </span>
      </div>
      {validation.warnings.map((warning) => (
        <p key={warning} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warning}
        </p>
      ))}
      {ignored.length ? (
        <p className="mt-2 text-xs text-slate-500">
          Ignored {ignored.length} extra column{ignored.length === 1 ? "" : "s"} (for example{" "}
          {ignored.slice(0, 3).join(", ")}).
        </p>
      ) : null}
      {validation.errors.length ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm font-medium text-red-700 underline-offset-2 hover:underline"
            onClick={() => setShowErrors((value) => !value)}
          >
            {showErrors ? "Hide" : "Show"} rejected rows
          </button>
          {showErrors ? (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-900">
              {validation.errors.slice(0, 50).map((error) => (
                <li key={`${error.row}-${error.message}`}>
                  {error.message}
                  {error.fields.length ? ` Fields: ${error.fields.slice(0, 8).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ResultsTable({
  rows,
  model,
  threshold,
  selectedIndex,
  pageOffset,
  onSelect,
}: {
  rows: ScoredRow[];
  model: ModelId;
  threshold: number;
  selectedIndex: number;
  pageOffset: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5 font-medium">Patient</th>
            <th className="px-3 py-2.5 font-medium">Date</th>
            <th className="px-3 py-2.5 font-medium">
              {model === "M0" ? "Rule" : "Probability"}
            </th>
            <th className="px-3 py-2.5 font-medium">Flag</th>
            <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, offset) => {
            const index = pageOffset + offset;
            const flag = riskFlag(row, model, threshold);
            const active = index === selectedIndex;
            return (
              <tr
                key={`${row.patientId}-${row.index}`}
                onClick={() => onSelect(index)}
                className={`cursor-pointer border-t border-slate-100 ${
                  active ? "bg-teal-50/80" : "hover:bg-slate-50"
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-[#102f38]">
                  {row.patientId}
                  {row.historyLimited ? (
                    <span title="History-limited prediction" className="ml-1.5 text-amber-600">
                      •
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.date || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-slate-700">
                  {row.unavailable
                    ? "—"
                    : model === "M0"
                      ? row.m0
                        ? "Hit"
                        : "No"
                      : row.probability === null
                        ? "…"
                        : percent(row.probability, 1)}
                </td>
                <td className="px-3 py-2.5">
                  <RiskPill flag={flag} />
                </td>
                <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">
                  {row.label === null ? "—" : row.label === 1 ? "Hypo" : "No hypo"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RiskPill({ flag }: { flag: boolean | null }) {
  if (flag === null) {
    return <span className="badge bg-slate-100 text-slate-500">n/a</span>;
  }
  return (
    <span
      className={`badge ${
        flag ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      }`}
    >
      {flag ? "High" : "Low"}
    </span>
  );
}

function RecordDetail({
  row,
  model,
  meta,
  threshold,
  onThreshold,
}: {
  row?: ScoredRow;
  model: ModelId;
  meta: ModelMeta;
  threshold: number;
  onThreshold: (value: number) => void;
}) {
  if (!row) {
    return (
      <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        Select a record to see details.
      </aside>
    );
  }

  const flag = riskFlag(row, model, threshold);
  const sensSpec = model === "M1" || model === "M2" ? sensSpecAt(meta, model, threshold) : null;
  const top = model === "M0" ? [] : meta.importance[model].slice(0, 5);

  return (
    <aside className="h-fit rounded-xl border border-slate-200 bg-[#fbfcfa] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Selected record
      </p>
      <h4 className="mt-1 text-lg font-semibold text-[#102f38]">{row.patientId}</h4>
      <p className="text-xs text-slate-500">{row.date || "No date supplied"}</p>

      <div className="mt-4 rounded-xl bg-[#102f38] px-5 py-4 text-white">
        {model === "M0" ? (
          <p className="text-3xl font-semibold">{row.m0 === null ? "—" : row.m0 ? "Rule hit" : "No hit"}</p>
        ) : (
          <p className="font-mono text-4xl font-semibold">
            {row.probability === null ? "—" : percent(row.probability, 1)}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-300">
          {model === "M0"
            ? "Previous-night TBR ≥ 15 min"
            : "Estimated probability of a hypoglycemic night"}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-600">At threshold {model === "M0" ? "—" : threshold.toFixed(3)}</span>
        <RiskPill flag={flag} />
      </div>

      {sensSpec ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <p className="font-mono text-lg font-semibold text-[#102f38]">
              {percent(sensSpec.sensitivity)}
            </p>
            <p className="text-[11px] text-slate-500">sensitivity</p>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <p className="font-mono text-lg font-semibold text-[#102f38]">
              {percent(sensSpec.specificity)}
            </p>
            <p className="text-[11px] text-slate-500">specificity</p>
          </div>
        </div>
      ) : null}

      {model !== "M0" ? (
        <input
          type="range"
          min={0.05}
          max={0.8}
          step={0.005}
          value={threshold}
          onChange={(event) => onThreshold(Number(event.target.value))}
          className="mt-4 w-full accent-teal-700"
          aria-label="Decision threshold"
        />
      ) : null}

      {row.historyLimited ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Prior-day history is missing. The history block uses a fixed training-set reference, so
          this prediction is approximate.
        </p>
      ) : null}

      {row.outOfRange.length ? (
        <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
          Outside the training range: {row.outOfRange.slice(0, 4).map(featureLabel).join(", ")}
          {row.outOfRange.length > 4 ? ` +${row.outOfRange.length - 4} more` : ""}.
        </p>
      ) : null}

      {model === "M0" ? (
        <div className="mt-5 text-sm leading-6 text-slate-600">
          M0 is a transparent clinical baseline: it flags a record when the previous night had at
          least 15 minutes below 3.9 mmol/L. It does not use today&apos;s CGM features.
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-sm font-semibold text-[#102f38]">Why this model weighs it</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Global importance, not a record-specific explanation.
          </p>
          <ul className="mt-3 space-y-2">
            {top.map((item) => (
              <li key={item.feature} className="flex items-start justify-between gap-3 text-xs">
                <span className="leading-5 text-slate-600">{featureLabel(item.feature)}</span>
                <span className="whitespace-nowrap font-mono text-slate-700">
                  {formatFeatureValue(item.feature, row.values[item.feature] ?? 0)}
                  {featureUnit(item.feature) ? ` ${featureUnit(item.feature)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-5 border-t border-slate-200 pt-3 text-[11px] leading-5 text-slate-500">
        Research output only. Probabilities are not individually calibrated and must not guide
        clinical care.
      </p>
    </aside>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-medium text-[#102f38]">Load a file to see predictions</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
        The synthetic sample contains 40 distribution-matched patient-days and is the quickest way
        to explore the interface.
      </p>
    </section>
  );
}
