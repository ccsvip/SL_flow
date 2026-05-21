import {
  App as AntdApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Segmented,
  Space,
  Tag,
  Typography,
} from "antd";
import { SettingOutlined, KeyOutlined } from "@ant-design/icons";
import { useState } from "react";

import { users } from "@/api/client";
import { extractError } from "@/api/http";
import { useAuthStore } from "@/store/auth";
import { useUIStore, ACCENT_PRESETS, AccentName } from "@/store/ui";
import ChangePasswordModal from "@/components/modals/ChangePasswordModal";

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { mode, setMode, accent, setAccent } = useUIStore();
  const { message } = AntdApp.useApp();
  const [pwOpen, setPwOpen] = useState(false);
  const [form] = Form.useForm();

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

  if (!user) return null;

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <SettingOutlined /> 个人设置
      </h1>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card title="基础信息" bordered={false}>
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
