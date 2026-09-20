import VesselMap from "../components/maps/VesselMap";
import { HEADER_HEIGHT } from "../utils/constants";

export default function MapPage() {
  return (
    <div className="flex flex-col" style={{ height: `calc(100vh - ${HEADER_HEIGHT}px - 32px)` }}>
      <p className="mb-2 shrink-0 text-lg font-semibold text-base-content">Peta Sebaran Kapal</p>
      <div className="flex-1 overflow-hidden rounded-lg border border-base-300">
        <VesselMap />
      </div>
    </div>
  );
}
