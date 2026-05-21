import React from "react";
import {
  Button,
  Card,
  Input,
  Segmented,
  Select,
  Table,
  Typography,
  Empty,
} from "antd";
import {
  AppstoreOutlined,
  BarsOutlined,
  CheckSquareOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";

import { tasks } from "@/api/client";
import StatusTag from "@/components/StatusTag";
import UserBadge from "@/components/UserBadge";
import TaskDrawer from "@/components/drawers/TaskDrawer";
import { useProjectOptions } from "@/hooks/options";
import { formatDate, fromNow } from "@/utils/format";
import type { Task, TaskStatus } from "@/api/types";

const STATUS_OPTIONS = [
  { value: "todo", label: "待开始" },
  { value: "in_progress", label: "进行中" },
  { value: "review", label: "待评审" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const KANBAN_COLS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "待开始" },
  { key: "in_progress", label: "进行中" },
  { key: "review", label: "待评审" },
  { key: "done", label: "已完成" },
];

export default function TasksPage() {
  const qc = useQueryClient();
  const projectOpts = useProjectOptions();
  const [q, setQ] = React.useState("");
  const [projectId, setProjectId] = React.useState<number>();
  const [statusFilter, setStatusFilter] = React.useState<string>();
  const [view, setView] = React.useState<"list" | "kanban">("list");
  const [editing, setEditing] = React.useState<Task | undefined>();
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["tasks", { q, project_id: projectId, status: statusFilter }],
    queryFn: () =>
      tasks.list({
        q: q || undefined,
        project_id: projectId,
        status: statusFilter,
      }),
  });

  const columns: ColumnsType<Task> = [
    { title: "ID", dataIndex: "id", width: 70 },
    {
      title: "标题",
      dataIndex: "title",
      render: (_, r) => (
        <a onClick={() => setEditing(r)} style={{ fontWeight: 500 }}>
          {r.title}
        </a>
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
      title: "优先级",
      dataIndex: "priority",
      width: 90,
      render: (v) => <StatusTag value={v} />,
    },
    {
      title: "工时",
      width: 110,
      render: (_, r) => (
        <Typography.Text type="secondary">
          {r.consumed_hours}h / {r.estimate_hours}h
        </Typography.Text>
      ),
    },
    {
      title: "截止",
      dataIndex: "due_date",
      width: 110,
      render: (v) => formatDate(v, "YYYY-MM-DD"),
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
        <CheckSquareOutlined /> 任务列表
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
          <Segmented
            value={view}
            onChange={(v) => setView(v as "list" | "kanban")}
            options={[
              { value: "list", label: "列表", icon: <BarsOutlined /> },
              { value: "kanban", label: "看板", icon: <AppstoreOutlined /> },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建任务
          </Button>
        </span>
      </h1>

      {view === "list" ? (
        <Card bordered={false}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={isLoading}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            locale={{ emptyText: <Empty description="暂无任务" /> }}
            size="middle"
          />
        </Card>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {KANBAN_COLS.map((col) => {
            const items = data.filter((t) => t.status === col.key);
            return (
              <div className="slf-kanban-col" key={col.key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontWeight: 600,
                    padding: "0 4px 6px",
                  }}
                >
                  <span>
                    <StatusTag value={col.key} /> {col.label}
                  </span>
                  <span style={{ opacity: 0.6 }}>{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12, padding: 6 }}>
                    暂无
                  </Typography.Text>
                ) : (
                  items.map((t) => (
                    <div
                      key={t.id}
                      className="slf-kanban-card"
                      onClick={() => setEditing(t)}
                    >
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <StatusTag value={t.priority} />
                        <UserBadge user={t.assignee} size={20} showName={false} />
                      </div>
                      {t.due_date && (
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                          截止 {formatDate(t.due_date, "MM-DD")}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      <TaskDrawer
        open={createOpen}
        defaultProjectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
      <TaskDrawer
        open={!!editing}
        task={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
      />
    </div>
  );
}
