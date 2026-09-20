import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { CHART_CATEGORICAL } from "../../utils/chartColors";
import type { ChartDataPoint } from "../../types";

interface DonutChartProps {
  title: string;
  data: ChartDataPoint[];
  height?: number;
}

export default function DonutChart({ title, data, height = 300 }: DonutChartProps) {
  return (
    <div className="card h-full border border-base-300 bg-base-100 p-5">
      <p className="mb-4 text-sm font-semibold text-base-content">{title}</p>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              nameKey="label"
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.label}
                  fill={entry.color || CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]}
                  stroke="var(--color-base-100)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-base-200)",
                border: "1px solid var(--color-base-300)",
                borderRadius: 8,
                color: "var(--color-base-content)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-muted)" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
