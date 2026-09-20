import { useState } from "react";
import { Brain, RefreshCw } from "lucide-react";
import EncountersPage from "./EncountersPage";
import LoiteringPage from "./LoiteringPage";

export default function AnalisisPerilakuPage() {
  const [tab, setTab] = useState(0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-lg font-semibold text-base-content">Analisis Perilaku</p>
        <div role="tablist" className="tabs tabs-lift tabs-sm">
          <a role="tab" className={`tab gap-1.5 ${tab === 0 ? "tab-active" : ""}`} onClick={() => setTab(0)}>
            <RefreshCw size={16} /> Pertemuan Kapal
          </a>
          <a role="tab" className={`tab gap-1.5 ${tab === 1 ? "tab-active" : ""}`} onClick={() => setTab(1)}>
            <Brain size={16} /> Loitering
          </a>
        </div>
      </div>

      {tab === 0 && <EncountersPage />}
      {tab === 1 && <LoiteringPage />}
    </div>
  );
}
