import { useState } from "react";
import { Paper, Typography, Box, Tooltip } from "@mui/material";
import { THEME_COLORS } from "../../utils/constants";

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

function interpolateColor(value: number, max: number): string {
  if (max === 0) return "#1a2035";
  const t = Math.min(value / max, 1);
  // dark navy → amber
  const r = Math.round(26 + t * (212 - 26));
  const g = Math.round(32 + t * (147 - 32));
  const b = Math.round(53 + t * (10 - 53));
  return `rgb(${r},${g},${b})`;
}

export default function HeatmapChart({ title, data }: HeatmapChartProps) {
  const [tooltip, setTooltip] = useState<{ day: number; hour: number; value: number } | null>(null);

  const grid: Record<string, number> = {};
  let maxVal = 0;
  for (const p of data) {
    const key = `${p.day}-${p.hour}`;
    grid[key] = p.value;
    if (p.value > maxVal) maxVal = p.value;
  }

  return (
    <Paper
      sx={{
        p: 2.5,
        backgroundColor: THEME_COLORS.surface,
        border: `1px solid ${THEME_COLORS.border}`,
        borderRadius: 2,
      }}
      elevation={0}
    >
      <Typography variant="subtitle2" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 2 }}>
        {title}
      </Typography>

      <Box sx={{ overflowX: "auto" }}>
        {/* Hour labels */}
        <Box sx={{ display: "flex", ml: "36px", mb: "4px" }}>
          {HOURS.map((h) => (
            <Box
              key={h}
              sx={{
                width: "calc((100% - 36px) / 24)",
                minWidth: 20,
                textAlign: "center",
                fontSize: 10,
                color: THEME_COLORS.textSecondary,
                flexShrink: 0,
              }}
            >
              {h % 6 === 0 ? `${h}h` : ""}
            </Box>
          ))}
        </Box>

        {/* Grid rows */}
        {DAY_LABELS.map((day, dayIdx) => (
          <Box key={dayIdx} sx={{ display: "flex", alignItems: "center", mb: "3px" }}>
            <Box
              sx={{
                width: 36,
                fontSize: 11,
                color: THEME_COLORS.textSecondary,
                flexShrink: 0,
              }}
            >
              {day}
            </Box>
            {HOURS.map((hour) => {
              const val = grid[`${dayIdx}-${hour}`] ?? 0;
              const bg = interpolateColor(val, maxVal);
              return (
                <Tooltip
                  key={hour}
                  title={
                    <span>
                      {day} {hour.toString().padStart(2, "0")}:00 — {val.toLocaleString()} kapal
                    </span>
                  }
                  arrow
                  placement="top"
                >
                  <Box
                    onMouseEnter={() => setTooltip({ day: dayIdx, hour, value: val })}
                    onMouseLeave={() => setTooltip(null)}
                    sx={{
                      width: "calc((100% - 36px) / 24)",
                      minWidth: 20,
                      height: 22,
                      backgroundColor: bg,
                      borderRadius: "3px",
                      flexShrink: 0,
                      cursor: "default",
                      border:
                        tooltip?.day === dayIdx && tooltip?.hour === hour
                          ? `1px solid ${THEME_COLORS.secondary}`
                          : "1px solid transparent",
                      transition: "border-color 0.1s",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        ))}

        {/* Legend */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2, ml: "36px" }}>
          <Typography sx={{ fontSize: 10, color: THEME_COLORS.textSecondary }}>Rendah</Typography>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <Box
              key={t}
              sx={{
                width: 20,
                height: 14,
                borderRadius: "2px",
                backgroundColor: interpolateColor(t * maxVal, maxVal),
              }}
            />
          ))}
          <Typography sx={{ fontSize: 10, color: THEME_COLORS.textSecondary }}>Tinggi</Typography>
        </Box>
      </Box>
    </Paper>
  );
}
