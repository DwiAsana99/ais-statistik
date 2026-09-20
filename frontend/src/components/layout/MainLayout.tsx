import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useThemeStore } from "../../stores/themeStore";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, HEADER_HEIGHT } from "../../utils/constants";

const MOBILE_BREAKPOINT = "(max-width: 899px)";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_BREAKPOINT).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export default function MainLayout() {
  const isMobile = useIsMobile();
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const sidebarWidth = isMobile ? 0 : desktopExpanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <div className="flex min-h-screen bg-base-100">
      <Sidebar
        mobile={isMobile}
        open={isMobile ? mobileOpen : desktopExpanded}
        onToggle={() => (isMobile ? setMobileOpen(false) : setDesktopExpanded(!desktopExpanded))}
        onClose={() => setMobileOpen(false)}
      />
      <Header
        sidebarWidth={sidebarWidth}
        darkMode={mode === "dark"}
        onToggleTheme={toggleTheme}
        onMenuClick={isMobile ? () => setMobileOpen(!mobileOpen) : undefined}
      />
      <main
        className="min-h-screen min-w-0 flex-1 px-3 pb-6 transition-[margin-left,width] duration-200 ease-in-out sm:px-6"
        style={{
          width: `calc(100% - ${sidebarWidth}px)`,
          marginLeft: sidebarWidth,
          paddingTop: HEADER_HEIGHT + 24,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
