import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CHART_DEFAULT_ACCENT } from "../../utils/chartColors";
import type { TimeSeriesPoint } from "../../types";

interface LineChartCardProps {
  title: string;
  data: TimeSeriesPoint[];
  height?: number;
  color?: string;
}

export default function LineChartCard({ title, data, height = 300, color = CHART_DEFAULT_ACCENT }: LineChartCardProps) {
  return (
    <div className={title ? "p-5" : ""}>
      {title && <p className="mb-4 text-sm font-semibold text-base-content">{title}</p>}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-300)" />
            <XAxis
              dataKey="timestamp"
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--color-base-300)" }}
            />
            <YAxis
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--color-base-300)" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-base-200)",
                border: "1px solid var(--color-base-300)",
                borderRadius: 8,
                color: "var(--color-base-content)",
              }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
