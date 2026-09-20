import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Bug, Copy, Ban } from "lucide-react";
import KpiCard from "../components/cards/KpiCard";
import DonutChart from "../components/charts/DonutChart";
import LineChartCard from "../components/charts/LineChartCard";
import api from "../api/client";
import type { QualitySummary, QualityByStation, DistributionResponse, TrendResponse } from "../types";
import { formatNumber } from "../utils/formatters";

const SEVERITY_COLOR: Record<string, string> = {
  ok:       "#59a14f",
  warning:  "#D4930A",
  critical: "#e15759",
};

const STATUS_COLOR: Record<string, string> = {
  healthy:  "#59a14f",
  warning:  "#D4930A",
  critical: "#e15759",
};

const STATUS_LABEL: Record<string, string> = {
  healthy:  "Sehat",
  warning:  "Perlu Perhatian",
  critical: "Kritis",
};

function SeverityChip({ severity }: { severity: string }) {
  const label = severity === "ok" ? "OK" : severity === "warning" ? "Warning" : "Kritis";
  const color = SEVERITY_COLOR[severity] ?? "#8899AA";
  return (
    <span
      className="badge badge-sm h-[22px] border font-semibold"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}
    >
      {label}
    </span>
  );
}

export default function DataQualityPage() {
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [byStation, setByStation] = useState<QualityByStation[]>([]);
  const [byType, setByType] = useState<DistributionResponse | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, bs, bt, tr] = await Promise.allSettled([
        api.get("/api/quality/summary"),
        api.get("/api/quality/by-station"),
        api.get("/api/quality/by-type"),
        api.get("/api/quality/trend"),
      ]);
      if (s.status === "fulfilled") setSummary(s.value.data);
      else console.error("quality/summary failed:", s.reason);
      if (bs.status === "fulfilled") setByStation(bs.value.data);
      else console.error("quality/by-station failed:", bs.reason);
      if (bt.status === "fulfilled") setByType(bt.value.data);
      else console.error("quality/by-type failed:", bt.reason);
      if (tr.status === "fulfilled") setTrend(tr.value.data);
      else console.error("quality/trend failed:", tr.reason);

      // Show error only if ALL failed
      if ([s, bs, bt, tr].every((r) => r.status === "rejected")) {
        setError("Gagal memuat data kualitas. Periksa koneksi ke server.");
      }
    } catch (err) {
      console.error("Failed to load data quality:", err);
      setError("Gagal memuat data kualitas. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusColor = summary ? STATUS_COLOR[summary.status] : "#8899AA";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="text-lg font-semibold text-base-content">Kualitas Data</p>
        {summary && (
          <span
            className="badge badge-sm border font-bold"
            style={{ backgroundColor: `${statusColor}22`, color: statusColor, borderColor: `${statusColor}55` }}
          >
            {STATUS_LABEL[summary.status]}
          </span>
        )}
      </div>

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
              title="Error Rate Global"
              value={summary?.error_rate_pct ?? 0}
              valueText={summary ? `${summary.error_rate_pct.toFixed(3)}%` : "—"}
              icon={<ShieldCheck />}
              color={statusColor}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Parse Gagal"
              value={summary?.parse_error_count ?? 0}
              icon={<Bug />}
              color="#e15759"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="Duplikat"
              value={summary?.duplicate_count ?? 0}
              icon={<Copy />}
              color="#f28e2b"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <KpiCard
              title="MMSI Invalid"
              value={summary?.invalid_mmsi_count ?? 0}
              icon={<Ban />}
              color="#b07aa1"
            />
          </div>

          {/* Context line */}
          {summary && (
            <div className="col-span-12">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-base-300 bg-base-200 px-5 py-2.5">
                <span className="text-[13px] text-base-content/60">Hari ini:</span>
                <span className="text-[13px] text-base-content">
                  <strong>{formatNumber(summary.total_errors)}</strong> error dari{" "}
                  <strong>{formatNumber(summary.total_messages)}</strong> pesan
                </span>
              </div>
            </div>
          )}

          {/* Trend line + Donut */}
          <div className="col-span-12 lg:col-span-8">
            {trend && <LineChartCard title={trend.title} data={trend.data} height={280} />}
          </div>
          <div className="col-span-12 lg:col-span-4">
            {byType && byType.data.length > 0 && (
              <DonutChart title={byType.title} data={byType.data} height={240} />
            )}
          </div>

          {/* By-station table */}
          {byStation.length > 0 && (
            <div className="col-span-12">
              <div className="card overflow-hidden border border-base-300 bg-base-100">
                <div className="border-b border-base-300 px-5 py-3">
                  <p className="text-sm font-semibold text-base-content">
                    Error Rate per Stasiun (7 Hari)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th className="w-10 bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">#</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Stasiun</th>
                        <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Severity</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Error</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Total Pesan</th>
                        <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Error Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byStation.map((s, i) => (
                        <tr
                          key={s.station_id}
                          className="hover:bg-base-200"
                          style={{
                            backgroundColor:
                              s.severity === "critical"
                                ? `${SEVERITY_COLOR.critical}0A`
                                : s.severity === "warning"
                                ? `${SEVERITY_COLOR.warning}0A`
                                : "transparent",
                          }}
                        >
                          <td className="text-base-content/60">{i + 1}</td>
                          <td className="font-mono font-medium">{s.station_id}</td>
                          <td><SeverityChip severity={s.severity} /></td>
                          <td className="text-right font-mono">{formatNumber(s.error_count)}</td>
                          <td className="text-right font-mono">{formatNumber(s.total_count)}</td>
                          <td
                            className="text-right font-mono font-bold"
                            style={{ color: SEVERITY_COLOR[s.severity] ?? undefined }}
                          >
                            {s.error_rate_pct.toFixed(3)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {byStation.length === 0 && !loading && (
            <div className="col-span-12">
              <div className="card border border-base-300 bg-base-100 p-6 text-center">
                <p className="text-[13px] text-base-content/60">
                  Data per-stasiun tidak tersedia — kolom station_id mungkin tidak ada di tabel ais_errors.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
