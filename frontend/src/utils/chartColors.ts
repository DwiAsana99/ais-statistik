// Chart color tokens for the "maritime" design system. Categorical slots and the
// single-series default read CSS custom properties defined per-theme in index.css
// (set by the dataviz skill's validate_palette.js — adjacent + circular/donut
// pairlist, CVD + contrast checks all pass) — they follow the light/dark theme
// automatically via the `data-theme` attribute, no JS branching needed.

export const CHART_CATEGORICAL = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
] as const;

export const CHART_DEFAULT_ACCENT = "var(--color-secondary)";

// Sequential (single-hue, light->dark) ramp for the traffic-density heatmap.
// Needs real interpolation math (not just a fill string), so it's plain hex per
// mode rather than a CSS var — see HeatmapChart.tsx.
export const HEATMAP_RAMP = {
  light: ["#DCF0F3", "#9FD3DB", "#4FAAB8", "#0C7B93", "#054859"],
  dark: ["#0F2A33", "#1C4A57", "#2E7E90", "#47AABD", "#7EDCEB"],
} as const;
