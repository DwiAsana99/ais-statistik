import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, CircularProgress, Alert, Button, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Grid } from "@mui/material";
import { Message, DirectionsBoat, Category, Speed } from "@mui/icons-material";
import KpiCard from "../components/cards/KpiCard";
import DonutChart from "../components/charts/DonutChart";
import BarChartCard from "../components/charts/BarChartCard";
import LineChartCard from "../components/charts/LineChartCard";
import api from "../api/client";
import type { MessageSummary, MessageTypeBreakdown, TrendResponse } from "../types";
import { THEME_COLORS } from "../utils/constants";
import { formatNumber } from "../utils/formatters";

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

export default function MessageStatsPage() {
  const [summary, setSummary] = useState<MessageSummary | null>(null);
  const [byType, setByType] = useState<MessageTypeBreakdown[]>([]);
  const [volumeDaily, setVolumeDaily] = useState<TrendResponse | null>(null);
  const [throughput, setThroughput] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, bt, vd, tp] = await Promise.all([
        api.get("/api/messages/summary"),
        api.get("/api/messages/by-type"),
        api.get("/api/messages/volume-daily"),
        api.get("/api/messages/throughput"),
      ]);
      setSummary(s.data);
      setByType(bt.data);
      setVolumeDaily(vd.data);
      setThroughput(tp.data);
    } catch (err) {
      console.error("Failed to load message stats:", err);
      setError("Gagal memuat statistik pesan. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const donutData = byType.slice(0, 10).map((t) => ({
    label: t.type_name ?? `Tipe ${t.msg_type}`,
    value: t.count,
  }));

  const barData = byType.slice(0, 15).map((t) => ({
    label: t.type_name ?? `Tipe ${t.msg_type}`,
    value: t.count,
  }));

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Statistik Pesan
      </Typography>

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
              title="Total Pesan (24 Jam)"
              value={summary?.total_messages ?? 0}
              icon={<Message />}
              color="#4e79a7"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Rata-rata per Kapal"
              value={summary?.avg_per_vessel ?? 0}
              valueText={summary ? `${summary.avg_per_vessel.toFixed(1)} msg` : "-"}
              icon={<DirectionsBoat />}
              color="#D4930A"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Tipe Pesan Unik"
              value={summary?.unique_msg_types ?? 0}
              icon={<Category />}
              color="#59a14f"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Throughput msg/jam"
              value={summary?.throughput_per_hour ?? 0}
              valueText={summary ? `${formatNumber(Math.round(summary.throughput_per_hour))}/jam` : "-"}
              icon={<Speed />}
              color="#76b7b2"
            />
          </Grid>

          {/* Class A vs B summary */}
          {summary && (
            <Grid size={{ xs: 12 }}>
              <Paper
                sx={{
                  px: 2.5,
                  py: 1.5,
                  backgroundColor: THEME_COLORS.surface,
                  border: `1px solid ${THEME_COLORS.border}`,
                  borderRadius: 2,
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
                elevation={0}
              >
                <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>
                  Komposisi:
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#4e79a7" }} />
                  <Typography sx={{ fontSize: 13, color: THEME_COLORS.text }}>
                    Class A — {summary.class_a_pct}%
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#f28e2b" }} />
                  <Typography sx={{ fontSize: 13, color: THEME_COLORS.text }}>
                    Class B — {summary.class_b_pct}%
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#bab0ac" }} />
                  <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>
                    Lainnya — {(100 - summary.class_a_pct - summary.class_b_pct).toFixed(1)}%
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Volume daily line chart */}
          <Grid size={{ xs: 12, lg: 8 }}>
            {volumeDaily && <LineChartCard title={volumeDaily.title} data={volumeDaily.data} height={280} />}
          </Grid>

          {/* Donut — type composition */}
          <Grid size={{ xs: 12, lg: 4 }}>
            {donutData.length > 0 && (
              <DonutChart title="Komposisi Tipe Pesan" data={donutData} height={240} />
            )}
          </Grid>

          {/* Throughput per hour line chart */}
          <Grid size={{ xs: 12 }}>
            {throughput && <LineChartCard title={throughput.title} data={throughput.data} height={220} />}
          </Grid>

          {/* Bar chart by type */}
          <Grid size={{ xs: 12 }}>
            {barData.length > 0 && (
              <BarChartCard title="Volume Pesan per Tipe (30 Hari)" data={barData} color="#4e79a7" height={320} />
            )}
          </Grid>

          {/* Detail table */}
          {byType.length > 0 && (
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
                    Rincian per Tipe Pesan
                  </Typography>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={headCellSx}>Tipe</TableCell>
                      <TableCell sx={headCellSx}>Nama</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Jumlah</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Share</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byType.map((t) => (
                      <TableRow
                        key={t.msg_type}
                        hover
                        sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}
                      >
                        <TableCell sx={{ ...cellSx, fontFamily: "monospace", width: 60 }}>
                          {t.msg_type}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, fontWeight: 500 }}>
                          {t.type_name ?? "—"}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNumber(t.count)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", color: THEME_COLORS.secondary, fontWeight: 600 }}>
                          {t.pct.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
