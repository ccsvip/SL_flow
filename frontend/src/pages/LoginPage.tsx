import { App as AntdApp, Button, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";

import { auth } from "@/api/client";
import { extractError } from "@/api/http";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);

  if (token) {
    const from = (location.state as { from?: string } | null)?.from || "/";
    navigate(from, { replace: true });
  }

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await auth.login(values.username.trim(), values.password);
      setAuth(res.access_token, res.user);
      message.success(`欢迎回来, ${res.user.full_name || res.user.username}`);
      const from = (location.state as { from?: string } | null)?.from || "/";
      navigate(from, { replace: true });
    } catch (e) {
      message.error(extractError(e, "登录失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="slf-login-bg">
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
        }}
      >
        <div className="slf-login-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <span className="slf-brand-mark">SL</span>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                SL Flow
              </Typography.Title>
              <Typography.Text type="secondary">研发流程协作平台</Typography.Text>
            </div>
          </div>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
            登录后即可管理项目、需求、任务与缺陷。
          </Typography.Paragraph>

          <Form
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
            size="large"
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: "请输入账号" }]}
            >
              <Input prefix={<UserOutlined />} placeholder="username" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="password"
                autoComplete="current-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
