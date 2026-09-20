import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, Paper, Chip, Tabs, Tab, Alert, Grid, Button, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Rule, FactCheck, Bolt, Block, HelpOutlined, ContentCopy, WifiOff } from "@mui/icons-material";
import KpiCard from "../components/cards/KpiCard";
import BarChartCard from "../components/charts/BarChartCard";
import api from "../api/client";
import { THEME_COLORS } from "../utils/constants";
import { formatNumber } from "../utils/formatters";
import type { ChartDataPoint, AnomalyA0Summary, AnomalyEvent, AnomalySummary } from "../types";

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

const STATUS_COLOR: Record<string, string> = {
  good: "#59a14f",
  warn: "#D4930A",
  crit: "#e15759",
};
const STATUS_LABEL: Record<string, string> = {
  good: "Layak",
  warn: "Perlu Perhatian",
  crit: "Terhambat Data",
};

function StatusChip({ status }: { status: "good" | "warn" | "crit" }) {
  return (
    <Chip
      label={STATUS_LABEL[status]}
      size="small"
      sx={{
        backgroundColor: `${STATUS_COLOR[status]}22`,
        color: STATUS_COLOR[status],
        border: `1px solid ${STATUS_COLOR[status]}55`,
        fontWeight: 600,
        fontSize: 11,
        height: 22,
      }}
    />
  );
}

interface ModuleRow {
  id: string;
  desc: string;
  status: "good" | "warn" | "crit";
}

const LAYER_A: ModuleRow[] = [
  { id: "A0", desc: "Kualitas & identitas — MMSI tak sah, sentinel SOG/COG. Semua kolom dasar tersedia penuh.", status: "good" },
  { id: "A1", desc: "Lompatan posisi & SOG mismatch. Live — hasil nyata di tab sebelah, tersimpan di tabel anomaly_events. Klasifikasi 3-jenis jump belum dikerjakan.", status: "warn" },
  { id: "A2", desc: "Duplikasi identitas (1 MMSI, ≥2 trek fisik tak mungkin). Live — hasil di tab sebelah, tersimpan di anomaly_events.", status: "good" },
  { id: "A3", desc: "AIS gap (\"dark activity\"). Live dengan adaptasi — kriteria jarak-ke-receiver DIHILANGKAN (2 stasiun kita tak punya koordinat), diganti proxy data-driven: kapal lain yang tetap terlihat di sel yang sama.", status: "warn" },
  { id: "A4", desc: "Anomali kinematik (SCA/TA). heading_deg ada (≈63% terisi, sisanya sentinel 511°), rot_deg_per_min ada (sentinel −128 perlu dikecualikan).", status: "good" },
  { id: "A5", desc: "Loitering. Sudah live di produksi (Fase 12) — algoritma trajektori 4 jam + rule P1, tervalidasi 40 event/7 hari.", status: "good" },
  { id: "A6", desc: "Encounter/rendezvous. Sudah ada sejak Fase 6, tapi pakai ambang sendiri (500 m / 30 mnt) — belum persis definisi GFW (500 m / 2 jam / median SOG<2kn / ≥10 km dari pelabuhan).", status: "warn" },
  { id: "A7", desc: "Konsistensi status/tipe vs perilaku. nav_status_code & ship_type_code tersedia penuh.", status: "good" },
  { id: "A8", desc: "Korroborasi lompatan lintas-kapal (indikasi GNSS interference). Butuh klasifikasi 3-jenis A1 selesai dulu.", status: "warn" },
];

const LAYER_B: ModuleRow[] = [
  { id: "B1", desc: "Isolation Forest per konteks (tipe kapal × wilayah). Perlu tambah scikit-learn ke requirements.txt.", status: "good" },
  { id: "B2", desc: "Normalitas per-sel + a contrario (GeoTrackNet-lite). Perlu tambah scipy.", status: "good" },
  { id: "B3", desc: "Deep learning (GeoTrackNet / autoencoder). Ditunda — dokumen sumber menyebut \"hanya bila diminta\".", status: "warn" },
];

