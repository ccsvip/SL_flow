import React from "react";
import { Layout } from "antd";
import { Outlet } from "react-router-dom";

import AppHeader from "./AppHeader";
import AppSider from "./AppSider";
import { useUIStore } from "@/store/ui";

const { Content } = Layout;

export default function AppLayout() {
  const collapsed = useUIStore((s) => s.collapsed);
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <AppSider />
      <Layout style={{ marginLeft: collapsed ? 72 : 232, transition: "margin-left 0.2s" }}>
        <AppHeader />
        <Content>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
