import React from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
} from "antd";
import {
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";

import { stories } from "@/api/client";
import StatusTag from "@/components/StatusTag";
import UserBadge from "@/components/UserBadge";
import StoryDrawer from "@/components/drawers/StoryDrawer";
import { useProjectOptions } from "@/hooks/options";
import { fromNow } from "@/utils/format";
import type { Story } from "@/api/types";

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "进行中" },
  { value: "in_review", label: "评审中" },
  { value: "accepted", label: "已验收" },
  { value: "closed", label: "已关闭" },
];

export default function StoriesPage() {
  const qc = useQueryClient();
  const projectOpts = useProjectOptions();
  const [q, setQ] = React.useState("");
  const [projectId, setProjectId] = React.useState<number>();
  const [statusFilter, setStatusFilter] = React.useState<string>();
  const [editing, setEditing] = React.useState<Story | undefined>();
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["stories", { q, project_id: projectId, status: statusFilter }],
    queryFn: () =>
      stories.list({
        q: q || undefined,
        project_id: projectId,
        status: statusFilter,
      }),
  });

  const columns: ColumnsType<Story> = [
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
    { title: "优先级", dataIndex: "priority", width: 90, render: (v) => <StatusTag value={v} /> },
    { title: "估点", dataIndex: "estimate_points", width: 70 },
    {
      title: "负责人",
      dataIndex: "assignee",
      width: 160,
      render: (_, r) => <UserBadge user={r.assignee} size={22} />,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 130,
      render: (v) => <Typography.Text type="secondary">{fromNow(v)}</Typography.Text>,
    },
  ];

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <FileTextOutlined /> 需求池
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建需求
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
          locale={{ emptyText: <Empty description="暂无需求" /> }}
          size="middle"
        />
      </Card>

      <StoryDrawer
        open={createOpen}
        defaultProjectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["stories"] });
        }}
      />
      <StoryDrawer
        open={!!editing}
        story={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          qc.invalidateQueries({ queryKey: ["stories"] });
        }}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["stories"] })}
      />
    </div>
  );
}
