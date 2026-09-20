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

// Colors now live in src/index.css as DaisyUI CSS-variable themes ("maritime" /
// "maritime-dark"), applied via the `data-theme` attribute (see stores/themeStore.ts).
// Components use Tailwind/DaisyUI utility classes (bg-base-100, text-base-content, etc.)
// instead of reading a JS color object.
