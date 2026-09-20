import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box, Typography, CircularProgress, Tabs, Tab, Alert, Button,
  Paper, Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Grid } from "@mui/material";
import { BarChart as BarChartIcon, TableChart, Flag, Straighten, Category } from "@mui/icons-material";
import BarChartCard from "../components/charts/BarChartCard";
import KpiCard from "../components/cards/KpiCard";
import DataTable from "../components/tables/DataTable";
import VesselTrackDialog from "../components/dialogs/VesselTrackDialog";
import api from "../api/client";
import type { DistributionResponse, VesselKpis, VesselListItem } from "../types";
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

export default function VesselStatsPage() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";

  const [tab, setTab] = useState(initialSearch ? 1 : 0);
  const [byType, setByType] = useState<DistributionResponse | null>(null);
  const [bySize, setBySize] = useState<DistributionResponse | null>(null);
  const [byFlag, setByFlag] = useState<DistributionResponse | null>(null);
  const [kpis, setKpis] = useState<VesselKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackVessel, setTrackVessel] = useState<VesselListItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s, f, k] = await Promise.all([
        api.get("/api/statistics/by-ship-type"),
        api.get("/api/statistics/by-size"),
        api.get("/api/statistics/by-flag"),
        api.get("/api/statistics/summary-kpis"),
      ]);
      setByType(t.data);
      setBySize(s.data);
      setByFlag(f.data);
      setKpis(k.data);
    } catch (err) {
      console.error("Failed to load stats:", err);
      setError("Gagal memuat statistik kapal. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
          Statistik Kapal
        </Typography>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              fontSize: 13,
              color: THEME_COLORS.textSecondary,
              textTransform: "none",
              "&.Mui-selected": { color: THEME_COLORS.secondary },
            },
            "& .MuiTabs-indicator": { backgroundColor: THEME_COLORS.secondary },
          }}
        >
          <Tab icon={<BarChartIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Grafik" />
          <Tab icon={<TableChart sx={{ fontSize: 18 }} />} iconPosition="start" label="Tabel Kapal" />
        </Tabs>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2.5 }} action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>
          {error}
        </Alert>
      )}

      {tab === 0 && (
        loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
            <CircularProgress sx={{ color: "#D4930A" }} />
          </Box>
        ) : error ? null : (
          <Grid container spacing={2.5}>
            {/* KPI cards */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <KpiCard
                title="Tipe Kapal Unik"
                value={kpis?.unique_ship_types ?? 0}
                icon={<Category />}
                color="#4e79a7"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <KpiCard
                title="Kapal Terbesar (LOA)"
                value={kpis?.largest_vessel_loa ?? 0}
                valueText={kpis?.largest_vessel_loa != null ? `${kpis.largest_vessel_loa.toFixed(0)} m` : "-"}
                icon={<Straighten />}
                color="#D4930A"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <KpiCard
                title="Bendera Dominan"
                value={0}
                valueText={kpis?.dominant_flag ?? "-"}
                icon={<Flag />}
                color="#59a14f"
              />
            </Grid>

            {/* Charts */}
            <Grid size={{ xs: 12, lg: 6 }}>
              {byType && <BarChartCard title={byType.title} data={byType.data} color="#4e79a7" />}
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              {bySize && <BarChartCard title={bySize.title} data={bySize.data} color="#59a14f" />}
            </Grid>
            <Grid size={{ xs: 12 }}>
              {byFlag && <BarChartCard title={byFlag.title} data={byFlag.data} color="#D4930A" height={350} />}
            </Grid>

            {/* Flag table */}
            {byFlag && byFlag.data.length > 0 && (
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
                      Top Bendera Kapal
                    </Typography>
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={headCellSx}>#</TableCell>
                        <TableCell sx={headCellSx}>Bendera</TableCell>
                        <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Jumlah</TableCell>
                        <TableCell sx={{ ...headCellSx, textAlign: "right" }}>Share</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {byFlag.data.map((flag, i) => (
                        <TableRow
                          key={flag.label}
                          hover
                          sx={{ "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` } }}
                        >
                          <TableCell sx={{ ...cellSx, color: THEME_COLORS.textSecondary, width: 40 }}>
                            {i + 1}
                          </TableCell>
                          <TableCell sx={{ ...cellSx, fontWeight: 500 }}>{flag.label}</TableCell>
                          <TableCell sx={{ ...cellSx, textAlign: "right", fontFamily: "monospace" }}>
                            {formatNumber(flag.value)}
                          </TableCell>
                          <TableCell sx={{ ...cellSx, textAlign: "right", color: THEME_COLORS.secondary, fontWeight: 600 }}>
                            {byFlag.total > 0
                              ? `${((flag.value / byFlag.total) * 100).toFixed(1)}%`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
            )}
          </Grid>
        )
      )}

      {tab === 1 && (
        <DataTable
          initialSearch={initialSearch}
          onTrackView={(v) => setTrackVessel(v)}
        />
      )}

      <VesselTrackDialog
        vessel={trackVessel}
        open={trackVessel !== null}
        onClose={() => setTrackVessel(null)}
      />
    </Box>
  );
}
