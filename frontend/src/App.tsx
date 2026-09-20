import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme, CircularProgress, Box } from "@mui/material";
import MainLayout from "./components/layout/MainLayout";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { useThemeStore } from "./stores/themeStore";
import { DARK_COLORS, LIGHT_COLORS } from "./utils/constants";

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

function buildTheme(mode: "dark" | "light") {
  const colors = mode === "dark" ? DARK_COLORS : LIGHT_COLORS;
  return createTheme({
    palette: {
      mode,
      primary: { main: colors.primary },
      secondary: { main: colors.secondary },
      background: {
        default: colors.background,
        paper: colors.surface,
      },
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    },
  });
}

function PageFallback() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
      <CircularProgress size={28} sx={{ color: "#D4930A" }} />
    </Box>
  );
}

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  const theme = buildTheme(mode);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
    </ThemeProvider>
  );
}
