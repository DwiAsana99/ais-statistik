import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, CircularProgress, Alert, Button, Paper, Chip,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Grid } from "@mui/material";
import { Router, SignalCellularAlt, DirectionsBoat, Speed } from "@mui/icons-material";
import KpiCard from "../components/cards/KpiCard";
import BarChartCard from "../components/charts/BarChartCard";
import api from "../api/client";
import type { StationPerformance, StationKpis } from "../types";
import { THEME_COLORS } from "../utils/constants";
import { formatNumber } from "../utils/formatters";

const STATUS_COLOR: Record<string, string> = {
  online:   "#59a14f",
  degraded: "#D4930A",
  offline:  "#e15759",
  unknown:  "#8899AA",
};

const STATUS_LABEL: Record<string, string> = {
  online:   "Online",
  degraded: "Degraded",
  offline:  "Offline",
  unknown:  "Tidak Diketahui",
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

function StatusChip({ status }: { status: string }) {
  return (
    <Chip
      label={STATUS_LABEL[status] ?? status}
      size="small"
      sx={{
        backgroundColor: `${STATUS_COLOR[status] ?? "#8899AA"}22`,
        color: STATUS_COLOR[status] ?? THEME_COLORS.textSecondary,
        border: `1px solid ${STATUS_COLOR[status] ?? "#8899AA"}55`,
        fontWeight: 600,
        fontSize: 11,
        height: 22,
      }}
    />
  );
}

export default function StationPerformancePage() {
  const [stations, setStations] = useState<StationPerformance[]>([]);
  const [kpis, setKpis] = useState<StationKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perf, kpiRes] = await Promise.all([
        api.get("/api/stations/performance"),
        api.get("/api/stations/summary-kpis"),
      ]);
      setStations(perf.data);
      setKpis(kpiRes.data);
    } catch (err) {
      console.error("Failed to load station performance:", err);
      setError("Gagal memuat data performa stasiun. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const barData = stations
    .filter((s) => s.vessel_count > 0)
    .slice(0, 20)
    .map((s) => ({
      label: s.station_name ?? s.station_id,
      value: s.vessel_count,
    }));

  const throughputBarData = stations
    .filter((s) => s.msg_per_hour > 0)
    .slice(0, 20)
    .map((s) => ({
      label: s.station_name ?? s.station_id,
      value: s.msg_per_hour,
    }));

  const onlineCount = kpis?.online_count ?? 0;
  const totalCount = kpis?.total_stations ?? 0;

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Performa Stasiun
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
              title="Stasiun Online / Total"
              value={onlineCount}
              valueText={`${onlineCount} / ${totalCount}`}
              icon={<Router />}
              color="#59a14f"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Cakupan Kapal"
              value={kpis?.total_vessel_coverage ?? 0}
              icon={<DirectionsBoat />}
              color="#4e79a7"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Throughput Total (msg/jam)"
              value={kpis?.total_throughput_per_hour ?? 0}
              valueText={
                kpis?.total_throughput_per_hour
                  ? `${formatNumber(Math.round(kpis.total_throughput_per_hour))}/jam`
                  : "—"
              }
              icon={<Speed />}
              color="#D4930A"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard
              title="Stasiun Degraded / Offline"
              value={(kpis?.degraded_count ?? 0) + (kpis?.offline_count ?? 0)}
              valueText={`${kpis?.degraded_count ?? 0} degraded · ${kpis?.offline_count ?? 0} offline`}
              icon={<SignalCellularAlt />}
              color="#e15759"
            />
          </Grid>

          {/* Status badge grid */}
          {stations.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Paper
                sx={{
                  p: 2.5,
                  backgroundColor: THEME_COLORS.surface,
                  border: `1px solid ${THEME_COLORS.border}`,
                  borderRadius: 2,
                }}
                elevation={0}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text, mb: 2 }}>
                  Status Stasiun
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {stations.map((s) => (
                    <Box
                      key={s.station_id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 1,
                        backgroundColor: THEME_COLORS.surfaceLight,
                        border: `1px solid ${STATUS_COLOR[s.status] ?? THEME_COLORS.border}44`,
                        minWidth: 160,
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: STATUS_COLOR[s.status] ?? THEME_COLORS.border,
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: THEME_COLORS.text, lineHeight: 1.2 }}>
                          {s.station_name ?? s.station_id}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: THEME_COLORS.textSecondary }}>
                          {s.vessel_count} kapal
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Bar charts */}
          {barData.length > 0 && (
            <Grid size={{ xs: 12, lg: throughputBarData.length > 0 ? 6 : 12 }}>
              <BarChartCard
                title="Cakupan Kapal per Stasiun"
                data={barData}
                color="#4e79a7"
                height={320}
              />
            </Grid>
          )}
          {throughputBarData.length > 0 && (
            <Grid size={{ xs: 12, lg: barData.length > 0 ? 6 : 12 }}>
              <BarChartCard
                title="Throughput per Stasiun (msg/jam, 7 hari)"
                data={throughputBarData}
                color="#D4930A"
                height={320}
              />
            </Grid>
          )}

          {/* Detail table */}
          {stations.length > 0 && (
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
                    Detail Stasiun
                  </Typography>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={headCellSx}>ID Stasiun</TableCell>
                      <TableCell sx={headCellSx}>MMSI</TableCell>
                      <TableCell sx={headCellSx}>Status</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Kapal</TableCell>
                      <TableCell sx={{ ...headCellSx, textAlign: "right" }}>msg/jam</TableCell>
                      <TableCell sx={headCellSx}>Terakhir Lapor</TableCell>
                      <TableCell sx={headCellSx}>Koordinat</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stations.map((s) => (
                      <TableRow
                        key={s.station_id}
                        hover
                        sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}
                      >
                        <TableCell sx={{ ...cellSx, fontFamily: "monospace", fontWeight: 500 }}>
                          {s.station_name ?? s.station_id}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, fontFamily: "monospace", color: THEME_COLORS.textSecondary }}>
                          {s.mmsi ?? "—"}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <StatusChip status={s.status} />
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNumber(s.vessel_count)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {s.msg_per_hour > 0 ? formatNumber(Math.round(s.msg_per_hour)) : "—"}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, color: THEME_COLORS.textSecondary, fontSize: 12 }}>
                          {s.last_seen
                            ? new Date(s.last_seen).toLocaleString("id-ID", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, color: THEME_COLORS.textSecondary, fontSize: 11, fontFamily: "monospace" }}>
                          {s.lat != null && s.lon != null
                            ? `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}`
                            : "—"}
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
