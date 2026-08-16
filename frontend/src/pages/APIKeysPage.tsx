import React from "react";
import {
  App as AntdApp,
  Button,
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
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiKeys } from "@/api/client";
import { extractError } from "@/api/http";
import type { APIKeyCreateInput, APIKeyItem } from "@/api/types";
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

function hostOf(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

function toPayload(values: FormShape): APIKeyCreateInput {
  return {
    title: values.title.trim(),
    api_key: values.api_key.trim(),
    base_url: blankToNull(values.base_url),
    models: splitModels(values.models_text),
    notes: blankToNull(values.notes),
  };
}

function KeyFields() {
  return (
    <>
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
        <Input.TextArea
          rows={2}
          placeholder="逗号或换行分隔，例如：gpt-4, claude-3-opus"
        />
      </Form.Item>
      <Form.Item label="备注信息" name="notes" rules={[{ max: 4000 }]}>
        <Input.TextArea rows={3} placeholder="用途、额度、负责人…" style={{ resize: "none" }} />
      </Form.Item>
    </>
  );
}

export default function APIKeysPage() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();
  const [form] = Form.useForm<FormShape>();
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [revealedIds, setRevealedIds] = React.useState<Set<number>>(() => new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [keyword, setKeyword] = React.useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: apiKeys.list,
  });

  const filtered = React.useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) => {
      const hay = [item.title, item.base_url || "", item.notes || "", ...item.models]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, keyword]);

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

  const copyText = async (text: string, successText = "已复制") => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successText);
    } catch {
      message.error("复制失败");
    }
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const openCreate = () => {
    form.resetFields();
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (item: APIKeyItem) => {
    form.setFieldsValue({
      title: item.title,
      api_key: item.api_key,
      base_url: item.base_url ?? undefined,
      models_text: item.models.join(", "),
      notes: item.notes ?? undefined,
    });
    setEditingId(item.id);
    setFormOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      const payload = toPayload(values);
      if (editingId) return apiKeys.update(editingId, payload);
      return apiKeys.create(payload);
    },
    onSuccess: (item) => {
      if (!item) return;
      qc.setQueryData<APIKeyItem[]>(["api-keys"], (old = []) => {
        if (editingId) return old.map((k) => (k.id === item.id ? item : k));
        return [item, ...old];
      });
      setActiveId(item.id);
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      message.success(editingId ? "密钥已更新" : "密钥已添加");
      closeForm();
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

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
      message.info("密钥已删除");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  const confirmDelete = (item: APIKeyItem) => {
    modal.confirm({
      title: `删除密钥「${item.title}」？`,
      content: "删除后无法恢复。已复制到外部系统的密钥不会被自动撤销。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => remove.mutate(item.id),
    });
  };

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyBundle = (item: APIKeyItem) => {
    const lines = [`API_KEY=${item.api_key}`];
    if (item.base_url) lines.push(`BASE_URL=${item.base_url}`);
    if (item.models.length) lines.push(`MODELS=${item.models.join(",")}`);
    copyText(lines.join("\n"), "已复制为环境变量");
  };

  const renderList = () => (
    <aside className="slf-vault-list">
      <div className="slf-vault-list-head">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索标题、模型、URL"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div className="slf-vault-list-body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={data.length === 0 ? "还没有密钥" : "没有匹配的密钥"}
          />
        ) : (
          filtered.map((item) => {
            const selected = item.id === activeId;
            const host = hostOf(item.base_url);
            return (
              <button
                key={item.id}
                type="button"
                className={`slf-vault-item${selected ? " is-active" : ""}`}
                onClick={() => setActiveId(item.id)}
              >
                <span className="slf-vault-item-mark">
                  <KeyOutlined />
                </span>
                <span className="slf-vault-item-main">
                  <span className="slf-vault-item-title">{item.title}</span>
                  <span className="slf-vault-item-sub">
                    {host || "未填写 Base URL"}
                    {item.models.length > 0 ? ` · ${item.models.length} 个模型` : ""}
                  </span>
                </span>
                <Tooltip title="复制密钥">
                  <span
                    className="slf-vault-item-copy"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(item.api_key, "密钥已复制");
                    }}
                  >
                    <CopyOutlined />
                  </span>
                </Tooltip>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );

  const renderDetail = () => {
    if (isLoading) {
      return (
        <section className="slf-vault-detail">
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      );
    }

    if (!active) {
      return (
        <section className="slf-vault-detail slf-vault-detail-empty">
          <Empty
            image={<KeyOutlined className="slf-vault-empty-icon" />}
            description={
              data.length === 0 ? "添加第一条密钥，集中管理连接信息" : "从左侧选择一条密钥"
            }
          >
            {data.length === 0 && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                添加密钥
              </Button>
            )}
          </Empty>
        </section>
      );
    }

    const revealed = revealedIds.has(active.id);
    const shownKey = revealed ? active.api_key : maskKey(active.api_key);

    return (
      <section className="slf-vault-detail">
        <header className="slf-vault-detail-head">
          <div className="slf-vault-detail-identity">
            <span className="slf-vault-detail-icon">
              <KeyOutlined />
            </span>
            <div className="slf-vault-detail-titles">
              <Typography.Title level={3} ellipsis={{ tooltip: active.title }}>
                {active.title}
              </Typography.Title>
              <Typography.Text type="secondary">
                更新于 {fromNow(active.updated_at)}
              </Typography.Text>
            </div>
          </div>
          <Space wrap>
            <Button icon={<CopyOutlined />} onClick={() => copyBundle(active)}>
              复制环境变量
            </Button>
            <Button icon={<EditOutlined />} onClick={() => openEdit(active)}>
              编辑
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={() => confirmDelete(active)}>
              删除
            </Button>
          </Space>
        </header>

        <div className="slf-vault-fields">
          <div className="slf-vault-field">
            <div className="slf-vault-field-label">
              <KeyOutlined /> API Key
            </div>
            <div className="slf-vault-field-box">
              <code className="slf-vault-mono">{shownKey}</code>
              <Space.Compact>
                <Tooltip title={revealed ? "隐藏" : "显示明文"}>
                  <Button
                    icon={revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    onClick={() => toggleReveal(active.id)}
                  />
                </Tooltip>
                <Tooltip title="复制密钥">
                  <Button
                    type="primary"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(active.api_key, "密钥已复制")}
                  />
                </Tooltip>
              </Space.Compact>
            </div>
          </div>

          <div className="slf-vault-field">
            <div className="slf-vault-field-label">
              <LinkOutlined /> Base URL
            </div>
            <div className="slf-vault-field-box">
              <code className="slf-vault-mono">
                {active.base_url || "未填写"}
              </code>
              {active.base_url && (
                <Tooltip title="复制链接">
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copyText(active.base_url || "", "链接已复制")}
                  />
                </Tooltip>
              )}
            </div>
          </div>

          <div className="slf-vault-field">
            <div className="slf-vault-field-label">
              <TagsOutlined /> 可用模型
            </div>
            {active.models.length === 0 ? (
              <div className="slf-vault-muted">未填写模型</div>
            ) : (
              <div className="slf-vault-models">
                {active.models.map((model) => (
                  <Tooltip key={model} title="复制模型 ID">
                    <Tag
                      className="slf-vault-model"
                      onClick={() => copyText(model, "模型 ID 已复制")}
                    >
                      {model}
                    </Tag>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>

          {active.notes && (
            <div className="slf-vault-field">
              <div className="slf-vault-field-label">备注</div>
              <div className="slf-vault-notes">{active.notes}</div>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="slf-page slf-api-keys-page">
      <header className="slf-vault-head">
        <div>
          <h1>
            <KeyOutlined /> 密钥管理
          </h1>
          <p>集中保管 API Key、Base URL 与模型清单，一键复制，互不影响已有记录。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          添加密钥
        </Button>
      </header>

      <div className="slf-vault-body">
        {renderList()}
        {renderDetail()}
      </div>

      <Modal
        title={editingId ? "编辑密钥" : "添加密钥"}
        open={formOpen}
        onCancel={closeForm}
        onOk={() => save.mutate()}
        confirmLoading={save.isPending}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <KeyFields />
        </Form>
      </Modal>
    </div>
  );
}
