import "leaflet/dist/leaflet.css";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  LayersControl,
  LayerGroup,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import api from "../../api/client";
import type { GeoJSONCollection } from "../../types";

const INDONESIA_CENTER: [number, number] = [-2.5, 118];
const DEFAULT_ZOOM = 5;

const SHIP_TYPE_COLORS: Record<string, string> = {
  Cargo: "#4e79a7",
  Tanker: "#e15759",
  Fishing: "#59a14f",
  Passenger: "#f28e2b",
  Tug: "#76b7b2",
  Sailing: "#edc948",
  Military: "#b07aa1",
  Pleasure: "#ff9da7",
  Towing: "#9c755f",
  Other: "#bab0ac",
  "Not available": "#888888",
};

function vesselColor(shipType: string | null): string {
  if (!shipType) return "#888888";
  return SHIP_TYPE_COLORS[shipType] ?? "#bab0ac";
}

interface VesselFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    mmsi: number;
    name: string | null;
    ship_type: string | null;
    nav_status: string | null;
    sog: number | null;
    cog: number | null;
    heading: number | null;
    timestamp: string | null;
  };
}

// Canvas renderer instance — shared for performance with many markers
const canvasRenderer = L.canvas({ padding: 0.5 });

function VesselLayer({ features }: { features: VesselFeature[] }) {
  return (
    <>
      {features.map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        const color = vesselColor(p.ship_type);
        return (
          <CircleMarker
            key={p.mmsi}
            center={[lat, lon]}
            radius={4}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: 0.5,
              opacity: 0.9,
              renderer: canvasRenderer,
            }}
          >
            <Popup>
              <div style={{ minWidth: 180, fontSize: 13 }}>
                <strong>{p.name || `MMSI ${p.mmsi}`}</strong>
                <br />
                <span style={{ color: "#666" }}>MMSI:</span> {p.mmsi}
                <br />
                {p.ship_type && (
                  <>
                    <span style={{ color: "#666" }}>Tipe:</span> {p.ship_type}
                    <br />
                  </>
                )}
                {p.nav_status && (
                  <>
                    <span style={{ color: "#666" }}>Status:</span> {p.nav_status}
                    <br />
                  </>
                )}
                {p.sog != null && (
                  <>
                    <span style={{ color: "#666" }}>SOG:</span> {p.sog.toFixed(1)} kn
                    {p.cog != null && <> | COG: {p.cog.toFixed(0)}°</>}
                    <br />
                  </>
                )}
                {p.timestamp && (
                  <span style={{ color: "#999", fontSize: 11 }}>
                    {new Date(p.timestamp).toLocaleString("id-ID")}
                  </span>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function HeatmapLayer({ features }: { features: VesselFeature[] }) {
  return (
    <>
      {features.map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        return (
          <CircleMarker
            key={f.properties.mmsi}
            center={[lat, lon]}
            radius={18}
            pathOptions={{
              color: "transparent",
              fillColor: "#D4930A",
              fillOpacity: 0.04,
              weight: 0,
              renderer: canvasRenderer,
            }}
          />
        );
      })}
    </>
  );
}

function StationLayer({ geojson }: { geojson: GeoJSONCollection }) {
  return (
    <>
      {geojson.features.map((f, i) => {
        const [lon, lat] = f.geometry.coordinates;
        return (
          <CircleMarker
            key={i}
            center={[lat, lon]}
            radius={7}
            pathOptions={{
              color: "#1565c0",
              fillColor: "#42a5f5",
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: 13 }}>
                <strong>AIS Base Station</strong>
                <br />
                MMSI: {f.properties.mmsi as number}
                {f.properties.last_report ? (
                  <>
                    <br />
                    <span style={{ color: "#999", fontSize: 11 }}>
                      {new Date(f.properties.last_report as string).toLocaleString("id-ID")}
                    </span>
                  </>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function AtonLayer({ geojson }: { geojson: GeoJSONCollection }) {
  return (
    <>
      {geojson.features.map((f, i) => {
        const [lon, lat] = f.geometry.coordinates;
        return (
          <CircleMarker
            key={i}
            center={[lat, lon]}
            radius={6}
            pathOptions={{
              color: "#388e3c",
              fillColor: "#66bb6a",
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: 13 }}>
                <strong>{(f.properties.name as string) || "AtoN"}</strong>
                <br />
                {f.properties.aton_type ? (
                  <>
                    <span style={{ color: "#666" }}>Tipe:</span>{" "}
                    {f.properties.aton_type as string}
                    <br />
                  </>
                ) : null}
                {f.properties.virtual ? (
                  <span style={{ color: "#999" }}>Virtual AtoN</span>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function WppLayer() {
  const [data, setData] = useState<GeoJSONCollection | null>(null);
  useEffect(() => {
    fetch("/geojson/wpp.geojson")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <GeoJSON
      data={data}
      style={{ color: "#00bcd4", weight: 1.5, fillOpacity: 0.05, fillColor: "#00bcd4" }}
      onEachFeature={(feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name as string, { permanent: false });
        }
      }}
    />
  );
}

function AlkiLayer() {
  const [data, setData] = useState<GeoJSONCollection | null>(null);
  useEffect(() => {
    fetch("/geojson/alki.geojson")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <GeoJSON
      data={data}
      style={{ color: "#ff6f00", weight: 2.5, dashArray: "8 4", fillOpacity: 0 }}
      onEachFeature={(feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name as string, { permanent: false });
        }
      }}
    />
  );
}

export default function VesselMap() {
  const [vessels, setVessels] = useState<GeoJSONCollection | null>(null);
  const [stations, setStations] = useState<GeoJSONCollection | null>(null);
  const [aton, setAton] = useState<GeoJSONCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, s, a] = await Promise.all([
        api.get("/api/maps/vessels"),
        api.get("/api/maps/base-stations"),
        api.get("/api/maps/aton"),
      ]);
      setVessels(v.data);
      setStations(s.data);
      setAton(a.data);
    } catch (err) {
      console.error("Map data load failed:", err);
      setError("Gagal memuat data peta. Periksa koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vesselFeatures = useMemo(
    () => (vessels?.features ?? []) as unknown as VesselFeature[],
    [vessels]
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="loading loading-spinner loading-lg text-secondary" />
        <p className="text-sm text-base-content/60">Memuat data peta…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="alert alert-error max-w-md">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Coba Lagi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Legend */}
      <div className="absolute right-2.5 bottom-7 z-[1000] min-w-[140px] rounded-lg border border-white/10 bg-[rgba(15,27,45,0.9)] p-3">
        <p className="mb-2 text-[11px] font-semibold text-white/70">TIPE KAPAL</p>
        {Object.entries(SHIP_TYPE_COLORS)
          .filter(([k]) => !["Not available", "Military", "Pleasure"].includes(k))
          .map(([label, color]) => (
            <div key={label} className="mb-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-white">{label}</span>
            </div>
          ))}
        <div className="mt-3 border-t border-white/10 pt-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#42a5f5]" />
            <span className="text-[11px] text-white">Stasiun</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#66bb6a]" />
            <span className="text-[11px] text-white">AtoN</span>
          </div>
        </div>
      </div>

      {/* Vessel count badge */}
      <div className="absolute top-2.5 left-2.5 z-[1000]">
        <span className="badge border border-white/10 bg-[rgba(15,27,45,0.9)] font-semibold text-secondary">
          {vesselFeatures.length.toLocaleString()} kapal
        </span>
      </div>

      <MapContainer
        center={INDONESIA_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
      >
        <LayersControl position="topright">
          {/* Base layers */}
          <LayersControl.BaseLayer name="CartoDB Dark" checked>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satelit (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>

          {/* Overlays */}
          <LayersControl.Overlay name="Kapal" checked>
            <LayerGroup>
              <VesselLayer features={vesselFeatures} />
            </LayerGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name="Heatmap Kepadatan">
            <LayerGroup>
              <HeatmapLayer features={vesselFeatures} />
            </LayerGroup>
          </LayersControl.Overlay>

          {stations && (
            <LayersControl.Overlay name="Stasiun AIS" checked>
              <LayerGroup>
                <StationLayer geojson={stations} />
              </LayerGroup>
            </LayersControl.Overlay>
          )}

          {aton && aton.features.length > 0 && (
            <LayersControl.Overlay name="AtoN" checked>
              <LayerGroup>
                <AtonLayer geojson={aton} />
              </LayerGroup>
            </LayersControl.Overlay>
          )}

          <LayersControl.Overlay name="WPP (Zona Perikanan)">
            <LayerGroup>
              <WppLayer />
            </LayerGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name="ALKI (Alur Laut)">
            <LayerGroup>
              <AlkiLayer />
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>
    </div>
  );
}
