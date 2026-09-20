export type NavItem = {
  label: string;
  path: string;
  icon: string;
  disabled?: boolean;
};

export type NavGroup = {
  groupLabel?: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", path: "/", icon: "Dashboard" },
    ],
  },
  {
    groupLabel: "STATISTIK",
    items: [
      { label: "Statistik Kapal", path: "/vessels", icon: "DirectionsBoat" },
      { label: "Trafik & Tren", path: "/traffic", icon: "TrendingUp" },
      { label: "Statistik Pesan", path: "/messages", icon: "Message" },
      { label: "Performa Stasiun", path: "/stations", icon: "Router" },
      { label: "Kualitas Data", path: "/data-quality", icon: "VerifiedUser" },
    ],
  },
  {
    groupLabel: "ANALISIS & DETEKSI ANOMALI",
    items: [
      { label: "Peta", path: "/map", icon: "Map" },
      { label: "Track Kapal", path: "/map/track", icon: "Route" },
      { label: "Pertemuan Kapal", path: "/encounters", icon: "Sync" },
      { label: "Loitering", path: "/loitering", icon: "Anchor" },
      { label: "Anomali Kinematik", path: "/anomaly/kinematic", icon: "Speed" },
      { label: "Deteksi Anomali", path: "/anomaly", icon: "Rule" },
    ],
  },
  {
    groupLabel: "LAPORAN",
    items: [
      { label: "Laporan", path: "/reports", icon: "Assessment" },
      { label: "Laporan Bulanan", path: "/monthly", icon: "CalendarMonth" },
    ],
  },
  {
    groupLabel: "PENGATURAN",
    items: [
      { label: "Konfigurasi Sistem", path: "/settings", icon: "Settings", disabled: true },
    ],
  },
];

// Backward compat: all active (non-disabled) nav items as a flat array
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items.filter((i) => !i.disabled));

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_COLLAPSED_WIDTH = 72;
export const HEADER_HEIGHT = 64;

export type ThemeMode = "dark" | "light";

export const DARK_COLORS = {
  primary: "#1A4E8F",
  secondary: "#D4930A",
  background: "#0F1B2D",
  surface: "#152238",
  surfaceLight: "#1C2E4A",
  text: "#E8ECF1",
  textSecondary: "#8899AA",
  border: "#2A3F5F",
};

export const LIGHT_COLORS = {
  primary: "#1A4E8F",
  secondary: "#B8790A",
  background: "#F2F5F9",
  surface: "#FFFFFF",
  surfaceLight: "#EAEFF5",
  text: "#1A2433",
  textSecondary: "#5B6B82",
  border: "#DCE3ED",
};

// Mutable singleton — components read THEME_COLORS.x at render time.
// applyThemeColors() mutates it in place; the Outlet remount (MainLayout, key={mode})
// forces page subtrees to re-render and pick up the new values.
export const THEME_COLORS = { ...DARK_COLORS };

export function applyThemeColors(mode: ThemeMode) {
  Object.assign(THEME_COLORS, mode === "light" ? LIGHT_COLORS : DARK_COLORS);
}
