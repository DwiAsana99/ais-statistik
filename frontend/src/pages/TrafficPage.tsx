import { useEffect, useState, useCallback } from "react";
import { Ship, Gauge, Clock } from "lucide-react";
import BarChartCard from "../components/charts/BarChartCard";
import LineChartCard from "../components/charts/LineChartCard";
import HeatmapChart from "../components/charts/HeatmapChart";
import KpiCard from "../components/cards/KpiCard";
import type { HeatmapPoint } from "../components/charts/HeatmapChart";
import api from "../api/client";
import type { TrendResponse, DistributionResponse, StationStats, TrafficKpis, SogBin } from "../types";

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
    <div>
      <p className="mb-3 text-lg font-semibold text-base-content">Trafik & Tren</p>

      {/* KPI cards — independent loading, fail silently */}
      {!kpisLoading && kpis && (
        <div className="mb-5 grid grid-cols-12 gap-5">
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <KpiCard
              title="Kapal Aktif (7 Hari)"
              value={kpis.total_active_vessels_7d}
              icon={<Ship />}
              color="#4e79a7"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <KpiCard
              title="Kecepatan Median"
              value={kpis.sog_median_knots}
              valueText={`${kpis.sog_median_knots.toFixed(1)} kn`}
              icon={<Gauge />}
              color="#D4930A"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <KpiCard
              title="Jam Puncak"
              value={kpis.peak_hour}
              valueText={`${String(kpis.peak_hour).padStart(2, "0")}:00`}
              icon={<Clock />}
              color="#76b7b2"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* Trend line */}
        <div className="col-span-12">
          <div className="card border border-base-300 bg-base-100 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-base-content">
                {trend?.title ?? "Tren Kapal Aktif Harian"}
              </p>
              <div className="join">
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <button
                    key={p}
                    className={`btn join-item btn-xs ${period === p ? "btn-secondary" : "btn-outline"}`}
                    onClick={() => setPeriod(p)}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {trendLoading ? (
              <div className="flex h-[350px] items-center justify-center">
                <span className="loading loading-spinner text-secondary" />
              </div>
            ) : trendError ? (
              <div className="alert alert-error">
                <span>{trendError}</span>
                <button className="btn btn-ghost btn-sm" onClick={loadTrend}>Coba Lagi</button>
              </div>
            ) : trend ? (
              <LineChartCard title="" data={trend.data} height={320} />
            ) : null}
          </div>
        </div>

        {staticError ? (
          <div className="col-span-12">
            <div className="alert alert-error">
              <span>{staticError}</span>
              <button className="btn btn-ghost btn-sm" onClick={loadStatic}>Coba Lagi</button>
            </div>
          </div>
        ) : (
          <>
            {/* Heatmap */}
            <div className="col-span-12">
              {staticLoading ? (
                <div className="flex justify-center pt-8">
                  <span className="loading loading-spinner text-secondary" />
                </div>
              ) : (
                <HeatmapChart title="Heatmap Trafik per Jam (30 hari terakhir)" data={heatmap} />
              )}
            </div>

            {/* SOG distribution — only shown once worker has precomputed it */}
            {!kpisLoading && sogChartData.length > 0 && (
              <div className="col-span-12 lg:col-span-6">
                <BarChartCard
                  title="Distribusi Kecepatan (SOG) 7 Hari — knots"
                  data={sogChartData}
                  color="#f28e2b"
                />
              </div>
            )}

            {/* Hourly bar */}
            <div className={!kpisLoading && sogChartData.length > 0 ? "col-span-12 lg:col-span-6" : "col-span-12"}>
              {hourly && <BarChartCard title={hourly.title} data={hourly.data} color="#76b7b2" />}
            </div>

            {/* Station bar */}
            <div className="col-span-12">
              <BarChartCard title="Trafik per Stasiun" data={stationChartData} color="#e15759" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
