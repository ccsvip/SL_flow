import React from "react";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  DownOutlined,
  KeyOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ai } from "@/api/client";
import { extractError } from "@/api/http";
import type { AIConfigUpdate, AITestResult } from "@/api/types";

// Convenience presets so the user doesn't have to remember each provider's
// /v1 path. Selecting one fills the form fields; the user still has to
// paste an API key. We include a custom row at the end to make it clear
// the field is free-form.
const PROVIDER_PRESETS: {
  key: string;
  label: string;
  base_url: string;
  default_model: string;
  hint?: string;
}[] = [
  {
    key: "openai",
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o-mini",
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    default_model: "deepseek-chat",
  },
  {
    key: "tongyi",
    label: "通义千问 (DashScope 兼容模式)",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    default_model: "qwen-plus",
  },
  {
    key: "doubao",
    label: "豆包 (火山方舟)",
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    default_model: "doubao-seed-1-6",
    hint: "model 字段填你创建的「推理接入点 ID」(ep-…)",
  },
  {
    key: "moonshot",
    label: "Moonshot (Kimi)",
    base_url: "https://api.moonshot.cn/v1",
    default_model: "moonshot-v1-8k",
  },
  {
    key: "zhipu",
    label: "智谱 GLM",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    default_model: "glm-4-flash",
  },
  {
    key: "groq",
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    default_model: "llama-3.1-70b-versatile",
  },
  {
    key: "ollama",
    label: "Ollama (本地)",
    base_url: "http://host.docker.internal:11434/v1",
    default_model: "llama3",
    hint: "在 Docker 内访问宿主机的 Ollama 时使用 host.docker.internal",
  },
];

interface FormShape {
  enabled: boolean;
  base_url: string;
  api_key: string;
  model: string;
  timeout_seconds: number;
  max_input_chars: number;
}

