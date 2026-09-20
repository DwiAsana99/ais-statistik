import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Paper, Typography, Box } from "@mui/material";
import { THEME_COLORS } from "../../utils/constants";
import type { TimeSeriesPoint } from "../../types";

interface LineChartCardProps {
  title: string;
  data: TimeSeriesPoint[];
  height?: number;
  color?: string;
}

export default function LineChartCard({ title, data, height = 300, color = "#D4930A" }: LineChartCardProps) {
  return (
    <Paper
      sx={{
        p: title ? 2.5 : 0,
        backgroundColor: "transparent",
        height: "100%",
      }}
      elevation={0}
    >
      {title && (
        <Typography variant="subtitle2" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 2 }}>
          {title}
        </Typography>
      )}
      <Box sx={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.border} />
            <XAxis
              dataKey="timestamp"
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
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
