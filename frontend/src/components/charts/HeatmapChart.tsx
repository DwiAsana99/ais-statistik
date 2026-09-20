import { useThemeStore } from "../../stores/themeStore";
import { HEATMAP_RAMP } from "../../utils/chartColors";

export interface HeatmapPoint {
  day: number;  // 0=Sun, 6=Sat
  hour: number; // 0-23
  value: number;
}

interface HeatmapChartProps {
  title: string;
  data: HeatmapPoint[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Multi-stop sequential ramp (light->dark hue per dataviz skill's sequential spec).
function interpolateRamp(ramp: readonly string[], t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const segments = ramp.length - 1;
  const pos = clamped * segments;
  const i = Math.min(Math.floor(pos), segments - 1);
  const localT = pos - i;
  const [r1, g1, b1] = hexToRgb(ramp[i]);
  const [r2, g2, b2] = hexToRgb(ramp[i + 1]);
  const r = Math.round(r1 + (r2 - r1) * localT);
  const g = Math.round(g1 + (g2 - g1) * localT);
  const b = Math.round(b1 + (b2 - b1) * localT);
  return `rgb(${r},${g},${b})`;
}

export default function HeatmapChart({ title, data }: HeatmapChartProps) {
  const mode = useThemeStore((s) => s.mode);
  const ramp = mode === "dark" ? HEATMAP_RAMP.dark : HEATMAP_RAMP.light;

  const grid: Record<string, number> = {};
  let maxVal = 0;
  for (const p of data) {
    const key = `${p.day}-${p.hour}`;
    grid[key] = p.value;
    if (p.value > maxVal) maxVal = p.value;
  }

  return (
    <div className="card border border-base-300 bg-base-100 p-5">
      <p className="mb-4 text-sm font-semibold text-base-content">{title}</p>

      <div className="overflow-x-auto">
        {/* Hour labels */}
        <div className="mb-1 ml-9 flex">
          {HOURS.map((h) => (
            <div key={h} className="w-[calc((100%-36px)/24)] min-w-5 shrink-0 text-center text-[10px] text-base-content/60">
              {h % 6 === 0 ? `${h}h` : ""}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {DAY_LABELS.map((day, dayIdx) => (
          <div key={dayIdx} className="mb-[3px] flex items-center">
            <div className="w-9 shrink-0 text-[11px] text-base-content/60">{day}</div>
            {HOURS.map((hour) => {
              const val = grid[`${dayIdx}-${hour}`] ?? 0;
              const bg = maxVal === 0 ? ramp[0] : interpolateRamp(ramp, val / maxVal);
              return (
                <div
                  key={hour}
                  className="tooltip w-[calc((100%-36px)/24)] min-w-5 shrink-0"
                  data-tip={`${day} ${hour.toString().padStart(2, "0")}:00 — ${val.toLocaleString()} kapal`}
                >
                  <div
                    className="h-[22px] cursor-default rounded-[3px] border border-transparent transition-colors hover:border-secondary"
                    style={{ backgroundColor: bg }}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="mt-4 ml-9 flex items-center gap-1">
          <span className="text-[10px] text-base-content/60">Rendah</span>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <div key={t} className="h-3.5 w-5 rounded-sm" style={{ backgroundColor: interpolateRamp(ramp, t) }} />
          ))}
          <span className="text-[10px] text-base-content/60">Tinggi</span>
        </div>
      </div>
    </div>
  );
}
