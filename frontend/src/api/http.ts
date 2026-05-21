import axios, { AxiosError } from "axios";
import { message } from "antd";

const baseURL = import.meta.env.VITE_API_BASE || "/api";

export const http = axios.create({
  baseURL,
  timeout: 60_000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("slflow.token");
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (resp) => resp,
  (error: AxiosError<{ detail?: string }>) => {
    const status = error.response?.status;
    const detail = error.response?.data?.detail || error.message || "Request failed";
    if (status === 401) {
      // Bubble silently for the auth gate, but force re-login.
      const path = window.location.pathname;
      if (!path.startsWith("/login")) {
        message.error("Session expired. Please sign in again.");
        localStorage.removeItem("slflow.token");
        window.location.href = "/login";
      }
    } else if (status && status >= 500) {
      message.error(`Server error: ${detail}`);
    }
    return Promise.reject(error);
  },
);

export function extractError(e: unknown, fallback = "Operation failed"): string {
  const err = e as AxiosError<{ detail?: string }>;
  return err?.response?.data?.detail || err?.message || fallback;
}
