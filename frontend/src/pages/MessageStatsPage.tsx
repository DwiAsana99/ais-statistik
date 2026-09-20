import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Ship, Tag, Gauge } from "lucide-react";
import KpiCard from "../components/cards/KpiCard";
import DonutChart from "../components/charts/DonutChart";
import BarChartCard from "../components/charts/BarChartCard";
import LineChartCard from "../components/charts/LineChartCard";
import api from "../api/client";
import type { MessageSummary, MessageTypeBreakdown, TrendResponse } from "../types";
import { formatNumber } from "../utils/formatters";

export default function MessageStatsPage() {
  const [summary, setSummary] = useState<MessageSummary | null>(null);
  const [byType, setByType] = useState<MessageTypeBreakdown[]>([]);
  const [volumeDaily, setVolumeDaily] = useState<TrendResponse | null>(null);
  const [throughput, setThroughput] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, bt, vd, tp] = await Promise.all([
        api.get("/api/messages/summary"),
        api.get("/api/messages/by-type"),
        api.get("/api/messages/volume-daily"),
        api.get("/api/messages/throughput"),
      ]);
      setSummary(s.data);
      setByType(bt.data);
      setVolumeDaily(vd.data);
      setThroughput(tp.data);
    } catch (err) {
      console.error("Failed to load message stats:", err);
      setError("Gagal memuat statistik pesan. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const donutData = byType.slice(0, 10).map((t) => ({
    label: t.type_name ?? `Tipe ${t.msg_type}`,
    value: t.count,
  }));

  const barData = byType.slice(0, 15).map((t) => ({
    label: t.type_name ?? `Tipe ${t.msg_type}`,
    value: t.count,
  }));

  return (
    <div>
      <p className="mb-3 text-lg font-semibold text-base-content">Statistik Pesan</p>

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
              title="Total Pesan (24 Jam)"
              value={summary?.total_messages ?? 0}
              icon={<MessageSquare />}
              color="#4e79a7"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Rata-rata per Kapal"
              value={summary?.avg_per_vessel ?? 0}
              valueText={summary ? `${summary.avg_per_vessel.toFixed(1)} msg` : "-"}
              icon={<Ship />}
              color="#D4930A"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Tipe Pesan Unik"
              value={summary?.unique_msg_types ?? 0}
              icon={<Tag />}
              color="#59a14f"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Throughput msg/jam"
              value={summary?.throughput_per_hour ?? 0}
              valueText={summary ? `${formatNumber(Math.round(summary.throughput_per_hour))}/jam` : "-"}
              icon={<Gauge />}
              color="#76b7b2"
            />
          </div>

          {/* Class A vs B summary */}
          {summary && (
            <div className="col-span-12">
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-base-300 bg-base-200 px-5 py-3">
                <span className="text-[13px] text-base-content/60">Komposisi:</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#4e79a7" }} />
                  <span className="text-[13px] text-base-content">Class A — {summary.class_a_pct}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f28e2b" }} />
                  <span className="text-[13px] text-base-content">Class B — {summary.class_b_pct}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#bab0ac" }} />
                  <span className="text-[13px] text-base-content/60">
                    Lainnya — {(100 - summary.class_a_pct - summary.class_b_pct).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Volume daily line chart */}
          <div className="col-span-12 lg:col-span-8">
            {volumeDaily && <LineChartCard title={volumeDaily.title} data={volumeDaily.data} height={280} />}
          </div>

          {/* Donut — type composition */}
          <div className="col-span-12 lg:col-span-4">
            {donutData.length > 0 && (
              <DonutChart title="Komposisi Tipe Pesan" data={donutData} height={240} />
            )}
          </div>

          {/* Throughput per hour line chart */}
          <div className="col-span-12">
            {throughput && <LineChartCard title={throughput.title} data={throughput.data} height={220} />}
          </div>

          {/* Bar chart by type */}
          <div className="col-span-12">
            {barData.length > 0 && (
              <BarChartCard title="Volume Pesan per Tipe (30 Hari)" data={barData} color="#4e79a7" height={320} />
            )}
          </div>

          {/* Detail table */}
          {byType.length > 0 && (
            <div className="col-span-12">
              <div className="card overflow-hidden border border-base-300 bg-base-100">
                <div className="border-b border-base-300 px-5 py-3">
                  <p className="text-sm font-semibold text-base-content">Rincian per Tipe Pesan</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Tipe</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Nama</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Jumlah</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byType.map((t) => (
                        <tr key={t.msg_type} className="hover:bg-base-200">
                          <td className="w-[60px] font-mono">{t.msg_type}</td>
                          <td className="font-medium">{t.type_name ?? "—"}</td>
                          <td className="text-right font-mono">{formatNumber(t.count)}</td>
                          <td className="text-right font-semibold text-secondary">{t.pct.toFixed(2)}%</td>
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
