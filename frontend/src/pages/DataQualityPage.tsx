import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, CircularProgress, Alert, Button, Paper, Chip,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Grid } from "@mui/material";
import { VerifiedUser, BugReport, ContentCopy, Block } from "@mui/icons-material";
import KpiCard from "../components/cards/KpiCard";
import DonutChart from "../components/charts/DonutChart";
import LineChartCard from "../components/charts/LineChartCard";
import api from "../api/client";
import type { QualitySummary, QualityByStation, DistributionResponse, TrendResponse } from "../types";
import { THEME_COLORS } from "../utils/constants";
import { formatNumber } from "../utils/formatters";

const SEVERITY_COLOR: Record<string, string> = {
  ok:       "#59a14f",
  warning:  "#D4930A",
  critical: "#e15759",
};

const STATUS_COLOR: Record<string, string> = {
  healthy:  "#59a14f",
  warning:  "#D4930A",
  critical: "#e15759",
};

const STATUS_LABEL: Record<string, string> = {
  healthy:  "Sehat",
  warning:  "Perlu Perhatian",
  critical: "Kritis",
};

const cellSx = {
  color: THEME_COLORS.text,
  borderBottom: `1px solid ${THEME_COLORS.border}`,
  fontSize: 13,
  py: 1,
};
const headCellSx = {
  ...cellSx,
  fontWeight: 600,
  color: THEME_COLORS.textSecondary,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  backgroundColor: THEME_COLORS.surface,
};

function SeverityChip({ severity }: { severity: string }) {
  const label = severity === "ok" ? "OK" : severity === "warning" ? "Warning" : "Kritis";
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        backgroundColor: `${SEVERITY_COLOR[severity] ?? "#8899AA"}22`,
        color: SEVERITY_COLOR[severity] ?? THEME_COLORS.textSecondary,
        border: `1px solid ${SEVERITY_COLOR[severity] ?? "#8899AA"}55`,
        fontWeight: 600,
        fontSize: 11,
        height: 22,
      }}
    />
  );
}

export default function DataQualityPage() {
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [byStation, setByStation] = useState<QualityByStation[]>([]);
  const [byType, setByType] = useState<DistributionResponse | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, bs, bt, tr] = await Promise.allSettled([
        api.get("/api/quality/summary"),
        api.get("/api/quality/by-station"),
        api.get("/api/quality/by-type"),
        api.get("/api/quality/trend"),
      ]);
      if (s.status === "fulfilled") setSummary(s.value.data);
      else console.error("quality/summary failed:", s.reason);
      if (bs.status === "fulfilled") setByStation(bs.value.data);
      else console.error("quality/by-station failed:", bs.reason);
      if (bt.status === "fulfilled") setByType(bt.value.data);
      else console.error("quality/by-type failed:", bt.reason);
      if (tr.status === "fulfilled") setTrend(tr.value.data);
      else console.error("quality/trend failed:", tr.reason);

      // Show error only if ALL failed
      if ([s, bs, bt, tr].every((r) => r.status === "rejected")) {
        setError("Gagal memuat data kualitas. Periksa koneksi ke server.");
      }
    } catch (err) {
      console.error("Failed to load data quality:", err);
      setError("Gagal memuat data kualitas. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusColor = summary ? STATUS_COLOR[summary.status] : THEME_COLORS.textSecondary;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
          Kualitas Data
        </Typography>
        {summary && (
          <Chip
            label={STATUS_LABEL[summary.status]}
            size="small"
            sx={{
              backgroundColor: `${statusColor}22`,
              color: statusColor,
              border: `1px solid ${statusColor}55`,
              fontWeight: 700,
              fontSize: 12,
            }}
          />
        )}
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2.5 }}
          action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
          <CircularProgress sx={{ color: THEME_COLORS.secondary }} />
        </Box>
      ) : !error && (
        <Grid container spacing={2.5}>
          {/* KPI cards */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Error Rate Global"
              value={summary?.error_rate_pct ?? 0}
              valueText={summary ? `${summary.error_rate_pct.toFixed(3)}%` : "—"}
              icon={<VerifiedUser />}
              color={statusColor}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Parse Gagal"
              value={summary?.parse_error_count ?? 0}
              icon={<BugReport />}
              color="#e15759"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Duplikat"
              value={summary?.duplicate_count ?? 0}
              icon={<ContentCopy />}
              color="#f28e2b"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="MMSI Invalid"
              value={summary?.invalid_mmsi_count ?? 0}
              icon={<Block />}
              color="#b07aa1"
            />
          </Grid>

          {/* Context line */}
          {summary && (
            <Grid size={{ xs: 12 }}>
              <Paper
                sx={{
                  px: 2.5,
                  py: 1.25,
                  backgroundColor: THEME_COLORS.surface,
                  border: `1px solid ${THEME_COLORS.border}`,
                  borderRadius: 2,
                  display: "flex",
                  gap: 3,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
                elevation={0}
              >
                <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>Hari ini:</Typography>
                <Typography sx={{ fontSize: 13, color: THEME_COLORS.text }}>
                  <strong>{formatNumber(summary.total_errors)}</strong> error dari{" "}
                  <strong>{formatNumber(summary.total_messages)}</strong> pesan
                </Typography>
              </Paper>
            </Grid>
          )}

          {/* Trend line + Donut */}
          <Grid size={{ xs: 12, lg: 8 }}>
            {trend && <LineChartCard title={trend.title} data={trend.data} height={280} />}
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            {byType && byType.data.length > 0 && (
              <DonutChart title={byType.title} data={byType.data} height={240} />
            )}
          </Grid>

          {/* By-station table */}
          {byStation.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Paper
                sx={{
                  backgroundColor: THEME_COLORS.surface,
                  border: `1px solid ${THEME_COLORS.border}`,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
                elevation={0}
              >
                <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>
                    Error Rate per Stasiun (7 Hari)
                  </Typography>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={headCellSx}>#</TableCell>
                      <TableCell sx={headCellSx}>Stasiun</TableCell>
                      <TableCell sx={headCellSx}>Severity</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Error</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Total Pesan</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Error Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byStation.map((s, i) => (
                      <TableRow
                        key={s.station_id}
                        hover
                        sx={{
                          "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` },
                          backgroundColor:
                            s.severity === "critical"
                              ? `${SEVERITY_COLOR.critical}0A`
                              : s.severity === "warning"
                              ? `${SEVERITY_COLOR.warning}0A`
                              : "transparent",
                        }}
                      >
                        <TableCell sx={{ ...cellSx, color: THEME_COLORS.textSecondary, width: 40 }}>
                          {i + 1}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, fontFamily: "monospace", fontWeight: 500 }}>
                          {s.station_id}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <SeverityChip severity={s.severity} />
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNumber(s.error_count)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNumber(s.total_count)}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...cellSx,
                            textAlign: "right",
                            fontWeight: 700,
                            color: SEVERITY_COLOR[s.severity] ?? THEME_COLORS.text,
                            fontFamily: "monospace",
                          }}
                        >
                          {s.error_rate_pct.toFixed(3)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          )}

          {byStation.length === 0 && !loading && (
            <Grid size={{ xs: 12 }}>
              <Paper
                sx={{
                  p: 3,
                  backgroundColor: THEME_COLORS.surface,
                  border: `1px solid ${THEME_COLORS.border}`,
                  borderRadius: 2,
                  textAlign: "center",
                }}
                elevation={0}
              >
                <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>
                  Data per-stasiun tidak tersedia — kolom station_id mungkin tidak ada di tabel ais_errors.
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
