import { useState } from "react";
import { saveAs } from "file-saver";
import { Download, Table, FileSpreadsheet, FileText } from "lucide-react";
import api from "../api/client";

type ReportType = "vessels" | "encounters";
type Format = "csv" | "excel" | "pdf";

const SHIP_TYPES = [
  "Cargo", "Tanker", "Fishing", "Passenger", "Tug", "Sailing",
  "Military", "Pleasure", "Towing", "Other", "Not available",
];

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReportsPage() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

  const [reportType, setReportType] = useState<ReportType>("vessels");
  const [format, setFormat] = useState<Format>("csv");
  const [search, setSearch] = useState("");
  const [shipType, setShipType] = useState("");
  const [dateFrom, setDateFrom] = useState(toLocalInput(yesterday));
  const [dateTo, setDateTo] = useState(toLocalInput(now));
  const [distanceM, setDistanceM] = useState(500);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { format, report_type: reportType };
      if (reportType === "vessels") {
        if (search) params.search = search;
        if (shipType) params.ship_type = shipType;
      } else {
        params.date_from = new Date(dateFrom).toISOString();
        params.date_to = new Date(dateTo).toISOString();
        params.distance_m = distanceM;
      }

      const res = await api.get("/api/reports/export", { params, responseType: "blob" });

      const disposition = res.headers["content-disposition"] as string | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `${reportType}.${format === "excel" ? "xlsx" : format}`;

      saveAs(res.data as Blob, filename);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Gagal mengekspor laporan. Coba lagi atau perkecil rentang data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="mb-3 text-lg font-semibold text-base-content">Laporan</p>

      <div className="card max-w-[640px] border border-base-300 bg-base-100 p-6">
        <p className="mb-1.5 text-xs font-semibold text-base-content/60">JENIS LAPORAN</p>
        <div className="join mb-6 w-full">
          <button
            className={`btn join-item btn-sm flex-1 ${reportType === "vessels" ? "btn-secondary" : "btn-outline"}`}
            onClick={() => setReportType("vessels")}
          >
            Daftar Kapal
          </button>
          <button
            className={`btn join-item btn-sm flex-1 ${reportType === "encounters" ? "btn-secondary" : "btn-outline"}`}
            onClick={() => setReportType("encounters")}
          >
            Pertemuan Kapal
          </button>
        </div>

        {reportType === "vessels" ? (
          <div className="mb-6 grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6">
              <label className="mb-1 block text-xs text-base-content/60">Cari nama / MMSI / call sign</label>
              <input
                type="text"
                className="input input-sm w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="mb-1 block text-xs text-base-content/60">Tipe Kapal</label>
              <select
                className="select select-sm w-full"
                value={shipType}
                onChange={(e) => setShipType(e.target.value)}
              >
                <option value="">Semua</option>
                {SHIP_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="mb-6 grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6">
              <label className="mb-1 block text-xs text-base-content/60">Dari</label>
              <input
                type="datetime-local"
                className="input input-sm w-full"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="mb-1 block text-xs text-base-content/60">Sampai</label>
              <input
                type="datetime-local"
                className="input input-sm w-full"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="mb-1 block text-xs text-base-content/60">Jarak Maks (m)</label>
              <input
                type="number"
                className="input input-sm w-full"
                value={distanceM}
                onChange={(e) => setDistanceM(Number(e.target.value))}
              />
            </div>
            <div className="col-span-12">
              <p className="text-[11px] text-base-content/60">
                Rentang waktu dibatasi maks 24 jam untuk menjaga performa query.
              </p>
            </div>
          </div>
        )}

        <p className="mb-1.5 text-xs font-semibold text-base-content/60">FORMAT</p>
        <div className="join mb-6 w-full">
          <button
            className={`btn join-item btn-sm flex-1 gap-1.5 ${format === "csv" ? "btn-secondary" : "btn-outline"}`}
            onClick={() => setFormat("csv")}
          >
            <Table size={14} /> CSV
          </button>
          <button
            className={`btn join-item btn-sm flex-1 gap-1.5 ${format === "excel" ? "btn-secondary" : "btn-outline"}`}
            onClick={() => setFormat("excel")}
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button
            className={`btn join-item btn-sm flex-1 gap-1.5 ${format === "pdf" ? "btn-secondary" : "btn-outline"}`}
            onClick={() => setFormat("pdf")}
          >
            <FileText size={14} /> PDF
          </button>
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}

        <button
          className="btn btn-secondary w-full gap-2"
          onClick={handleExport}
          disabled={loading}
        >
          {loading ? <span className="loading loading-spinner loading-sm" /> : <Download size={16} />}
          {loading ? "Mengekspor..." : "Export Laporan"}
        </button>
      </div>
    </div>
  );
}
