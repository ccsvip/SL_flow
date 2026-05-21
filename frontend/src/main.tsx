import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "dayjs/locale/zh-cn";

import App from "./App";
import { useUIStore, resolveDark, ACCENT_PRESETS } from "./store/ui";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function Root() {
  const { mode, accent } = useUIStore();
  const dark = React.useMemo(() => resolveDark(mode), [mode]);

  // Sync OS theme when in auto mode.
  React.useEffect(() => {
    if (mode !== "auto") return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => useUIStore.setState({ mode: "auto" });
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [mode]);

  // Reflect dark mode on <html> for CSS variable toggling.
  React.useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.setProperty("--accent", ACCENT_PRESETS[accent]);
    document.body.style.background = dark ? "#0e1116" : "#f4f6fb";
  }, [dark, accent]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: ACCENT_PRESETS[accent],
          borderRadius: 10,
          fontFamily:
            '"Inter","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",-apple-system,BlinkMacSystemFont,sans-serif',
        },
        components: {
          Layout: {
            siderBg: dark ? "#0e1218" : "#101a2a",
            headerBg: dark ? "#11161e" : "#ffffff",
          },
          Menu: {
            darkItemBg: "transparent",
            darkSubMenuItemBg: "transparent",
          },
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
