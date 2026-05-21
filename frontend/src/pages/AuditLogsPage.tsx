import React from "react";
import {
  Card,
  DatePicker,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  HistoryOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import { auditLogs, users as usersApi } from "@/api/client";
import type {
  AuditAction,
  AuditLog,
  AuditTargetType,
} from "@/api/types";
import UserBadge from "@/components/UserBadge";
import { formatDate } from "@/utils/format";
import { useAuthStore } from "@/store/auth";

const ACTION_OPTIONS: { value: AuditAction; label: string; color: string }[] = [
  { value: "create", label: "新建", color: "green" },
  { value: "update", label: "更新", color: "blue" },
  { value: "delete", label: "删除", color: "red" },
  { value: "login", label: "登录", color: "geekblue" },
  { value: "login_failed", label: "登录失败", color: "volcano" },
  { value: "logout", label: "登出", color: "default" },
  { value: "password_change", label: "改密码", color: "purple" },
];
const ACTION_BY_VALUE = Object.fromEntries(
  ACTION_OPTIONS.map((o) => [o.value, o]),
);

const TARGET_OPTIONS: { value: AuditTargetType; label: string }[] = [
  { value: "project", label: "项目" },
  { value: "story", label: "需求" },
  { value: "task", label: "任务" },
  { value: "bug", label: "缺陷" },
  { value: "comment", label: "评论" },
  { value: "attachment", label: "附件" },
  { value: "user", label: "用户" },
  { value: "auth", label: "认证" },
];
const TARGET_LABEL = Object.fromEntries(TARGET_OPTIONS.map((t) => [t.value, t.label]));

export default function AuditLogsPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === "admin";

  const [action, setAction] = React.useState<AuditAction | undefined>();
  const [targetType, setTargetType] = React.useState<AuditTargetType | undefined>();
  const [actorId, setActorId] = React.useState<number | undefined>();
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);

  const params = React.useMemo(
    () => ({
      action,
      target_type: targetType,
      actor_id: actorId,
      q: q || undefined,
      start: range?.[0] ? range[0].toISOString() : undefined,
      end: range?.[1] ? range[1].toISOString() : undefined,
      page,
      page_size: pageSize,
    }),
    [action, targetType, actorId, q, range, page, pageSize],
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => auditLogs.list(params),
    placeholderData: (prev) => prev,
  });

  // Admin-only filter: actor dropdown.
  const { data: userList = [] } = useQuery({
    queryKey: ["users-light-audit"],
    queryFn: usersApi.list,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const columns: ColumnsType<AuditLog> = [
    {
      title: "时间",
      dataIndex: "created_at",
      width: 170,
      render: (v) => (
        <Tooltip title={formatDate(v, "YYYY-MM-DD HH:mm:ss")}>
          {formatDate(v, "MM-DD HH:mm:ss")}
        </Tooltip>
      ),
    },
    {
      title: "操作人",
      dataIndex: "actor",
      width: 160,
      render: (_, r) => {
        if (r.actor) return <UserBadge user={r.actor as any} size={22} />;
        return (
          <Typography.Text type="secondary">
            {r.actor_username_at_event || "（未知）"}
          </Typography.Text>
        );
      },
    },
    {
      title: "操作",
      dataIndex: "action",
      width: 100,
      render: (v: AuditAction) => {
        const o = ACTION_BY_VALUE[v];
        return <Tag color={o?.color || "default"}>{o?.label || v}</Tag>;
      },
    },
    {
      title: "对象类型",
      dataIndex: "target_type",
      width: 100,
      render: (v) => <Tag>{TARGET_LABEL[v] || v}</Tag>,
    },
    {
      title: "对象",
      render: (_, r) => (
        <Tooltip title={r.target_label || `#${r.target_id ?? "—"}`}>
          <span>
            {r.target_id !== null && r.target_id !== undefined && (
              <Typography.Text type="secondary" style={{ marginRight: 6 }}>
                #{r.target_id}
              </Typography.Text>
            )}
            <span>{r.target_label || "—"}</span>
          </span>
        </Tooltip>
      ),
    },
    {
      title: "状态",
      dataIndex: "status_code",
      width: 80,
      render: (v) => {
        if (v == null) return "—";
        let color = "default";
        if (v >= 500) color = "red";
        else if (v >= 400) color = "orange";
        else if (v >= 200 && v < 300) color = "green";
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: "请求",
      width: 200,
      render: (_, r) => {
        if (!r.request_path) return "—";
        return (
          <Tooltip title={`${r.request_method || ""} ${r.request_path}`}>
            <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }}>
              {r.request_method} {r.request_path}
            </Typography.Text>
          </Tooltip>
        );
      },
    },
    {
      title: "IP",
      dataIndex: "client_ip",
      width: 130,
      render: (v) =>
        v ? (
          <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }}>
            {v}
          </Typography.Text>
        ) : (
          "—"
        ),
    },
    {
      title: "附加信息",
      dataIndex: "extra",
      width: 220,
      render: (v) => {
        if (!v) return "—";
        try {
          const parsed = JSON.parse(v);
          if (parsed.changed && Array.isArray(parsed.changed)) {
            return (
              <Tooltip title={`更改字段: ${parsed.changed.join(", ")}`}>
                <Typography.Text style={{ fontSize: 12 }}>
                  改了 {parsed.changed.length} 个字段
                </Typography.Text>
              </Tooltip>
            );
          }
          return (
            <Typography.Text style={{ fontSize: 12, fontFamily: "monospace" }} ellipsis>
              {v}
            </Typography.Text>
          );
        } catch {
          return (
            <Typography.Text style={{ fontSize: 12 }} ellipsis>
              {v}
            </Typography.Text>
          );
        }
      },
    },
  ];

  const onResetFilters = () => {
    setAction(undefined);
    setTargetType(undefined);
    setActorId(undefined);
    setQ("");
    setRange(null);
    setPage(1);
  };

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <HistoryOutlined /> 操作日志
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {isAdmin
              ? "管理员视图：可查看全部用户的操作记录"
              : "你的操作记录"}
          </Typography.Text>
          <a onClick={() => refetch()} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ReloadOutlined /> 刷新
          </a>
        </span>
      </h1>

      <Card bordered={false} style={{ marginBottom: 12 }}>
        <Space wrap size={[8, 8]}>
          <Input
            allowClear
            placeholder="搜索对象 / 路径"
            prefix={<SearchOutlined />}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="操作类型"
            options={ACTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={action}
            onChange={(v) => {
              setAction(v);
              setPage(1);
            }}
            style={{ width: 130 }}
          />
          <Select
            allowClear
            placeholder="对象类型"
            options={TARGET_OPTIONS}
            value={targetType}
            onChange={(v) => {
              setTargetType(v);
              setPage(1);
            }}
            style={{ width: 130 }}
          />
          {isAdmin && (
            <Select
              allowClear
              placeholder="操作人"
              showSearch
              optionFilterProp="label"
              options={userList.map((u) => ({
                value: u.id,
                label: u.full_name ? `${u.full_name} (${u.username})` : u.username,
              }))}
              value={actorId}
              onChange={(v) => {
                setActorId(v);
                setPage(1);
              }}
              style={{ width: 200 }}
            />
          )}
          <DatePicker.RangePicker
            showTime
            value={range as any}
            onChange={(v) => {
              setRange(v as any);
              setPage(1);
            }}
            placeholder={["开始时间", "结束时间"]}
          />
          <a onClick={onResetFilters}>重置筛选</a>
        </Space>
      </Card>

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items || []}
          loading={isFetching}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total: data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ["20", "50", "100", "200"],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (t) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <Empty description="暂无日志" /> }}
        />
      </Card>
    </div>
  );
}
