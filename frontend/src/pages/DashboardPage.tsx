import { useEffect, useState, useCallback } from "react";
import {
  Ship,
  Navigation,
  Anchor,
  ParkingCircle,
  MessageSquare,
  Router,
  CircleAlert,
} from "lucide-react";
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
      <div className="flex justify-center pt-10">
        <span className="loading loading-spinner text-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
      </div>
    );
  }

  const errorRate = overview?.error_rate ?? 0;
  const isHealthy = errorRate <= 5;

  return (
    <div>
      {/* Vessel status KPIs */}
      <div className="mb-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          title="Total Kapal"
          value={overview?.total_vessels ?? 0}
          icon={<Ship size={22} />}
          color="#4e79a7"
        />
        <KpiCard
          title="Kapal Aktif"
          value={overview?.active_vessels ?? 0}
          icon={<Navigation size={22} />}
          color="#59a14f"
        />
        <KpiCard
          title="Berlayar"
          value={overview?.vessels_underway ?? 0}
          icon={<Navigation size={22} />}
          color="#D4930A"
        />
        <KpiCard
          title="Berlabuh"
          value={overview?.vessels_anchored ?? 0}
          icon={<Anchor size={22} />}
          color="#f28e2b"
        />
        <KpiCard
          title="Sandar"
          value={overview?.vessels_moored ?? 0}
          icon={<ParkingCircle size={22} />}
          color="#76b7b2"
        />
      </div>

      {/* System health KPIs */}
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
        <KpiCard
          title="Pesan Diterima Hari Ini"
          value={overview?.messages_today ?? 0}
          icon={<MessageSquare size={22} />}
          color="#76b7b2"
        />
        <KpiCard
          title="Stasiun Online"
          value={overview?.stations_online ?? 0}
          icon={<Router size={22} />}
          color="#59a14f"
        />
        <KpiCard
          title="Error Rate"
          value={errorRate}
          valueText={`${errorRate.toFixed(1)}%`}
          icon={<CircleAlert size={22} />}
          color={isHealthy ? "#59a14f" : "#e15759"}
          statusLabel={isHealthy ? "Sehat" : "Degraded"}
          statusColor={isHealthy ? "#59a14f" : "#e15759"}
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div>{shipTypeDist && <DonutChart title={shipTypeDist.title} data={shipTypeDist.data} />}</div>
        <div>{navStatusDist && <DonutChart title={navStatusDist.title} data={navStatusDist.data} />}</div>
      </div>
    </div>
  );
}
