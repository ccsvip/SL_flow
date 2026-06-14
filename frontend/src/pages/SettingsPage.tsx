import {
  App as AntdApp,
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  CameraOutlined,
  DeleteOutlined,
  KeyOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { users } from "@/api/client";
import { extractError, http } from "@/api/http";
import { useAuthStore } from "@/store/auth";
import { useUIStore, ACCENT_PRESETS, AccentName } from "@/store/ui";
import ChangePasswordModal from "@/components/modals/ChangePasswordModal";
import { initials } from "@/utils/format";

// Avatar caps - keep in sync with the backend AVATAR_MAX_BYTES /
// AVATAR_ALLOWED_MIMES values in app/api/routes/users.py.
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { mode, setMode, accent, setAccent } = useUIStore();
  const { message, modal } = AntdApp.useApp();
  const qc = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form] = Form.useForm();

  // Refresh the local avatar blob whenever the user's avatar URL changes
  // (login, upload, delete). We deliberately fetch through axios so the JWT
  // is sent - browsers won't add Authorization to a plain <img src>.
  useEffect(() => {
    if (!user?.avatar) {
      setAvatarPreview(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    const path = user.avatar.startsWith("/api/") ? user.avatar.slice(4) : user.avatar;
    http
      .get<Blob>(path, { responseType: "blob" })
      .then((r) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(r.data);
        setAvatarPreview(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setAvatarPreview(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [user?.avatar]);

  const submit = async () => {
    if (!user) return;
    try {
      const v = await form.validateFields();
      const updated = await users.update(user.id, v);
      setUser(updated);
      message.success("已保存");
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error(extractError(e, "保存失败"));
    }
  };

  const validateAvatarFile = (file: File): string | null => {
    if (!AVATAR_ALLOWED_MIMES.has(file.type)) {
      return "仅支持 PNG / JPEG / GIF / WebP 格式";
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return `文件过大（最大 ${AVATAR_MAX_BYTES / (1024 * 1024)} MB）`;
    }
    return null;
  };

  const handleAvatarUpload = async (file: File) => {
    const err = validateAvatarFile(file);
    if (err) {
      message.error(err);
      return;
    }
    setAvatarUploading(true);
    try {
      const updated = await users.uploadAvatar(file);
      setUser(updated);
      // Force any cached <UserBadge> instances to re-fetch (their blob cache
      // is keyed by the URL and the URL stays the same for me, but other
      // users will have their badges pulled via this query key).
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["users-light"] });
      message.success("头像已更新");
    } catch (e) {
      message.error(extractError(e, "头像上传失败"));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarDelete = () => {
    if (!user?.avatar) return;
    modal.confirm({
      title: "移除头像？",
      content: "移除后将显示姓名首字母作为占位。",
      okText: "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await users.removeAvatar();
          setUser({ ...user, avatar: null });
          qc.invalidateQueries({ queryKey: ["users"] });
          qc.invalidateQueries({ queryKey: ["users-light"] });
          message.success("头像已移除");
        } catch (e) {
          message.error(extractError(e, "操作失败"));
        }
      },
    });
  };

  if (!user) return null;

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <SettingOutlined /> 个人设置
      </h1>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card title="基础信息" bordered={false}>
            <div
              style={{
                display: "flex",
                gap: 20,
                alignItems: "center",
                marginBottom: 24,
                padding: "12px 0",
              }}
            >
              <div style={{ position: "relative" }}>
                <Avatar
                  size={88}
                  src={avatarPreview || undefined}
                  style={{
                    background: avatarPreview
                      ? undefined
                      : "linear-gradient(135deg, var(--accent), #722ed1)",
                    color: "white",
                    fontSize: 28,
                    fontWeight: 700,
                  }}
                >
                  {avatarPreview ? null : initials(user.full_name || user.username)}
                </Avatar>
                <Upload
                  accept={Array.from(AVATAR_ALLOWED_MIMES).join(",")}
                  showUploadList={false}
                  beforeUpload={(file) => {
                    handleAvatarUpload(file as File);
                    return false; // suppress AntD's default upload pipeline
                  }}
                >
                  <Tooltip title="更换头像">
                    <Button
                      shape="circle"
                      size="small"
                      type="primary"
                      icon={<CameraOutlined />}
                      loading={avatarUploading}
                      style={{
                        position: "absolute",
                        right: -2,
                        bottom: -2,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                      }}
                    />
                  </Tooltip>
                </Upload>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {user.full_name || user.username}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  PNG / JPEG / GIF / WebP，单文件 ≤ {AVATAR_MAX_BYTES / (1024 * 1024)} MB
                </Typography.Text>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <Upload
                    accept={Array.from(AVATAR_ALLOWED_MIMES).join(",")}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      handleAvatarUpload(file as File);
                      return false;
                    }}
                  >
                    <Button icon={<CameraOutlined />} loading={avatarUploading}>
                      {user.avatar ? "更换头像" : "上传头像"}
                    </Button>
                  </Upload>
                  {user.avatar && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleAvatarDelete}
                    >
                      移除
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Form
              form={form}
              layout="vertical"
              initialValues={user}
              requiredMark={false}
              onFinish={submit}
            >
              <Form.Item label="账号">
                <Input value={user.username} disabled />
              </Form.Item>
              <Form.Item label="姓名" name="full_name" rules={[{ max: 128 }]}>
                <Input placeholder="如 张三" />
              </Form.Item>
              <Form.Item label="邮箱" name="email" rules={[{ type: "email" }]}>
                <Input placeholder="user@example.com" />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  保存
                </Button>
                <Button icon={<KeyOutlined />} onClick={() => setPwOpen(true)}>
                  修改密码
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="外观" bordered={false}>
            <div style={{ marginBottom: 18 }}>
              <Typography.Text type="secondary">主题模式</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Segmented
                  value={mode}
                  onChange={(v) => setMode(v as "light" | "dark" | "auto")}
                  options={[
                    { value: "light", label: "浅色" },
                    { value: "dark", label: "深色" },
                    { value: "auto", label: "跟随系统" },
                  ]}
                />
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">主色</Typography.Text>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {(Object.keys(ACCENT_PRESETS) as AccentName[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setAccent(k)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border:
                        accent === k
                          ? "3px solid rgba(0,0,0,0.55)"
                          : "1px solid rgba(125,125,140,0.4)",
                      background: ACCENT_PRESETS[k],
                      cursor: "pointer",
                      transition: "transform 0.15s",
                    }}
                    aria-label={k}
                  />
                ))}
              </div>
            </div>
          </Card>
          <Card title="账号信息" bordered={false} style={{ marginTop: 16 }}>
            <p>
              角色：
              {user.role === "admin" ? (
                <Tag color="purple">管理员</Tag>
              ) : (
                <Tag>普通用户</Tag>
              )}
            </p>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              注册于 {user.created_at}
            </Typography.Text>
          </Card>
        </Col>
      </Row>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
