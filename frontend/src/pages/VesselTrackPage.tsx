import { useState, useEffect, useCallback, useRef } from "react";
import { Route, Search } from "lucide-react";
import api from "../api/client";
import VesselTrackViewer from "../components/vessel/VesselTrackViewer";
import type { VesselListItem } from "../types";

export default function VesselTrackPage() {
  const [inputValue, setInputValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [options, setOptions] = useState<VesselListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [vessel, setVessel] = useState<VesselListItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(inputValue), 400);
    return () => clearTimeout(t);
  }, [inputValue]);

  const search = useCallback(async (term: string) => {
    if (!term) {
      setOptions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get("/api/vessels", { params: { search: term, page: 1, page_size: 15 } });
      setOptions(res.data.items);
    } catch (err) {
      console.error("Failed to search vessels:", err);
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { search(debounced); }, [debounced, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectVessel = (v: VesselListItem) => {
    setVessel(v);
    setInputValue(v.name || `MMSI ${v.mmsi}`);
    setShowDropdown(false);
  };

  return (
    <div>
      <p className="mb-3 text-lg font-semibold text-base-content">Track Kapal</p>

      <div className="card mb-2.5 border border-base-300 bg-base-100 p-2.5">
        <div ref={containerRef} className="relative">
          <label className="input input-sm w-full">
            <Search size={18} className="text-base-content/60" />
            <input
              type="text"
              placeholder="Cari kapal — nama, MMSI, atau call sign..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setVessel(null);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
            {searching && <span className="loading loading-spinner loading-xs text-secondary" />}
          </label>

          {showDropdown && (
            <ul className="menu absolute top-full left-0 z-20 mt-1 w-full rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
              {options.length === 0 ? (
                <li className="px-3 py-2 text-[13px] text-base-content/60">
                  {inputValue ? "Kapal tidak ditemukan" : "Ketik nama, MMSI, atau call sign kapal"}
                </li>
              ) : (
                options.map((option) => (
                  <li key={option.mmsi}>
                    <button
                      type="button"
                      className="flex items-center justify-between gap-1.5"
                      onClick={() => selectVessel(option)}
                    >
                      <span>
                        <span className="block text-[13px] font-semibold text-base-content">
                          {option.name || `MMSI ${option.mmsi}`}
                        </span>
                        <span className="block text-[11px] text-base-content/60">
                          MMSI {option.mmsi}{option.call_sign ? ` · ${option.call_sign}` : ""}
                        </span>
                      </span>
                      {option.ship_type_group && (
                        <span className="badge badge-sm">{option.ship_type_group}</span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {vessel ? (
        <VesselTrackViewer key={vessel.mmsi} vessel={vessel} />
      ) : (
        <div className="card border border-base-300 bg-base-100 p-6 text-center">
          <Route size={40} className="mx-auto mb-1 text-base-content/60 opacity-50" />
          <p className="text-[13px] text-base-content/60">
            Pilih kapal di atas untuk melihat riwayat track posisinya di peta.
          </p>
        </div>
      )}
    </div>
  );
}
