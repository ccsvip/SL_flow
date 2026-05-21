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
  Typography,
} from "antd";
import {
  BgColorsOutlined,
  BulbOutlined,
  CloudSyncOutlined,
  DownloadOutlined,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuthStore } from "@/store/auth";
import { useUIStore, ACCENT_PRESETS, AccentName } from "@/store/ui";
import { system } from "@/api/client";
import ChangePasswordModal from "@/components/modals/ChangePasswordModal";
import { initials } from "@/utils/format";
import UpdateModal from "@/components/modals/UpdateModal";

const { Header } = Layout;

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
  const qc = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const { data: version } = useQuery({
    queryKey: ["version"],
    queryFn: system.version,
    refetchInterval: 60_000,
    enabled: !!user,
  });

  const { data: updateInfo } = useQuery({
    queryKey: ["update-poll"],
    queryFn: () =>
      system.checkUpdate().catch(() => null), // silent failure for non-admin / non-git
    refetchInterval: 5 * 60_000,
    enabled: !!user && user.role === "admin",
  });

  const updateAvailable = !!updateInfo?.update_available;

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
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            v{version?.app_version || "—"}{" "}
            {version?.git?.branch ? `· ${version.git.branch}` : ""}
          </Typography.Text>
        </Space>

        <Space size="small">
          {user?.role === "admin" && (
            <Tooltip title={updateAvailable ? "有新版本可用，点击查看" : "检查更新"}>
              <Badge dot={updateAvailable} color="red">
                <Button
                  type="text"
                  icon={<CloudSyncOutlined />}
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ["update-poll"] });
                    setUpdateOpen(true);
                  }}
                />
              </Badge>
            </Tooltip>
          )}

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
                style={{
                  background: "linear-gradient(135deg, var(--accent), #722ed1)",
                  fontWeight: 700,
                }}
              >
                {initials(user?.full_name || user?.username)}
              </Avatar>
              <span style={{ fontWeight: 500 }}>
                {user?.full_name || user?.username}
              </span>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <UpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </>
  );
}
