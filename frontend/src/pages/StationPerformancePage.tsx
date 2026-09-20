import { useEffect, useState, useCallback } from "react";
import { Router, SignalHigh, Ship, Gauge } from "lucide-react";
import KpiCard from "../components/cards/KpiCard";
import BarChartCard from "../components/charts/BarChartCard";
import api from "../api/client";
import type { StationPerformance, StationKpis } from "../types";
import { formatNumber } from "../utils/formatters";

const STATUS_COLOR: Record<string, string> = {
  online:   "#59a14f",
  degraded: "#D4930A",
  offline:  "#e15759",
  unknown:  "#8899AA",
};

const STATUS_LABEL: Record<string, string> = {
  online:   "Online",
  degraded: "Degraded",
  offline:  "Offline",
  unknown:  "Tidak Diketahui",
};

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#8899AA";
  return (
    <span
      className="badge badge-sm h-[22px] border font-semibold"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function StationPerformancePage() {
  const [stations, setStations] = useState<StationPerformance[]>([]);
  const [kpis, setKpis] = useState<StationKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perf, kpiRes] = await Promise.all([
        api.get("/api/stations/performance"),
        api.get("/api/stations/summary-kpis"),
      ]);
      setStations(perf.data);
      setKpis(kpiRes.data);
    } catch (err) {
      console.error("Failed to load station performance:", err);
      setError("Gagal memuat data performa stasiun. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const barData = stations
    .filter((s) => s.vessel_count > 0)
    .slice(0, 20)
    .map((s) => ({
      label: s.station_name ?? s.station_id,
      value: s.vessel_count,
    }));

  const throughputBarData = stations
    .filter((s) => s.msg_per_hour > 0)
    .slice(0, 20)
    .map((s) => ({
      label: s.station_name ?? s.station_id,
      value: s.msg_per_hour,
    }));

  const onlineCount = kpis?.online_count ?? 0;
  const totalCount = kpis?.total_stations ?? 0;

  return (
    <div>
      <p className="mb-3 text-lg font-semibold text-base-content">Performa Stasiun</p>

      {error && (
        <div className="alert alert-error mb-5">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center pt-16">
          <span className="loading loading-spinner text-secondary" />
        </div>
      ) : !error && (
        <div className="grid grid-cols-12 gap-5">
          {/* KPI cards */}
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Stasiun Online / Total"
              value={onlineCount}
              valueText={`${onlineCount} / ${totalCount}`}
              icon={<Router />}
              color="#59a14f"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Cakupan Kapal"
              value={kpis?.total_vessel_coverage ?? 0}
              icon={<Ship />}
              color="#4e79a7"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Throughput Total (msg/jam)"
              value={kpis?.total_throughput_per_hour ?? 0}
              valueText={
                kpis?.total_throughput_per_hour
                  ? `${formatNumber(Math.round(kpis.total_throughput_per_hour))}/jam`
                  : "—"
              }
              icon={<Gauge />}
              color="#D4930A"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Stasiun Degraded / Offline"
              value={(kpis?.degraded_count ?? 0) + (kpis?.offline_count ?? 0)}
              valueText={`${kpis?.degraded_count ?? 0} degraded · ${kpis?.offline_count ?? 0} offline`}
              icon={<SignalHigh />}
              color="#e15759"
            />
          </div>

          {/* Status badge grid */}
          {stations.length > 0 && (
            <div className="col-span-12">
              <div className="card border border-base-300 bg-base-100 p-5">
                <p className="mb-3 text-sm font-semibold text-base-content">Status Stasiun</p>
                <div className="flex flex-wrap gap-2">
                  {stations.map((s) => (
                    <div
                      key={s.station_id}
                      className="flex min-w-[160px] items-center gap-2 rounded-lg border bg-base-200 px-3 py-1.5"
                      style={{ borderColor: `${STATUS_COLOR[s.status] ?? "var(--color-base-300)"}44` }}
                    >
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: STATUS_COLOR[s.status] ?? "var(--color-base-300)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs leading-tight font-semibold text-base-content">
                          {s.station_name ?? s.station_id}
                        </p>
                        <p className="text-[10px] text-base-content/60">{s.vessel_count} kapal</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bar charts */}
          {barData.length > 0 && (
            <div className={throughputBarData.length > 0 ? "col-span-12 lg:col-span-6" : "col-span-12"}>
              <BarChartCard
                title="Cakupan Kapal per Stasiun"
                data={barData}
                color="#4e79a7"
                height={320}
              />
            </div>
          )}
          {throughputBarData.length > 0 && (
            <div className={barData.length > 0 ? "col-span-12 lg:col-span-6" : "col-span-12"}>
              <BarChartCard
                title="Throughput per Stasiun (msg/jam, 7 hari)"
                data={throughputBarData}
                color="#D4930A"
                height={320}
              />
            </div>
          )}

          {/* Detail table */}
          {stations.length > 0 && (
            <div className="col-span-12">
              <div className="card overflow-hidden border border-base-300 bg-base-100">
                <div className="border-b border-base-300 px-5 py-3">
                  <p className="text-sm font-semibold text-base-content">Detail Stasiun</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">ID Stasiun</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">MMSI</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Status</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Kapal</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">msg/jam</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Terakhir Lapor</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Koordinat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stations.map((s) => (
                        <tr key={s.station_id} className="hover:bg-base-200">
                          <td className="font-mono font-medium">{s.station_name ?? s.station_id}</td>
                          <td className="font-mono text-base-content/60">{s.mmsi ?? "—"}</td>
                          <td><StatusChip status={s.status} /></td>
                          <td className="text-right font-mono">{formatNumber(s.vessel_count)}</td>
                          <td className="text-right font-mono">
                            {s.msg_per_hour > 0 ? formatNumber(Math.round(s.msg_per_hour)) : "—"}
                          </td>
                          <td className="text-xs text-base-content/60">
                            {s.last_seen
                              ? new Date(s.last_seen).toLocaleString("id-ID", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </td>
                          <td className="font-mono text-[11px] text-base-content/60">
                            {s.lat != null && s.lon != null
                              ? `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
