import React from "react";
import {
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Empty,
  Skeleton,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  EditOutlined,
  PaperClipOutlined,
  ProjectOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { bugs, projects, stories, tasks } from "@/api/client";
import StatusTag from "@/components/StatusTag";
import UserBadge from "@/components/UserBadge";
import AttachmentList from "@/components/AttachmentList";
import CommentsPanel from "@/components/CommentsPanel";
import { fromNow, formatDate } from "@/utils/format";
import type { TaskStatus } from "@/api/types";

const TASK_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "待开始" },
  { key: "in_progress", label: "进行中" },
  { key: "review", label: "待评审" },
  { key: "done", label: "已完成" },
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: storyList = [] } = useQuery({
    queryKey: ["stories", { project_id: projectId }],
    queryFn: () => stories.list({ project_id: projectId }),
    enabled: !!projectId,
  });
  const { data: taskList = [] } = useQuery({
    queryKey: ["tasks", { project_id: projectId }],
    queryFn: () => tasks.list({ project_id: projectId }),
    enabled: !!projectId,
  });
  const { data: bugList = [] } = useQuery({
    queryKey: ["bugs", { project_id: projectId }],
    queryFn: () => bugs.list({ project_id: projectId }),
    enabled: !!projectId,
  });

  if (isLoading || !project) {
    return (
      <div className="slf-page">
        <Skeleton active />
      </div>
    );
  }

  return (
    <div className="slf-page">
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/projects")}
        style={{ paddingLeft: 0, marginBottom: 8 }}
      >
        返回项目列表
      </Button>

      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: `linear-gradient(135deg, ${project.color}33, transparent 65%)`,
          border: "1px solid rgba(125,125,140,0.12)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: project.color,
              color: "white",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 20,
              boxShadow: `0 8px 24px ${project.color}66`,
            }}
          >
            {project.code.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {project.name}
            </Typography.Title>
            <div style={{ marginTop: 4 }}>
              <Tag>{project.code}</Tag>
              <StatusTag value={project.status} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {fromNow(project.updated_at)}更新
              </Typography.Text>
            </div>
          </div>
          <UserBadge user={project.owner} />
        </div>
        {project.description && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {project.description}
          </Typography.Paragraph>
        )}
      </div>

      <Tabs
        items={[
          {
            key: "overview",
            label: "概览",
            children: (
              <Card bordered={false}>
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="项目代号">{project.code}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <StatusTag value={project.status} />
                  </Descriptions.Item>
                  <Descriptions.Item label="负责人">
                    <UserBadge user={project.owner} />
                  </Descriptions.Item>
                  <Descriptions.Item label="主题色">
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: project.color,
                        verticalAlign: "middle",
                        marginRight: 6,
                      }}
                    />
                    {project.color}
                  </Descriptions.Item>
                  <Descriptions.Item label="开始日期">
                    {formatDate(project.start_date, "YYYY-MM-DD") || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="结束日期">
                    {formatDate(project.end_date, "YYYY-MM-DD") || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="需求数">{project.story_count}</Descriptions.Item>
                  <Descriptions.Item label="任务数">{project.task_count}</Descriptions.Item>
                  <Descriptions.Item label="缺陷数">{project.bug_count}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {formatDate(project.created_at)}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: "kanban",
            label: `看板 (${taskList.length})`,
            children: (
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
                {TASK_COLUMNS.map((col) => {
                  const items = taskList.filter((t) => t.status === col.key);
                  return (
                    <div className="slf-kanban-col" key={col.key}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          display: "flex",
                          justifyContent: "space-between",
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
                          <div className="slf-kanban-card" key={t.id}>
                            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.title}
                              </span>
                              {t.attachment_count > 0 && (
                                <Tooltip title={`含 ${t.attachment_count} 个附件`}>
                                  <span style={{ fontSize: 11, opacity: 0.75, display: "inline-flex", alignItems: "center", gap: 2 }}>
                                    <PaperClipOutlined style={{ fontSize: 11 }} />
                                    {t.attachment_count}
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                            <div
                              style={{
                                marginTop: 6,
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 12,
                              }}
                            >
                              <StatusTag value={t.priority} />
                              <UserBadge user={t.assignee} size={20} showName={false} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            ),
          },
          {
            key: "stories",
            label: `需求 (${storyList.length})`,
            children:
              storyList.length === 0 ? (
                <Empty description="暂无需求" />
              ) : (
                <Card bordered={false}>
                  {storyList.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        padding: "10px 4px",
                        borderBottom: "1px dashed rgba(125,125,140,0.18)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Typography.Text strong>{s.title}</Typography.Text>
                          {s.attachment_count > 0 && (
                            <Tooltip title={`含 ${s.attachment_count} 个附件`}>
                              <span style={{ fontSize: 11, opacity: 0.75, display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <PaperClipOutlined style={{ fontSize: 11 }} />
                                {s.attachment_count}
                              </span>
                            </Tooltip>
                          )}
                        </span>
                        <div style={{ marginTop: 4 }}>
                          <StatusTag value={s.status} />
                          <StatusTag value={s.priority} />
                          <Tag>{s.estimate_points} 点</Tag>
                        </div>
                      </div>
                      <UserBadge user={s.assignee} size={22} />
                    </div>
                  ))}
                </Card>
              ),
          },
          {
            key: "bugs",
            label: `缺陷 (${bugList.length})`,
            children:
              bugList.length === 0 ? (
                <Empty description="暂无缺陷" />
              ) : (
                <Card bordered={false}>
                  {bugList.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        padding: "10px 4px",
                        borderBottom: "1px dashed rgba(125,125,140,0.18)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Typography.Text strong>{b.title}</Typography.Text>
                          {b.attachment_count > 0 && (
                            <Tooltip title={`含 ${b.attachment_count} 个附件`}>
                              <span style={{ fontSize: 11, opacity: 0.75, display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <PaperClipOutlined style={{ fontSize: 11 }} />
                                {b.attachment_count}
                              </span>
                            </Tooltip>
                          )}
                        </span>
                        <div style={{ marginTop: 4 }}>
                          <StatusTag value={b.status} />
                          <StatusTag value={b.severity} />
                          <StatusTag value={b.priority} />
                        </div>
                      </div>
                      <UserBadge user={b.assignee} size={22} />
                    </div>
                  ))}
                </Card>
              ),
          },
          {
            key: "attach",
            label: "附件",
            children: (
              <Card bordered={false}>
                <AttachmentList targetType="project" targetId={projectId} />
              </Card>
            ),
          },
          {
            key: "comments",
            label: "评论",
            children: (
              <Card bordered={false}>
                <CommentsPanel targetType="project" targetId={projectId} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
