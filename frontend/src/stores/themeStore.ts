import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyThemeColors, type ThemeMode } from "../utils/constants";

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      toggle: () => {
        const next: ThemeMode = get().mode === "dark" ? "light" : "dark";
        applyThemeColors(next);
        set({ mode: next });
      },
    }),
    {
      name: "ais-theme-mode",
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeColors(state.mode);
      },
    }
  )
);
