import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { Play, Pause, RotateCcw, Route } from "lucide-react";
import api from "../../api/client";
import type { VesselListItem, VesselTrackPoint } from "../../types";

const NAV_STATUS: Record<number, string> = {
  0: "Underway (engine)",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  4: "Constrained by draught",
  5: "Moored",
  6: "Aground",
  7: "Fishing",
  8: "Underway (sailing)",
  15: "Not defined",
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FitBounds({ track }: { track: VesselTrackPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (track.length > 0) {
      const bounds = track.map((p) => [p.lat, p.lon] as [number, number]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }, [track, map]);
  return null;
}

interface Props {
  vessel: VesselListItem;
}

export default function VesselTrackViewer({ vessel }: Props) {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(toLocalInput(new Date(now.getTime() - 24 * 3600 * 1000)));
  const [dateTo, setDateTo] = useState(toLocalInput(now));

  const [track, setTrack] = useState<VesselTrackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const [sliderVal, setSliderVal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = track.length > 0 ? track[sliderVal] : null;

  const stopPlay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPlaying(false);
  }, []);

  const startPlay = useCallback(() => {
    stopPlay();
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      setSliderVal((prev) => {
        if (prev >= track.length - 1) {
          clearInterval(intervalRef.current!);
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 150);
  }, [track.length, stopPlay]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const fetchTrack = useCallback(async () => {
    stopPlay();
    setLoading(true);
    setFetched(true);
    setTrack([]);
    setSliderVal(0);
    try {
      const res = await api.get(`/api/vessels/${vessel.mmsi}/track`, {
        params: {
          date_from: new Date(dateFrom).toISOString(),
          date_to: new Date(dateTo).toISOString(),
        },
      });
      setTrack(res.data);
    } catch (err) {
      console.error("Failed to load vessel track:", err);
    } finally {
      setLoading(false);
    }
  }, [vessel, dateFrom, dateTo, stopPlay]);

  const trackPositions = track.map((p) => [p.lat, p.lon] as [number, number]);
  const defaultCenter: [number, number] = vessel.last_lat && vessel.last_lon
    ? [vessel.last_lat, vessel.last_lon]
    : [-2, 117]; // center Indonesia

  return (
    <div>
      {/* Date range + fetch */}
      <div className="flex flex-wrap items-center gap-3 rounded-t-lg border border-base-300 bg-base-100 p-4">
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
        <button className="btn btn-secondary btn-sm" onClick={fetchTrack} disabled={loading}>
          {loading ? <span className="loading loading-spinner loading-xs" /> : <Route size={16} />}
          Muat Track
        </button>
        {fetched && !loading && (
          <span className="text-xs text-base-content/60">
            {track.length === 0 ? "Tidak ada data posisi." : `${track.length} titik dimuat.`}
          </span>
        )}
        <span className="ml-auto text-[11px] text-base-content/60">Maks 48 jam · maks 2 000 titik</span>
      </div>

      {/* Map */}
      <div className="relative h-[440px] border border-t-0 border-base-300">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/40">
            <span className="loading loading-spinner loading-lg text-secondary" />
          </div>
        )}
        <MapContainer center={defaultCenter} zoom={6} style={{ width: "100%", height: "100%" }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OSM &copy; CARTO"
          />
          {track.length > 0 && (
            <>
              <FitBounds track={track} />
              <Polyline positions={trackPositions} pathOptions={{ color: "#0C7B93", weight: 2, opacity: 0.7 }} />
              <CircleMarker
                center={[track[0].lat, track[0].lon]}
                radius={7}
                pathOptions={{ color: "#2FA173", fillColor: "#2FA173", fillOpacity: 1, weight: 2 }}
              >
                <Popup>Start: {new Date(track[0].time).toLocaleString("id-ID")}</Popup>
              </CircleMarker>
              <CircleMarker
                center={[track[track.length - 1].lat, track[track.length - 1].lon]}
                radius={7}
                pathOptions={{ color: "#D9534F", fillColor: "#D9534F", fillOpacity: 1, weight: 2 }}
              >
                <Popup>End: {new Date(track[track.length - 1].time).toLocaleString("id-ID")}</Popup>
              </CircleMarker>
              {current && sliderVal > 0 && sliderVal < track.length - 1 && (
                <CircleMarker
                  center={[current.lat, current.lon]}
                  radius={9}
                  pathOptions={{ color: "#EE9B00", fillColor: "#EE9B00", fillOpacity: 1, weight: 2 }}
                >
                  <Popup>
                    {new Date(current.time).toLocaleString("id-ID")}
                    {current.sog != null ? ` · ${current.sog.toFixed(1)} kn` : ""}
                  </Popup>
                </CircleMarker>
              )}
            </>
          )}
        </MapContainer>
      </div>

      {/* Playback controls */}
      {track.length > 1 && (
        <div className="border border-t-0 border-base-300 bg-base-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSliderVal(0); stopPlay(); }}
              className="btn btn-ghost btn-square btn-sm text-base-content/60"
              title="Reset"
            >
              <RotateCcw size={16} />
            </button>
            <button onClick={playing ? stopPlay : startPlay} className="btn btn-ghost btn-square btn-sm text-secondary">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={track.length - 1}
              value={sliderVal}
              onChange={(e) => { stopPlay(); setSliderVal(Number(e.target.value)); }}
              className="range range-secondary range-sm"
            />
            <span className="min-w-[110px] shrink-0 text-right text-xs whitespace-nowrap text-base-content/60">
              {sliderVal + 1} / {track.length}
            </span>
          </div>
          {current && (
            <p className="mt-1 text-[11px] text-base-content/60">{new Date(current.time).toLocaleString("id-ID")}</p>
          )}
        </div>
      )}

      <div className="border-t border-base-300" />

      {/* Current position info */}
      {current && (
        <div className="rounded-b-lg border border-t-0 border-base-300 bg-base-100 px-4 py-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[11px] text-base-content/60">SOG</p>
              <p className="font-mono text-sm font-semibold text-base-content">
                {current.sog != null ? `${current.sog.toFixed(1)} kn` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-base-content/60">COG</p>
              <p className="font-mono text-sm font-semibold text-base-content">
                {current.cog != null ? `${current.cog.toFixed(1)}°` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-base-content/60">Heading</p>
              <p className="font-mono text-sm font-semibold text-base-content">
                {current.heading != null ? `${current.heading}°` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-base-content/60">Nav Status</p>
              <p className="text-[13px] font-semibold text-base-content">
                {current.nav_status_code != null
                  ? (NAV_STATUS[current.nav_status_code] ?? `Code ${current.nav_status_code}`)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
