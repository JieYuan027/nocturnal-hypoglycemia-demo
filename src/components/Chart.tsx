interface Point {
  x: number;
  y: number;
}

interface Series {
  name: string;
  color: string;
  points: Point[];
  dashed?: boolean;
  dots?: boolean;
}

interface ChartProps {
  series: Series[];
  xLabel: string;
  yLabel: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xTicks?: number[];
  yTicks?: number[];
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  marker?: { x: number; label: string };
}

const WIDTH = 640;
const HEIGHT = 340;
const MARGIN = { top: 18, right: 18, bottom: 48, left: 58 };

export function Chart({
  series,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  formatX = (value) => value.toFixed(2),
  formatY = (value) => value.toFixed(1),
  marker,
}: ChartProps) {
  const allPoints = series.flatMap((item) => item.points);
  const [x0, x1] = xDomain ?? [
    Math.min(...allPoints.map((point) => point.x)),
    Math.max(...allPoints.map((point) => point.x)),
  ];
  const [y0, y1] = yDomain ?? [
    Math.min(...allPoints.map((point) => point.y)),
    Math.max(...allPoints.map((point) => point.y)),
  ];

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const sx = (value: number) => MARGIN.left + ((value - x0) / (x1 - x0)) * plotWidth;
  const sy = (value: number) => MARGIN.top + (1 - (value - y0) / (y1 - y0)) * plotHeight;

  const xValues = xTicks ?? Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  const yValues = yTicks ?? Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${yLabel} versus ${xLabel}`}
      >
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          fill="#fbfcfa"
          rx="6"
        />
        {yValues.map((value) => (
          <g key={`y-${value}`}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={sy(value)}
              y2={sy(value)}
              stroke="#dbe3df"
              strokeWidth="1"
            />
            <text
              x={MARGIN.left - 9}
              y={sy(value) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#57706a"
            >
              {formatY(value)}
            </text>
          </g>
        ))}
        {xValues.map((value) => (
          <g key={`x-${value}`}>
            <line
              x1={sx(value)}
              x2={sx(value)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="#edf1ee"
              strokeWidth="1"
            />
            <text
              x={sx(value)}
              y={HEIGHT - MARGIN.bottom + 18}
              textAnchor="middle"
              fontSize="11"
              fill="#57706a"
            >
              {formatX(value)}
            </text>
          </g>
        ))}
        {marker ? (
          <g>
            <line
              x1={sx(marker.x)}
              x2={sx(marker.x)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="#b54708"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <text x={sx(marker.x) + 6} y={MARGIN.top + 14} fontSize="11" fill="#b54708">
              {marker.label}
            </text>
          </g>
        ) : null}
        {series.map((item) => {
          const path = item.points
            .map((point, index) => `${index === 0 ? "M" : "L"}${sx(point.x)},${sy(point.y)}`)
            .join(" ");
          return (
            <g key={item.name}>
              <path
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth="2.5"
                strokeDasharray={item.dashed ? "6 5" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {item.dots
                ? item.points.map((point) => (
                    <circle
                      key={`${item.name}-${point.x}`}
                      cx={sx(point.x)}
                      cy={sy(point.y)}
                      r="3.4"
                      fill="#fbfcfa"
                      stroke={item.color}
                      strokeWidth="2"
                    />
                  ))
                : null}
            </g>
          );
        })}
        <text
          x={MARGIN.left + plotWidth / 2}
          y={HEIGHT - 10}
          textAnchor="middle"
          fontSize="12"
          fill="#24433c"
        >
          {xLabel}
        </text>
        <text
          transform={`translate(14 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="#24433c"
        >
          {yLabel}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5 rounded-full"
              style={{
                background: item.dashed
                  ? `repeating-linear-gradient(90deg, ${item.color} 0 5px, transparent 5px 9px)`
                  : item.color,
              }}
            />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