function ModuleTable({ title, rows }: { title: string; rows: ModuleRow[] }) {
  return (
    <Paper
      sx={{ backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2, overflow: "hidden" }}
      elevation={0}
    >
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>{title}</Typography>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headCellSx, width: 56 }}>Modul</TableCell>
            <TableCell sx={headCellSx}>Deskripsi</TableCell>
            <TableCell sx={{ ...headCellSx, width: 150 }}>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} hover sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}>
              <TableCell sx={{ ...cellSx, fontFamily: "monospace", fontWeight: 700 }}>{r.id}</TableCell>
              <TableCell sx={{ ...cellSx, color: THEME_COLORS.textSecondary, lineHeight: 1.5, whiteSpace: "normal" }}>{r.desc}</TableCell>
              <TableCell sx={cellSx}><StatusChip status={r.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function FeasibilityTab() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary, maxWidth: 760 }}>
        Status dinilai dari kolom &amp; file yang benar-benar tersedia di database (bukan asumsi dokumen), setelah audit skema{" "}
        <code>ais_position</code>, <code>ais_vessel_static</code>, dan pengecekan <code>data/ports.csv</code> / <code>data/receivers.csv</code>.
        Peta ini adalah penilaian arsitektur — tidak berubah tiap request, beda dengan tab A0/A1 yang membaca data live.
      </Typography>
      <ModuleTable title="Lapisan A — aturan (interpretable)" rows={LAYER_A} />
      <ModuleTable title="Lapisan B — statistik / unsupervised" rows={LAYER_B} />
    </Box>
  );
}

function A0Tab() {
  const [data, setData] = useState<AnomalyA0Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/a0-summary", { params: { lookback_days: 7 } });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load A0 summary:", err);
      setError("Gagal memuat ringkasan kualitas data. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress sx={{ color: THEME_COLORS.secondary }} /></Box>;
  }
  if (error || !data) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>
        {error ?? "Data tidak tersedia."}
      </Alert>
    );
  }

  const sogPct = data.n_points_total ? (data.n_sog_na / data.n_points_total * 100) : 0;
  const cogPct = data.n_points_total ? (data.n_cog_na / data.n_points_total * 100) : 0;
  const latlonPct = data.n_points_total ? (data.n_latlon_bad / data.n_points_total * 100) : 0;
  const activePct = data.total_mmsi_registered ? (data.n_vessels_active / data.total_mmsi_registered * 100) : 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Alert severity="info" sx={{ backgroundColor: THEME_COLORS.surfaceLight, color: THEME_COLORS.text }}>
        Dari <strong>{formatNumber(data.total_mmsi_registered)}</strong> MMSI terdaftar, hanya{" "}
        <strong>{formatNumber(data.n_vessels_active)} ({activePct.toFixed(1)}%)</strong> yang mengirim posisi dalam{" "}
        {data.lookback_days} hari terakhir — sisanya kapal tidak aktif/registrasi lama, di luar cakupan audit ini.
      </Alert>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard title="MMSI Bukan 9-digit" value={data.mmsi_invalid_count} icon={<Block />} color="#e15759" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard title="MMSI Placeholder" value={data.mmsi_placeholder_count} icon={<Block />} color="#f28e2b" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard title="Kapal Aktif" value={data.n_vessels_active} valueText={`${formatNumber(data.n_vessels_active)} / ${formatNumber(data.total_mmsi_registered)}`} icon={<FactCheck />} color="#59a14f" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard title="Titik SOG Sentinel (≥102,3kn)" value={sogPct} valueText={`${sogPct.toFixed(2)}%`} icon={<HelpOutlined />} color="#76b7b2" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard title="Titik COG Sentinel (=360°)" value={cogPct} valueText={`${cogPct.toFixed(2)}%`} icon={<HelpOutlined />} color="#b07aa1" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard title="Titik lat/lon Tidak Valid" value={latlonPct} valueText={`${latlonPct.toFixed(2)}%`} icon={<HelpOutlined />} color="#e15759" />
        </Grid>
      </Grid>
      <Typography sx={{ fontSize: 11.5, color: THEME_COLORS.textSecondary }}>
        Live · {data.lookback_days} hari terakhir · {formatNumber(data.n_points_total)} titik posisi dari kapal aktif
      </Typography>
    </Box>
  );
}

