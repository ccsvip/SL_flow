import React from "react";
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiKeys } from "@/api/client";
import { extractError } from "@/api/http";
import type { APIKeyCreateInput, APIKeyItem, APIKeyUpdateInput } from "@/api/types";
import { fromNow } from "@/utils/format";

interface FormShape {
  title: string;
  api_key: string;
  base_url?: string;
  models_text?: string;
  notes?: string;
}

function splitModels(input?: string): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  return input
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function blankToNull(value?: string): string | null {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function maskKey(value: string): string {
  if (value.length <= 10) return "••••••••";
  const start = Math.min(6, Math.floor(value.length / 3));
  const end = Math.min(4, Math.floor(value.length / 3));
  return `${value.slice(0, start)}••••••••••••••••${value.slice(value.length - end)}`;
}

function DetailRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="slf-api-key-detail-row">
      <div className="slf-api-key-detail-label">
        {icon}
        {label}
      </div>
      <div className="slf-api-key-detail-value">{children}</div>
    </div>
  );
}

export default function APIKeysPage() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [form] = Form.useForm<FormShape>();
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [revealedIds, setRevealedIds] = React.useState<Set<number>>(() => new Set());
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editForm] = Form.useForm<FormShape>();

  const { data = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: apiKeys.list,
  });

  const active = React.useMemo(
    () => data.find((item) => item.id === activeId) || null,
    [activeId, data],
  );

  React.useEffect(() => {
    if (data.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !data.some((item) => item.id === activeId)) {
      setActiveId(data[0].id);
    }
  }, [activeId, data]);

  const copyText = async (text: string, successText = "已成功复制") => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successText);
    } catch {
      message.error("复制失败");
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      const payload: APIKeyCreateInput = {
        title: values.title.trim(),
        api_key: values.api_key.trim(),
        base_url: blankToNull(values.base_url),
        models: splitModels(values.models_text),
        notes: blankToNull(values.notes),
      };
      return apiKeys.create(payload);
    },
    onSuccess: (item) => {
      qc.setQueryData<APIKeyItem[]>(["api-keys"], (old = []) => [item, ...old]);
      setActiveId(item.id);
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      form.resetFields();
      message.success("密钥添加成功");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return null;
      const values = await editForm.validateFields();
      const payload: APIKeyUpdateInput = {
        title: values.title.trim(),
        api_key: values.api_key.trim(),
        base_url: blankToNull(values.base_url),
        models: splitModels(values.models_text),
        notes: blankToNull(values.notes),
      };
      return apiKeys.update(editingId, payload);
    },
    onSuccess: (item) => {
      if (!item) return;
      qc.setQueryData<APIKeyItem[]>(["api-keys"], (old = []) =>
        old.map((k) => (k.id === item.id ? item : k)),
      );
      setEditingId(null);
      editForm.resetFields();
      message.success("密钥更新成功");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => message.error(extractError(e, "更新失败")),
  });

  const openEdit = (item: APIKeyItem) => {
    editForm.setFieldsValue({
      title: item.title,
      api_key: item.api_key,
      base_url: item.base_url ?? undefined,
      models_text: item.models.join(", "),
      notes: item.notes ?? undefined,
    });
    setEditingId(item.id);
  };

  const remove = useMutation({
    mutationFn: apiKeys.remove,
    onSuccess: (_, id) => {
      qc.setQueryData<APIKeyItem[]>(["api-keys"], (old = []) =>
        old.filter((item) => item.id !== id),
      );
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      message.info("密钥卡片已删除");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  const confirmDelete = (item: APIKeyItem) => {
    modal.confirm({
      title: `删除密钥 ${item.title} ?`,
      content: "删除后无法恢复，已复制到外部系统的密钥不会被自动撤销。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => remove.mutate(item.id),
    });
  };

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderActiveCard = () => {
    if (isLoading) {
      return (
        <Card bordered={false} className="slf-api-key-empty-card">
          <Skeleton active />
        </Card>
      );
    }

    if (!active) {
      return (
        <Card bordered={false} className="slf-api-key-empty-card">
          <Empty
            image={<FolderOpenOutlined className="slf-api-key-empty-icon" />}
            description="暂无选中的密钥卡片，请在左侧生成或在下方选择"
          />
        </Card>
      );
    }

    const revealed = revealedIds.has(active.id);
    const shownKey = revealed ? active.api_key : maskKey(active.api_key);

    return (
      <Card bordered={false} className="slf-api-key-active-card">
        <Space className="slf-api-key-actions">
          <Tooltip title="编辑">
            <Button
              shape="circle"
              icon={<EditOutlined />}
              onClick={() => openEdit(active)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              danger
              shape="circle"
              icon={<DeleteOutlined />}
              onClick={() => confirmDelete(active)}
            />
          </Tooltip>
        </Space>

        <div className="slf-api-key-active-head">
          <div className="slf-api-key-active-icon">
            <KeyOutlined />
          </div>
          <div style={{ minWidth: 0 }}>
            <Typography.Title
              level={3}
              ellipsis={{ tooltip: active.title }}
              style={{ margin: 0 }}
            >
              {active.title}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              更新于 {fromNow(active.updated_at)}
            </Typography.Text>
          </div>
        </div>

        <div className="slf-api-key-core">
          <DetailRow label="API Key" icon={<KeyOutlined />}>
            <Typography.Text
              className="slf-api-key-mono"
              ellipsis={{ tooltip: shownKey }}
            >
              {shownKey}
            </Typography.Text>
            <Space.Compact>
              <Tooltip title={revealed ? "隐藏" : "显示"}>
                <Button
                  icon={revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => toggleReveal(active.id)}
                />
              </Tooltip>
              <Tooltip title="复制">
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => copyText(active.api_key)}
                />
              </Tooltip>
            </Space.Compact>
          </DetailRow>

          {active.base_url && (
            <DetailRow label="Base URL" icon={<LinkOutlined />}>
              <Typography.Text
                className="slf-api-key-mono"
                ellipsis={{ tooltip: active.base_url }}
              >
                {active.base_url}
              </Typography.Text>
              <Tooltip title="复制链接">
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => copyText(active.base_url || "")}
                />
              </Tooltip>
            </DetailRow>
          )}
        </div>

        {active.models.length > 0 && (
          <div className="slf-api-key-section">
            <div className="slf-api-key-section-title">
              <TagsOutlined /> 支持的模型
            </div>
            <Space size={[8, 8]} wrap>
              {active.models.map((model) => (
                <Tooltip key={model} title="复制模型 ID">
                  <Tag
                    color="blue"
                    className="slf-api-key-model-tag"
                    onClick={() => copyText(model, "模型 ID 已复制")}
                  >
                    <CopyOutlined /> {model}
                  </Tag>
                </Tooltip>
              ))}
            </Space>
          </div>
        )}

        {active.notes && (
          <div className="slf-api-key-section">
            <div className="slf-api-key-section-title">备注</div>
            <div className="slf-api-key-notes">{active.notes}</div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="slf-page slf-api-keys-page">
      <header className="slf-api-key-header">
        <h1>
          <KeyOutlined /> API 密钥管理台
        </h1>
        <p>简单高效地生成与管理您的 API 连接信息</p>
      </header>

      <main className="slf-api-key-main">
        <div className="slf-api-key-top">
          <Card
            bordered={false}
            className="slf-api-key-form-card"
            title={
              <span>
                <PlusOutlined /> 添加新密钥
              </span>
            }
          >
            <Form form={form} layout="vertical" requiredMark={false}>
              <Form.Item
                label="标题"
                name="title"
                rules={[{ required: true, message: "请填写标题" }, { max: 128 }]}
              >
                <Input placeholder="例如：OpenAI 生产环境" />
              </Form.Item>

              <Form.Item
                label="API 密钥"
                name="api_key"
                rules={[{ required: true, message: "请填写 API 密钥" }, { max: 4096 }]}
              >
                <Input.Password placeholder="sk-..." autoComplete="new-password" />
              </Form.Item>

              <Form.Item label="Base URL" name="base_url" rules={[{ max: 512 }]}>
                <Input placeholder="https://api.openai.com/v1" />
              </Form.Item>

              <Form.Item label="可用模型" name="models_text">
                <Input placeholder="例如：gpt-4, claude-3-opus" />
              </Form.Item>

              <Form.Item label="备注信息" name="notes" rules={[{ max: 4000 }]}>
                <Input.TextArea
                  rows={3}
                  placeholder="用于主营业务对话，每月额度 $100"
                  style={{ resize: "none" }}
                />
              </Form.Item>

              <Button
                block
                type="primary"
                icon={<PlusOutlined />}
                size="large"
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                生成卡片
              </Button>
            </Form>
          </Card>

          <section className="slf-api-key-preview">{renderActiveCard()}</section>
        </div>

        {data.length > 0 && (
          <Card
            bordered={false}
            className="slf-api-key-library"
            title={
              <span>
                <KeyOutlined /> 我的密钥库
              </span>
            }
          >
            <div className="slf-api-key-mini-list">
              {data.map((item) => {
                const selected = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`slf-api-key-mini ${selected ? "is-active" : ""}`}
                    onClick={() => setActiveId(item.id)}
                    title={item.title}
                  >
                    <span className="slf-api-key-mini-icon">
                      <KeyOutlined />
                    </span>
                    <span className="slf-api-key-mini-text">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </main>

      <Modal
        title="编辑密钥"
        open={editingId !== null}
        onCancel={() => {
          setEditingId(null);
          editForm.resetFields();
        }}
        onOk={() => update.mutate()}
        confirmLoading={update.isPending}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: "请填写标题" }, { max: 128 }]}
          >
            <Input placeholder="例如：OpenAI 生产环境" />
          </Form.Item>

          <Form.Item
            label="API 密钥"
            name="api_key"
            rules={[{ required: true, message: "请填写 API 密钥" }, { max: 4096 }]}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>

          <Form.Item label="Base URL" name="base_url" rules={[{ max: 512 }]}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item label="可用模型" name="models_text">
            <Input placeholder="例如：gpt-4, claude-3-opus" />
          </Form.Item>

          <Form.Item label="备注信息" name="notes" rules={[{ max: 4000 }]}>
            <Input.TextArea
              rows={3}
              placeholder="用于主营业务对话，每月额度 $100"
              style={{ resize: "none" }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
