import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import {
  Box, Typography, TextField, Button, CircularProgress, Slider, IconButton, Grid, Divider,
} from "@mui/material";
import { PlayArrow, Pause, Replay, Route } from "@mui/icons-material";
import api from "../../api/client";
import { THEME_COLORS } from "../../utils/constants";
import type { VesselListItem, VesselTrackPoint } from "../../types";

const NAV_STATUS: Record<number, string> = {
  0: "Underway (engine)",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  4: "Constrained by draught",
  5: "Moored",
  6: "Aground",
  7: "Fishing",
  8: "Underway (sailing)",
  15: "Not defined",
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FitBounds({ track }: { track: VesselTrackPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (track.length > 0) {
      const bounds = track.map((p) => [p.lat, p.lon] as [number, number]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }, [track, map]);
  return null;
}

interface Props {
  vessel: VesselListItem;
}

export default function VesselTrackViewer({ vessel }: Props) {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(toLocalInput(new Date(now.getTime() - 24 * 3600 * 1000)));
  const [dateTo, setDateTo] = useState(toLocalInput(now));

  const [track, setTrack] = useState<VesselTrackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const [sliderVal, setSliderVal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = track.length > 0 ? track[sliderVal] : null;

  const stopPlay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPlaying(false);
  }, []);

  const startPlay = useCallback(() => {
    stopPlay();
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      setSliderVal((prev) => {
        if (prev >= track.length - 1) {
          clearInterval(intervalRef.current!);
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 150);
  }, [track.length, stopPlay]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const fetchTrack = useCallback(async () => {
    stopPlay();
    setLoading(true);
    setFetched(true);
    setTrack([]);
    setSliderVal(0);
    try {
      const res = await api.get(`/api/vessels/${vessel.mmsi}/track`, {
        params: {
          date_from: new Date(dateFrom).toISOString(),
          date_to: new Date(dateTo).toISOString(),
        },
      });
      setTrack(res.data);
    } catch (err) {
      console.error("Failed to load vessel track:", err);
    } finally {
      setLoading(false);
    }
  }, [vessel, dateFrom, dateTo, stopPlay]);

  const trackPositions = track.map((p) => [p.lat, p.lon] as [number, number]);
  const defaultCenter: [number, number] = vessel.last_lat && vessel.last_lon
    ? [vessel.last_lat, vessel.last_lon]
    : [-2, 117]; // center Indonesia

  const infoSx = { fontSize: 12, color: THEME_COLORS.textSecondary };
  const valSx = { fontSize: 14, fontWeight: 600, color: THEME_COLORS.text, fontFamily: "monospace" };

  return (
    <Box>
      {/* Date range + fetch */}
      <Box
        sx={{
          p: 2,
          display: "flex",
          gap: 2,
          alignItems: "center",
          backgroundColor: THEME_COLORS.surface,
          border: `1px solid ${THEME_COLORS.border}`,
          borderRadius: "8px 8px 0 0",
          flexWrap: "wrap",
        }}
      >
        <TextField
          size="small" type="datetime-local" label="Dari"
          value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 }, minWidth: 200 }}
        />
        <TextField
          size="small" type="datetime-local" label="Sampai"
          value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 }, minWidth: 200 }}
        />
        <Button
          variant="contained" size="small" onClick={fetchTrack} disabled={loading}
          startIcon={loading ? <CircularProgress size={14} /> : <Route />}
          sx={{ backgroundColor: THEME_COLORS.secondary, "&:hover": { backgroundColor: "#b87d08" } }}
        >
          Muat Track
        </Button>
        {fetched && !loading && (
          <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary }}>
            {track.length === 0 ? "Tidak ada data posisi." : `${track.length} titik dimuat.`}
          </Typography>
        )}
        <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, ml: "auto" }}>
          Maks 48 jam · maks 2 000 titik
        </Typography>
      </Box>

      {/* Map */}
      <Box sx={{ height: 440, position: "relative", border: `1px solid ${THEME_COLORS.border}`, borderTop: "none" }}>
        {loading && (
          <Box
            sx={{
              position: "absolute", inset: 0, zIndex: 1000,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
          >
            <CircularProgress sx={{ color: THEME_COLORS.secondary }} />
          </Box>
        )}
        <MapContainer
          center={defaultCenter}
          zoom={6}
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OSM &copy; CARTO"
          />
          {track.length > 0 && (
            <>
              <FitBounds track={track} />
              <Polyline
                positions={trackPositions}
                pathOptions={{ color: "#4e79a7", weight: 2, opacity: 0.7 }}
              />
              {/* Start marker */}
              <CircleMarker
                center={[track[0].lat, track[0].lon]}
                radius={7}
                pathOptions={{ color: "#59a14f", fillColor: "#59a14f", fillOpacity: 1, weight: 2 }}
              >
                <Popup>
                  Start: {new Date(track[0].time).toLocaleString("id-ID")}
                </Popup>
              </CircleMarker>
              {/* End marker */}
              <CircleMarker
                center={[track[track.length - 1].lat, track[track.length - 1].lon]}
                radius={7}
                pathOptions={{ color: "#e15759", fillColor: "#e15759", fillOpacity: 1, weight: 2 }}
              >
                <Popup>
                  End: {new Date(track[track.length - 1].time).toLocaleString("id-ID")}
                </Popup>
              </CircleMarker>
              {/* Playback position */}
              {current && sliderVal > 0 && sliderVal < track.length - 1 && (
                <CircleMarker
                  center={[current.lat, current.lon]}
                  radius={9}
                  pathOptions={{ color: "#D4930A", fillColor: "#D4930A", fillOpacity: 1, weight: 2 }}
                >
                  <Popup>
                    {new Date(current.time).toLocaleString("id-ID")}
                    {current.sog != null ? ` · ${current.sog.toFixed(1)} kn` : ""}
                  </Popup>
                </CircleMarker>
              )}
            </>
          )}
        </MapContainer>
      </Box>

      {/* Playback controls */}
      {track.length > 1 && (
        <Box
          sx={{
            px: 2.5, py: 1.5,
            backgroundColor: THEME_COLORS.surface,
            border: `1px solid ${THEME_COLORS.border}`,
            borderTop: "none",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton
              size="small"
              onClick={() => { setSliderVal(0); stopPlay(); }}
              sx={{ color: THEME_COLORS.textSecondary }}
              title="Reset"
            >
              <Replay fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={playing ? stopPlay : startPlay}
              sx={{ color: THEME_COLORS.secondary }}
            >
              {playing ? <Pause /> : <PlayArrow />}
            </IconButton>
            <Slider
              min={0}
              max={track.length - 1}
              value={sliderVal}
              onChange={(_, v) => { stopPlay(); setSliderVal(v as number); }}
              sx={{
                color: THEME_COLORS.secondary,
                "& .MuiSlider-thumb": { width: 14, height: 14 },
              }}
            />
            <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary, whiteSpace: "nowrap", minWidth: 110 }}>
              {sliderVal + 1} / {track.length}
            </Typography>
          </Box>
          {current && (
            <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary, mt: 0.5 }}>
              {new Date(current.time).toLocaleString("id-ID")}
            </Typography>
          )}
        </Box>
      )}

      <Divider sx={{ borderColor: THEME_COLORS.border }} />

      {/* Current position info */}
      {current && (
        <Box
          sx={{
            px: 2.5, py: 1.5,
            backgroundColor: THEME_COLORS.surface,
            border: `1px solid ${THEME_COLORS.border}`,
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
          }}
        >
          <Grid container spacing={3}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography sx={infoSx}>SOG</Typography>
              <Typography sx={valSx}>
                {current.sog != null ? `${current.sog.toFixed(1)} kn` : "—"}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography sx={infoSx}>COG</Typography>
              <Typography sx={valSx}>
                {current.cog != null ? `${current.cog.toFixed(1)}°` : "—"}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography sx={infoSx}>Heading</Typography>
              <Typography sx={valSx}>
                {current.heading != null ? `${current.heading}°` : "—"}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography sx={infoSx}>Nav Status</Typography>
              <Typography sx={{ ...valSx, fontFamily: "inherit", fontSize: 13 }}>
                {current.nav_status_code != null
                  ? (NAV_STATUS[current.nav_status_code] ?? `Code ${current.nav_status_code}`)
                  : "—"}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
