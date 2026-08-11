import {
  App as AntdApp,
  Avatar,
  Badge,
  Button,
  Dropdown,
  Layout,
  Modal,
  Space,
  Tooltip,
} from "antd";
import {
  BellOutlined,
  BgColorsOutlined,
  BulbOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  PictureOutlined,
  SunOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAuthStore } from "@/store/auth";
import { useUIStore, ACCENT_PRESETS, AccentName } from "@/store/ui";
import { notifications } from "@/api/client";
import { http } from "@/api/http";
import ChangePasswordModal from "@/components/modals/ChangePasswordModal";
import { initials } from "@/utils/format";

const { Header } = Layout;

// Tiny per-component avatar fetcher: AppHeader only ever shows ONE avatar
// (the current user's), and we want it to update immediately after the user
// uploads a new photo. We re-fetch whenever the avatar URL changes.
function useHeaderAvatar(avatarUrl: string | null | undefined): string | null {
  const [blob, setBlob] = useState<string | null>(null);
  useEffect(() => {
    if (!avatarUrl) {
      setBlob(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    const path = avatarUrl.startsWith("/api/") ? avatarUrl.slice(4) : avatarUrl;
    http
      .get<Blob>(path, { responseType: "blob" })
      .then((r) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(r.data);
        setBlob(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setBlob(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [avatarUrl]);
  return blob;
}

export default function AppHeader() {
  const { user, logout } = useAuthStore();
  const collapsed = useUIStore((s) => s.collapsed);
  const toggleCollapsed = useUIStore((s) => s.toggleCollapsed);
  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const accent = useUIStore((s) => s.accent);
  const setAccent = useUIStore((s) => s.setAccent);

  const navigate = useNavigate();
  const { modal } = AntdApp.useApp();
  const [pwOpen, setPwOpen] = useState(false);
  const headerAvatar = useHeaderAvatar(user?.avatar);

  // Unread notification count - polled every 30s. Cheap query (one
  // SELECT COUNT(*)). The bell badge updates without a manual refresh.
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: notifications.unreadCount,
    refetchInterval: 30_000,
    enabled: !!user,
  });

  return (
    <>
      <Header
        className="slf-header"
        style={{
          padding: "0 16px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Space>
          <Button
            type="text"
            onClick={toggleCollapsed}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          />
        </Space>

        <Space size="small">
          <Dropdown
            trigger={["click"]}
            menu={{
              selectedKeys: [accent],
              onClick: (e) => setAccent(e.key as AccentName),
              items: (Object.keys(ACCENT_PRESETS) as AccentName[]).map((k) => ({
                key: k,
                label: (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: ACCENT_PRESETS[k],
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
                      }}
                    />
                    {k}
                  </span>
                ),
              })),
            }}
          >
            <Button type="text" icon={<BgColorsOutlined />} />
          </Dropdown>

          <Dropdown
            trigger={["click"]}
            menu={{
              selectedKeys: [mode],
              onClick: (e) => setMode(e.key as "light" | "dark" | "auto"),
              items: [
                { key: "light", icon: <SunOutlined />, label: "浅色" },
                { key: "dark", icon: <MoonOutlined />, label: "深色" },
                { key: "auto", icon: <BulbOutlined />, label: "跟随系统" },
              ],
            }}
          >
            <Button
              type="text"
              icon={mode === "dark" ? <MoonOutlined /> : mode === "light" ? <SunOutlined /> : <BulbOutlined />}
            />
          </Dropdown>

          <Tooltip title={unreadCount > 0 ? `${unreadCount} 条未读通知` : "通知中心"}>
            <Badge count={unreadCount} size="small" offset={[-2, 2]} overflowCount={99}>
              <Button
                type="text"
                icon={<BellOutlined />}
                onClick={() => navigate("/notifications")}
              />
            </Badge>
          </Tooltip>

          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "me",
                  label: (
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 600 }}>{user?.full_name || user?.username}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>
                        {user?.role === "admin" ? "管理员" : "普通用户"}
                      </div>
                    </div>
                  ),
                  disabled: true,
                },
                { type: "divider" },
                {
                  key: "settings",
                  icon: <UserOutlined />,
                  label: "个人设置",
                  onClick: () => navigate("/settings"),
                },
                {
                  key: "pw",
                  icon: <KeyOutlined />,
                  label: "修改密码",
                  onClick: () => setPwOpen(true),
                },
                { type: "divider" },
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "退出登录",
                  danger: true,
                  onClick: () =>
                    modal.confirm({
                      title: "确认退出登录？",
                      okText: "退出",
                      okButtonProps: { danger: true },
                      cancelText: "取消",
                      onOk: () => {
                        logout();
                        navigate("/login");
                      },
                    }),
                },
              ],
            }}
          >
            <Space style={{ cursor: "pointer", padding: "0 4px" }}>
              <Avatar
                size={32}
                src={headerAvatar || undefined}
                style={{
                  background: headerAvatar
                    ? undefined
                    : "linear-gradient(135deg, var(--accent), #722ed1)",
                  fontWeight: 700,
                }}
              >
                {headerAvatar ? null : initials(user?.full_name || user?.username)}
              </Avatar>
              <span style={{ fontWeight: 500 }}>
                {user?.full_name || user?.username}
              </span>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}
