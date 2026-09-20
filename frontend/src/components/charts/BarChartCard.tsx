import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CHART_DEFAULT_ACCENT } from "../../utils/chartColors";
import type { ChartDataPoint } from "../../types";

interface BarChartCardProps {
  title: string;
  data: ChartDataPoint[];
  height?: number;
  color?: string;
}

export default function BarChartCard({ title, data, height = 300, color = CHART_DEFAULT_ACCENT }: BarChartCardProps) {
  return (
    <div className="card h-full border border-base-300 bg-base-100 p-5">
      <p className="mb-4 text-sm font-semibold text-base-content">{title}</p>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-300)" />
            <XAxis
              dataKey="label"
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
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
