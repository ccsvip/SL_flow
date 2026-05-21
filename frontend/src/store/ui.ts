import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "auto";
export type AccentName = "blue" | "purple" | "green" | "orange" | "magenta";

export const ACCENT_PRESETS: Record<AccentName, string> = {
  blue: "#1677ff",
  purple: "#722ed1",
  green: "#13c2c2",
  orange: "#fa8c16",
  magenta: "#eb2f96",
};

interface UIState {
  mode: ThemeMode;
  accent: AccentName;
  collapsed: boolean;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentName) => void;
  toggleCollapsed: () => void;
  setCollapsed: (c: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      mode: "light",
      accent: "blue",
      collapsed: false,
      setMode: (m) => set({ mode: m }),
      setAccent: (a) => set({ accent: a }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: "slflow.ui" },
  ),
);

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
