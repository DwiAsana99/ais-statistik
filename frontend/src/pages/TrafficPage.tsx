import { useEffect, useState, useCallback } from "react";
import { Box, Typography, CircularProgress, ToggleButtonGroup, ToggleButton, Alert, Button } from "@mui/material";
import { Grid } from "@mui/material";
import { DirectionsBoat, Speed, Schedule } from "@mui/icons-material";
import BarChartCard from "../components/charts/BarChartCard";
import LineChartCard from "../components/charts/LineChartCard";
import HeatmapChart from "../components/charts/HeatmapChart";
import KpiCard from "../components/cards/KpiCard";
import type { HeatmapPoint } from "../components/charts/HeatmapChart";
import api from "../api/client";
import type { TrendResponse, DistributionResponse, StationStats, TrafficKpis, SogBin } from "../types";
import { THEME_COLORS } from "../utils/constants";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 Hari",
  "30d": "30 Hari",
  "90d": "90 Hari",
};

export default function TrafficPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [hourly, setHourly] = useState<DistributionResponse | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [stations, setStations] = useState<StationStats[]>([]);
  const [staticLoading, setStaticLoading] = useState(true);
  const [staticError, setStaticError] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  // KPI + SOG — precomputed by worker; loaded separately so they never block trend/charts
  const [kpis, setKpis] = useState<TrafficKpis | null>(null);
  const [sogBins, setSogBins] = useState<SogBin[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);

  // Fast static data — small cached queries
  const loadStatic = useCallback(async () => {
    setStaticLoading(true);
    setStaticError(null);
    try {
      const [h, s, hm] = await Promise.all([
        api.get("/api/traffic/hourly"),
        api.get("/api/traffic/by-station"),
        api.get("/api/traffic/heatmap"),
      ]);
      setHourly(h.data);
      setStations(s.data);
      setHeatmap(hm.data);
    } catch (err) {
      console.error("Failed to load traffic static:", err);
      setStaticError("Gagal memuat data trafik. Periksa koneksi ke server.");
    } finally {
      setStaticLoading(false);
    }
  }, []);

  // Heavy precomputed data — may be slow on first run before worker caches them
  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const [kp, sog] = await Promise.all([
        api.get("/api/traffic/summary-kpis"),
        api.get("/api/traffic/sog-distribution"),
      ]);
      setKpis(kp.data);
      setSogBins(sog.data);
    } catch (err) {
      console.error("Failed to load traffic KPIs:", err);
      // Fail silently — cards just won't show
    } finally {
      setKpisLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatic();
    loadKpis();
  }, [loadStatic, loadKpis]);

  const loadTrend = useCallback(async () => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const res = await api.get(`/api/traffic/trend?period=${period}`);
      setTrend(res.data);
    } catch (err) {
      console.error("Failed to load trend:", err);
      setTrendError("Gagal memuat tren.");
    } finally {
      setTrendLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadTrend();
  }, [loadTrend]);

  const stationChartData = stations.map((s) => ({
    label: s.station_id,
    value: s.vessel_count,
  }));

  const sogChartData = sogBins.map((b) => ({
    label: `${b.bin_start}–${b.bin_start + 2}`,
    value: b.count,
  }));

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Trafik & Tren
      </Typography>

      {/* KPI cards — independent loading, fail silently */}
      {!kpisLoading && kpis && (
        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <KpiCard
              title="Kapal Aktif (7 Hari)"
              value={kpis.total_active_vessels_7d}
              icon={<DirectionsBoat />}
              color="#4e79a7"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <KpiCard
              title="Kecepatan Median"
              value={kpis.sog_median_knots}
              valueText={`${kpis.sog_median_knots.toFixed(1)} kn`}
              icon={<Speed />}
              color="#D4930A"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <KpiCard
              title="Jam Puncak"
              value={kpis.peak_hour}
              valueText={`${String(kpis.peak_hour).padStart(2, "0")}:00`}
              icon={<Schedule />}
              color="#76b7b2"
            />
          </Grid>
        </Grid>
      )}

      <Grid container spacing={2.5}>
        {/* Trend line */}
        <Grid size={{ xs: 12 }}>
          <Box
            sx={{
              p: 2.5,
              backgroundColor: THEME_COLORS.surface,
              border: `1px solid ${THEME_COLORS.border}`,
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="subtitle2" sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
                {trend?.title ?? "Tren Kapal Aktif Harian"}
              </Typography>
              <ToggleButtonGroup
                value={period}
                exclusive
                onChange={(_, val) => val && setPeriod(val as Period)}
                size="small"
                sx={{
                  "& .MuiToggleButton-root": {
                    color: THEME_COLORS.textSecondary,
                    borderColor: THEME_COLORS.border,
                    fontSize: 12,
                    py: 0.4,
                    px: 1.5,
                    textTransform: "none",
                    "&.Mui-selected": {
                      color: THEME_COLORS.secondary,
                      backgroundColor: `${THEME_COLORS.secondary}18`,
                      borderColor: `${THEME_COLORS.secondary}60`,
                    },
                  },
                }}
              >
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <ToggleButton key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {trendLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", height: 350, alignItems: "center" }}>
                <CircularProgress size={28} sx={{ color: THEME_COLORS.secondary }} />
              </Box>
            ) : trendError ? (
              <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadTrend}>Coba Lagi</Button>}>
                {trendError}
              </Alert>
            ) : trend ? (
              <LineChartCard title="" data={trend.data} height={320} />
            ) : null}
          </Box>
        </Grid>

        {staticError ? (
          <Grid size={{ xs: 12 }}>
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadStatic}>Coba Lagi</Button>}>
              {staticError}
            </Alert>
          </Grid>
        ) : (
          <>
            {/* Heatmap */}
            <Grid size={{ xs: 12 }}>
              {staticLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
                  <CircularProgress size={28} sx={{ color: THEME_COLORS.secondary }} />
                </Box>
              ) : (
                <HeatmapChart title="Heatmap Trafik per Jam (30 hari terakhir)" data={heatmap} />
              )}
            </Grid>

            {/* SOG distribution — only shown once worker has precomputed it */}
            {!kpisLoading && sogChartData.length > 0 && (
              <Grid size={{ xs: 12, lg: 6 }}>
                <BarChartCard
                  title="Distribusi Kecepatan (SOG) 7 Hari — knots"
                  data={sogChartData}
                  color="#f28e2b"
                />
              </Grid>
            )}

            {/* Hourly bar */}
            <Grid size={{ xs: 12, lg: !kpisLoading && sogChartData.length > 0 ? 6 : 12 }}>
              {hourly && <BarChartCard title={hourly.title} data={hourly.data} color="#76b7b2" />}
            </Grid>

            {/* Station bar */}
            <Grid size={{ xs: 12 }}>
              <BarChartCard title="Trafik per Stasiun" data={stationChartData} color="#e15759" />
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}
