import React from "react";
import {
  App as AntdApp,
  Button,
  Card,
  Col,
  ColorPicker,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import {
  EditOutlined,
  PlusOutlined,
  ProjectOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { projects } from "@/api/client";
import { extractError } from "@/api/http";
import StatusTag from "@/components/StatusTag";
import UserBadge from "@/components/UserBadge";
import { fromNow } from "@/utils/format";
import type { Project } from "@/api/types";

const STATUS_OPTIONS = [
  { value: "planning", label: "规划中" },
  { value: "active", label: "进行中" },
  { value: "on_hold", label: "已挂起" },
  { value: "completed", label: "已完成" },
  { value: "archived", label: "已归档" },
];

function ProjectFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const isEdit = !!initial;

  React.useEffect(() => {
    if (open) {
      form.resetFields();
      if (initial) {
        form.setFieldsValue({
          ...initial,
          start_date: initial.start_date ? dayjs(initial.start_date) : null,
          end_date: initial.end_date ? dayjs(initial.end_date) : null,
        });
      } else {
        form.setFieldsValue({ status: "active", color: "#1677ff" });
      }
    }
  }, [open, initial, form]);

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      color: typeof values.color === "string" ? values.color : values.color?.toHexString?.() || "#1677ff",
      start_date: values.start_date ? values.start_date.format("YYYY-MM-DD") : null,
      end_date: values.end_date ? values.end_date.format("YYYY-MM-DD") : null,
    };
    try {
      if (isEdit && initial) {
        const { code: _ignored, ...rest } = payload;
        await projects.update(initial.id, rest);
      } else {
        await projects.create(payload);
      }
      message.success(isEdit ? "项目已更新" : "项目已创建");
      onSaved();
    } catch (e) {
      message.error(extractError(e, "保存失败"));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title={isEdit ? "编辑项目" : "新建项目"}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              label="项目代号"
              name="code"
              rules={[
                { required: true, message: "必填" },
                { pattern: /^[A-Za-z0-9_\-]+$/, message: "仅字母/数字/-/_" },
                { max: 32 },
              ]}
            >
              <Input disabled={isEdit} placeholder="如 SL_FLOW" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="项目名称"
              name="name"
              rules={[{ required: true, max: 128 }]}
            >
              <Input placeholder="项目全称" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="项目目标、范围…" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="状态" name="status" rules={[{ required: true }]}>
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="主题色" name="color">
              <ColorPicker showText format="hex" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="周期">
              <Input.Group compact>
                <Form.Item name="start_date" noStyle>
                  <DatePicker placeholder="开始" style={{ width: "50%" }} />
                </Form.Item>
                <Form.Item name="end_date" noStyle>
                  <DatePicker placeholder="结束" style={{ width: "50%" }} />
                </Form.Item>
              </Input.Group>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { modal, message } = AntdApp.useApp();
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>();
  const [editing, setEditing] = React.useState<Project | undefined>();
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["projects", q, statusFilter],
    queryFn: () => projects.list({ q: q || undefined, status: statusFilter }),
  });

  const remove = useMutation({
    mutationFn: projects.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      message.success("项目已删除");
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <ProjectOutlined /> 项目列表
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Input
            allowClear
            placeholder="搜索代号/名称"
            prefix={<SearchOutlined />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 130 }}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建项目
          </Button>
        </span>
      </h1>

      {isLoading ? (
        <Skeleton active />
      ) : data.length === 0 ? (
        <Empty description="尚无项目，点击右上角创建第一个项目" />
      ) : (
        <Row gutter={[16, 16]}>
          {data.map((p) => (
            <Col key={p.id} xs={24} sm={12} md={12} lg={8} xl={6}>
              <Card
                hoverable
                bordered={false}
                onClick={() => navigate(`/projects/${p.id}`)}
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  position: "relative",
                  background: `linear-gradient(160deg, ${p.color}22, transparent 60%)`,
                  border: "1px solid rgba(125,125,140,0.12)",
                }}
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(p);
                    }}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="del"
                    type="text"
                    danger
                    onClick={(e) => {
                      e.stopPropagation();
                      modal.confirm({
                        title: `删除项目 ${p.code} ?`,
                        content: "项目下的所有需求/任务/缺陷将一并删除。该操作不可恢复。",
                        okText: "删除",
                        okButtonProps: { danger: true },
                        cancelText: "取消",
                        onOk: () => remove.mutate(p.id),
                      });
                    }}
                  >
                    删除
                  </Button>,
                ]}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: p.color,
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  {p.code.slice(0, 2).toUpperCase()}
                </div>
                <Typography.Title level={5} style={{ margin: 0 }} ellipsis={{ tooltip: p.name }}>
                  {p.name}
                </Typography.Title>
                <div style={{ marginTop: 4, marginBottom: 10 }}>
                  <Tag>{p.code}</Tag>
                  <StatusTag value={p.status} />
                </div>
                <Typography.Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  style={{ minHeight: 36 }}
                >
                  {p.description || "暂无描述"}
                </Typography.Paragraph>
                <div style={{ display: "flex", gap: 14, fontSize: 12, opacity: 0.7 }}>
                  <span>需求 {p.story_count}</span>
                  <span>任务 {p.task_count}</span>
                  <span>缺陷 {p.bug_count}</span>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <UserBadge user={p.owner} size={22} />
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{fromNow(p.updated_at)}</span>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
      <ProjectFormModal
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          qc.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
    </div>
  );
}
