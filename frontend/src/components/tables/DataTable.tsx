import { useState, useEffect, useCallback } from "react";
import { Search, Route, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import api from "../../api/client";
import { formatNumber, truncate } from "../../utils/formatters";
import type { VesselListItem, PaginatedResponse } from "../../types";

const NAV_STATUS_COLORS: Record<string, string> = {
  "Under way using engine": "#4caf50",
  "At anchor": "#ff9800",
  "Moored": "#2196f3",
  "Under way sailing": "#00bcd4",
  "Engaged in fishing": "#e91e63",
  "Not defined": "#9e9e9e",
  "Aground": "#f44336",
};

const SHIP_TYPES = [
  "Cargo", "Tanker", "Fishing", "Passenger", "Tug", "Sailing",
  "Military", "Pleasure", "Towing", "Other", "Not available",
];

type SortField = "name" | "mmsi" | "ship_type" | "length" | "last_update";

interface DataTableProps {
  initialSearch?: string;
  onTrackView?: (vessel: VesselListItem) => void;
}

export default function DataTable({ initialSearch = "", onTrackView }: DataTableProps) {
  const [data, setData] = useState<PaginatedResponse<VesselListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [search, setSearch] = useState(initialSearch);
  const [shipType, setShipType] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: page + 1,
        page_size: rowsPerPage,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (searchDebounced) params.search = searchDebounced;
      if (shipType) params.ship_type = shipType;

      const res = await api.get("/api/vessels", { params });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load vessels:", err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchDebounced, shipType, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [searchDebounced, shipType]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const sortTh = (field: SortField, label: string) => {
    const active = sortBy === field;
    return (
      <th
        className="cursor-pointer bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase select-none"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {label}
          {active && (sortOrder === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </span>
      </th>
    );
  };

  const total = data?.total ?? 0;
  const rangeStart = total === 0 ? 0 : page * rowsPerPage + 1;
  const rangeEnd = Math.min((page + 1) * rowsPerPage, total);
  const colSpan = onTrackView ? 11 : 10;

  return (
    <div className="card overflow-hidden border border-base-300 bg-base-100">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <label className="input input-sm w-[300px]">
          <Search size={18} className="text-base-content/60" />
          <input
            type="text"
            placeholder="Cari nama, MMSI, call sign..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="select select-sm w-40"
          value={shipType}
          onChange={(e) => setShipType(e.target.value)}
        >
          <option value="">Semua tipe</option>
          {SHIP_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="grow" />
        {data && (
          <span className="text-xs text-base-content/60">{formatNumber(data.total)} kapal ditemukan</span>
        )}
      </div>

      <div className="max-h-[calc(100vh-380px)] overflow-auto">
        <table className="table-pin-rows table table-sm">
          <thead>
            <tr>
              {sortTh("mmsi", "MMSI")}
              {sortTh("name", "Nama Kapal")}
              <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Call Sign</th>
              <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">IMO</th>
              {sortTh("ship_type", "Tipe")}
              {sortTh("length", "LOA (m)")}
              <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Lebar (m)</th>
              <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Status</th>
              <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">SOG (kn)</th>
              <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Tujuan</th>
              {onTrackView && <th className="w-12 bg-base-100" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="py-12 text-center">
                  <span className="loading loading-spinner loading-md text-secondary" />
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-8 text-center text-base-content/60">Tidak ada data</td>
              </tr>
            ) : (
              data?.items.map((v) => (
                <tr key={v.mmsi} className="hover:bg-base-200">
                  <td className="font-mono text-[13px]">{v.mmsi}</td>
                  <td className="font-medium">{v.name || "-"}</td>
                  <td>{v.call_sign || "-"}</td>
                  <td>{v.imo || "-"}</td>
                  <td>
                    {v.ship_type_group ? (
                      <span className="badge badge-sm bg-primary/20 text-base-content">{v.ship_type_group}</span>
                    ) : "-"}
                  </td>
                  <td>{v.length_m ?? "-"}</td>
                  <td>{v.width_m ?? "-"}</td>
                  <td>
                    {v.last_nav_status ? (
                      <span
                        className="badge badge-sm border"
                        style={{
                          backgroundColor: `${NAV_STATUS_COLORS[v.last_nav_status] || "#666"}25`,
                          color: NAV_STATUS_COLORS[v.last_nav_status] || "var(--chart-muted)",
                          borderColor: `${NAV_STATUS_COLORS[v.last_nav_status] || "#666"}40`,
                        }}
                      >
                        {v.last_nav_status}
                      </span>
                    ) : "-"}
                  </td>
                  <td>{v.last_sog != null ? v.last_sog.toFixed(1) : "-"}</td>
                  <td>{truncate(v.destination, 20)}</td>
                  {onTrackView && (
                    <td className="p-0.5">
                      <button
                        className="tooltip btn btn-ghost btn-square btn-xs text-secondary opacity-70 hover:opacity-100"
                        data-tip="Lihat Track"
                        onClick={(e) => { e.stopPropagation(); onTrackView(v); }}
                      >
                        <Route size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && total > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-base-300 px-4 py-2">
          <span className="text-xs text-base-content/60">Baris/halaman:</span>
          <select
            className="select select-xs w-16"
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          >
            {[10, 15, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-base-content/60">{rangeStart}–{rangeEnd} dari {formatNumber(total)}</span>
          <div className="join">
            <button
              className="btn join-item btn-xs"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="btn join-item btn-xs"
              disabled={rangeEnd >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
