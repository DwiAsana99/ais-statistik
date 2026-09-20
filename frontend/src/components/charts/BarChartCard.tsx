import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Paper, Typography, Box } from "@mui/material";
import { THEME_COLORS } from "../../utils/constants";
import type { ChartDataPoint } from "../../types";

interface BarChartCardProps {
  title: string;
  data: ChartDataPoint[];
  height?: number;
  color?: string;
}

export default function BarChartCard({ title, data, height = 300, color = "#4e79a7" }: BarChartCardProps) {
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
          <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.border} />
            <XAxis
              dataKey="label"
              tick={{ fill: THEME_COLORS.textSecondary, fontSize: 11 }}
              axisLine={{ stroke: THEME_COLORS.border }}
            />
            <YAxis
              tick={{ fill: THEME_COLORS.textSecondary, fontSize: 11 }}
              axisLine={{ stroke: THEME_COLORS.border }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: THEME_COLORS.surfaceLight,
                border: `1px solid ${THEME_COLORS.border}`,
                borderRadius: 8,
                color: THEME_COLORS.text,
              }}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
