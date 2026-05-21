import React from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Table,
  Tooltip,
  Typography,
} from "antd";
import {
  BugOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";

import { bugs } from "@/api/client";
import StatusTag from "@/components/StatusTag";
import UserBadge from "@/components/UserBadge";
import BugDrawer from "@/components/drawers/BugDrawer";
import { useProjectOptions } from "@/hooks/options";
import { fromNow } from "@/utils/format";
import type { Bug } from "@/api/types";

const STATUS_OPTIONS = [
  { value: "open", label: "未解决" },
  { value: "in_progress", label: "进行中" },
  { value: "resolved", label: "已解决" },
  { value: "closed", label: "已关闭" },
  { value: "reopened", label: "重新打开" },
];

const SEVERITY_OPTIONS = [
  { value: "trivial", label: "轻微" },
  { value: "minor", label: "次要" },
  { value: "major", label: "重要" },
  { value: "critical", label: "严重" },
  { value: "blocker", label: "阻塞" },
];

export default function BugsPage() {
  const qc = useQueryClient();
  const projectOpts = useProjectOptions();
  const [q, setQ] = React.useState("");
  const [projectId, setProjectId] = React.useState<number>();
  const [statusFilter, setStatusFilter] = React.useState<string>();
  const [severityFilter, setSeverityFilter] = React.useState<string>();
  const [editing, setEditing] = React.useState<Bug | undefined>();
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["bugs", { q, project_id: projectId, status: statusFilter, severity: severityFilter }],
    queryFn: () =>
      bugs.list({
        q: q || undefined,
        project_id: projectId,
        status: statusFilter,
        severity: severityFilter,
      }),
  });

  const columns: ColumnsType<Bug> = [
    { title: "ID", dataIndex: "id", width: 70 },
    {
      title: "标题",
      dataIndex: "title",
      render: (_, r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <a onClick={() => setEditing(r)} style={{ fontWeight: 500 }}>
            {r.title}
          </a>
          {r.attachment_count > 0 && (
            <Tooltip title={`含 ${r.attachment_count} 个附件`}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: 12,
                  color: "var(--accent, #1677ff)",
                  background: "rgba(22,119,255,0.1)",
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontWeight: 600,
                }}
              >
                <PaperClipOutlined style={{ fontSize: 11 }} />
                {r.attachment_count}
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: "项目",
      dataIndex: "project_id",
      width: 140,
      render: (v) => projectOpts.find((p) => p.value === v)?.label || `#${v}`,
    },
    { title: "状态", dataIndex: "status", width: 100, render: (v) => <StatusTag value={v} /> },
    {
      title: "严重程度",
      dataIndex: "severity",
      width: 100,
      render: (v) => <StatusTag value={v} />,
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 90,
      render: (v) => <StatusTag value={v} />,
    },
    {
      title: "负责人",
      dataIndex: "assignee",
      width: 160,
      render: (_, r) => <UserBadge user={r.assignee} size={22} />,
    },
    {
      title: "更新",
      dataIndex: "updated_at",
      width: 110,
      render: (v) => <Typography.Text type="secondary">{fromNow(v)}</Typography.Text>,
    },
  ];

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <BugOutlined /> 缺陷追踪
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
            placeholder="项目"
            options={projectOpts}
            style={{ width: 180 }}
            value={projectId}
            onChange={(v) => setProjectId(v)}
            showSearch
            optionFilterProp="label"
          />
          <Select
            allowClear
            placeholder="状态"
            options={STATUS_OPTIONS}
            style={{ width: 130 }}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <Select
            allowClear
            placeholder="严重程度"
            options={SEVERITY_OPTIONS}
            style={{ width: 130 }}
            value={severityFilter}
            onChange={setSeverityFilter}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建缺陷
          </Button>
        </span>
      </h1>

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="暂无缺陷" /> }}
          size="middle"
        />
      </Card>

      <BugDrawer
        open={createOpen}
        defaultProjectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["bugs"] });
        }}
      />
      <BugDrawer
        open={!!editing}
        bug={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          qc.invalidateQueries({ queryKey: ["bugs"] });
        }}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["bugs"] })}
      />
    </div>
  );
}
