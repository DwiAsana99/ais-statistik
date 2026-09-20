import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Toolbar, Typography, Box, IconButton, Chip, InputBase } from "@mui/material";
import { Refresh, DarkMode, LightMode, Menu, Search } from "@mui/icons-material";
import { HEADER_HEIGHT, THEME_COLORS } from "../../utils/constants";

interface HeaderProps {
  sidebarWidth: number;
  darkMode: boolean;
  onToggleTheme: () => void;
  onMenuClick?: () => void;
}

export default function Header({ sidebarWidth, darkMode, onToggleTheme, onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    if (q) {
      navigate(`/vessels?search=${encodeURIComponent(q)}`);
      setSearchQ("");
    }
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: { xs: "100%", md: `calc(100% - ${sidebarWidth}px)` },
        ml: { xs: 0, md: `${sidebarWidth}px` },
        height: HEADER_HEIGHT,
        transition: "width 0.2s ease, margin-left 0.2s ease",
        backgroundColor: THEME_COLORS.surface,
        borderBottom: `1px solid ${THEME_COLORS.border}`,
      }}
    >
      <Toolbar sx={{ height: HEADER_HEIGHT, gap: 1 }}>
        {onMenuClick && (
          <IconButton onClick={onMenuClick} size="small" sx={{ color: THEME_COLORS.textSecondary, mr: 0.5 }}>
            <Menu fontSize="small" />
          </IconButton>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: THEME_COLORS.text,
              fontSize: { xs: 15, sm: 18 },
              whiteSpace: "nowrap",
            }}
          >
            Statistik AIS
          </Typography>
          <Chip
            label="Live"
            size="small"
            sx={{
              backgroundColor: "rgba(76, 175, 80, 0.15)",
              color: "#4caf50",
              fontWeight: 600,
              fontSize: 11,
              height: 22,
              display: { xs: "none", sm: "flex" },
            }}
          />
        </Box>

        {/* Search bar */}
        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          sx={{
            flexGrow: 1,
            mx: { xs: 0, sm: 2 },
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            backgroundColor: THEME_COLORS.surfaceLight,
            border: `1px solid ${THEME_COLORS.border}`,
            borderRadius: 1.5,
            px: 1.5,
            py: 0.5,
            maxWidth: 360,
            "&:focus-within": { borderColor: THEME_COLORS.secondary },
          }}
        >
          <Search sx={{ color: THEME_COLORS.textSecondary, fontSize: 18, mr: 1, flexShrink: 0 }} />
          <InputBase
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Cari MMSI, nama kapal..."
            sx={{
              flex: 1,
              fontSize: 13,
              color: THEME_COLORS.text,
              "& ::placeholder": { color: THEME_COLORS.textSecondary, opacity: 1 },
            }}
            inputProps={{ "aria-label": "cari kapal" }}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 0.5, ml: "auto" }}>
          <IconButton size="small" sx={{ color: THEME_COLORS.textSecondary }}>
            <Refresh fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onToggleTheme} sx={{ color: THEME_COLORS.textSecondary }}>
            {darkMode ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
