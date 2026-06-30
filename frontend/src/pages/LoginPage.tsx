import { App as AntdApp, Button, Form, Input, Typography } from "antd";
import {
  LockOutlined,
  UserOutlined,
  ProjectOutlined,
  DashboardOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";

import { auth } from "@/api/client";
import { extractError } from "@/api/http";
import { useAuthStore } from "@/store/auth";

const FEATURES = [
  {
    icon: <ProjectOutlined />,
    title: "全流程研发协作",
    desc: "项目、需求、任务、缺陷，一站打通",
  },
  {
    icon: <DashboardOutlined />,
    title: "数据可视化看板",
    desc: "状态分布与趋势一目了然",
  },
  {
    icon: <SafetyOutlined />,
    title: "角色权限与审计",
    desc: "细粒度管控，操作可追溯",
  },
];

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
      <div className="slf-login-shell">
        {/* 左侧品牌展示区 */}
        <aside className="slf-login-hero">
          <div className="slf-login-hero-glow slf-login-hero-glow-a" aria-hidden />
          <div className="slf-login-hero-glow slf-login-hero-glow-b" aria-hidden />
          <div className="slf-login-hero-inner">
            <div className="slf-login-brand">
              <span className="slf-brand-mark slf-brand-mark-lg">SL</span>
              <div>
                <Typography.Title level={2} className="slf-login-brand-title">
                  SL Flow
                </Typography.Title>
                <Typography.Text className="slf-login-brand-sub">
                  研发流程协作平台
                </Typography.Text>
              </div>
            </div>

            <p className="slf-login-tagline">
              让研发团队的每一次协作，<br />
              都从清晰与秩序开始。
            </p>

            <ul className="slf-login-features">
              {FEATURES.map((f) => (
                <li key={f.title} className="slf-login-feature">
                  <span className="slf-login-feature-icon">{f.icon}</span>
                  <div>
                    <div className="slf-login-feature-title">{f.title}</div>
                    <div className="slf-login-feature-desc">{f.desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="slf-login-hero-footer">
              <Typography.Text className="slf-login-copy">
                © {new Date().getFullYear()} SL Flow · Built for builders
              </Typography.Text>
            </div>
          </div>
        </aside>

        {/* 右侧登录表单卡片 */}
        <section className="slf-login-form-wrap">
          <div className="slf-login-card slf-login-card-in">
            <header className="slf-login-card-head">
              <Typography.Title level={3} className="slf-login-card-title">
                欢迎回来 👋
              </Typography.Title>
              <Typography.Paragraph type="secondary" className="slf-login-card-desc">
                登录后即可管理项目、需求、任务与缺陷。
              </Typography.Paragraph>
            </header>

            <Form
              layout="vertical"
              onFinish={onFinish}
              requiredMark={false}
              size="large"
              className="slf-login-form"
            >
              <Form.Item
                name="username"
                label="账号"
                rules={[{ required: true, message: "请输入账号" }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="username"
                  autoComplete="username"
                  allowClear
                />
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
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                className="slf-login-submit"
              >
                登 录
              </Button>
            </Form>

            <p className="slf-login-hint">
              默认账号 <code>admin</code> / <code>admin</code>，首次登录后请尽快修改密码。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
