import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Table2, Flag, Ruler, Shapes } from "lucide-react";
import BarChartCard from "../components/charts/BarChartCard";
import KpiCard from "../components/cards/KpiCard";
import DataTable from "../components/tables/DataTable";
import VesselTrackDialog from "../components/dialogs/VesselTrackDialog";
import api from "../api/client";
import type { DistributionResponse, VesselKpis, VesselListItem } from "../types";
import { formatNumber } from "../utils/formatters";

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

  const tabs = [
    { icon: BarChart3, label: "Grafik" },
    { icon: Table2, label: "Tabel Kapal" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-lg font-semibold text-base-content">Statistik Kapal</p>
        <div role="tablist" className="tabs tabs-lift tabs-sm">
          {tabs.map((t, i) => (
            <a
              key={t.label}
              role="tab"
              className={`tab gap-1.5 ${tab === i ? "tab-active" : ""}`}
              onClick={() => setTab(i)}
            >
              <t.icon size={16} /> {t.label}
            </a>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-5">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
        </div>
      )}

      {tab === 0 && (
        loading ? (
          <div className="flex justify-center pt-16">
            <span className="loading loading-spinner text-secondary" />
          </div>
        ) : error ? null : (
          <div className="grid grid-cols-12 gap-5">
            {/* KPI cards */}
            <div className="col-span-12 sm:col-span-6 md:col-span-4">
              <KpiCard
                title="Tipe Kapal Unik"
                value={kpis?.unique_ship_types ?? 0}
                icon={<Shapes />}
                color="#4e79a7"
              />
            </div>
            <div className="col-span-12 sm:col-span-6 md:col-span-4">
              <KpiCard
                title="Kapal Terbesar (LOA)"
                value={kpis?.largest_vessel_loa ?? 0}
                valueText={kpis?.largest_vessel_loa != null ? `${kpis.largest_vessel_loa.toFixed(0)} m` : "-"}
                icon={<Ruler />}
                color="#D4930A"
              />
            </div>
            <div className="col-span-12 sm:col-span-6 md:col-span-4">
              <KpiCard
                title="Bendera Dominan"
                value={0}
                valueText={kpis?.dominant_flag ?? "-"}
                icon={<Flag />}
                color="#59a14f"
              />
            </div>

            {/* Charts */}
            <div className="col-span-12 lg:col-span-6">
              {byType && <BarChartCard title={byType.title} data={byType.data} color="#4e79a7" />}
            </div>
            <div className="col-span-12 lg:col-span-6">
              {bySize && <BarChartCard title={bySize.title} data={bySize.data} color="#59a14f" />}
            </div>
            <div className="col-span-12">
              {byFlag && <BarChartCard title={byFlag.title} data={byFlag.data} color="#D4930A" height={350} />}
            </div>

            {/* Flag table */}
            {byFlag && byFlag.data.length > 0 && (
              <div className="col-span-12">
                <div className="card overflow-hidden border border-base-300 bg-base-100">
                  <div className="border-b border-base-300 px-5 py-3">
                    <p className="text-sm font-semibold text-base-content">Top Bendera Kapal</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">#</th>
                          <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Bendera</th>
                          <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Jumlah</th>
                          <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byFlag.data.map((flag, i) => (
                          <tr key={flag.label} className="hover:bg-base-200">
                            <td className="w-10 text-base-content/60">{i + 1}</td>
                            <td className="font-medium">{flag.label}</td>
                            <td className="text-right font-mono">{formatNumber(flag.value)}</td>
                            <td className="text-right font-semibold text-secondary">
                              {byFlag.total > 0
                                ? `${((flag.value / byFlag.total) * 100).toFixed(1)}%`
                                : "-"}
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
    </div>
  );
}
