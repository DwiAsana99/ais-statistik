import { useState, useCallback, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from "react-leaflet";
import { RefreshCw, X } from "lucide-react";
import api from "../api/client";
import { formatDecimal } from "../utils/formatters";
import type { EncounterSummary, EncounterDetail } from "../types";

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EncountersPage() {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600 * 1000);

  const [dateFrom, setDateFrom] = useState(toLocalInput(sixHoursAgo));
  const [dateTo, setDateTo] = useState(toLocalInput(now));
  const [distanceM, setDistanceM] = useState(500);
  const [minDuration, setMinDuration] = useState(0);

  const [items, setItems] = useState<EncounterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get("/api/encounters", {
        params: {
          date_from: new Date(dateFrom).toISOString(),
          date_to: new Date(dateTo).toISOString(),
          distance_m: distanceM,
          min_duration_minutes: minDuration,
        },
      });
      setItems(res.data.items);
    } catch (err) {
      console.error("Failed to load encounters:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, distanceM, minDuration]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/encounters/${encodeURIComponent(id)}`, {
        params: { distance_m: distanceM },
      });
      setDetail(res.data);
    } catch (err) {
      console.error("Failed to load encounter detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => setDetail(null);

  const trackCenter: [number, number] | null =
    detail && detail.track.length > 0
      ? [detail.track[Math.floor(detail.track.length / 2)].lat_a, detail.track[Math.floor(detail.track.length / 2)].lon_a]
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
      <p className="mb-5 text-lg font-semibold text-base-content">Pertemuan Kapal (Encounter)</p>

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
            <span>Jarak Maks (m)</span>
            <input
              type="number"
              className="input input-sm w-32"
              value={distanceM}
              onChange={(e) => setDistanceM(Number(e.target.value))}
            />
          </label>
          <label className="floating-label">
            <span>Durasi Min (menit)</span>
            <input
              type="number"
              className="input input-sm w-32"
              value={minDuration}
              onChange={(e) => setMinDuration(Number(e.target.value))}
            />
          </label>
          <button className="btn btn-secondary btn-sm" onClick={runSearch} disabled={loading}>
            {loading ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw size={16} />}
            Deteksi
          </button>
        </div>
        <p className="mt-3 text-[11px] text-base-content/60">
          Rentang waktu dibatasi maks 24 jam untuk menjaga performa query (ais_position tanpa partisi).
        </p>
      </div>

      <div className="card overflow-hidden border border-base-300 bg-base-100">
        <div className="max-h-[calc(100vh-420px)] overflow-auto">
          <table className="table-pin-rows table table-sm">
            <thead>
              <tr>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Kapal A</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Kapal B</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Mulai</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Durasi</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Jarak Min</th>
                <th className="bg-base-100 text-[11px] font-semibold tracking-wide text-base-content/60 uppercase">Sampel</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <span className="loading loading-spinner loading-md text-secondary" />
                  </td>
                </tr>
              ) : !searched ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-base-content/60">
                    Atur filter lalu klik "Deteksi" untuk mencari pertemuan kapal
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-base-content/60">
                    Tidak ada pertemuan kapal ditemukan pada rentang ini
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="cursor-pointer hover:bg-base-200" onClick={() => openDetail(it.id)}>
                    <td className="text-[13px]">
                      {it.name_a || `MMSI ${it.mmsi_a}`}
                      {it.ship_type_a && <span className="badge badge-sm ml-1.5">{it.ship_type_a}</span>}
                    </td>
                    <td className="text-[13px]">
                      {it.name_b || `MMSI ${it.mmsi_b}`}
                      {it.ship_type_b && <span className="badge badge-sm ml-1.5">{it.ship_type_b}</span>}
                    </td>
                    <td className="text-[13px]">{new Date(it.first_seen).toLocaleString("id-ID")}</td>
                    <td className="text-[13px]">{formatDecimal(it.duration_minutes, 1)} menit</td>
                    <td className="text-[13px]">{formatDecimal(it.min_distance_m, 0)} m</td>
                    <td className="text-[13px]">{it.sample_count}</td>
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
            <p className="text-[15px] font-bold text-base-content">Detail Pertemuan Kapal</p>
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
                  <div className="col-span-6">
                    <p className="text-[11px] text-base-content/60">KAPAL A</p>
                    <p className="font-semibold text-base-content">{detail.name_a || `MMSI ${detail.mmsi_a}`}</p>
                    <p className="text-xs text-base-content/60">
                      MMSI {detail.mmsi_a} {detail.ship_type_a && `· ${detail.ship_type_a}`}
                    </p>
                  </div>
                  <div className="col-span-6">
                    <p className="text-[11px] text-base-content/60">KAPAL B</p>
                    <p className="font-semibold text-base-content">{detail.name_b || `MMSI ${detail.mmsi_b}`}</p>
                    <p className="text-xs text-base-content/60">
                      MMSI {detail.mmsi_b} {detail.ship_type_b && `· ${detail.ship_type_b}`}
                    </p>
                  </div>
                  <div className="col-span-4">
                    <p className="text-[11px] text-base-content/60">DURASI</p>
                    <p className="font-semibold text-secondary">{formatDecimal(detail.duration_minutes, 1)} menit</p>
                  </div>
                  <div className="col-span-4">
                    <p className="text-[11px] text-base-content/60">JARAK MIN</p>
                    <p className="font-semibold text-secondary">{formatDecimal(detail.min_distance_m, 0)} m</p>
                  </div>
                  <div className="col-span-4">
                    <p className="text-[11px] text-base-content/60">SAMPEL</p>
                    <p className="font-semibold text-secondary">{detail.sample_count}</p>
                  </div>
                </div>

                {trackCenter && (
                  <div className="h-80 overflow-hidden rounded-lg border border-base-300">
                    <MapContainer center={trackCenter} zoom={11} style={{ width: "100%", height: "100%" }}>
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; OSM &copy; CARTO"
                      />
                      <Polyline
                        positions={detail.track.map((t) => [t.lat_a, t.lon_a])}
                        pathOptions={{ color: "#4e79a7", weight: 2 }}
                      />
                      <Polyline
                        positions={detail.track.map((t) => [t.lat_b, t.lon_b])}
                        pathOptions={{ color: "#e15759", weight: 2 }}
                      />
                      <CircleMarker
                        center={[detail.track[detail.track.length - 1].lat_a, detail.track[detail.track.length - 1].lon_a]}
                        radius={6}
                        pathOptions={{ color: "#4e79a7", fillColor: "#4e79a7", fillOpacity: 1 }}
                      >
                        <Popup>{detail.name_a || `MMSI ${detail.mmsi_a}`}</Popup>
                      </CircleMarker>
                      <CircleMarker
                        center={[detail.track[detail.track.length - 1].lat_b, detail.track[detail.track.length - 1].lon_b]}
                        radius={6}
                        pathOptions={{ color: "#e15759", fillColor: "#e15759", fillOpacity: 1 }}
                      >
                        <Popup>{detail.name_b || `MMSI ${detail.mmsi_b}`}</Popup>
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
