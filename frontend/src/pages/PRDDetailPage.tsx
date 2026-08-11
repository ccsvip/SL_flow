import React from "react";
import {
  App as AntdApp,
  Badge,
  Button,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  EyeOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { ai, prd } from "@/api/client";
import { extractError, http } from "@/api/http";
import MarkdownView from "@/components/MarkdownView";
import { useProjectOptions } from "@/hooks/options";
import { fromNow } from "@/utils/format";
import type {
  PRDDocument,
  PRDPriority,
  PRDRequirement,
  PRDTemplate,
  PRDTemplateInfo,
} from "@/api/types";

// ---------------------------------------------------------------------------
// Static metadata (mirrored from PRDListPage to keep the file self-contained;
// duplication < importing from a sibling page that owns presentation state.)
// ---------------------------------------------------------------------------

const TEMPLATE_BADGE: Record<PRDTemplate, { label: string; emoji: string }> = {
  software_project: { label: "软件项目", emoji: "💻" },
  mini_program: { label: "小程序", emoji: "📱" },
  app: { label: "App", emoji: "📲" },
  admin_system: { label: "后台系统", emoji: "⚙️" },
  ai_app: { label: "AI 应用", emoji: "✨" },
  digital_human: { label: "数字人", emoji: "🤖" },
  tob_delivery: { label: "ToB 交付", emoji: "📦" },
};

const PRIORITY_META: Record<PRDPriority, { label: string; color: string }> = {
  urgent: { label: "P0 紧急", color: "red" },
  high: { label: "P1 高", color: "orange" },
  medium: { label: "P2 中", color: "blue" },
  low: { label: "P3 低", color: "default" },
};

// Section markers are HTML comments embedded in the markdown body so
// per-section regenerate can splice in by string match. Hide them in
// the edit-mode textarea so a user doesn't accidentally delete one and
// silently break section regen. The backend's PATCH handler re-injects
// markers by heading-match before persisting, so a clean round-trip is
// guaranteed.
const SECTION_MARKER_RE = /<!--\s*prd:section:(?:start|end):[^>]*-->\n?/g;
function stripSectionMarkers(md: string): string {
  return md.replace(SECTION_MARKER_RE, "");
}

// ---------------------------------------------------------------------------
// Section regenerate dialog
// ---------------------------------------------------------------------------

interface RegenSectionDialogProps {
  open: boolean;
  docId: number;
  template: PRDTemplate;
  templates: PRDTemplateInfo[] | undefined;
  defaultSlug?: string;
  onClose: () => void;
  onRegenerated: () => void;
}

function RegenSectionDialog({
  open,
  docId,
  template,
  templates,
  defaultSlug,
  onClose,
  onRegenerated,
}: RegenSectionDialogProps) {
  const { message } = AntdApp.useApp();
  const [slug, setSlug] = React.useState<string>(defaultSlug || "");
  const [extra, setExtra] = React.useState("");

  const tplInfo = templates?.find((t) => t.template === template);

  React.useEffect(() => {
    if (open) {
      setSlug(defaultSlug || tplInfo?.sections[0]?.slug || "");
      setExtra("");
    }
  }, [open, defaultSlug, tplInfo]);

  const regen = useMutation({
    mutationFn: () => prd.regenerateSection(docId, slug, extra || undefined),
    onSuccess: () => {
      message.success("章节已重生成");
      onRegenerated();
    },
    onError: (e) => message.error(extractError(e, "重生成失败")),
  });

  return (
    <Modal
      open={open}
      title={
        <span>
          <ReloadOutlined /> 重新生成章节
        </span>
      }
      onCancel={onClose}
      onOk={() => regen.mutate()}
      okText="重新生成"
      okButtonProps={{ loading: regen.isPending, disabled: !slug }}
      destroyOnClose
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div>
          <Typography.Text strong>章节</Typography.Text>
          <Select
            value={slug}
            onChange={setSlug}
            style={{ width: "100%", marginTop: 4 }}
            options={(tplInfo?.sections || []).map((s) => ({
              value: s.slug,
              label: s.title,
            }))}
            showSearch
            optionFilterProp="label"
          />
        </div>
        <div>
          <Typography.Text strong>额外指令（可选）</Typography.Text>
          <Input.TextArea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={3}
            placeholder="例：列出 5 个边界条件 / 写得更详细 / 改成英文 / 加一个表格…"
            style={{ marginTop: 4 }}
          />
        </div>
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Requirement editor row
// ---------------------------------------------------------------------------

interface ReqRowProps {
  req: PRDRequirement;
  onUpdated: () => void;
  onDeleted: () => void;
}

function RequirementRow({ req, onUpdated, onDeleted }: ReqRowProps) {
  const { message, modal } = AntdApp.useApp();
  const [editing, setEditing] = React.useState(false);
  const [form] = Form.useForm();

  const update = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      return prd.updateRequirement(req.id, v);
    },
    onSuccess: () => {
      message.success("已更新");
      setEditing(false);
      onUpdated();
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const remove = useMutation({
    mutationFn: () => prd.removeRequirement(req.id),
    onSuccess: () => {
      message.success("已删除");
      onDeleted();
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  React.useEffect(() => {
    if (editing) {
      form.setFieldsValue({
        title: req.title,
        description: req.description,
        acceptance_criteria: req.acceptance_criteria,
        priority: req.priority,
        category: req.category,
        tag: req.tag,
      });
    }
  }, [editing, req, form]);

  if (editing) {
    return (
      <Card size="small" style={{ marginBottom: 8 }}>
        <Form form={form} layout="vertical" requiredMark={false} size="small">
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: "必填" }]}
            style={{ marginBottom: 8 }}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description" style={{ marginBottom: 8 }}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            label="验收标准"
            name="acceptance_criteria"
            style={{ marginBottom: 8 }}
          >
            <Input.TextArea rows={2} placeholder="给定…当…那么…" />
          </Form.Item>
          <Space>
            <Form.Item label="优先级" name="priority" style={{ marginBottom: 8 }}>
              <Select
                style={{ width: 110 }}
                options={(Object.keys(PRIORITY_META) as PRDPriority[]).map((k) => ({
                  value: k,
                  label: PRIORITY_META[k].label,
                }))}
              />
            </Form.Item>
            <Form.Item label="分类" name="category" style={{ marginBottom: 8 }}>
              <Input style={{ width: 140 }} placeholder="例：登录 / 看板" />
            </Form.Item>
            <Form.Item label="标签" name="tag" style={{ marginBottom: 8 }}>
              <Input style={{ width: 100 }} placeholder="must/should…" />
            </Form.Item>
          </Space>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={() => setEditing(false)}>取消</Button>
            <Button
              type="primary"
              loading={update.isPending}
              onClick={() => update.mutate()}
            >
              保存
            </Button>
          </div>
        </Form>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      bodyStyle={{ padding: "10px 14px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Tag color={PRIORITY_META[req.priority].color} style={{ margin: 0 }}>
              {PRIORITY_META[req.priority].label}
            </Tag>
            {req.category && (
              <Tag color="cyan" style={{ margin: 0 }}>
                {req.category}
              </Tag>
            )}
            {req.tag && <Tag style={{ margin: 0 }}>{req.tag}</Tag>}
            {req.converted_story_id && (
              <Tag color="green" style={{ margin: 0 }}>
                ✓ 已落地 → 故事 #{req.converted_story_id}
              </Tag>
            )}
            <Typography.Text strong style={{ fontSize: 14 }}>
              {req.title}
            </Typography.Text>
          </div>
          {req.description && (
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.6 }}
              ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
            >
              {req.description}
            </Typography.Paragraph>
          )}
          {req.acceptance_criteria && (
            <div
              style={{
                fontSize: 12,
                marginTop: 4,
                padding: "4px 8px",
                background: "rgba(82,196,26,0.08)",
                borderLeft: "3px solid #52c41a",
                borderRadius: 4,
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "#52c41a" }}>验收：</strong>
              {req.acceptance_criteria}
            </div>
          )}
        </div>
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(true)}
          />
          <Popconfirm
            title="删除这条需求？"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove.mutate()}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Convert-to-stories dialog
// ---------------------------------------------------------------------------

function ConvertDialog({
  open,
  doc,
  onClose,
  onDone,
}: {
  open: boolean;
  doc: PRDDocument;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const projectOpts = useProjectOptions();
  const [projectId, setProjectId] = React.useState<number | undefined>(
    doc.project_id ?? undefined,
  );
  const [selected, setSelected] = React.useState<number[]>([]);

  const eligible = doc.requirements.filter((r) => !r.converted_story_id);

  React.useEffect(() => {
    if (open) {
      setProjectId(doc.project_id ?? undefined);
      setSelected(eligible.map((r) => r.id));
    }
  }, [open, doc]);

  const convert = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error("请先选择目标项目");
      return prd.convertToStories(
        doc.id,
        projectId,
        selected.length === eligible.length ? undefined : selected,
      );
    },
    onSuccess: (res) => {
      message.success(
        `成功创建 ${res.created_story_ids.length} 条故事${
          res.skipped_requirement_ids.length
            ? `，跳过 ${res.skipped_requirement_ids.length} 条已落地的`
            : ""
        }`,
      );
      onDone();
    },
    onError: (e) => message.error(extractError(e, "转换失败")),
  });

  return (
    <Modal
      open={open}
      title="将需求池一键转为故事 (Story)"
      onCancel={onClose}
      onOk={() => convert.mutate()}
      okText={`转换 ${selected.length} 条`}
      okButtonProps={{
        loading: convert.isPending,
        disabled: !projectId || selected.length === 0,
      }}
      width={720}
      destroyOnClose
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div>
          <Typography.Text strong>目标项目</Typography.Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            options={projectOpts}
            value={projectId}
            onChange={setProjectId}
            placeholder="选择故事归属的项目"
            showSearch
            optionFilterProp="label"
          />
        </div>

        {eligible.length === 0 ? (
          <Empty description="所有需求都已经落地为故事了 🎉" />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography.Text>
                选择要转换的需求（{selected.length} / {eligible.length}）
              </Typography.Text>
              <Space>
                <Button
                  size="small"
                  onClick={() => setSelected(eligible.map((r) => r.id))}
                >
                  全选
                </Button>
                <Button size="small" onClick={() => setSelected([])}>
                  清空
                </Button>
              </Space>
            </div>
            <div
              style={{
                maxHeight: 360,
                overflowY: "auto",
                border: "1px solid rgba(125,125,140,0.2)",
                borderRadius: 8,
                padding: 8,
              }}
            >
              {eligible.map((r) => {
                const checked = selected.includes(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(r.id)
                          ? prev.filter((id) => id !== r.id)
                          : [...prev, r.id],
                      )
                    }
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: checked ? "rgba(22,119,255,0.1)" : "transparent",
                      borderLeft: checked
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      style={{ pointerEvents: "none" }}
                    />
                    <Tag color={PRIORITY_META[r.priority].color} style={{ margin: 0 }}>
                      {PRIORITY_META[r.priority].label}
                    </Tag>
                    <span style={{ flex: 1, fontSize: 13 }}>{r.title}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main detail page
// ---------------------------------------------------------------------------

export default function PRDDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const docId = Number(idParam);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [editingBody, setEditingBody] = React.useState("");
  const [editingTitle, setEditingTitle] = React.useState("");
  const [bodyTouched, setBodyTouched] = React.useState(false);
  const [regenSectionOpen, setRegenSectionOpen] = React.useState(false);
  const [regenSlug, setRegenSlug] = React.useState<string | undefined>();
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [addReqOpen, setAddReqOpen] = React.useState(false);
  const [addForm] = Form.useForm();

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ["prd-document", docId],
    queryFn: () => prd.get(docId),
    enabled: Number.isFinite(docId) && docId > 0,
  });

  const { data: templates } = useQuery({
    queryKey: ["prd-templates"],
    queryFn: prd.templates,
    staleTime: 60_000,
  });

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: ai.status,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (doc) {
      // Strip section markers from the textarea so users see clean
      // markdown. The backend re-injects markers on PATCH (see
      // routes/prd.py::update_document).
      setEditingBody(stripSectionMarkers(doc.content));
      setEditingTitle(doc.title);
      setBodyTouched(false);
    }
  }, [doc?.id, doc?.updated_at]);

  const saveBody = useMutation({
    mutationFn: () =>
      prd.update(docId, {
        title: editingTitle,
        content: editingBody,
      }),
    onSuccess: () => {
      message.success("已保存");
      setBodyTouched(false);
      qc.invalidateQueries({ queryKey: ["prd-document", docId] });
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const regenerateAll = useMutation({
    mutationFn: (extra?: string) => prd.regenerate(docId, extra),
    onSuccess: () => {
      message.success("整份 PRD 已重新生成");
      qc.invalidateQueries({ queryKey: ["prd-document", docId] });
    },
    onError: (e) => message.error(extractError(e, "重生成失败")),
  });

  const reextract = useMutation({
    mutationFn: () => prd.reextract(docId),
    onSuccess: () => {
      message.success("已重新提取需求池");
      qc.invalidateQueries({ queryKey: ["prd-document", docId] });
    },
    onError: (e) => message.error(extractError(e, "提取失败")),
  });

  const remove = useMutation({
    mutationFn: () => prd.remove(docId),
    onSuccess: () => {
      message.success("已删除");
      navigate("/prd");
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  const addReq = useMutation({
    mutationFn: async () => {
      const v = await addForm.validateFields();
      return prd.addRequirement(docId, v);
    },
    onSuccess: () => {
      message.success("已添加需求");
      setAddReqOpen(false);
      addForm.resetFields();
      qc.invalidateQueries({ queryKey: ["prd-document", docId] });
    },
    onError: (e) => message.error(extractError(e, "添加失败")),
  });

  const downloadExport = async (fmt: "markdown" | "html") => {
    try {
      const r = await prd.exportBlob(docId, fmt);
      // Server already sets a Content-Disposition with filename, but we
      // honour it manually so the FE works whether or not Axios surfaced
      // the header (some setups strip it for cross-origin reasons).
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (doc?.title || "prd").replace(/[\\/:*?"<>|]/g, "_");
      a.download = `${safe}.${fmt === "markdown" ? "md" : "html"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(extractError(e, "导出失败"));
    }
  };

  if (!Number.isFinite(docId) || docId <= 0) {
    return (
      <div className="slf-page">
        <Empty description="无效的 PRD ID" />
      </div>
    );
  }

  if (isLoading || !doc) {
    return (
      <div className="slf-page">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="slf-page">
        <Empty description="加载失败，请稍后重试" />
      </div>
    );
  }

  const tplMeta = TEMPLATE_BADGE[doc.template];
  const tplInfo = templates?.find((t) => t.template === doc.template);
  const aiOff = !aiStatus?.enabled;

  return (
    <div className="slf-page" style={{ paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/prd")}>
          返回列表
        </Button>
        <Tag color="purple" style={{ marginRight: 0 }}>
          {tplMeta.emoji} {tplMeta.label}
        </Tag>
        {doc.generated_model && (
          <Tooltip title="生成所用的模型">
            <Tag>{doc.generated_model}</Tag>
          </Tooltip>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          创建于 {fromNow(doc.created_at)} · 更新于 {fromNow(doc.updated_at)}
        </Typography.Text>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Segmented
            value={mode}
            options={[
              { label: <span><EyeOutlined /> 预览</span>, value: "preview" },
              { label: <span><EditOutlined /> 编辑</span>, value: "edit" },
            ]}
            onChange={(v) => {
              if (mode === "edit" && bodyTouched) {
                modal.confirm({
                  title: "切换到预览前要保存吗？",
                  content: "未保存的内容将丢失。",
                  okText: "保存并切换",
                  cancelText: "丢弃",
                  onOk: async () => {
                    await saveBody.mutateAsync();
                    setMode(v as "preview" | "edit");
                  },
                  onCancel: () => {
                    setEditingBody(stripSectionMarkers(doc.content));
                    setBodyTouched(false);
                    setMode(v as "preview" | "edit");
                  },
                });
              } else {
                setMode(v as "preview" | "edit");
              }
            }}
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: "regen-all",
                  label: "重生成整份 PRD",
                  icon: <ThunderboltOutlined />,
                  disabled: aiOff,
                  onClick: () =>
                    modal.confirm({
                      title: "重新生成整份 PRD？",
                      content:
                        "需求池将被全量替换，建议先把已落地的故事 ID 备份；操作可在「操作日志」回查。",
                      okText: "确认重生成",
                      onOk: () => regenerateAll.mutateAsync(undefined),
                    }),
                },
                {
                  key: "regen-section",
                  label: "重生成某章节",
                  icon: <ReloadOutlined />,
                  disabled: aiOff,
                  onClick: () => {
                    setRegenSlug(undefined);
                    setRegenSectionOpen(true);
                  },
                },
                {
                  key: "reextract",
                  label: "重新提取需求池",
                  icon: <ReloadOutlined />,
                  disabled: aiOff,
                  onClick: () =>
                    modal.confirm({
                      title: "重新提取需求池？",
                      content: "原有需求会被替换；已落地为故事的链接会按标题尝试保留。",
                      okText: "确认提取",
                      onOk: () => reextract.mutateAsync(),
                    }),
                },
                { type: "divider" as const },
                {
                  key: "export-md",
                  label: "导出 Markdown",
                  icon: <DownloadOutlined />,
                  onClick: () => downloadExport("markdown"),
                },
                {
                  key: "export-html",
                  label: "导出 HTML",
                  icon: <ExportOutlined />,
                  onClick: () => downloadExport("html"),
                },
                { type: "divider" as const },
                {
                  key: "delete",
                  label: "删除 PRD",
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () =>
                    modal.confirm({
                      title: `删除「${doc.title}」？`,
                      okText: "删除",
                      okButtonProps: { danger: true },
                      onOk: () => remove.mutateAsync(),
                    }),
                },
              ],
            }}
            trigger={["click"]}
          >
            <Button icon={<MoreOutlined />}>更多操作</Button>
          </Dropdown>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Document body ----------------------------------------- */}
        <Card
          bordered={false}
          title={
            mode === "edit" ? (
              <Input
                value={editingTitle}
                onChange={(e) => {
                  setEditingTitle(e.target.value);
                  setBodyTouched(true);
                }}
                size="large"
                bordered={false}
                style={{ fontWeight: 700, fontSize: 18, padding: 0 }}
              />
            ) : (
              <span style={{ fontSize: 18 }}>
                <FileTextOutlined /> {doc.title}
              </span>
            )
          }
          extra={
            mode === "edit" && (
              <Space>
                <Button
                  onClick={() => {
                    setEditingBody(stripSectionMarkers(doc.content));
                    setEditingTitle(doc.title);
                    setBodyTouched(false);
                  }}
                  disabled={!bodyTouched}
                >
                  撤销
                </Button>
                <Button
                  type="primary"
                  loading={saveBody.isPending}
                  disabled={!bodyTouched}
                  onClick={() => saveBody.mutate()}
                >
                  保存
                </Button>
              </Space>
            )
          }
        >
          {doc.summary && mode === "preview" && (
            <div
              style={{
                padding: 14,
                marginBottom: 18,
                background:
                  "linear-gradient(135deg, rgba(22,119,255,0.08), rgba(114,46,209,0.06))",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.7,
                borderLeft: "3px solid var(--accent)",
              }}
            >
              <Typography.Text strong>摘要：</Typography.Text> {doc.summary}
            </div>
          )}

          {/* Truncation hint: surfaced from the persisted
              last_generation_truncated flag (set by the backend whenever
              an AI generation/regeneration falls into the JSON-fallback
              path). Reading this off the doc avoids the false-positive
              ("user manually emptied requirement pool") and false-negative
              ("model truncated but produced 1-2 reqs") cases of the old
              heuristic. */}
          {mode === "preview" && doc.last_generation_truncated && (
            <div
              style={{
                padding: 12,
                marginBottom: 14,
                background: "rgba(255, 197, 61, 0.18)",
                border: "1px solid rgba(255, 197, 61, 0.45)",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <Typography.Text strong>⚠️ 上次生成被截断</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", fontSize: 12 }}>
                AI 服务商在返回完整 PRD 之前提前截断了输出，正文与需求池可能不完整。点击右上角「更多操作 →
                重新提取需求池」从当前正文里重抽，或「重生成整份 PRD」整体重试。
              </Typography.Paragraph>
            </div>
          )}

          {mode === "preview" ? (
            doc.content ? (
              <div style={{ position: "relative" }}>
                <MarkdownView markdown={doc.content} />
                {tplInfo && !aiOff && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: 12,
                      background: "rgba(125,125,140,0.08)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    <Typography.Text type="secondary">
                      想单独优化某个章节？
                    </Typography.Text>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      {tplInfo.sections.map((s) => (
                        <Button
                          key={s.slug}
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {
                            setRegenSlug(s.slug);
                            setRegenSectionOpen(true);
                          }}
                        >
                          {s.title}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Empty description="文档为空，可在右上角切到「编辑」开始写。" />
            )
          ) : (
            <Input.TextArea
              value={editingBody}
              onChange={(e) => {
                setEditingBody(e.target.value);
                setBodyTouched(true);
              }}
              autoSize={{ minRows: 24 }}
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            />
          )}
        </Card>

        {/* Side panel: requirement pool -------------------------- */}
        <div style={{ position: "sticky", top: 76 }}>
          <Card
            bordered={false}
            title={
              <span>
                <FileTextOutlined /> 需求池{" "}
                <Badge
                  count={doc.requirements.length}
                  style={{ background: "var(--accent)" }}
                />
              </span>
            }
            extra={
              <Space size={4}>
                <Tooltip title="手动添加一条需求">
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => setAddReqOpen(true)}
                  />
                </Tooltip>
                <Tooltip title="从当前正文重新提取需求池">
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={reextract.isPending}
                    disabled={aiOff}
                    onClick={() =>
                      modal.confirm({
                        title: "重新提取需求池？",
                        content: "原有需求会被替换；已落地为故事的链接会按标题尝试保留。",
                        okText: "确认",
                        onOk: () => reextract.mutateAsync(),
                      })
                    }
                  />
                </Tooltip>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  disabled={doc.requirements.length === 0}
                  onClick={() => setConvertOpen(true)}
                >
                  转故事
                </Button>
              </Space>
            }
            bodyStyle={{
              maxHeight: "calc(100vh - 220px)",
              overflowY: "auto",
              padding: 12,
            }}
          >
            {doc.suggested_project_name && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  background: "rgba(22,119,255,0.06)",
                  borderRadius: 6,
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                <Typography.Text strong>建议项目：</Typography.Text>{" "}
                {doc.suggested_project_name}{" "}
                {doc.suggested_project_code && (
                  <Tag style={{ marginLeft: 4 }}>{doc.suggested_project_code}</Tag>
                )}
              </div>
            )}

            {doc.requirements.length === 0 ? (
              <Empty
                description={
                  <div>
                    <div style={{ marginBottom: 8 }}>暂无原子需求</div>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      disabled={aiOff}
                      onClick={() => reextract.mutateAsync()}
                      loading={reextract.isPending}
                    >
                      从正文 AI 提取
                    </Button>
                  </div>
                }
              />
            ) : (
              doc.requirements.map((r) => (
                <RequirementRow
                  key={r.id}
                  req={r}
                  onUpdated={() =>
                    qc.invalidateQueries({ queryKey: ["prd-document", docId] })
                  }
                  onDeleted={() =>
                    qc.invalidateQueries({ queryKey: ["prd-document", docId] })
                  }
                />
              ))
            )}
          </Card>
        </div>
      </div>

      <RegenSectionDialog
        open={regenSectionOpen}
        docId={docId}
        template={doc.template}
        templates={templates}
        defaultSlug={regenSlug}
        onClose={() => setRegenSectionOpen(false)}
        onRegenerated={() => {
          setRegenSectionOpen(false);
          qc.invalidateQueries({ queryKey: ["prd-document", docId] });
        }}
      />

      <ConvertDialog
        open={convertOpen}
        doc={doc}
        onClose={() => setConvertOpen(false)}
        onDone={() => {
          setConvertOpen(false);
          qc.invalidateQueries({ queryKey: ["prd-document", docId] });
          qc.invalidateQueries({ queryKey: ["stories"] });
        }}
      />

      {/* Add requirement -------------------------------------- */}
      <Modal
        open={addReqOpen}
        title="新增一条原子需求"
        onCancel={() => setAddReqOpen(false)}
        onOk={() => addReq.mutate()}
        okButtonProps={{ loading: addReq.isPending }}
        destroyOnClose
      >
        <Form
          form={addForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{ priority: "medium" }}
        >
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: "必填" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="验收标准" name="acceptance_criteria">
            <Input.TextArea rows={2} placeholder="给定…当…那么…" />
          </Form.Item>
          <Space>
            <Form.Item label="优先级" name="priority" style={{ marginBottom: 0 }}>
              <Select
                style={{ width: 120 }}
                options={(Object.keys(PRIORITY_META) as PRDPriority[]).map((k) => ({
                  value: k,
                  label: PRIORITY_META[k].label,
                }))}
              />
            </Form.Item>
            <Form.Item label="分类" name="category" style={{ marginBottom: 0 }}>
              <Input style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="标签" name="tag" style={{ marginBottom: 0 }}>
              <Input style={{ width: 100 }} placeholder="must/should…" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
