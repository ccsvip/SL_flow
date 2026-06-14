import React from "react";
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  AuditOutlined,
  CommentOutlined,
  DeleteOutlined,
  FileTextOutlined,
  MessageOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";

import { ai, prd } from "@/api/client";
import { extractError } from "@/api/http";
import { useProjectOptions } from "@/hooks/options";
import { fromNow } from "@/utils/format";
import type {
  PRDDocumentSummary,
  PRDSourceType,
  PRDStatus,
  PRDTemplate,
  PRDTemplateInfo,
} from "@/api/types";

// ---------------------------------------------------------------------------
// Static UI metadata
// ---------------------------------------------------------------------------

const STATUS_META: Record<PRDStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  generating: { label: "生成中", color: "blue" },
  ready: { label: "就绪", color: "green" },
  archived: { label: "已归档", color: "default" },
};

const TEMPLATE_BADGE: Record<PRDTemplate, { label: string; emoji: string; tint: string }> = {
  software_project: { label: "软件项目", emoji: "💻", tint: "#1677ff" },
  mini_program: { label: "小程序", emoji: "📱", tint: "#52c41a" },
  app: { label: "App", emoji: "📲", tint: "#722ed1" },
  admin_system: { label: "后台系统", emoji: "⚙️", tint: "#fa8c16" },
  ai_app: { label: "AI 应用", emoji: "✨", tint: "#eb2f96" },
  digital_human: { label: "数字人", emoji: "🤖", tint: "#13c2c2" },
  tob_delivery: { label: "ToB 交付", emoji: "📦", tint: "#2f54eb" },
};

const SOURCE_META: Record<
  PRDSourceType,
  { label: string; placeholder: string; description: string; icon: React.ReactNode }
> = {
  one_liner: {
    label: "一句话需求",
    description: "粗粒度想法，模型会主动补全细节并标注「待业务方确认」。",
    placeholder:
      "例：做一个团队任务看板，支持拖拽改状态，可以 @ 提醒别人，老板看得到燃尽图。",
    icon: <ThunderboltOutlined />,
  },
  chat_log: {
    label: "聊天记录",
    description: "可以是飞书/企微/微信导出的多轮对话；模型会过滤口语化与跑题。",
    placeholder: `[10:21] 张三: 老板说需要做一个员工排班\n[10:22] 李四: 移动端要不要？\n[10:22] 张三: 要的，先做 H5 …`,
    icon: <MessageOutlined />,
  },
  customer_feedback: {
    label: "客户反馈",
    description: "客户的吐槽/建议/真实场景，会拆解为需求池条目和优先级。",
    placeholder:
      "例：上次开会时客户说他们最头疼的是审批流卡在中层，需要支持自动催办和升级转交。",
    icon: <CommentOutlined />,
  },
  manual: {
    label: "我自己写",
    description: "跳过 AI 生成，建一个空白文档（可以稍后再调用单 section 重生成）。",
    placeholder: "（可选）粘一份你自己的草稿，AI 不会重写它。",
    icon: <ToolOutlined />,
  },
};

// ---------------------------------------------------------------------------
// PRD wizard
// ---------------------------------------------------------------------------

interface WizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

