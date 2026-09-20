import { useEffect, useState, useCallback, useRef } from "react";
import {
  CalendarDays, TrendingUp, TrendingDown, Minus, X,
  Ship, MessageSquare, CheckCircle, CircleAlert,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import KpiCard from "../components/cards/KpiCard";
import api from "../api/client";
import type { MonthlyReport, MonthlyReportDetail } from "../types";
import { formatNumber } from "../utils/formatters";
import { CHART_DEFAULT_ACCENT } from "../utils/chartColors";

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-base-content/60">—</span>;
  const color = pct > 0 ? "#59a14f" : pct < 0 ? "#e15759" : "var(--chart-muted)";
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon size={14} style={{ color }} />
      <span className="text-xs font-semibold" style={{ color }}>
        {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
    </span>
  );
}

function DetailDialog({
  open,
  onClose,
  detail,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  detail: MonthlyReportDetail | null;
  loading: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-box max-w-3xl p-0">
        <div className="flex items-center justify-between border-b border-base-300 bg-base-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-secondary" size={20} />
            <p className="text-[15px] font-bold text-base-content">
              {detail?.month_label ?? "—"}
            </p>
          </div>
          <button className="btn btn-ghost btn-square btn-sm text-base-content/60" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="bg-base-200">
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner text-secondary" />
            </div>
          ) : detail ? (
            <>
              {/* Summary KPIs */}
              <div className="p-2.5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="text-center">
                    <p className="text-[11px] tracking-wide text-base-content/60 uppercase">Total Pesan</p>
                    <p className="font-mono text-xl font-bold text-base-content">
                      {formatNumber(detail.total_messages)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] tracking-wide text-base-content/60 uppercase">Total Kapal</p>
                    <p className="font-mono text-xl font-bold text-base-content">
                      {formatNumber(detail.total_vessels)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] tracking-wide text-base-content/60 uppercase">Hari Aktif</p>
                    <p className="text-xl font-bold text-base-content">
                      {detail.active_days}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] tracking-wide text-base-content/60 uppercase">Error Rate</p>
                    <p
                      className="text-xl font-bold"
                      style={{
                        color: detail.avg_error_rate > 5 ? "#e15759" : detail.avg_error_rate > 3 ? "#D4930A" : "#59a14f",
                      }}
                    >
                      {detail.avg_error_rate.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-base-300" />

              {/* Weekly breakdown */}
              <div className="p-2.5">
                <p className="mb-1.5 text-sm font-semibold text-base-content">
                  Breakdown per Minggu
                </p>
                {detail.weekly_breakdown.length === 0 ? (
                  <p className="text-[13px] text-base-content/60">Tidak ada data mingguan.</p>
                ) : (
                  <div className="card overflow-hidden border border-base-300 bg-base-100">
                    <div className="overflow-x-auto">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Minggu ke</th>
                            <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Pesan</th>
                            <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Kapal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.weekly_breakdown.map((w, i) => (
                            <tr key={w.week_num} className="hover:bg-base-200">
                              <td>{i + 1}</td>
                              <td className="text-right font-mono">{formatNumber(w.messages)}</td>
                              <td className="text-right font-mono">{formatNumber(w.vessels)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-base-300" />

              <div className="grid grid-cols-1 sm:grid-cols-2">
                {/* Top ship types */}
                <div className="p-2.5">
                  <p className="mb-1.5 text-sm font-semibold text-base-content">
                    Top Tipe Kapal
                  </p>
                  {detail.top_ship_types.length === 0 ? (
                    <p className="text-[13px] text-base-content/60">Tidak ada data.</p>
                  ) : (
                    detail.top_ship_types.map((t, i) => (
                      <div
                        key={t.label}
                        className="mb-1.5 flex items-center justify-between"
                      >
                        <p className="text-[13px] text-base-content">
                          <span className="mr-1 text-[11px] text-base-content/60">
                            {i + 1}.
                          </span>
                          {t.label}
                        </p>
                        <p className="font-mono text-[13px] font-semibold text-secondary">
                          {formatNumber(t.value)}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Top stations */}
                <div className="border-t border-base-300 p-2.5 sm:border-t-0 sm:border-l">
                  <p className="mb-1.5 text-sm font-semibold text-base-content">
                    Top Stasiun
                  </p>
                  {detail.top_stations.length === 0 ? (
                    <p className="text-[13px] text-base-content/60">Data stasiun tidak tersedia.</p>
                  ) : (
                    detail.top_stations.map((s, i) => (
                      <div
                        key={s.label}
                        className="mb-1.5 flex items-center justify-between"
                      >
                        <p className="text-[13px] text-base-content">
                          <span className="mr-1 text-[11px] text-base-content/60">
                            {i + 1}.
                          </span>
                          {s.label}
                        </p>
                        <p className="font-mono text-[13px] font-semibold" style={{ color: "#4e79a7" }}>
                          {formatNumber(s.value)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

export default function MonthlyReportPage() {
  const [data, setData] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<MonthlyReport | null>(null);
  const [detail, setDetail] = useState<MonthlyReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/reports/monthly");
      setData(res.data);
    } catch (err) {
      console.error("Failed to load monthly reports:", err);
      setError("Gagal memuat laporan bulanan. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (m: MonthlyReport) => {
    setSelectedMonth(m);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/reports/monthly/${m.year}/${m.month}`);
      setDetail(res.data);
    } catch (err) {
      console.error("Failed to load monthly detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedMonth(null);
    setDetail(null);
  }, []);

  const current = data[0] ?? null;
  const previous = data[1] ?? null;

  // Chart: chronological order (oldest → newest), last 12 months
  const chartData = [...data].reverse().slice(-12).map((m) => ({
    label: m.month_label,
    pesan: m.total_messages,
    kapal: m.total_vessels,
  }));

  const errorStatus = current
    ? current.avg_error_rate > 5 ? "critical" : current.avg_error_rate > 3 ? "warning" : "healthy"
    : null;
  const errorColor = errorStatus === "critical" ? "#e15759" : errorStatus === "warning" ? "#D4930A" : "#59a14f";

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        <CalendarDays className="text-secondary" size={20} />
        <p className="text-lg font-semibold text-base-content">
          Laporan Bulanan
        </p>
        {current && (
          <span className="badge badge-sm border border-secondary/40 bg-secondary/10 text-secondary">
            Terbaru: {current.month_label}
          </span>
        )}
      </div>

      {error && (
        <div className="alert alert-error mb-2.5">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center pt-10">
          <span className="loading loading-spinner text-secondary" />
        </div>
      ) : error ? null : (
        <>
          {/* KPI cards — current month vs previous */}
          <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
            <KpiCard
              title="Total Pesan (Bln Ini)"
              value={current?.total_messages ?? 0}
              subtitle={
                previous && current
                  ? `Bln lalu: ${formatNumber(previous.total_messages)}`
                  : undefined
              }
              icon={<MessageSquare size={22} />}
              color="#4e79a7"
            />
            <KpiCard
              title="Total Kapal (Bln Ini)"
              value={current?.total_vessels ?? 0}
              subtitle={
                previous && current
                  ? `Bln lalu: ${formatNumber(previous.total_vessels)}`
                  : undefined
              }
              icon={<Ship size={22} />}
              color="var(--color-secondary)"
            />
            <KpiCard
              title="Hari Aktif"
              value={current?.active_days ?? 0}
              subtitle={
                previous ? `Bln lalu: ${previous.active_days} hari` : undefined
              }
              icon={<CalendarDays size={22} />}
              color="#59a14f"
            />
            <KpiCard
              title="Error Rate (Bln Ini)"
              value={current?.avg_error_rate ?? 0}
              valueText={current ? `${current.avg_error_rate.toFixed(2)}%` : "—"}
              subtitle={
                previous ? `Bln lalu: ${previous.avg_error_rate.toFixed(2)}%` : undefined
              }
              icon={errorStatus === "healthy" ? <CheckCircle size={22} /> : <CircleAlert size={22} />}
              color={errorColor}
            />
          </div>

          {/* BarChart — message trend */}
          {chartData.length > 0 && (
            <div className="card mb-3 border border-base-300 bg-base-100 p-2.5">
              <p className="mb-2 text-sm font-semibold text-base-content">
                Tren Pesan Bulanan
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-300)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--color-base-300)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--color-base-300)" }}
                    tickLine={false}
                    tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                    width={48}
                  />
                  <ReTooltip
                    contentStyle={{
                      backgroundColor: "var(--color-base-200)",
                      border: "1px solid var(--color-base-300)",
                      borderRadius: 8,
                      color: "var(--color-base-content)",
                      fontSize: 12,
                    }}
                    formatter={(value) => [formatNumber(Number(value)), "Pesan"]}
                  />
                  <Bar dataKey="pesan" fill={CHART_DEFAULT_ACCENT} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary table */}
          <div className="card overflow-hidden border border-base-300 bg-base-100">
            <div className="border-b border-base-300 px-2.5 py-1.5">
              <p className="text-sm font-semibold text-base-content">
                Ringkasan per Bulan
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Bulan</th>
                    <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Total Pesan</th>
                    <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Total Kapal</th>
                    <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Hari Aktif</th>
                    <th className="bg-base-100 text-right text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Error Rate</th>
                    <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">vs Bln Lalu</th>
                    <th className="w-20 bg-base-100" />
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-base-content/60">Tidak ada data</td>
                    </tr>
                  ) : (
                    data.map((m) => {
                      const errColor =
                        m.avg_error_rate > 5 ? "#e15759"
                        : m.avg_error_rate > 3 ? "#D4930A"
                        : "#59a14f";
                      return (
                        <tr key={`${m.year}-${m.month}`} className="hover:bg-base-200">
                          <td className="font-medium">{m.month_label}</td>
                          <td className="text-right font-mono">
                            {formatNumber(m.total_messages)}
                          </td>
                          <td className="text-right font-mono">
                            {formatNumber(m.total_vessels)}
                          </td>
                          <td className="text-right">
                            {m.active_days}
                          </td>
                          <td className="text-right font-semibold" style={{ color: errColor }}>
                            {m.avg_error_rate.toFixed(2)}%
                          </td>
                          <td>
                            <ChangeBadge pct={m.msg_change_pct} />
                          </td>
                          <td className="p-0.5">
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => openDetail(m)}
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <DetailDialog
        open={selectedMonth !== null}
        onClose={closeDetail}
        detail={detail}
        loading={detailLoading}
      />
    </div>
  );
}
