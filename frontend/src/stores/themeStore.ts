import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "../utils/constants";

function applyDataTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode === "dark" ? "maritime-dark" : "maritime");
}

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
        applyDataTheme(next);
        set({ mode: next });
      },
    }),
    {
      name: "ais-theme-mode",
      onRehydrateStorage: () => (state) => {
        applyDataTheme(state?.mode ?? "dark");
      },
    }
  )
);
