import { useEffect, useState, useCallback } from "react";
import { Grid, Box, CircularProgress, Alert, Button } from "@mui/material";
import {
  DirectionsBoat,
  Navigation,
  Anchor,
  LocalParking,
  Message,
  Router,
  ErrorOutlined,
} from "@mui/icons-material";
import KpiCard from "../components/cards/KpiCard";
import DonutChart from "../components/charts/DonutChart";
import api from "../api/client";
import type { DashboardOverview, DistributionResponse } from "../types";

export default function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [shipTypeDist, setShipTypeDist] = useState<DistributionResponse | null>(null);
  const [navStatusDist, setNavStatusDist] = useState<DistributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, st, ns] = await Promise.all([
        api.get("/api/dashboard/overview"),
        api.get("/api/dashboard/vessel-type-distribution"),
        api.get("/api/dashboard/nav-status-distribution"),
      ]);
      setOverview(ov.data);
      setShipTypeDist(st.data);
      setNavStatusDist(ns.data);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      setError("Gagal memuat data dashboard. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress sx={{ color: "#D4930A" }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Coba Lagi</Button>}>
        {error}
      </Alert>
    );
  }

  const errorRate = overview?.error_rate ?? 0;
  const isHealthy = errorRate <= 5;

  return (
    <Box>
      {/* Vessel status KPIs */}
      <Grid container spacing={2.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            title="Total Kapal"
            value={overview?.total_vessels ?? 0}
            icon={<DirectionsBoat />}
            color="#4e79a7"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            title="Kapal Aktif"
            value={overview?.active_vessels ?? 0}
            icon={<Navigation />}
            color="#59a14f"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            title="Berlayar"
            value={overview?.vessels_underway ?? 0}
            icon={<Navigation />}
            color="#D4930A"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            title="Berlabuh"
            value={overview?.vessels_anchored ?? 0}
            icon={<Anchor />}
            color="#f28e2b"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            title="Sandar"
            value={overview?.vessels_moored ?? 0}
            icon={<LocalParking />}
            color="#76b7b2"
          />
        </Grid>
      </Grid>

      {/* System health KPIs */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Pesan Diterima Hari Ini"
            value={overview?.messages_today ?? 0}
            icon={<Message />}
            color="#76b7b2"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Stasiun Online"
            value={overview?.stations_online ?? 0}
            icon={<Router />}
            color="#59a14f"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Error Rate"
            value={errorRate}
            valueText={`${errorRate.toFixed(1)}%`}
            icon={<ErrorOutlined />}
            color={isHealthy ? "#59a14f" : "#e15759"}
            statusLabel={isHealthy ? "Sehat" : "Degraded"}
            statusColor={isHealthy ? "#59a14f" : "#e15759"}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          {shipTypeDist && <DonutChart title={shipTypeDist.title} data={shipTypeDist.data} />}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          {navStatusDist && <DonutChart title={navStatusDist.title} data={navStatusDist.data} />}
        </Grid>
      </Grid>
    </Box>
  );
}
