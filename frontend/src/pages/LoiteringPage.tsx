import { useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import {
  Box, Typography, Paper, TextField, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Dialog, DialogTitle, DialogContent, Chip, Grid,
} from "@mui/material";
import { Psychology, Close } from "@mui/icons-material";
import api from "../api/client";
import { THEME_COLORS } from "../utils/constants";
import { formatDecimal } from "../utils/formatters";
import type { LoiteringEvent, LoiteringDetail } from "../types";

const cellSx = {
  color: THEME_COLORS.text,
  borderBottom: `1px solid ${THEME_COLORS.border}`,
  fontSize: 13,
};
const headCellSx = {
  ...cellSx,
  fontWeight: 600,
  color: THEME_COLORS.textSecondary,
  fontSize: 12,
  textTransform: "uppercase" as const,
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LoiteringPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [dateFrom, setDateFrom] = useState(toLocalInput(sevenDaysAgo));
  const [dateTo, setDateTo] = useState(toLocalInput(now));
  const [avgSogLt, setAvgSogLt] = useState(2.0);
  const [durationHGt, setDurationHGt] = useState(2.0);
  const [distPortKmGt, setDistPortKmGt] = useState(37.04);

  const [items, setItems] = useState<LoiteringEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [detail, setDetail] = useState<LoiteringDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get("/api/behavior/loitering", {
        params: {
          date_from: new Date(dateFrom).toISOString(),
          date_to: new Date(dateTo).toISOString(),
          avg_sog_kn_lt: avgSogLt,
          duration_h_gt: durationHGt,
          avg_dist_port_km_gt: distPortKmGt,
        },
      });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load loitering events:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, avgSogLt, durationHGt, distPortKmGt]);

  const openDetail = async (event: LoiteringEvent) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get(`/api/behavior/loitering/${encodeURIComponent(event.id)}`);
      setDetail(res.data);
    } catch (err) {
      console.error("Failed to load loitering detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const mapCenter: [number, number] | null =
    detail && detail.track.length > 0
      ? [detail.centroid_lat, detail.centroid_lon]
      : null;

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Deteksi Loitering
      </Typography>

      <Paper
        sx={{
          p: 2.5,
          mb: 2.5,
          backgroundColor: THEME_COLORS.surface,
          border: `1px solid ${THEME_COLORS.border}`,
          borderRadius: 2,
        }}
        elevation={0}
      >
        <Grid container spacing={2} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth size="small" type="datetime-local" label="Dari"
              value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth size="small" type="datetime-local" label="Sampai"
              value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 1.5 }}>
            <TextField
              fullWidth size="small" type="number" label="Avg SOG Maks (knot)"
              value={avgSogLt} onChange={(e) => setAvgSogLt(Number(e.target.value))}
              slotProps={{ input: { inputProps: { step: 0.1, min: 0.1, max: 10 } } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 1.5 }}>
            <TextField
              fullWidth size="small" type="number" label="Durasi Min (jam)"
              value={durationHGt} onChange={(e) => setDurationHGt(Number(e.target.value))}
              slotProps={{ input: { inputProps: { min: 0.1, step: 0.5 } } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 1.5 }}>
            <TextField
              fullWidth size="small" type="number" label="Jarak Pelabuhan Min (km)"
              value={distPortKmGt} onChange={(e) => setDistPortKmGt(Number(e.target.value))}
              slotProps={{ input: { inputProps: { min: 0, max: 500, step: 1 } } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 1.5 }}>
            <Button
              fullWidth variant="contained" startIcon={<Psychology />}
              onClick={runSearch} disabled={loading}
              sx={{ backgroundColor: THEME_COLORS.secondary, "&:hover": { backgroundColor: "#b87d08" } }}
            >
              Deteksi
            </Button>
          </Grid>
        </Grid>
        <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, mt: 1.5 }}>
          Rentang waktu maks 30 hari. Algoritma: ekstraksi trajektori per kapal (jeda &gt; 4 jam = trajektori baru),
          dilabeli loitering bila rata-rata SOG &amp; durasi &amp; jarak ke pelabuhan terdekat melewati ambang di atas.
        </Typography>
      </Paper>

      <Paper
        sx={{
          backgroundColor: THEME_COLORS.surface,
          border: `1px solid ${THEME_COLORS.border}`,
          borderRadius: 2,
          overflow: "hidden",
        }}
        elevation={0}
      >
        <TableContainer sx={{ maxHeight: "calc(100vh - 440px)" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Kapal</TableCell>
                <TableCell sx={headCellSx}>Tipe</TableCell>
                <TableCell sx={headCellSx}>Mulai</TableCell>
                <TableCell sx={headCellSx}>Durasi</TableCell>
                <TableCell sx={headCellSx}>Avg SOG</TableCell>
                <TableCell sx={headCellSx}>Titik</TableCell>
                <TableCell sx={headCellSx}>Jarak Pelabuhan</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ ...cellSx, textAlign: "center", py: 6 }}>
                    <CircularProgress size={28} sx={{ color: THEME_COLORS.secondary }} />
                  </TableCell>
                </TableRow>
              ) : !searched ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                    <Typography sx={{ color: THEME_COLORS.textSecondary }}>
                      Atur filter lalu klik "Deteksi" untuk mencari loitering
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                    <Typography sx={{ color: THEME_COLORS.textSecondary }}>
                      Tidak ada loitering ditemukan pada rentang ini
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow
                    key={it.id}
                    hover
                    onClick={() => openDetail(it)}
                    sx={{ cursor: "pointer", "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}
                  >
                    <TableCell sx={cellSx}>
                      {it.vessel_name || `MMSI ${it.mmsi}`}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {it.ship_type
                        ? <Chip label={it.ship_type} size="small" sx={{ height: 18, fontSize: 10 }} />
                        : <Typography sx={{ color: THEME_COLORS.textSecondary, fontSize: 12 }}>—</Typography>}
                    </TableCell>
                    <TableCell sx={cellSx}>{new Date(it.start_time).toLocaleString("id-ID")}</TableCell>
                    <TableCell sx={{ ...cellSx, color: THEME_COLORS.secondary, fontWeight: 600 }}>
                      {formatDecimal(it.duration_minutes, 1)} mnt
                    </TableCell>
                    <TableCell sx={cellSx}>{it.avg_sog.toFixed(3)} kn</TableCell>
                    <TableCell sx={cellSx}>{it.point_count}</TableCell>
                    <TableCell sx={{ ...cellSx, color: THEME_COLORS.textSecondary }}>
                      {it.avg_dist_port_km.toFixed(1)} km
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog
        open={!!detail || detailLoading}
        onClose={() => { setDetail(null); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle
          sx={{
            backgroundColor: THEME_COLORS.surface,
            color: THEME_COLORS.text,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Detail Loitering
          <Button onClick={() => setDetail(null)} size="small" sx={{ minWidth: 0, color: THEME_COLORS.textSecondary }}>
            <Close fontSize="small" />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: THEME_COLORS.surface, p: 0 }}>
          {detailLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress sx={{ color: THEME_COLORS.secondary }} />
            </Box>
          ) : detail ? (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>KAPAL</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
                    {detail.vessel_name || `MMSI ${detail.mmsi}`}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary }}>
                    MMSI {detail.mmsi}{detail.ship_type ? ` · ${detail.ship_type}` : ""}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>DURASI</Typography>
                  <Typography sx={{ color: THEME_COLORS.secondary, fontWeight: 600 }}>
                    {formatDecimal(detail.duration_minutes, 1)} menit
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>AVG SOG</Typography>
                  <Typography sx={{ color: THEME_COLORS.secondary, fontWeight: 600 }}>
                    {detail.avg_sog.toFixed(3)} kn
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>MULAI</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontSize: 13 }}>
                    {new Date(detail.start_time).toLocaleString("id-ID")}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>SELESAI</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontSize: 13 }}>
                    {new Date(detail.end_time).toLocaleString("id-ID")}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>TITIK DATA</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
                    {detail.point_count}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>JARAK PELABUHAN</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
                    {detail.avg_dist_port_km.toFixed(1)} km
                  </Typography>
                </Grid>
              </Grid>

              {mapCenter && (
                <Box
                  sx={{
                    height: 320,
                    borderRadius: 1.5,
                    overflow: "hidden",
                    border: `1px solid ${THEME_COLORS.border}`,
                  }}
                >
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    style={{ width: "100%", height: "100%" }}
                  >
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      attribution="&copy; OSM &copy; CARTO"
                    />
                    {detail.track.map((pt, i) => (
                      <CircleMarker
                        key={i}
                        center={[pt.lat, pt.lon]}
                        radius={4}
                        pathOptions={{
                          color: "#D4930A",
                          fillColor: "#D4930A",
                          fillOpacity: 0.6 + (i / detail.track.length) * 0.4,
                          weight: 1,
                        }}
                      >
                        <Popup>
                          {new Date(pt.time).toLocaleTimeString("id-ID")} · {pt.sog.toFixed(3)} kn
                        </Popup>
                      </CircleMarker>
                    ))}
                    <CircleMarker
                      center={mapCenter}
                      radius={8}
                      pathOptions={{ color: "#e15759", fillColor: "#e15759", fillOpacity: 1, weight: 2 }}
                    >
                      <Popup>Centroid loitering</Popup>
                    </CircleMarker>
                  </MapContainer>
                </Box>
              )}
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
