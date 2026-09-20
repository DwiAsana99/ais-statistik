import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Paper, Typography, Box } from "@mui/material";
import { THEME_COLORS } from "../../utils/constants";
import type { ChartDataPoint } from "../../types";

const DEFAULT_COLORS = [
  "#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2",
  "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#edc948",
];

interface DonutChartProps {
  title: string;
  data: ChartDataPoint[];
  height?: number;
}

export default function DonutChart({ title, data, height = 300 }: DonutChartProps) {
  return (
    <Paper
      sx={{
        p: 2.5,
        backgroundColor: THEME_COLORS.surface,
        border: `1px solid ${THEME_COLORS.border}`,
        borderRadius: 2,
        height: "100%",
      }}
      elevation={0}
    >
      <Typography variant="subtitle2" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 2 }}>
        {title}
      </Typography>
      <Box sx={{ width: "100%", height }}>
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
                <Cell key={entry.label} fill={entry.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: THEME_COLORS.surfaceLight,
                border: `1px solid ${THEME_COLORS.border}`,
                borderRadius: 8,
                color: THEME_COLORS.text,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: THEME_COLORS.textSecondary }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