export default function AISettingsPage() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormShape>();
  const [testResult, setTestResult] = React.useState<AITestResult | null>(null);
  // Track whether the user touched the api_key input. We pre-fill it with
  // an empty string and only send it on save when it has been touched -
  // that way "save name change" doesn't accidentally clear the saved key.
  const [keyDirty, setKeyDirty] = React.useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["ai-config"],
    queryFn: ai.getConfig,
  });

  React.useEffect(() => {
    if (!config) return;
    form.setFieldsValue({
      enabled: config.enabled,
      base_url: config.base_url,
      api_key: "",
      model: config.model,
      timeout_seconds: config.timeout_seconds,
      max_input_chars: config.max_input_chars,
    });
    setKeyDirty(false);
    setTestResult(null);
  }, [config, form]);

  const save = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      const update: AIConfigUpdate = {
        enabled: v.enabled,
        base_url: v.base_url,
        model: v.model,
        timeout_seconds: v.timeout_seconds,
        max_input_chars: v.max_input_chars,
      };
      // Only send api_key if user actually edited the field. Sending the
      // empty string explicitly *would* clear the saved key, which is
      // also a feature we expose via a dedicated "清除" button below.
      if (keyDirty) {
        update.api_key = v.api_key;
      }
      return ai.updateConfig(update);
    },
    onSuccess: () => {
      message.success("已保存");
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const test = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      // We test against whatever's in the form - lets the admin verify
      // a new key BEFORE saving it (which is the safer flow).
      return ai.testConnection({
        base_url: v.base_url,
        api_key: keyDirty ? v.api_key : undefined,
        model: v.model,
      });
    },
    onSuccess: (result) => setTestResult(result),
    onError: (e) =>
      setTestResult({
        ok: false,
        message: extractError(e, "测试请求失败"),
        sample: null,
        model: null,
      }),
  });

  const clearKey = () => {
    form.setFieldValue("api_key", "");
    setKeyDirty(true);
    message.info("已清空，点击「保存」生效");
  };

  const applyPreset = (key: string) => {
    const p = PROVIDER_PRESETS.find((x) => x.key === key);
    if (!p) return;
    form.setFieldsValue({
      base_url: p.base_url,
      model: p.default_model,
    });
    message.success(`已套用 ${p.label} 预设`);
  };

  if (isLoading || !config) {
    return (
      <div className="slf-page">
        <h1 className="slf-page-title">
          <ThunderboltOutlined /> AI 设置
        </h1>
        <Card bordered={false}>
          <Skeleton active />
        </Card>
      </div>
    );
  }

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <ThunderboltOutlined /> AI 设置
      </h1>

      <Card
        bordered={false}
        title="服务商配置"
        extra={
          <Dropdown
            menu={{
              items: PROVIDER_PRESETS.map((p) => ({
                key: p.key,
                label: p.label,
                onClick: () => applyPreset(p.key),
              })),
            }}
            trigger={["click"]}
          >
            <Button>
              选择预设 <DownOutlined />
            </Button>
          </Dropdown>
        }
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="支持任意 OpenAI 兼容服务"
          description={
            <span>
              SL Flow 通过标准 <Typography.Text code>/chat/completions</Typography.Text>{" "}
              接口对接，因此 OpenAI、DeepSeek、通义、豆包、Moonshot、智谱、Groq、Ollama 以及
              vLLM 等任何兼容服务都能直接使用。从右上角「选择预设」可一键填入 base_url 与建议模型。
            </span>
          }
        />

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            enabled: config.enabled,
            base_url: config.base_url,
            api_key: "",
            model: config.model,
            timeout_seconds: config.timeout_seconds,
            max_input_chars: config.max_input_chars,
          }}
        >
          <Form.Item
            label="启用 AI 功能"
            name="enabled"
            valuePropName="checked"
            extra="关闭后任务/需求/缺陷抽屉里的「AI 摘要」按钮将隐藏"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="API Base URL"
            name="base_url"
            rules={[{ required: true, message: "必填" }, { max: 255 }]}
            extra="例：https://api.openai.com/v1 / https://api.deepseek.com/v1 / Ollama 用 http://host.docker.internal:11434/v1"
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item label="API Key" required>
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item
                name="api_key"
                noStyle
                rules={[{ max: 512 }]}
              >
                <Input.Password
                  prefix={<KeyOutlined />}
                  placeholder={
                    config.api_key_present
                      ? `已保存：${config.api_key_masked || "•••"}（留空保持不变）`
                      : "粘贴你的 API Key"
                  }
                  onChange={() => setKeyDirty(true)}
                  autoComplete="new-password"
                />
              </Form.Item>
              {config.api_key_present && (
                <Button danger onClick={clearKey}>
                  清除
                </Button>
              )}
            </Space.Compact>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              密钥服务器端加密存储，前端永远只能看到掩码形式
            </Typography.Text>
          </Form.Item>

          <Form.Item
            label="模型 ID"
            name="model"
            rules={[{ required: true, message: "必填" }, { max: 128 }]}
            extra="OpenAI: gpt-4o-mini / DeepSeek: deepseek-chat / 豆包：填推理接入点 ID (ep-...)"
          >
            <Input placeholder="gpt-4o-mini" />
          </Form.Item>

          <Space size={16}>
            <Form.Item
              label="超时（秒）"
              name="timeout_seconds"
              rules={[{ required: true }]}
              style={{ width: 160 }}
            >
              <InputNumber min={5} max={600} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="最大输入字符"
              name="max_input_chars"
              rules={[{ required: true }]}
              style={{ width: 200 }}
              tooltip="输入会从最早评论开始截断；OpenAI 兼容模型的 token 窗口大小因厂商而异"
            >
              <InputNumber min={500} max={200000} step={500} style={{ width: "100%" }} />
            </Form.Item>
          </Space>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button
              type="primary"
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              保存
            </Button>
            <Button
              icon={<ThunderboltOutlined />}
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              测试连接
            </Button>
            <Typography.Text type="secondary" style={{ alignSelf: "center", fontSize: 12 }}>
              测试会向上述地址发起一次极小的对话请求
            </Typography.Text>
          </div>
        </Form>

        {testResult && (
          <Alert
            style={{ marginTop: 16 }}
            type={testResult.ok ? "success" : "error"}
            showIcon
            icon={
              testResult.ok ? (
                <CheckCircleTwoTone twoToneColor="#52c41a" />
              ) : (
                <CloseCircleTwoTone twoToneColor="#ff4d4f" />
              )
            }
            message={
              testResult.ok ? (
                <span>
                  连接成功
                  {testResult.model && (
                    <Tag color="purple" style={{ marginLeft: 8 }}>
                      {testResult.model}
                    </Tag>
                  )}
                </span>
              ) : (
                "连接失败"
              )
            }
            description={
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
                {testResult.message}
                {testResult.sample && (
                  <div style={{ marginTop: 8, opacity: 0.7 }}>
                    模型回复样例：{testResult.sample}
                  </div>
                )}
              </div>
            }
          />
        )}
      </Card>
    </div>
  );
}
