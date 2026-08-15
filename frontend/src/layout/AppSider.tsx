import React from "react";
import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  DatabaseOutlined,
  ProjectOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  BugOutlined,
  CalendarOutlined,
  TeamOutlined,
  SettingOutlined,
  HistoryOutlined,
  KeyOutlined,
  ThunderboltOutlined,
  ReadOutlined,
  NotebookOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";

const { Sider } = Layout;

export default function AppSider() {
  const collapsed = useUIStore((s) => s.collapsed);
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.user?.role);

  const items = React.useMemo(() => {
    const base = [
      { key: "/", icon: <DashboardOutlined />, label: "工作台" },
      { key: "/projects", icon: <ProjectOutlined />, label: "项目" },
      { key: "/prd", icon: <ReadOutlined />, label: "PRD 文档" },
      { key: "/api-keys", icon: <KeyOutlined />, label: "密钥管理" },
      { key: "/stories", icon: <FileTextOutlined />, label: "需求" },
      { key: "/tasks", icon: <CheckSquareOutlined />, label: "任务" },
      { key: "/bugs", icon: <BugOutlined />, label: "缺陷" },
      { key: "/calendar", icon: <CalendarOutlined />, label: "日历" },
      { key: "/memos", icon: <NotebookOutlined />, label: "备忘录" },
      { key: "/audit-logs", icon: <HistoryOutlined />, label: "操作日志" },
      { key: "/settings", icon: <SettingOutlined />, label: "个人设置" },
    ];
    if (role === "admin") {
      // Admin-only entries: user management + backups before audit logs,
      // and AI settings between settings and version-and-update so it
      // sits with the other "platform" controls.
      base.splice(7, 0, { key: "/users", icon: <TeamOutlined />, label: "用户管理" });
      base.splice(8, 0, { key: "/backups", icon: <DatabaseOutlined />, label: "数据备份" });
      base.splice(
        base.length - 1,
        0,
        { key: "/ai-settings", icon: <ThunderboltOutlined />, label: "AI 设置" },
      );
    }
    return base;
  }, [role]);

  const selected = React.useMemo(() => {
    const path = location.pathname;
    if (path === "/") return ["/"];
    const match = items.find((it) => path === it.key || path.startsWith(it.key + "/"));
    return match ? [match.key] : [];
  }, [location.pathname, items]);

  return (
    <Sider
      className="slf-sider"
      collapsed={collapsed}
      width={232}
      collapsedWidth={72}
      breakpoint="lg"
      onBreakpoint={(b) => useUIStore.setState({ collapsed: b })}
      theme="dark"
      style={{
        position: "fixed",
        height: "100vh",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 30,
      }}
    >
      <div
        onClick={() => navigate("/")}
        style={{
          cursor: "pointer",
          padding: collapsed ? "16px 12px" : "18px 20px",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #1677ff, #722ed1)",
            fontWeight: 800,
            color: "white",
            boxShadow: "0 6px 16px rgba(22,119,255,0.45)",
            flexShrink: 0,
          }}
        >
          SL
        </span>
        {!collapsed && (
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>SL Flow</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>项目管理</div>
          </div>
        )}
      </div>
      <Menu
        mode="inline"
        theme="dark"
        items={items}
        selectedKeys={selected}
        onClick={(e) => navigate(e.key)}
        style={{ background: "transparent", borderRight: 0 }}
      />
    </Sider>
  );
}
