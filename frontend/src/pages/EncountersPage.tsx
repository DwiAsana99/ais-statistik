import { useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from "react-leaflet";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  Grid,
} from "@mui/material";
import { Sync, Close } from "@mui/icons-material";
import api from "../api/client";
import { THEME_COLORS } from "../utils/constants";
import { formatDecimal } from "../utils/formatters";
import type { EncounterSummary, EncounterDetail } from "../types";

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

export default function EncountersPage() {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600 * 1000);

  const [dateFrom, setDateFrom] = useState(toLocalInput(sixHoursAgo));
  const [dateTo, setDateTo] = useState(toLocalInput(now));
  const [distanceM, setDistanceM] = useState(500);
  const [minDuration, setMinDuration] = useState(0);

  const [items, setItems] = useState<EncounterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get("/api/encounters", {
        params: {
          date_from: new Date(dateFrom).toISOString(),
          date_to: new Date(dateTo).toISOString(),
          distance_m: distanceM,
          min_duration_minutes: minDuration,
        },
      });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load encounters:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, distanceM, minDuration]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/encounters/${encodeURIComponent(id)}`, {
        params: { distance_m: distanceM },
      });
      setDetail(res.data);
    } catch (err) {
      console.error("Failed to load encounter detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const trackCenter: [number, number] | null =
    detail && detail.track.length > 0
      ? [detail.track[Math.floor(detail.track.length / 2)].lat_a, detail.track[Math.floor(detail.track.length / 2)].lon_a]
      : null;

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Pertemuan Kapal (Encounter)
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
              fullWidth
              size="small"
              type="datetime-local"
              label="Dari"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label="Sampai"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Jarak Maks (m)"
              value={distanceM}
              onChange={(e) => setDistanceM(Number(e.target.value))}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Durasi Min (menit)"
              value={minDuration}
              onChange={(e) => setMinDuration(Number(e.target.value))}
              sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<Sync />}
              onClick={runSearch}
              disabled={loading}
              sx={{ backgroundColor: THEME_COLORS.secondary, "&:hover": { backgroundColor: "#b87d08" } }}
            >
              Deteksi
            </Button>
          </Grid>
        </Grid>
        <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, mt: 1.5 }}>
          Rentang waktu dibatasi maks 24 jam untuk menjaga performa query (ais_position tanpa partisi).
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
        <TableContainer sx={{ maxHeight: "calc(100vh - 420px)" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Kapal A</TableCell>
                <TableCell sx={headCellSx}>Kapal B</TableCell>
                <TableCell sx={headCellSx}>Mulai</TableCell>
                <TableCell sx={headCellSx}>Durasi</TableCell>
                <TableCell sx={headCellSx}>Jarak Min</TableCell>
                <TableCell sx={headCellSx}>Sampel</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ ...cellSx, textAlign: "center", py: 6 }}>
                    <CircularProgress size={28} sx={{ color: THEME_COLORS.secondary }} />
                  </TableCell>
                </TableRow>
              ) : !searched ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                    <Typography sx={{ color: THEME_COLORS.textSecondary }}>
                      Atur filter lalu klik "Deteksi" untuk mencari pertemuan kapal
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                    <Typography sx={{ color: THEME_COLORS.textSecondary }}>
                      Tidak ada pertemuan kapal ditemukan pada rentang ini
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow
                    key={it.id}
                    hover
                    onClick={() => openDetail(it.id)}
                    sx={{ cursor: "pointer", "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}
                  >
                    <TableCell sx={cellSx}>
                      {it.name_a || `MMSI ${it.mmsi_a}`}
                      {it.ship_type_a && (
                        <Chip label={it.ship_type_a} size="small" sx={{ ml: 1, height: 18, fontSize: 10 }} />
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {it.name_b || `MMSI ${it.mmsi_b}`}
                      {it.ship_type_b && (
                        <Chip label={it.ship_type_b} size="small" sx={{ ml: 1, height: 18, fontSize: 10 }} />
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>{new Date(it.first_seen).toLocaleString("id-ID")}</TableCell>
                    <TableCell sx={cellSx}>{formatDecimal(it.duration_minutes, 1)} menit</TableCell>
                    <TableCell sx={cellSx}>{formatDecimal(it.min_distance_m, 0)} m</TableCell>
                    <TableCell sx={cellSx}>{it.sample_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={!!detail || detailLoading} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle
          sx={{
            backgroundColor: THEME_COLORS.surface,
            color: THEME_COLORS.text,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Detail Pertemuan Kapal
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
                <Grid size={{ xs: 6 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>KAPAL A</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
                    {detail.name_a || `MMSI ${detail.mmsi_a}`}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary }}>
                    MMSI {detail.mmsi_a} {detail.ship_type_a && `· ${detail.ship_type_a}`}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>KAPAL B</Typography>
                  <Typography sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
                    {detail.name_b || `MMSI ${detail.mmsi_b}`}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary }}>
                    MMSI {detail.mmsi_b} {detail.ship_type_b && `· ${detail.ship_type_b}`}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>DURASI</Typography>
                  <Typography sx={{ color: THEME_COLORS.secondary, fontWeight: 600 }}>
                    {formatDecimal(detail.duration_minutes, 1)} menit
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>JARAK MIN</Typography>
                  <Typography sx={{ color: THEME_COLORS.secondary, fontWeight: 600 }}>
                    {formatDecimal(detail.min_distance_m, 0)} m
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>SAMPEL</Typography>
                  <Typography sx={{ color: THEME_COLORS.secondary, fontWeight: 600 }}>
                    {detail.sample_count}
                  </Typography>
                </Grid>
              </Grid>

              {trackCenter && (
                <Box sx={{ height: 320, borderRadius: 1.5, overflow: "hidden", border: `1px solid ${THEME_COLORS.border}` }}>
                  <MapContainer center={trackCenter} zoom={11} style={{ width: "100%", height: "100%" }}>
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      attribution="&copy; OSM &copy; CARTO"
                    />
                    <Polyline
                      positions={detail.track.map((t) => [t.lat_a, t.lon_a])}
                      pathOptions={{ color: "#4e79a7", weight: 2 }}
                    />
                    <Polyline
                      positions={detail.track.map((t) => [t.lat_b, t.lon_b])}
                      pathOptions={{ color: "#e15759", weight: 2 }}
                    />
                    <CircleMarker
                      center={[detail.track[detail.track.length - 1].lat_a, detail.track[detail.track.length - 1].lon_a]}
                      radius={6}
                      pathOptions={{ color: "#4e79a7", fillColor: "#4e79a7", fillOpacity: 1 }}
                    >
                      <Popup>{detail.name_a || `MMSI ${detail.mmsi_a}`}</Popup>
                    </CircleMarker>
                    <CircleMarker
                      center={[detail.track[detail.track.length - 1].lat_b, detail.track[detail.track.length - 1].lon_b]}
                      radius={6}
                      pathOptions={{ color: "#e15759", fillColor: "#e15759", fillOpacity: 1 }}
                    >
                      <Popup>{detail.name_b || `MMSI ${detail.mmsi_b}`}</Popup>
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
