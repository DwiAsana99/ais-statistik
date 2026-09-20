import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, CircularProgress, Alert, Button, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, IconButton, Chip, Divider,
} from "@mui/material";
import { Grid } from "@mui/material";
import {
  CalendarMonth, TrendingUp, TrendingDown, Remove, Close,
  DirectionsBoat, Message, CheckCircle, ErrorOutline,
} from "@mui/icons-material";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import KpiCard from "../components/cards/KpiCard";
import api from "../api/client";
import type { MonthlyReport, MonthlyReportDetail } from "../types";
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

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <Typography sx={{ ...cellSx, color: THEME_COLORS.textSecondary }}>—</Typography>;
  const color = pct > 0 ? "#59a14f" : pct < 0 ? "#e15759" : THEME_COLORS.textSecondary;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Remove;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Icon sx={{ fontSize: 14, color }} />
      <Typography sx={{ fontSize: 12, color, fontWeight: 600 }}>
        {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
      </Typography>
    </Box>
  );
}

function DetailDialog({
  open,
  onClose,
  detail,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  detail: MonthlyReportDetail | null;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          backgroundColor: THEME_COLORS.surface,
          color: THEME_COLORS.text,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          py: 1.5,
          borderBottom: `1px solid ${THEME_COLORS.border}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CalendarMonth sx={{ color: THEME_COLORS.secondary }} />
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
            {detail?.month_label ?? "—"}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: THEME_COLORS.textSecondary }}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ backgroundColor: THEME_COLORS.background, p: 0 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: THEME_COLORS.secondary }} />
          </Box>
        ) : detail ? (
          <>
            {/* Summary KPIs */}
            <Box sx={{ p: 2.5 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Total Pesan
                    </Typography>
                    <Typography sx={{ fontSize: 20, fontWeight: 700, color: THEME_COLORS.text, fontFamily: "monospace" }}>
                      {formatNumber(detail.total_messages)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Total Kapal
                    </Typography>
                    <Typography sx={{ fontSize: 20, fontWeight: 700, color: THEME_COLORS.text, fontFamily: "monospace" }}>
                      {formatNumber(detail.total_vessels)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Hari Aktif
                    </Typography>
                    <Typography sx={{ fontSize: 20, fontWeight: 700, color: THEME_COLORS.text }}>
                      {detail.active_days}
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Error Rate
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 20, fontWeight: 700,
                        color: detail.avg_error_rate > 5 ? "#e15759" : detail.avg_error_rate > 3 ? "#D4930A" : "#59a14f",
                      }}
                    >
                      {detail.avg_error_rate.toFixed(2)}%
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ borderColor: THEME_COLORS.border }} />

            {/* Weekly breakdown */}
            <Box sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: THEME_COLORS.text, mb: 1.5 }}>
                Breakdown per Minggu
              </Typography>
              {detail.weekly_breakdown.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>Tidak ada data mingguan.</Typography>
              ) : (
                <Paper
                  sx={{
                    backgroundColor: THEME_COLORS.surface,
                    border: `1px solid ${THEME_COLORS.border}`,
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
                  elevation={0}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={headCellSx}>Minggu ke</TableCell>
                        <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Pesan</TableCell>
                        <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Kapal</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.weekly_breakdown.map((w, i) => (
                        <TableRow key={w.week_num} sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }} hover>
                          <TableCell sx={cellSx}>{i + 1}</TableCell>
                          <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                            {formatNumber(w.messages)}
                          </TableCell>
                          <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                            {formatNumber(w.vessels)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              )}
            </Box>

            <Divider sx={{ borderColor: THEME_COLORS.border }} />

            <Grid container>
              {/* Top ship types */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: THEME_COLORS.text, mb: 1.5 }}>
                    Top Tipe Kapal
                  </Typography>
                  {detail.top_ship_types.length === 0 ? (
                    <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>Tidak ada data.</Typography>
                  ) : (
                    detail.top_ship_types.map((t, i) => (
                      <Box
                        key={t.label}
                        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}
                      >
                        <Typography sx={{ fontSize: 13, color: THEME_COLORS.text }}>
                          <Typography component="span" sx={{ color: THEME_COLORS.textSecondary, fontSize: 11, mr: 1 }}>
                            {i + 1}.
                          </Typography>
                          {t.label}
                        </Typography>
                        <Typography sx={{ fontSize: 13, fontFamily: "monospace", color: THEME_COLORS.secondary, fontWeight: 600 }}>
                          {formatNumber(t.value)}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              </Grid>

              {/* Top stations */}
              <Grid size={{ xs: 12, sm: 6 }} sx={{ borderLeft: { sm: `1px solid ${THEME_COLORS.border}` } }}>
                <Box sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: THEME_COLORS.text, mb: 1.5 }}>
                    Top Stasiun
                  </Typography>
                  {detail.top_stations.length === 0 ? (
                    <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>Data stasiun tidak tersedia.</Typography>
                  ) : (
                    detail.top_stations.map((s, i) => (
                      <Box
                        key={s.label}
                        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}
                      >
                        <Typography sx={{ fontSize: 13, color: THEME_COLORS.text }}>
                          <Typography component="span" sx={{ color: THEME_COLORS.textSecondary, fontSize: 11, mr: 1 }}>
                            {i + 1}.
                          </Typography>
                          {s.label}
                        </Typography>
                        <Typography sx={{ fontSize: 13, fontFamily: "monospace", color: "#4e79a7", fontWeight: 600 }}>
                          {formatNumber(s.value)}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              </Grid>
            </Grid>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function MonthlyReportPage() {
  const [data, setData] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<MonthlyReport | null>(null);
  const [detail, setDetail] = useState<MonthlyReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/reports/monthly");
      setData(res.data);
    } catch (err) {
      console.error("Failed to load monthly reports:", err);
      setError("Gagal memuat laporan bulanan. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (m: MonthlyReport) => {
    setSelectedMonth(m);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/reports/monthly/${m.year}/${m.month}`);
      setDetail(res.data);
    } catch (err) {
      console.error("Failed to load monthly detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedMonth(null);
    setDetail(null);
  }, []);

  const current = data[0] ?? null;
  const previous = data[1] ?? null;

  // Chart: chronological order (oldest → newest), last 12 months
  const chartData = [...data].reverse().slice(-12).map((m) => ({
    label: m.month_label,
    pesan: m.total_messages,
    kapal: m.total_vessels,
  }));

  const errorStatus = current
    ? current.avg_error_rate > 5 ? "critical" : current.avg_error_rate > 3 ? "warning" : "healthy"
    : null;
  const errorColor = errorStatus === "critical" ? "#e15759" : errorStatus === "warning" ? "#D4930A" : "#59a14f";

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <CalendarMonth sx={{ color: THEME_COLORS.secondary }} />
        <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
          Laporan Bulanan
        </Typography>
        {current && (
          <Chip
            label={`Terbaru: ${current.month_label}`}
            size="small"
            sx={{
              fontSize: 11,
              height: 22,
              backgroundColor: `${THEME_COLORS.secondary}20`,
              color: THEME_COLORS.secondary,
              border: `1px solid ${THEME_COLORS.secondary}40`,
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
      ) : error ? null : (
        <>
          {/* KPI cards — current month vs previous */}
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                title="Total Pesan (Bln Ini)"
                value={current?.total_messages ?? 0}
                subtitle={
                  previous && current
                    ? `Bln lalu: ${formatNumber(previous.total_messages)}`
                    : undefined
                }
                icon={<Message />}
                color="#4e79a7"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                title="Total Kapal (Bln Ini)"
                value={current?.total_vessels ?? 0}
                subtitle={
                  previous && current
                    ? `Bln lalu: ${formatNumber(previous.total_vessels)}`
                    : undefined
                }
                icon={<DirectionsBoat />}
                color={THEME_COLORS.secondary}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                title="Hari Aktif"
                value={current?.active_days ?? 0}
                subtitle={
                  previous ? `Bln lalu: ${previous.active_days} hari` : undefined
                }
                icon={<CalendarMonth />}
                color="#59a14f"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                title="Error Rate (Bln Ini)"
                value={current?.avg_error_rate ?? 0}
                valueText={current ? `${current.avg_error_rate.toFixed(2)}%` : "—"}
                subtitle={
                  previous ? `Bln lalu: ${previous.avg_error_rate.toFixed(2)}%` : undefined
                }
                icon={errorStatus === "healthy" ? <CheckCircle /> : <ErrorOutline />}
                color={errorColor}
              />
            </Grid>
          </Grid>

          {/* BarChart — message trend */}
          {chartData.length > 0 && (
            <Paper
              sx={{
                backgroundColor: THEME_COLORS.surface,
                border: `1px solid ${THEME_COLORS.border}`,
                borderRadius: 2,
                p: 2.5,
                mb: 3,
              }}
              elevation={0}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text, mb: 2 }}>
                Tren Pesan Bulanan
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.border} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: THEME_COLORS.textSecondary, fontSize: 11 }}
                    axisLine={{ stroke: THEME_COLORS.border }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: THEME_COLORS.textSecondary, fontSize: 11 }}
                    axisLine={{ stroke: THEME_COLORS.border }}
                    tickLine={false}
                    tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                    width={48}
                  />
                  <ReTooltip
                    contentStyle={{
                      backgroundColor: THEME_COLORS.surface,
                      border: `1px solid ${THEME_COLORS.border}`,
                      borderRadius: 8,
                      color: THEME_COLORS.text,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [formatNumber(value), "Pesan"]}
                  />
                  <Bar dataKey="pesan" fill="#4e79a7" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          )}

          {/* Summary table */}
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
                Ringkasan per Bulan
              </Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Bulan</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Total Pesan</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Total Kapal</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Hari Aktif</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Error Rate</TableCell>
                  <TableCell sx={headCellSx}>vs Bln Lalu</TableCell>
                  <TableCell sx={{ ...headCellSx, width: 80 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                      <Typography sx={{ color: THEME_COLORS.textSecondary }}>Tidak ada data</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((m) => {
                    const errColor =
                      m.avg_error_rate > 5 ? "#e15759"
                      : m.avg_error_rate > 3 ? "#D4930A"
                      : "#59a14f";
                    return (
                      <TableRow
                        key={`${m.year}-${m.month}`}
                        hover
                        sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}
                      >
                        <TableCell sx={{ ...cellSx, fontWeight: 500 }}>{m.month_label}</TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNumber(m.total_messages)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNumber(m.total_vessels)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right" }}>
                          {m.active_days}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "right", color: errColor, fontWeight: 600 }}>
                          {m.avg_error_rate.toFixed(2)}%
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <ChangeBadge pct={m.msg_change_pct} />
                        </TableCell>
                        <TableCell sx={{ ...cellSx, p: 0.5 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openDetail(m)}
                            sx={{
                              fontSize: 11,
                              py: 0.25,
                              px: 1,
                              minWidth: 0,
                              borderColor: THEME_COLORS.border,
                              color: THEME_COLORS.textSecondary,
                              "&:hover": { borderColor: THEME_COLORS.secondary, color: THEME_COLORS.secondary },
                            }}
                          >
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <DetailDialog
        open={selectedMonth !== null}
        onClose={closeDetail}
        detail={detail}
        loading={detailLoading}
      />
    </Box>
  );
}
