import { useEffect, useState, useCallback } from "react";
import { ListChecks, ClipboardCheck, Zap, Ban, HelpCircle, Copy, WifiOff } from "lucide-react";
import KpiCard from "../components/cards/KpiCard";
import BarChartCard from "../components/charts/BarChartCard";
import api from "../api/client";
import { formatNumber } from "../utils/formatters";
import type { ChartDataPoint, AnomalyA0Summary, AnomalyEvent, AnomalySummary } from "../types";

const STATUS_COLOR: Record<string, string> = {
  good: "#2E8B57",
  warn: "#EE9B00",
  crit: "#E5484D",
};
const STATUS_LABEL: Record<string, string> = {
  good: "Layak",
  warn: "Perlu Perhatian",
  crit: "Terhambat Data",
};

function StatusChip({ status }: { status: "good" | "warn" | "crit" }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="badge badge-sm h-[22px] border font-semibold"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

interface ModuleRow {
  id: string;
  desc: string;
  status: "good" | "warn" | "crit";
}

const LAYER_A: ModuleRow[] = [
  { id: "A0", desc: "Kualitas & identitas — MMSI tak sah, sentinel SOG/COG. Semua kolom dasar tersedia penuh.", status: "good" },
  { id: "A1", desc: "Lompatan posisi & SOG mismatch. Live — hasil nyata di tab sebelah, tersimpan di tabel anomaly_events. Klasifikasi 3-jenis jump belum dikerjakan.", status: "warn" },
  { id: "A2", desc: "Duplikasi identitas (1 MMSI, ≥2 trek fisik tak mungkin). Live — hasil di tab sebelah, tersimpan di anomaly_events.", status: "good" },
  { id: "A3", desc: "AIS gap (\"dark activity\"). Live dengan adaptasi — kriteria jarak-ke-receiver DIHILANGKAN (2 stasiun kita tak punya koordinat), diganti proxy data-driven: kapal lain yang tetap terlihat di sel yang sama.", status: "warn" },
  { id: "A4", desc: "Anomali kinematik (SCA). Live — 3 sub-jenis (speed_change, course_change, heading_cog_mismatch), ambang tetap [ADAPT], halaman khusus \"Anomali Kinematik\" di sidebar. TA (U-turn/berputar, jendela geser) belum dikerjakan.", status: "warn" },
  { id: "A5", desc: "Loitering. Sudah live di produksi (Fase 12) — algoritma trajektori 4 jam + rule P1, tervalidasi 40 event/7 hari.", status: "good" },
  { id: "A6", desc: "Encounter/rendezvous. Sudah ada sejak Fase 6, tapi pakai ambang sendiri (500 m / 30 mnt) — belum persis definisi GFW (500 m / 2 jam / median SOG<2kn / ≥10 km dari pelabuhan).", status: "warn" },
  { id: "A7", desc: "Konsistensi status/tipe vs perilaku. nav_status_code & ship_type_code tersedia penuh.", status: "good" },
  { id: "A8", desc: "Korroborasi lompatan lintas-kapal (indikasi GNSS interference). Butuh klasifikasi 3-jenis A1 selesai dulu.", status: "warn" },
];

const LAYER_B: ModuleRow[] = [
  { id: "B1", desc: "Isolation Forest per konteks (tipe kapal × wilayah). Perlu tambah scikit-learn ke requirements.txt.", status: "good" },
  { id: "B2", desc: "Normalitas per-sel + a contrario (GeoTrackNet-lite). Perlu tambah scipy.", status: "good" },
  { id: "B3", desc: "Deep learning (GeoTrackNet / autoencoder). Ditunda — dokumen sumber menyebut \"hanya bila diminta\".", status: "warn" },
];

function ModuleTable({ title, rows }: { title: string; rows: ModuleRow[] }) {
  return (
    <div className="card overflow-hidden border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-5 py-3">
        <p className="text-sm font-semibold text-base-content">{title}</p>
      </div>
      <table className="table table-sm">
        <thead>
          <tr>
            <th className="w-14 bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Modul</th>
            <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Deskripsi</th>
            <th className="w-[150px] bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-base-200">
              <td className="font-mono font-bold">{r.id}</td>
              <td className="text-base-content/70" style={{ lineHeight: 1.5, whiteSpace: "normal" }}>{r.desc}</td>
              <td><StatusChip status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeasibilityTab() {
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[760px] text-[13px] text-base-content/60">
        Status dinilai dari kolom &amp; file yang benar-benar tersedia di database (bukan asumsi dokumen), setelah audit skema{" "}
        <code>ais_position</code>, <code>ais_vessel_static</code>, dan pengecekan <code>data/ports.csv</code> / <code>data/receivers.csv</code>.
        Peta ini adalah penilaian arsitektur — tidak berubah tiap request, beda dengan tab A0/A1 yang membaca data live.
      </p>
      <ModuleTable title="Lapisan A — aturan (interpretable)" rows={LAYER_A} />
      <ModuleTable title="Lapisan B — statistik / unsupervised" rows={LAYER_B} />
    </div>
  );
}

function A0Tab() {
  const [data, setData] = useState<AnomalyA0Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/a0-summary", { params: { lookback_days: 7 } });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load A0 summary:", err);
      setError("Gagal memuat ringkasan kualitas data. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center pt-16"><span className="loading loading-spinner text-secondary" /></div>;
  }
  if (error || !data) {
    return (
      <div className="alert alert-error">
        <span>{error ?? "Data tidak tersedia."}</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
      </div>
    );
  }

  const sogPct = data.n_points_total ? (data.n_sog_na / data.n_points_total * 100) : 0;
  const cogPct = data.n_points_total ? (data.n_cog_na / data.n_points_total * 100) : 0;
  const latlonPct = data.n_points_total ? (data.n_latlon_bad / data.n_points_total * 100) : 0;
  const activePct = data.total_mmsi_registered ? (data.n_vessels_active / data.total_mmsi_registered * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="alert bg-base-200 text-base-content">
        <span>
          Dari <strong>{formatNumber(data.total_mmsi_registered)}</strong> MMSI terdaftar, hanya{" "}
          <strong>{formatNumber(data.n_vessels_active)} ({activePct.toFixed(1)}%)</strong> yang mengirim posisi dalam{" "}
          {data.lookback_days} hari terakhir — sisanya kapal tidak aktif/registrasi lama, di luar cakupan audit ini.
        </span>
      </div>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 sm:col-span-6 md:col-span-4">
          <KpiCard title="MMSI Bukan 9-digit" value={data.mmsi_invalid_count} icon={<Ban />} color="#E5484D" />
        </div>
        <div className="col-span-12 sm:col-span-6 md:col-span-4">
          <KpiCard title="MMSI Placeholder" value={data.mmsi_placeholder_count} icon={<Ban />} color="#EE9B00" />
        </div>
        <div className="col-span-12 sm:col-span-6 md:col-span-4">
          <KpiCard title="Kapal Aktif" value={data.n_vessels_active} valueText={`${formatNumber(data.n_vessels_active)} / ${formatNumber(data.total_mmsi_registered)}`} icon={<ClipboardCheck />} color="#2E8B57" />
        </div>
        <div className="col-span-12 sm:col-span-6 md:col-span-4">
          <KpiCard title="Titik SOG Sentinel (≥102,3kn)" value={sogPct} valueText={`${sogPct.toFixed(2)}%`} icon={<HelpCircle />} color="#94D2BD" />
        </div>
        <div className="col-span-12 sm:col-span-6 md:col-span-4">
          <KpiCard title="Titik COG Sentinel (=360°)" value={cogPct} valueText={`${cogPct.toFixed(2)}%`} icon={<HelpCircle />} color="#C0508C" />
        </div>
        <div className="col-span-12 sm:col-span-6 md:col-span-4">
          <KpiCard title="Titik lat/lon Tidak Valid" value={latlonPct} valueText={`${latlonPct.toFixed(2)}%`} icon={<HelpCircle />} color="#E5484D" />
        </div>
      </div>
      <p className="text-[11.5px] text-base-content/60">
        Live · {data.lookback_days} hari terakhir · {formatNumber(data.n_points_total)} titik posisi dari kapal aktif
      </p>
    </div>
  );
}

function bucketize(values: number[], edges: number[]): ChartDataPoint[] {
  const labels = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    const fmt = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : `${n}`);
    labels.push(`${fmt(a)}–${fmt(b)}`);
  }
  const counts = new Array(edges.length - 1).fill(0);
  values.forEach((v) => {
    for (let i = 0; i < edges.length - 1; i++) {
      if (v >= edges[i] && (v < edges[i + 1] || i === edges.length - 2)) {
        counts[i]++;
        break;
      }
    }
  });
  return labels.map((label, i) => ({ label, value: counts[i] }));
}

