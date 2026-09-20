import { useState } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useThemeStore } from "../../stores/themeStore";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, HEADER_HEIGHT, THEME_COLORS } from "../../utils/constants";

export default function MainLayout() {
  const isMobile = useMediaQuery(useTheme().breakpoints.down("md"));
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const sidebarWidth = isMobile ? 0 : desktopExpanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", backgroundColor: THEME_COLORS.background }}>
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
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: "100%", md: `calc(100% - ${sidebarWidth}px)` },
          pt: `${HEADER_HEIGHT + 24}px`,
          px: { xs: 1.5, sm: 3 },
          pb: 3,
          minHeight: "100vh",
          minWidth: 0,
          transition: "margin-left 0.2s ease, width 0.2s ease",
        }}
      >
        <Box key={mode}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
