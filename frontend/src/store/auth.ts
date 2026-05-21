import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/api/types";
import { auth } from "@/api/client";

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      hydrated: false,
      setAuth: (token, user) => {
        localStorage.setItem("slflow.token", token);
        set({ token, user, hydrated: true });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        localStorage.removeItem("slflow.token");
        set({ token: null, user: null });
      },
      bootstrap: async () => {
        const { token } = get();
        if (!token) {
          set({ hydrated: true });
          return;
        }
        try {
          const me = await auth.me();
          set({ user: me, hydrated: true });
        } catch {
          set({ token: null, user: null, hydrated: true });
          localStorage.removeItem("slflow.token");
        }
      },
    }),
    {
      name: "slflow.auth",
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);
