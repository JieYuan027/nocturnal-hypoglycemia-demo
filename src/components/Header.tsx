interface HeaderProps {
  tab: "predict" | "validation";
  onTab: (tab: "predict" | "validation") => void;
}

export function Header({ tab, onTab }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f7f8f4]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#102f38] text-[#9ff2e1] shadow-sm">
            <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
              <path
                d="M6 22c4-1 5-9 9-9s4 7 7 7 3-4 4-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="22.5" cy="9.5" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19 12.8c.8.9 1 2.2.6 3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
              Research prototype
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-[#102f38]">
              Nocturnal Hypoglycemia Risk
            </h1>
          </div>
        </div>
        <nav className="flex gap-1 rounded-xl bg-slate-200/60 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => onTab("predict")}
            className={`rounded-lg px-4 py-2 transition ${
              tab === "predict"
                ? "bg-white text-[#102f38] shadow-sm"
                : "text-slate-600 hover:text-[#102f38]"
            }`}
          >
            Predict
          </button>
          <button
            type="button"
            onClick={() => onTab("validation")}
            className={`rounded-lg px-4 py-2 transition ${
              tab === "validation"
                ? "bg-white text-[#102f38] shadow-sm"
                : "text-slate-600 hover:text-[#102f38]"
            }`}
          >
            Model &amp; validation
          </button>
        </nav>
      </div>
    </header>
  );
}
