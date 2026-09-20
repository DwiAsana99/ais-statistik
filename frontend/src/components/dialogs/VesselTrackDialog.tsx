import { useEffect, useRef } from "react";
import { X, Route } from "lucide-react";
import VesselTrackViewer from "../vessel/VesselTrackViewer";
import type { VesselListItem } from "../../types";

interface Props {
  vessel: VesselListItem | null;
  open: boolean;
  onClose: () => void;
}

export default function VesselTrackDialog({ vessel, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-box max-w-4xl p-0">
        <div className="flex items-center justify-between border-b border-base-300 bg-base-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Route className="text-secondary" size={20} />
            <div>
              <p className="text-[15px] font-bold text-base-content">
                {vessel?.name || `MMSI ${vessel?.mmsi}`}
              </p>
              <p className="text-[11px] text-base-content/60">
                Track History · MMSI {vessel?.mmsi}{vessel?.ship_type_group ? ` · ${vessel.ship_type_group}` : ""}
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-square btn-sm text-base-content/60" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="bg-base-100">
          {vessel && <VesselTrackViewer key={vessel.mmsi} vessel={vessel} />}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
