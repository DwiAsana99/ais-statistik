import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { useThemeStore } from "./stores/themeStore";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const VesselStatsPage = lazy(() => import("./pages/VesselStatsPage"));
const TrafficPage = lazy(() => import("./pages/TrafficPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const VesselTrackPage = lazy(() => import("./pages/VesselTrackPage"));
const EncountersPage = lazy(() => import("./pages/EncountersPage"));
const LoiteringPage = lazy(() => import("./pages/LoiteringPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const MessageStatsPage = lazy(() => import("./pages/MessageStatsPage"));
const StationPerformancePage = lazy(() => import("./pages/StationPerformancePage"));
const DataQualityPage = lazy(() => import("./pages/DataQualityPage"));
const AnalisisPerilakuPage = lazy(() => import("./pages/AnalisisPerilakuPage"));
const MonthlyReportPage = lazy(() => import("./pages/MonthlyReportPage"));
const AnomalyPage = lazy(() => import("./pages/AnomalyPage"));
const KinematicAnomalyPage = lazy(() => import("./pages/KinematicAnomalyPage"));

function PageFallback() {
  return (
    <div className="flex justify-center pt-24">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}

export default function App() {
  const mode = useThemeStore((s) => s.mode);

  // Belt-and-suspenders: themeStore's onRehydrateStorage already sets data-theme,
  // but this covers the very first render before persist middleware finishes hydrating.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode === "dark" ? "maritime-dark" : "maritime");
  }, [mode]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/vessels" element={<VesselStatsPage />} />
              <Route path="/traffic" element={<TrafficPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/map/track" element={<VesselTrackPage />} />
              <Route path="/encounters" element={<EncountersPage />} />
              <Route path="/loitering" element={<LoiteringPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/messages" element={<MessageStatsPage />} />
              <Route path="/stations" element={<StationPerformancePage />} />
              <Route path="/data-quality" element={<DataQualityPage />} />
              <Route path="/behavior" element={<AnalisisPerilakuPage />} />
              <Route path="/monthly" element={<MonthlyReportPage />} />
              <Route path="/anomaly" element={<AnomalyPage />} />
              <Route path="/anomaly/kinematic" element={<KinematicAnomalyPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
