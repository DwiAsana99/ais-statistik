import { useEffect, useState, useCallback } from "react";
import { Gauge, Compass, ArrowLeftRight } from "lucide-react";
import KpiCard from "../components/cards/KpiCard";
import BarChartCard from "../components/charts/BarChartCard";
import api from "../api/client";
import { formatNumber } from "../utils/formatters";
import type { AnomalyEvent } from "../types";

const SUBTYPE_LABEL: Record<string, string> = {
  speed_change: "Perubahan Kecepatan",
  course_change: "Perubahan Arah",
  heading_cog_mismatch: "Heading vs COG",
};
const SUBTYPE_COLOR: Record<string, string> = {
  speed_change: "#e15759",
  course_change: "#f28e2b",
  heading_cog_mismatch: "#76b7b2",
};

function SubtypeChip({ subtype }: { subtype: string }) {
  const color = SUBTYPE_COLOR[subtype] ?? "var(--chart-muted)";
  return (
    <span
      className="badge badge-sm border font-semibold"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}
    >
      {SUBTYPE_LABEL[subtype] ?? subtype}
    </span>
  );
}

function evidenceDetail(e: AnomalyEvent): string {
  const ev = e.evidence;
  switch (ev.subtype) {
    case "speed_change":
      return `${ev.prev_sog_kn} → ${ev.sog_kn} kn (${ev.accel_kn_per_min} kn/mnt, Δt ${ev.dt_s}s)`;
    case "course_change":
      return `${ev.prev_cog_deg}° → ${ev.cog_deg}° (Δ${ev.dcog_deg}°, SOG ${ev.sog_kn}kn, Δt ${ev.dt_s}s)`;
    case "heading_cog_mismatch":
      return `heading ${ev.heading_deg}° vs COG ${ev.cog_deg}° (selisih ${ev.diff_deg}°, SOG ${ev.sog_kn}kn)`;
    default:
      return "—";
  }
}

export default function KinematicAnomalyPage() {
  const [items, setItems] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/events", { params: { type: "KINEMATIC_SCA", limit: 1000 } });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load A4 events:", err);
      setError("Gagal memuat kejadian anomali kinematik. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bySubtype = {
    speed_change: items.filter((e) => e.evidence.subtype === "speed_change"),
    course_change: items.filter((e) => e.evidence.subtype === "course_change"),
    heading_cog_mismatch: items.filter((e) => e.evidence.subtype === "heading_cog_mismatch"),
  };
  const chartData = [
    { label: "Perubahan Kecepatan", value: bySubtype.speed_change.length },
    { label: "Perubahan Arah", value: bySubtype.course_change.length },
    { label: "Heading vs COG", value: bySubtype.heading_cog_mismatch.length },
  ];
  const top30 = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30);

  return (
    <div>
      <p className="mb-3 text-lg font-semibold text-base-content">Anomali Kinematik</p>

      {loading ? (
        <div className="flex justify-center pt-8">
          <span className="loading loading-spinner text-secondary" />
        </div>
      ) : error ? (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="alert bg-base-200 text-base-content">
            <span>
              Deteksi A4 (SCA — Speed &amp; Course Anomaly, ANOMALY_ALGORITHM.md Bagian 5). Ambang tetap <code>[ADAPT]</code>,
              belum dikalibrasi per konteks (tipe kapal × wilayah). 3 sub-jenis: <strong>perubahan kecepatan</strong> tiba-tiba
              (&gt;5 kn/menit), <strong>perubahan arah</strong> tiba-tiba (&gt;90° dalam ≤5 menit saat SOG&gt;3kn), dan
              <strong> heading vs COG</strong> menyimpang jauh (&gt;45° saat SOG&gt;3kn). TA (putaran/U-turn) belum
              diimplementasi.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <KpiCard title="Perubahan Kecepatan" value={bySubtype.speed_change.length} icon={<Gauge size={22} />} color={SUBTYPE_COLOR.speed_change} />
            <KpiCard title="Perubahan Arah" value={bySubtype.course_change.length} icon={<Compass size={22} />} color={SUBTYPE_COLOR.course_change} />
            <KpiCard title="Heading vs COG" value={bySubtype.heading_cog_mismatch.length} icon={<ArrowLeftRight size={22} />} color={SUBTYPE_COLOR.heading_cog_mismatch} />
          </div>

          <BarChartCard title={`Distribusi Sub-jenis (n=${items.length})`} data={chartData} color="#4e79a7" height={240} />

          <div className="card overflow-hidden border border-base-300 bg-base-100">
            <div className="border-b border-base-300 px-2.5 py-1.5">
              <p className="text-sm font-semibold text-base-content">Top 30 Skor Tertinggi</p>
            </div>
            {top30.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-[13px] text-base-content/60">
                  Tidak ada kejadian anomali kinematik pada window terakhir.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Sub-jenis</th>
                      <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">MMSI</th>
                      <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Kapal</th>
                      <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Waktu</th>
                      <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top30.map((r) => (
                      <tr key={r.id} className="hover:bg-base-200">
                        <td><SubtypeChip subtype={String(r.evidence.subtype)} /></td>
                        <td className="font-mono text-base-content/60">{r.mmsi}</td>
                        <td>{r.vessel_name || "—"}</td>
                        <td>{new Date(r.t_start).toLocaleString("id-ID")}</td>
                        <td className="font-mono text-xs">{evidenceDetail(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11.5px] text-base-content/60">
            Live · {formatNumber(items.length)} kejadian tersimpan di <code>anomaly_events</code> (tipe KINEMATIC_SCA)
          </p>
        </div>
      )}
    </div>
  );
}
