import { Paper, Typography, Box, Chip } from "@mui/material";
import { THEME_COLORS } from "../../utils/constants";
import { formatNumber } from "../../utils/formatters";

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
  valueText?: string;
  statusLabel?: string;
  statusColor?: string;
}

export default function KpiCard({
  title,
  value,
  icon,
  color = THEME_COLORS.secondary,
  subtitle,
  valueText,
  statusLabel,
  statusColor,
}: KpiCardProps) {
  return (
    <Paper
      sx={{
        p: 2.5,
        backgroundColor: THEME_COLORS.surface,
        border: `1px solid ${THEME_COLORS.border}`,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
      elevation={0}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          backgroundColor: `${color}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: color,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: THEME_COLORS.textSecondary, fontSize: 12 }}>
          {title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: THEME_COLORS.text, lineHeight: 1.2 }}>
            {valueText !== undefined ? valueText : formatNumber(value)}
          </Typography>
          {statusLabel && (
            <Chip
              label={statusLabel}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: `${statusColor || color}20`,
                color: statusColor || color,
                border: `1px solid ${statusColor || color}40`,
              }}
            />
          )}
        </Box>
        {subtitle && (
          <Typography variant="caption" sx={{ color: THEME_COLORS.textSecondary, fontSize: 11 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