function bucketize(values: number[], edges: number[]): ChartDataPoint[] {
  const labels = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    const fmt = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : `${n}`);
    labels.push(`${fmt(a)}–${fmt(b)}`);
  }
  const counts = new Array(edges.length - 1).fill(0);
  values.forEach((v) => {
    for (let i = 0; i < edges.length - 1; i++) {
      if (v >= edges[i] && (v < edges[i + 1] || i === edges.length - 2)) {
        counts[i]++;
        break;
      }
    }
  });
  return labels.map((label, i) => ({ label, value: counts[i] }));
}

function A1Tab() {
  const [jumps, setJumps] = useState<AnomalyEvent[]>([]);
  const [mismatches, setMismatches] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, m] = await Promise.all([
        api.get("/api/anomaly/events", { params: { type: "JUMP", limit: 1000 } }),
        api.get("/api/anomaly/events", { params: { type: "SOG_MISMATCH", limit: 1000 } }),
      ]);
      setJumps(j.data.items);
      setMismatches(m.data.items);
    } catch (err) {
      console.error("Failed to load A1 events:", err);
      setError("Gagal memuat kejadian anomali. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress sx={{ color: THEME_COLORS.secondary }} /></Box>;
  }
  if (error) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>{error}</Alert>;
  }
  if (jumps.length === 0 && mismatches.length === 0) {
    return (
      <Alert severity="info" sx={{ backgroundColor: THEME_COLORS.surfaceLight, color: THEME_COLORS.text }}>
        Belum ada kejadian tersimpan di <code>anomaly_events</code>. Worker precompute berjalan tiap ~24 menit — cek lagi
        sebentar, atau pastikan worker backend sudah aktif.
      </Alert>
    );
  }

  const edges = [60, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000, 4000000];
  const jumpBuckets = bucketize(jumps.map((e) => Number(e.evidence.v_imp_kn ?? e.score ?? 0)), edges);
  const mismatchEdges = [10, 15, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000, 4000000];
  const mismatchBuckets = bucketize(mismatches.map((e) => Number(e.evidence.diff_kn ?? e.score ?? 0)), mismatchEdges);

  const jumpTop10 = [...jumps].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
  const mismatchTop10 = [...mismatches].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Alert severity="warning" sx={{ backgroundColor: THEME_COLORS.surfaceLight, color: THEME_COLORS.text }}>
        Distribusi bimodal khas: klaster kecil (puluhan–ribuan knot, kemungkinan lompatan/error wajar) terpisah dari klaster
        ekstrem (&gt;300 ribu knot — kemungkinan satu titik koordinat korup, kandidat <code>isolated_outlier</code>). Klasifikasi
        3-jenis (<code>isolated_outlier</code> / <code>single_axis</code> / <code>persistent_shift</code>) belum dikerjakan.
      </Alert>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <BarChartCard title={`Lompatan Posisi — v_imp_kn (log, n=${jumps.length})`} data={jumpBuckets} color="#4e79a7" height={280} />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <BarChartCard title={`SOG Mismatch — selisih kn (log, n=${mismatches.length})`} data={mismatchBuckets} color="#f28e2b" height={280} />
        </Grid>
      </Grid>

      <Paper sx={{ backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2, overflow: "hidden" }} elevation={0}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>Top 10 Lompatan Posisi</Typography>
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>MMSI</TableCell>
                <TableCell sx={headCellSx}>Kapal</TableCell>
                <TableCell sx={headCellSx}>Waktu</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: "right" }}>v_imp (kn)</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Jarak (km)</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Δt (s)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jumpTop10.map((r) => (
                <TableRow key={r.id} hover sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}>
                  <TableCell sx={{ ...cellSx, fontFamily: "monospace", color: THEME_COLORS.textSecondary }}>{r.mmsi}</TableCell>
                  <TableCell sx={cellSx}>{r.vessel_name || "—"}</TableCell>
                  <TableCell sx={cellSx}>{new Date(r.t_start).toLocaleString("id-ID")}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace", color: "#e15759", fontWeight: 600 }}>
                    {formatNumber(Number(r.evidence.v_imp_kn ?? 0))}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>{formatNumber(Number(r.evidence.dist_km ?? 0))}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>{r.evidence.dt_s}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Paper sx={{ backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2, overflow: "hidden" }} elevation={0}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>Top 10 SOG Mismatch</Typography>
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>MMSI</TableCell>
                <TableCell sx={headCellSx}>Kapal</TableCell>
                <TableCell sx={headCellSx}>Waktu</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: "right" }}>SOG Lapor (kn)</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: "right" }}>v_imp (kn)</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Selisih (kn)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mismatchTop10.map((r) => (
                <TableRow key={r.id} hover sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}>
                  <TableCell sx={{ ...cellSx, fontFamily: "monospace", color: THEME_COLORS.textSecondary }}>{r.mmsi}</TableCell>
                  <TableCell sx={cellSx}>{r.vessel_name || "—"}</TableCell>
                  <TableCell sx={cellSx}>{new Date(r.t_start).toLocaleString("id-ID")}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>{r.evidence.sog_kn}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>{formatNumber(Number(r.evidence.v_imp_kn ?? 0))}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace", color: "#f28e2b", fontWeight: 600 }}>
                    {formatNumber(Number(r.evidence.diff_kn ?? 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Box>
  );
}

function A2Tab() {
  const [items, setItems] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/events", { params: { type: "MMSI_DUPLICATE", limit: 200 } });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load A2 events:", err);
      setError("Gagal memuat kejadian duplikasi MMSI.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress sx={{ color: THEME_COLORS.secondary }} /></Box>;
  }
  if (error) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>{error}</Alert>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Alert severity="info" sx={{ backgroundColor: THEME_COLORS.surfaceLight, color: THEME_COLORS.text }}>
        Metode Global Fishing Watch: pesan satu MMSI dikelompokkan jadi &ge;1 "trek" berdasar kecepatan tersirat yang wajar
        (&le;60 kn) antar pesan berurutan. MMSI ditandai duplikat bila &ge;2 trek besar (&ge;5 pesan) tumpang-tindih waktu
        &ge;0,5 jam — artinya satu MMSI dipakai &ge;2 entitas fisik sekaligus. <strong>Keterbatasan</strong>: tidak bisa
        memisahkan kapal ber-MMSI sama yang posisinya berdekatan.
      </Alert>
      <Paper sx={{ backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2, overflow: "hidden" }} elevation={0}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>
            Kandidat Duplikasi MMSI {items.length > 0 && `(${items.length})`}
          </Typography>
        </Box>
        {items.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>
              Tidak ada kandidat duplikasi MMSI ditemukan pada window terakhir.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>MMSI</TableCell>
                  <TableCell sx={headCellSx}>Kapal</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Jumlah Trek</TableCell>
                  <TableCell sx={headCellSx}>Ukuran Trek</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Overlap (jam)</TableCell>
                  <TableCell sx={headCellSx}>Rentang Waktu</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} hover sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}>
                    <TableCell sx={{ ...cellSx, fontFamily: "monospace", color: THEME_COLORS.textSecondary }}>{r.mmsi}</TableCell>
                    <TableCell sx={cellSx}>{r.vessel_name || "—"}</TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: "right", fontWeight: 600, color: "#e15759" }}>{r.evidence.n_tracks}</TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>{JSON.stringify(r.evidence.track_sizes)}</TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>{r.evidence.max_overlap_h}</TableCell>
                    <TableCell sx={cellSx}>
                      {new Date(r.t_start).toLocaleString("id-ID")} &ndash; {r.t_end ? new Date(r.t_end).toLocaleString("id-ID") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

function A3Tab() {
  const [items, setItems] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/events", { params: { type: "AIS_GAP", limit: 500 } });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load A3 events:", err);
      setError("Gagal memuat kejadian AIS gap.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress sx={{ color: THEME_COLORS.secondary }} /></Box>;
  }
  if (error) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>{error}</Alert>;
  }

  const intentional = items.filter((r) => r.evidence.likely_intentional);
  const sorted = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Alert severity="warning" sx={{ backgroundColor: THEME_COLORS.surfaceLight, color: THEME_COLORS.text }}>
        <strong>Adaptasi dari dokumen sumber</strong>: kriteria asli "jarak ke receiver terdekat" dihilangkan (2 stasiun kita
        tidak punya koordinat). Sebagai gantinya, "Kandidat Sengaja" = kapal lain tetap terlihat di sel 0,1° yang sama
        sebelum &amp; selama gap (area tetap tercakup, bukan receiver padam) — proxy data-driven, belum tervalidasi
        seakurat kriteria asli.
      </Alert>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <KpiCard title="Total Gap Terdeteksi" value={items.length} icon={<Bolt />} color="#76b7b2" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <KpiCard title="Kandidat Sengaja" value={intentional.length} valueText={`${intentional.length} / ${items.length}`} icon={<Block />} color="#e15759" />
        </Grid>
      </Grid>
      <Paper sx={{ backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2, overflow: "hidden" }} elevation={0}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${THEME_COLORS.border}` }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: THEME_COLORS.text }}>Gap Terpanjang (top 30)</Typography>
        </Box>
        {sorted.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography sx={{ fontSize: 13, color: THEME_COLORS.textSecondary }}>Tidak ada gap ditemukan pada window terakhir.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>MMSI</TableCell>
                  <TableCell sx={headCellSx}>Kapal</TableCell>
                  <TableCell sx={headCellSx}>Mulai Gap</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Durasi (jam)</TableCell>
                  <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Perpindahan (km)</TableCell>
                  <TableCell sx={headCellSx}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.id} hover sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}>
                    <TableCell sx={{ ...cellSx, fontFamily: "monospace", color: THEME_COLORS.textSecondary }}>{r.mmsi}</TableCell>
                    <TableCell sx={cellSx}>{r.vessel_name || "—"}</TableCell>
                    <TableCell sx={cellSx}>{new Date(r.t_start).toLocaleString("id-ID")}</TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{r.evidence.gap_h}</TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>{r.evidence.disp_km}</TableCell>
                    <TableCell sx={cellSx}>
                      <Chip
                        label={r.evidence.likely_intentional ? "Kandidat Sengaja" : "Kemungkinan Wajar"}
                        size="small"
                        sx={{
                          backgroundColor: r.evidence.likely_intentional ? "#e1575922" : "#59a14f22",
                          color: r.evidence.likely_intentional ? "#e15759" : "#59a14f",
                          border: `1px solid ${r.evidence.likely_intentional ? "#e15759" : "#59a14f"}55`,
                          fontWeight: 600, fontSize: 11, height: 22,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default function AnomalyPage() {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);

  useEffect(() => {
    api.get("/api/anomaly/summary").then((res) => setSummary(res.data)).catch(() => {});
  }, []);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
            Deteksi Anomali
          </Typography>
          {summary && (
            <Chip
              label={`${formatNumber(summary.total_events)} kejadian tersimpan`}
              size="small"
              sx={{ backgroundColor: `${THEME_COLORS.secondary}22`, color: THEME_COLORS.secondary, fontWeight: 600, fontSize: 11 }}
            />
          )}
        </Box>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36, fontSize: 13, color: THEME_COLORS.textSecondary, textTransform: "none",
              "&.Mui-selected": { color: THEME_COLORS.secondary },
            },
            "& .MuiTabs-indicator": { backgroundColor: THEME_COLORS.secondary },
          }}
        >
          <Tab icon={<Rule sx={{ fontSize: 18 }} />} iconPosition="start" label="Kelayakan Modul" />
          <Tab icon={<FactCheck sx={{ fontSize: 18 }} />} iconPosition="start" label="A0 · Kualitas Data" />
          <Tab icon={<Bolt sx={{ fontSize: 18 }} />} iconPosition="start" label="A1 · Lompatan Posisi" />
          <Tab icon={<ContentCopy sx={{ fontSize: 18 }} />} iconPosition="start" label="A2 · Duplikasi MMSI" />
          <Tab icon={<WifiOff sx={{ fontSize: 18 }} />} iconPosition="start" label="A3 · AIS Gap" />
        </Tabs>
      </Box>

      {tab === 0 && <FeasibilityTab />}
      {tab === 1 && <A0Tab />}
      {tab === 2 && <A1Tab />}
      {tab === 3 && <A2Tab />}
      {tab === 4 && <A3Tab />}
    </Box>
  );
}
