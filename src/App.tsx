import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { PredictPanel } from "./components/PredictPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import modelMetaJson from "./generated/model-meta.json";
import type { ModelMeta, XgbBoosterJson } from "./types";

const meta = modelMetaJson as unknown as ModelMeta;

export default function App() {
  const [tab, setTab] = useState<"predict" | "validation">("predict");
  const [booster, setBooster] = useState<XgbBoosterJson | null>(null);
  const [boosterStatus, setBoosterStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}models/m2.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<XgbBoosterJson>;
      })
      .then((json) => {
        if (cancelled) return;
        setBooster(json);
        setBoosterStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setBoosterStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  return (
    <div className="min-h-screen">
      <Header tab={tab} onTab={setTab} />
      <main>
        <div className={tab === "predict" ? "" : "hidden"}>
          <PredictPanel meta={meta} booster={booster} boosterStatus={boosterStatus} />
        </div>
        <div className={tab === "validation" ? "" : "hidden"}>
          <ValidationPanel meta={meta} />
        </div>
      </main>
      <footer className="mt-10 border-t border-slate-200 bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Research prototype · not a medical device · {meta.cohort.patients} patients /{" "}
            {meta.cohort.patientDays.toLocaleString()} patient-days · model {meta.version}
          </p>
          <div className="flex gap-4">
            <a
              className="font-medium text-teal-700 hover:underline"
              href="https://github.com/JieYuan027/nocturnal-hypoglycemia-demo"
              target="_blank"
              rel="noreferrer"
            >
              Source code
            </a>
            <a className="font-medium text-teal-700 hover:underline" href="#top">
              Back to top
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