const cellCls = "text-[13px]";
const headCellCls = "bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase";

function A1Tab() {
  const [jumps, setJumps] = useState<AnomalyEvent[]>([]);
  const [mismatches, setMismatches] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, m] = await Promise.all([
        api.get("/api/anomaly/events", { params: { type: "JUMP", limit: 1000 } }),
        api.get("/api/anomaly/events", { params: { type: "SOG_MISMATCH", limit: 1000 } }),
      ]);
      setJumps(j.data.items);
      setMismatches(m.data.items);
    } catch (err) {
      console.error("Failed to load A1 events:", err);
      setError("Gagal memuat kejadian anomali. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center pt-16"><span className="loading loading-spinner text-secondary" /></div>;
  }
  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
      </div>
    );
  }
  if (jumps.length === 0 && mismatches.length === 0) {
    return (
      <div className="alert bg-base-200 text-base-content">
        <span>
          Belum ada kejadian tersimpan di <code>anomaly_events</code>. Worker precompute berjalan tiap ~24 menit — cek lagi
          sebentar, atau pastikan worker backend sudah aktif.
        </span>
      </div>
    );
  }

  const edges = [60, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000, 4000000];
  const jumpBuckets = bucketize(jumps.map((e) => Number(e.evidence.v_imp_kn ?? e.score ?? 0)), edges);
  const mismatchEdges = [10, 15, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000, 4000000];
  const mismatchBuckets = bucketize(mismatches.map((e) => Number(e.evidence.diff_kn ?? e.score ?? 0)), mismatchEdges);

  const jumpTop10 = [...jumps].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
  const mismatchTop10 = [...mismatches].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="alert alert-warning">
        <span>
          Distribusi bimodal khas: klaster kecil (puluhan–ribuan knot, kemungkinan lompatan/error wajar) terpisah dari klaster
          ekstrem (&gt;300 ribu knot — kemungkinan satu titik koordinat korup, kandidat <code>isolated_outlier</code>). Klasifikasi
          3-jenis (<code>isolated_outlier</code> / <code>single_axis</code> / <code>persistent_shift</code>) belum dikerjakan.
        </span>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-6">
          <BarChartCard title={`Lompatan Posisi — v_imp_kn (log, n=${jumps.length})`} data={jumpBuckets} color="#D9534F" height={280} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <BarChartCard title={`SOG Mismatch — selisih kn (log, n=${mismatches.length})`} data={mismatchBuckets} color="#E08E00" height={280} />
        </div>
      </div>

      <div className="card overflow-hidden border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-5 py-3">
          <p className="text-sm font-semibold text-base-content">Top 10 Lompatan Posisi</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className={headCellCls}>MMSI</th>
                <th className={headCellCls}>Kapal</th>
                <th className={headCellCls}>Waktu</th>
                <th className={`${headCellCls} text-right`}>v_imp (kn)</th>
                <th className={`${headCellCls} text-right`}>Jarak (km)</th>
                <th className={`${headCellCls} text-right`}>Δt (s)</th>
              </tr>
            </thead>
            <tbody>
              {jumpTop10.map((r) => (
                <tr key={r.id} className="hover:bg-base-200">
                  <td className={`${cellCls} font-mono text-base-content/60`}>{r.mmsi}</td>
                  <td className={cellCls}>{r.vessel_name || "—"}</td>
                  <td className={cellCls}>{new Date(r.t_start).toLocaleString("id-ID")}</td>
                  <td className="text-right font-mono font-semibold text-[#E5484D]">{formatNumber(Number(r.evidence.v_imp_kn ?? 0))}</td>
                  <td className="text-right font-mono">{formatNumber(Number(r.evidence.dist_km ?? 0))}</td>
                  <td className="text-right font-mono">{r.evidence.dt_s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-5 py-3">
          <p className="text-sm font-semibold text-base-content">Top 10 SOG Mismatch</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className={headCellCls}>MMSI</th>
                <th className={headCellCls}>Kapal</th>
                <th className={headCellCls}>Waktu</th>
                <th className={`${headCellCls} text-right`}>SOG Lapor (kn)</th>
                <th className={`${headCellCls} text-right`}>v_imp (kn)</th>
                <th className={`${headCellCls} text-right`}>Selisih (kn)</th>
              </tr>
            </thead>
            <tbody>
              {mismatchTop10.map((r) => (
                <tr key={r.id} className="hover:bg-base-200">
                  <td className={`${cellCls} font-mono text-base-content/60`}>{r.mmsi}</td>
                  <td className={cellCls}>{r.vessel_name || "—"}</td>
                  <td className={cellCls}>{new Date(r.t_start).toLocaleString("id-ID")}</td>
                  <td className="text-right font-mono">{r.evidence.sog_kn}</td>
                  <td className="text-right font-mono">{formatNumber(Number(r.evidence.v_imp_kn ?? 0))}</td>
                  <td className="text-right font-mono font-semibold text-[#E08E00]">{formatNumber(Number(r.evidence.diff_kn ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function A2Tab() {
  const [items, setItems] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/events", { params: { type: "MMSI_DUPLICATE", limit: 200 } });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load A2 events:", err);
      setError("Gagal memuat kejadian duplikasi MMSI.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center pt-16"><span className="loading loading-spinner text-secondary" /></div>;
  }
  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="alert bg-base-200 text-base-content">
        <span>
          Metode Global Fishing Watch: pesan satu MMSI dikelompokkan jadi &ge;1 "trek" berdasar kecepatan tersirat yang wajar
          (&le;60 kn) antar pesan berurutan. MMSI ditandai duplikat bila &ge;2 trek besar (&ge;5 pesan) tumpang-tindih waktu
          &ge;0,5 jam — artinya satu MMSI dipakai &ge;2 entitas fisik sekaligus. <strong>Keterbatasan</strong>: tidak bisa
          memisahkan kapal ber-MMSI sama yang posisinya berdekatan.
        </span>
      </div>
      <div className="card overflow-hidden border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-5 py-3">
          <p className="text-sm font-semibold text-base-content">
            Kandidat Duplikasi MMSI {items.length > 0 && `(${items.length})`}
          </p>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[13px] text-base-content/60">Tidak ada kandidat duplikasi MMSI ditemukan pada window terakhir.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className={headCellCls}>MMSI</th>
                  <th className={headCellCls}>Kapal</th>
                  <th className={`${headCellCls} text-right`}>Jumlah Trek</th>
                  <th className={headCellCls}>Ukuran Trek</th>
                  <th className={`${headCellCls} text-right`}>Overlap (jam)</th>
                  <th className={headCellCls}>Rentang Waktu</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-base-200">
                    <td className={`${cellCls} font-mono text-base-content/60`}>{r.mmsi}</td>
                    <td className={cellCls}>{r.vessel_name || "—"}</td>
                    <td className="text-right font-semibold text-[#E5484D]">{r.evidence.n_tracks}</td>
                    <td className={`${cellCls} font-mono`}>{JSON.stringify(r.evidence.track_sizes)}</td>
                    <td className="text-right font-mono">{r.evidence.max_overlap_h}</td>
                    <td className={cellCls}>
                      {new Date(r.t_start).toLocaleString("id-ID")} &ndash; {r.t_end ? new Date(r.t_end).toLocaleString("id-ID") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function A3Tab() {
  const [items, setItems] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/anomaly/events", { params: { type: "AIS_GAP", limit: 500 } });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load A3 events:", err);
      setError("Gagal memuat kejadian AIS gap.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center pt-16"><span className="loading loading-spinner text-secondary" /></div>;
  }
  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
      </div>
    );
  }

  const intentional = items.filter((r) => r.evidence.likely_intentional);
  const sorted = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30);

  return (
    <div className="flex flex-col gap-5">
      <div className="alert alert-warning">
        <span>
          <strong>Adaptasi dari dokumen sumber</strong>: kriteria asli "jarak ke receiver terdekat" dihilangkan (2 stasiun kita
          tidak punya koordinat). Sebagai gantinya, "Kandidat Sengaja" = kapal lain tetap terlihat di sel 0,1° yang sama
          sebelum &amp; selama gap (area tetap tercakup, bukan receiver padam) — proxy data-driven, belum tervalidasi
          seakurat kriteria asli.
        </span>
      </div>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 sm:col-span-6">
          <KpiCard title="Total Gap Terdeteksi" value={items.length} icon={<Zap />} color="#94D2BD" />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <KpiCard title="Kandidat Sengaja" value={intentional.length} valueText={`${intentional.length} / ${items.length}`} icon={<Ban />} color="#E5484D" />
        </div>
      </div>
      <div className="card overflow-hidden border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-5 py-3">
          <p className="text-sm font-semibold text-base-content">Gap Terpanjang (top 30)</p>
        </div>
        {sorted.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[13px] text-base-content/60">Tidak ada gap ditemukan pada window terakhir.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className={headCellCls}>MMSI</th>
                  <th className={headCellCls}>Kapal</th>
                  <th className={headCellCls}>Mulai Gap</th>
                  <th className={`${headCellCls} text-right`}>Durasi (jam)</th>
                  <th className={`${headCellCls} text-right`}>Perpindahan (km)</th>
                  <th className={headCellCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="hover:bg-base-200">
                    <td className={`${cellCls} font-mono text-base-content/60`}>{r.mmsi}</td>
                    <td className={cellCls}>{r.vessel_name || "—"}</td>
                    <td className={cellCls}>{new Date(r.t_start).toLocaleString("id-ID")}</td>
                    <td className="text-right font-mono font-semibold">{r.evidence.gap_h}</td>
                    <td className="text-right font-mono">{r.evidence.disp_km}</td>
                    <td>
                      {r.evidence.likely_intentional ? (
                        <span className="badge badge-sm border border-[#E5484D]/40 bg-[#E5484D]/15 font-semibold text-[#E5484D]">
                          Kandidat Sengaja
                        </span>
                      ) : (
                        <span className="badge badge-sm border border-[#2E8B57]/40 bg-[#2E8B57]/15 font-semibold text-[#2E8B57]">
                          Kemungkinan Wajar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnomalyPage() {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);

  useEffect(() => {
    api.get("/api/anomaly/summary").then((res) => setSummary(res.data)).catch(() => {});
  }, []);

  const tabs = [
    { icon: ListChecks, label: "Kelayakan Modul" },
    { icon: ClipboardCheck, label: "A0 · Kualitas Data" },
    { icon: Zap, label: "A1 · Lompatan Posisi" },
    { icon: Copy, label: "A2 · Duplikasi MMSI" },
    { icon: WifiOff, label: "A3 · AIS Gap" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <p className="text-lg font-semibold text-base-content">Deteksi Anomali</p>
          {summary && (
            <span className="badge badge-sm bg-secondary/20 font-semibold text-secondary">
              {formatNumber(summary.total_events)} kejadian tersimpan
            </span>
          )}
        </div>
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

      {tab === 0 && <FeasibilityTab />}
      {tab === 1 && <A0Tab />}
      {tab === 2 && <A1Tab />}
      {tab === 3 && <A2Tab />}
      {tab === 4 && <A3Tab />}
    </div>
  );
}
