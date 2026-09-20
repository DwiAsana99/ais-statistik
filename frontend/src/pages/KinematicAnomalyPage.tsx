import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, Paper, Chip, Alert, Grid, Button, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Speed, Explore, CompareArrows } from "@mui/icons-material";
import KpiCard from "../components/cards/KpiCard";
import BarChartCard from "../components/charts/BarChartCard";
import api from "../api/client";
import { THEME_COLORS } from "../utils/constants";
import { formatNumber } from "../utils/formatters";
import type { AnomalyEvent } from "../types";

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

const SUBTYPE_LABEL: Record<string, string> = {
  speed_change: "Perubahan Kecepatan",
  course_change: "Perubahan Arah",
  heading_cog_mismatch: "Heading vs COG",
};
const SUBTYPE_COLOR: Record<string, string> = {
  speed_change: "#e15759",
  course_change: "#f28e2b",
  heading_cog_mismatch: "#76b7b2",
};

function SubtypeChip({ subtype }: { subtype: string }) {
  const color = SUBTYPE_COLOR[subtype] ?? THEME_COLORS.textSecondary;
  return (
    <Chip
      label={SUBTYPE_LABEL[subtype] ?? subtype}
      size="small"
      sx={{
        backgroundColor: `${color}22`, color, border: `1px solid ${color}55`,
        fontWeight: 600, fontSize: 11, height: 22,
      }}
    />
  );
}

function evidenceDetail(e: AnomalyEvent): string {
  const ev = e.evidence;
  switch (ev.subtype) {
    case "speed_change":
      return `${ev.prev_sog_kn} → ${ev.sog_kn} kn (${ev.accel_kn_per_min} kn/mnt, Δt ${ev.dt_s}s)`;
    case "course_change":
      return `${ev.prev_cog_deg}° → ${ev.cog_deg}° (Δ${ev.dcog_deg}°, SOG ${ev.sog_kn}kn, Δt ${ev.dt_s}s)`;
    case "heading_cog_mismatch":
      return `heading ${ev.heading_deg}° vs COG ${ev.cog_deg}° (selisih ${ev.diff_deg}°, SOG ${ev.sog_kn}kn)`;
    default:
      return "—";
  }
}

export default function KinematicAnomalyPage() {
  const [items, setItems] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/events", { params: { type: "KINEMATIC_SCA", limit: 1000 } });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load A4 events:", err);
      setError("Gagal memuat kejadian anomali kinematik. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bySubtype = {
    speed_change: items.filter((e) => e.evidence.subtype === "speed_change"),
    course_change: items.filter((e) => e.evidence.subtype === "course_change"),
    heading_cog_mismatch: items.filter((e) => e.evidence.subtype === "heading_cog_mismatch"),
  };
  const chartData = [
    { label: "Perubahan Kecepatan", value: bySubtype.speed_change.length },
    { label: "Perubahan Arah", value: bySubtype.course_change.length },
    { label: "Heading vs COG", value: bySubtype.heading_cog_mismatch.length },
  ];
  const top30 = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30);

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Anomali Kinematik
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
          <CircularProgress sx={{ color: THEME_COLORS.secondary }} />
        </Box>
      ) : error ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>
          {error}
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <Alert severity="info" sx={{ backgroundColor: THEME_COLORS.surfaceLight, color: THEME_COLORS.text }}>
            Deteksi A4 (SCA — Speed &amp; Course Anomaly, ANOMALY_ALGORITHM.md Bagian 5). Ambang tetap <code>[ADAPT]</code>,
            belum dikalibrasi per konteks (tipe kapal × wilayah). 3 sub-jenis: <strong>perubahan kecepatan</strong> tiba-tiba
            (&gt;5 kn/menit), <strong>perubahan arah</strong> tiba-tiba (&gt;90° dalam ≤5 menit saat SOG&gt;3kn), dan
            <strong> heading vs COG</strong> menyimpang jauh (&gt;45° saat SOG&gt;3kn). TA (putaran/U-turn) belum
            diimplementasi.
          </Alert>

          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <KpiCard title="Perubahan Kecepatan" value={bySubtype.speed_change.length} icon={<Speed />} color={SUBTYPE_COLOR.speed_change} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <KpiCard title="Perubahan Arah" value={bySubtype.course_change.length} icon={<Explore />} color={SUBTYPE_COLOR.course_change} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <KpiCard title="Heading vs COG" value={bySubtype.heading_cog_mismatch.length} icon={<CompareArrows />} color={SUBTYPE_COLOR.heading_cog_mismatch} />
            </Grid>
          </Grid>

          <BarChartCard title={`Distribusi Sub-jenis (n=${items.length})`} data={chartData} color="#4e79a7" height={240} />

          <Paper sx={{ backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2, overflow: "hidden" }} elevation={0}>
            <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>Top 30 Skor Tertinggi</Typography>
            </Box>
            {top30.length === 0 ? (
              <Box sx={{ p: 3, textAlign: "center" }}>
                <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>
                  Tidak ada kejadian anomali kinematik pada window terakhir.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={headCellSx}>Sub-jenis</TableCell>
                      <TableCell sx={headCellSx}>MMSI</TableCell>
                      <TableCell sx={headCellSx}>Kapal</TableCell>
                      <TableCell sx={headCellSx}>Waktu</TableCell>
                      <TableCell sx={headCellSx}>Detail</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {top30.map((r) => (
                      <TableRow key={r.id} hover sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}>
                        <TableCell sx={cellSx}><SubtypeChip subtype={String(r.evidence.subtype)} /></TableCell>
                        <TableCell sx={{ ...cellSx, fontFamily: "monospace", color: THEME_COLORS.textSecondary }}>{r.mmsi}</TableCell>
                        <TableCell sx={cellSx}>{r.vessel_name || "—"}</TableCell>
                        <TableCell sx={cellSx}>{new Date(r.t_start).toLocaleString("id-ID")}</TableCell>
                        <TableCell sx={{ ...cellSx, fontFamily: "monospace", fontSize: 12 }}>{evidenceDetail(r)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Paper>

          <Typography sx={{ fontSize: 11.5, color: THEME_COLORS.textSecondary }}>
            Live · {formatNumber(items.length)} kejadian tersimpan di <code>anomaly_events</code> (tipe KINEMATIC_SCA)
          </Typography>
        </Box>
      )}
    </Box>
  );
}