function PRDWizard({ open, onClose, onCreated }: WizardProps) {
  const { message } = AntdApp.useApp();
  const projectOpts = useProjectOptions();

  const [step, setStep] = React.useState(0);
  const [template, setTemplate] = React.useState<PRDTemplate | null>(null);
  const [sourceType, setSourceType] = React.useState<PRDSourceType>("one_liner");
  const [sourceInput, setSourceInput] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | undefined>(undefined);

  // Reset whenever the wizard re-opens.
  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setTemplate(null);
    setSourceType("one_liner");
    setSourceInput("");
    setTitle("");
    setExtra("");
    setProjectId(undefined);
  }, [open]);

  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ["prd-templates"],
    queryFn: prd.templates,
    enabled: open,
    staleTime: 60_000,
  });

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: ai.status,
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: () => {
      if (!template) throw new Error("请先选择模板");
      return prd.generate({
        template,
        source_type: sourceType,
        source_input: sourceInput,
        title: title || undefined,
        extra_instruction: extra || undefined,
        project_id: projectId,
      });
    },
    onSuccess: (doc) => {
      message.success("PRD 已生成");
      onCreated(doc.id);
    },
    onError: (e) => message.error(extractError(e, "生成失败")),
  });

  const aiOff = !aiStatus?.enabled;
  const sourceMeta = SOURCE_META[sourceType];

  const stepTitles = [
    { title: "选模板", icon: <FileTextOutlined /> },
    { title: "粘素材", icon: sourceMeta.icon },
    { title: "确认&生成", icon: <ThunderboltOutlined /> },
  ];

  const canNextStep0 = template !== null;
  const canNextStep1 = sourceType === "manual" || sourceInput.trim().length > 0;

  const renderTemplateGallery = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
        marginTop: 4,
      }}
    >
      {(templates || []).map((t) => {
        const meta = TEMPLATE_BADGE[t.template];
        const selected = template === t.template;
        return (
          <div
            key={t.template}
            className={`slf-prd-tpl-card ${selected ? "is-selected" : ""}`}
            onClick={() => setTemplate(t.template)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              <span
                style={{
                  display: "inline-grid",
                  placeItems: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: meta.tint + "22",
                  color: meta.tint,
                  fontSize: 16,
                }}
              >
                {meta.emoji}
              </span>
              {t.label}
            </div>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, lineHeight: 1.5 }}
            >
              {t.description}
            </Typography.Text>
            <div style={{ marginTop: "auto" }}>
              <Tag color="blue" style={{ fontSize: 11 }}>
                {t.sections.length} 个章节
              </Tag>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Modal
      open={open}
      title={
        <span>
          <ThunderboltOutlined style={{ color: "#722ed1" }} /> 新建 PRD
        </span>
      }
      onCancel={onClose}
      width={Math.min(960, window.innerWidth - 60)}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {step > 0 && (
            <Button onClick={() => setStep((s) => s - 1)} disabled={generate.isPending}>
              上一步
            </Button>
          )}
          {step < 2 && (
            <Button
              type="primary"
              disabled={(step === 0 && !canNextStep0) || (step === 1 && !canNextStep1)}
              onClick={() => setStep((s) => s + 1)}
            >
              下一步
            </Button>
          )}
          {step === 2 && (
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={generate.isPending}
              disabled={!template || aiOff}
              onClick={() => generate.mutate()}
            >
              开始生成
            </Button>
          )}
        </div>
      }
      destroyOnClose
    >
      <Steps
        current={step}
        size="small"
        items={stepTitles.map((s) => ({ title: s.title, icon: s.icon }))}
        style={{ marginBottom: 18 }}
      />

      {aiOff && (
        <div
          style={{
            background: "rgba(255, 197, 61, 0.18)",
            border: "1px solid rgba(255, 197, 61, 0.45)",
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          AI 功能未启用。请先让管理员在「AI 设置」配置 API Key 后再使用 PRD 生成。
        </div>
      )}

      {step === 0 && (
        <>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            选择最贴近你产品形态的模板，模型会按对应章节结构填写。
          </Typography.Paragraph>
          {loadingTemplates ? (
            <Spin />
          ) : (
            renderTemplateGallery()
          )}
          {template && (
            <Card
              size="small"
              style={{ marginTop: 16 }}
              title={`将填充 ${TEMPLATE_BADGE[template].label} 模板的章节`}
            >
              <ul style={{ margin: 0, paddingLeft: 20, columns: 2 }}>
                {(templates || [])
                  .find((t) => t.template === template)
                  ?.sections.map((s) => (
                    <li key={s.slug} style={{ fontSize: 12, lineHeight: 1.8 }}>
                      <span style={{ color: "var(--accent)" }}>{s.title}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {step === 1 && (
        <div>
          <Typography.Paragraph type="secondary">
            选择素材类型并粘贴原文。模型会根据类型采用不同的解析策略。
          </Typography.Paragraph>
          <Radio.Group
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {(Object.keys(SOURCE_META) as PRDSourceType[]).map((k) => (
              <Radio.Button key={k} value={k}>
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  {SOURCE_META[k].icon}
                  {SOURCE_META[k].label}
                </span>
              </Radio.Button>
            ))}
          </Radio.Group>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {sourceMeta.description}
          </Typography.Text>
          <Input.TextArea
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            placeholder={sourceMeta.placeholder}
            rows={10}
            style={{ marginTop: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, display: "block", marginTop: 6 }}
          >
            字数 {sourceInput.length} / 模型上下文上限会自动截断较早内容。
          </Typography.Text>
        </div>
      )}

      {step === 2 && (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <Typography.Text strong>模板：</Typography.Text>{" "}
            {template && (
              <Tag color="purple">
                {TEMPLATE_BADGE[template].emoji} {TEMPLATE_BADGE[template].label}
              </Tag>
            )}
          </div>
          <div>
            <Typography.Text strong>素材类型：</Typography.Text>{" "}
            <Tag>{sourceMeta.label}</Tag>{" "}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {sourceInput.length} 字
            </Typography.Text>
          </div>

          <div>
            <Typography.Text strong>文档标题（可选）：</Typography.Text>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空将由 AI 根据内容生成"
              style={{ marginTop: 4 }}
            />
          </div>

          <div>
            <Typography.Text strong>关联项目（可选）：</Typography.Text>
            <Select
              allowClear
              style={{ width: "100%", marginTop: 4 }}
              options={projectOpts}
              value={projectId}
              onChange={setProjectId}
              placeholder="选择已有项目，便于后续把需求池一键转为 Story"
              showSearch
              optionFilterProp="label"
            />
          </div>

          <div>
            <Typography.Text strong>额外指令（可选）：</Typography.Text>
            <Input.TextArea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="例：重点突出移动端体验 / 用 1.5 周交付节奏 / 引用现有项目 SLF 的命名规范"
              style={{ marginTop: 4 }}
            />
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(125,125,140,0.08)",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            ✓ 章节填充 · ✓ 需求池抽取 · ✓ 优先级 / 验收标准 / 边界条件 / 异常流程 / 接口草稿 / 页面原型说明
          </div>
        </Space>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PRD list page
// ---------------------------------------------------------------------------

export default function PRDListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { modal, message } = AntdApp.useApp();

  const [q, setQ] = React.useState("");
  const [templateFilter, setTemplateFilter] = React.useState<PRDTemplate | undefined>();
  const [statusFilter, setStatusFilter] = React.useState<PRDStatus | undefined>();
  const [mine, setMine] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["prd-documents", { q, templateFilter, statusFilter, mine }],
    queryFn: () =>
      prd.list({
        q: q || undefined,
        template: templateFilter,
        status: statusFilter,
        mine: mine || undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => prd.remove(id),
    onSuccess: () => {
      message.success("已删除");
      qc.invalidateQueries({ queryKey: ["prd-documents"] });
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  const columns: ColumnsType<PRDDocumentSummary> = [
    { title: "ID", dataIndex: "id", width: 70 },
    {
      title: "标题",
      dataIndex: "title",
      render: (_, r) => (
        <a onClick={() => navigate(`/prd/${r.id}`)} style={{ fontWeight: 500 }}>
          {r.title}
          {r.summary && (
            <Typography.Paragraph
              type="secondary"
              ellipsis={{ rows: 1 }}
              style={{ margin: 0, fontSize: 12, fontWeight: 400 }}
            >
              {r.summary}
            </Typography.Paragraph>
          )}
        </a>
      ),
    },
    {
      title: "模板",
      dataIndex: "template",
      width: 130,
      render: (v: PRDTemplate) => {
        const meta = TEMPLATE_BADGE[v];
        return (
          <Tag color="purple">
            {meta.emoji} {meta.label}
          </Tag>
        );
      },
      filters: (Object.keys(TEMPLATE_BADGE) as PRDTemplate[]).map((k) => ({
        text: TEMPLATE_BADGE[k].label,
        value: k,
      })),
      onFilter: (v, r) => r.template === v,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (v: PRDStatus) => <Tag color={STATUS_META[v].color}>{STATUS_META[v].label}</Tag>,
    },
    {
      title: "需求条数",
      dataIndex: "requirement_count",
      width: 110,
      align: "center",
      render: (v: number) =>
        v > 0 ? (
          <Tag color="blue" icon={<AuditOutlined />}>
            {v}
          </Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "创建者",
      dataIndex: "creator",
      width: 110,
      render: (_, r) => r.creator?.full_name || r.creator?.username || "—",
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 120,
      render: (v) => <Typography.Text type="secondary">{fromNow(v)}</Typography.Text>,
    },
    {
      title: "操作",
      width: 60,
      align: "center",
      render: (_, r) => (
        <Tooltip title="删除">
          <Button
            danger
            type="text"
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              modal.confirm({
                title: `删除 PRD「${r.title}」？`,
                content: "删除后需求池一同消失，不可恢复。",
                okText: "删除",
                okButtonProps: { danger: true },
                onOk: () => remove.mutateAsync(r.id),
              });
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <FileTextOutlined /> PRD / 需求文档
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Input
            allowClear
            placeholder="搜索标题"
            prefix={<SearchOutlined />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 200 }}
          />
          <Select
            allowClear
            placeholder="模板"
            style={{ width: 150 }}
            value={templateFilter}
            onChange={setTemplateFilter}
            options={(Object.keys(TEMPLATE_BADGE) as PRDTemplate[]).map((k) => ({
              value: k,
              label: `${TEMPLATE_BADGE[k].emoji} ${TEMPLATE_BADGE[k].label}`,
            }))}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 110 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={(Object.keys(STATUS_META) as PRDStatus[]).map((k) => ({
              value: k,
              label: STATUS_META[k].label,
            }))}
          />
          <Button
            type={mine ? "primary" : "default"}
            ghost={mine}
            onClick={() => setMine((m) => !m)}
          >
            只看我的
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setWizardOpen(true)}
          >
            新建 PRD
          </Button>
        </span>
      </h1>

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={isLoading}
          onRow={(r) => ({ onClick: () => navigate(`/prd/${r.id}`) })}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{
            emptyText: (
              <Empty
                description={
                  <span>
                    还没有 PRD 文档。
                    <Button
                      type="link"
                      onClick={() => setWizardOpen(true)}
                      style={{ padding: "0 4px" }}
                    >
                      立即创建
                    </Button>
                    一份。
                  </span>
                }
              />
            ),
          }}
          size="middle"
          rowClassName={() => "slf-clickable-row"}
        />
      </Card>

      <PRDWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => {
          setWizardOpen(false);
          qc.invalidateQueries({ queryKey: ["prd-documents"] });
          navigate(`/prd/${id}`);
        }}
      />
    </div>
  );
}
