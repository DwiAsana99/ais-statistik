import { useState, useCallback, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Brain, X } from "lucide-react";
import api from "../api/client";
import { formatDecimal } from "../utils/formatters";
import type { LoiteringEvent, LoiteringDetail } from "../types";

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LoiteringPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [dateFrom, setDateFrom] = useState(toLocalInput(sevenDaysAgo));
  const [dateTo, setDateTo] = useState(toLocalInput(now));
  const [avgSogLt, setAvgSogLt] = useState(2.0);
  const [durationHGt, setDurationHGt] = useState(2.0);
  const [distPortKmGt, setDistPortKmGt] = useState(37.04);

  const [items, setItems] = useState<LoiteringEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [detail, setDetail] = useState<LoiteringDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get("/api/behavior/loitering", {
        params: {
          date_from: new Date(dateFrom).toISOString(),
          date_to: new Date(dateTo).toISOString(),
          avg_sog_kn_lt: avgSogLt,
          duration_h_gt: durationHGt,
          avg_dist_port_km_gt: distPortKmGt,
        },
      });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load loitering events:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, avgSogLt, durationHGt, distPortKmGt]);

  const openDetail = async (event: LoiteringEvent) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get(`/api/behavior/loitering/${encodeURIComponent(event.id)}`);
      setDetail(res.data);
    } catch (err) {
      console.error("Failed to load loitering detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => setDetail(null);

  const mapCenter: [number, number] | null =
    detail && detail.track.length > 0
      ? [detail.centroid_lat, detail.centroid_lon]
      : null;

  const dialogOpen = !!detail || detailLoading;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (dialogOpen && !el.open) el.showModal();
    if (!dialogOpen && el.open) el.close();
  }, [dialogOpen]);

  return (
    <div>
      <p className="mb-5 text-lg font-semibold text-base-content">Deteksi Loitering</p>

      <div className="card mb-5 border border-base-300 bg-base-100 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="floating-label">
            <span>Dari</span>
            <input
              type="datetime-local"
              className="input input-sm min-w-[200px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="floating-label">
            <span>Sampai</span>
            <input
              type="datetime-local"
              className="input input-sm min-w-[200px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="floating-label">
            <span>Avg SOG Maks (knot)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              max={10}
              className="input input-sm w-36"
              value={avgSogLt}
              onChange={(e) => setAvgSogLt(Number(e.target.value))}
            />
          </label>
          <label className="floating-label">
            <span>Durasi Min (jam)</span>
            <input
              type="number"
              min={0.1}
              step={0.5}
              className="input input-sm w-32"
              value={durationHGt}
              onChange={(e) => setDurationHGt(Number(e.target.value))}
            />
          </label>
          <label className="floating-label">
            <span>Jarak Pelabuhan Min (km)</span>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              className="input input-sm w-36"
              value={distPortKmGt}
              onChange={(e) => setDistPortKmGt(Number(e.target.value))}
            />
          </label>
          <button className="btn btn-secondary btn-sm" onClick={runSearch} disabled={loading}>
            {loading ? <span className="loading loading-spinner loading-xs" /> : <Brain size={16} />}
            Deteksi
          </button>
        </div>
        <p className="mt-3 text-[11px] text-base-content/60">
          Rentang waktu maks 30 hari. Algoritma: ekstraksi trajektori per kapal (jeda &gt; 4 jam = trajektori baru),
          dilabeli loitering bila rata-rata SOG &amp; durasi &amp; jarak ke pelabuhan terdekat melewati ambang di atas.
        </p>
      </div>

      <div className="card overflow-hidden border border-base-300 bg-base-100">
        <div className="max-h-[calc(100vh-440px)] overflow-auto">
          <table className="table-pin-rows table table-sm">
            <thead>
              <tr>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Kapal</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Tipe</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Mulai</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Durasi</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Avg SOG</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Titik</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Jarak Pelabuhan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <span className="loading loading-spinner loading-md text-secondary" />
                  </td>
                </tr>
              ) : !searched ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-base-content/60">
                    Atur filter lalu klik "Deteksi" untuk mencari loitering
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-base-content/60">
                    Tidak ada loitering ditemukan pada rentang ini
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="cursor-pointer hover:bg-base-200" onClick={() => openDetail(it)}>
                    <td className="text-[13px]">{it.vessel_name || `MMSI ${it.mmsi}`}</td>
                    <td className="text-[13px]">
                      {it.ship_type
                        ? <span className="badge badge-sm">{it.ship_type}</span>
                        : <span className="text-xs text-base-content/60">—</span>}
                    </td>
                    <td className="text-[13px]">{new Date(it.start_time).toLocaleString("id-ID")}</td>
                    <td className="text-[13px] font-semibold text-secondary">
                      {formatDecimal(it.duration_minutes, 1)} mnt
                    </td>
                    <td className="text-[13px]">{it.avg_sog.toFixed(3)} kn</td>
                    <td className="text-[13px]">{it.point_count}</td>
                    <td className="text-[13px] text-base-content/60">
                      {it.avg_dist_port_km.toFixed(1)} km
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <dialog ref={dialogRef} className="modal" onCancel={closeDetail}>
        <div className="modal-box max-w-3xl p-0">
          <div className="flex items-center justify-between border-b border-base-300 bg-base-100 px-4 py-3">
            <p className="text-[15px] font-bold text-base-content">Detail Loitering</p>
            <button className="btn btn-ghost btn-square btn-sm text-base-content/60" onClick={closeDetail}>
              <X size={16} />
            </button>
          </div>

          <div className="bg-base-100">
            {detailLoading ? (
              <div className="flex justify-center py-16">
                <span className="loading loading-spinner text-secondary" />
              </div>
            ) : detail ? (
              <div className="p-5">
                <div className="mb-4 grid grid-cols-12 gap-4">
                  <div className="col-span-12 sm:col-span-6">
                    <p className="text-[11px] text-base-content/60">KAPAL</p>
                    <p className="font-semibold text-base-content">{detail.vessel_name || `MMSI ${detail.mmsi}`}</p>
                    <p className="text-xs text-base-content/60">
                      MMSI {detail.mmsi}{detail.ship_type ? ` · ${detail.ship_type}` : ""}
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="text-[11px] text-base-content/60">DURASI</p>
                    <p className="font-semibold text-secondary">{formatDecimal(detail.duration_minutes, 1)} menit</p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="text-[11px] text-base-content/60">AVG SOG</p>
                    <p className="font-semibold text-secondary">{detail.avg_sog.toFixed(3)} kn</p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="text-[11px] text-base-content/60">MULAI</p>
                    <p className="text-[13px] text-base-content">{new Date(detail.start_time).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="text-[11px] text-base-content/60">SELESAI</p>
                    <p className="text-[13px] text-base-content">{new Date(detail.end_time).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="text-[11px] text-base-content/60">TITIK DATA</p>
                    <p className="font-semibold text-base-content">{detail.point_count}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="text-[11px] text-base-content/60">JARAK PELABUHAN</p>
                    <p className="font-semibold text-base-content">{detail.avg_dist_port_km.toFixed(1)} km</p>
                  </div>
                </div>

                {mapCenter && (
                  <div className="h-80 overflow-hidden rounded-lg border border-base-300">
                    <MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }}>
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; OSM &copy; CARTO"
                      />
                      {detail.track.map((pt, i) => (
                        <CircleMarker
                          key={i}
                          center={[pt.lat, pt.lon]}
                          radius={4}
                          pathOptions={{
                            color: "#D4930A",
                            fillColor: "#D4930A",
                            fillOpacity: 0.6 + (i / detail.track.length) * 0.4,
                            weight: 1,
                          }}
                        >
                          <Popup>
                            {new Date(pt.time).toLocaleTimeString("id-ID")} · {pt.sog.toFixed(3)} kn
                          </Popup>
                        </CircleMarker>
                      ))}
                      <CircleMarker
                        center={mapCenter}
                        radius={8}
                        pathOptions={{ color: "#e15759", fillColor: "#e15759", fillOpacity: 1, weight: 2 }}
                      >
                        <Popup>Centroid loitering</Popup>
                      </CircleMarker>
                    </MapContainer>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeDetail}>close</button>
        </form>
      </dialog>
    </div>
  );
}
