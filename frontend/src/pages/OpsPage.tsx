import React from "react";
import {
  Alert,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  Typography,
  Space,
  Button,
} from "antd";
import {
  CloudServerOutlined,
  ContainerOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  ExclamationCircleTwoTone,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";

import { ops } from "@/api/client";
import type { OpsOverview, OpsContainerState, OpsContainerStat } from "@/api/types";

// ---------- helpers --------------------------------------------------------

function bytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 按使用率返回进度条颜色：绿 → 橙 → 红 */
function usageColor(pct: number): string {
  if (pct > 85) return "#ff4d4f";
  if (pct > 60) return "#faad14";
  return "#52c41a";
}

function StateDot({ state }: { state?: string | null }) {
  if (!state) return <CloseCircleTwoTone twoToneColor="#bfbfbf" />;
  const s = state.toLowerCase();
  if (s === "running") return <CheckCircleTwoTone twoToneColor="#52c41a" />;
  if (s === "exited" || s === "dead") return <CloseCircleTwoTone twoToneColor="#ff4d4f" />;
  return <ExclamationCircleTwoTone twoToneColor="#faad14" />;
}

// ---------- 通用展示组件 ---------------------------------------------------

/** 指标卡：图标 + 数值 + 标签 + 彩色光斑 */
function StatCard({
  icon,
  label,
  value,
  suffix,
  tone = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  tone?: "blue" | "purple" | "green" | "orange" | "red" | "cyan";
}) {
  return (
    <div className={`slf-ops-stat slf-ops-stat-${tone}`}>
      <div className="slf-ops-stat-glow" aria-hidden />
      <div className="slf-ops-stat-icon">{icon}</div>
      <div className="slf-ops-stat-body">
        <div className="slf-ops-stat-label">{label}</div>
        <div className="slf-ops-stat-value">
          {value}
          {suffix && <span className="slf-ops-stat-suffix">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

/** 键值信息行 */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="slf-ops-info-row">
      <span className="slf-ops-info-label">{label}</span>
      <span className="slf-ops-info-value">{value}</span>
    </div>
  );
}

// ---------- page -----------------------------------------------------------

export default function OpsPage() {
  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["ops-overview"],
    queryFn: () => ops.overview(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="加载运维数据失败"
        description={(error as Error)?.message ?? "未知错误"}
      />
    );
  }

  return (
    <div className="slf-ops-page">
      <div className="slf-ops-header">
        <div className="slf-ops-header-text">
          <div className="slf-ops-title">
            <span className="slf-ops-title-icon">
              <CloudServerOutlined />
            </span>
            运维看板
          </div>
          <div className="slf-ops-subtitle">
            主机 · 容器 · 数据库 · 安全 · 每 15 秒自动刷新
            {data?.elapsed_ms != null && (
              <span className="slf-ops-elapsed">耗时 {data.elapsed_ms} ms</span>
            )}
          </div>
        </div>
        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          className="slf-ops-refresh"
        >
          刷新
        </Button>
      </div>

      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <HostSection data={data} />
          <ContainerSection
            states={data.containers}
            stats={data.container_stats}
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <DatabaseSection data={data} />
            </Col>
            <Col xs={24} lg={12}>
              <SecuritySection data={data} />
            </Col>
          </Row>
        </Space>
      )}
    </div>
  );
}

// ---------- host -----------------------------------------------------------

function HostSection({ data }: { data: OpsOverview }) {
  const host = data.host;
  if (!host?.available) {
    return (
      <Card
        className="slf-ops-card"
        title={
          <span className="slf-ops-card-title">
            <CloudServerOutlined /> 主机信息
          </span>
        }
      >
        <Empty
          description={
            <>
              无法访问 docker daemon
              {host?.reason && <Typography.Text type="secondary"> — {host.reason}</Typography.Text>}
            </>
          }
        />
      </Card>
    );
  }
  return (
    <Card
      className="slf-ops-card"
      title={
        <span className="slf-ops-card-title">
          <CloudServerOutlined /> 主机信息
        </span>
      }
    >
      <div className="slf-ops-stat-grid">
        <StatCard
          icon={<CloudServerOutlined />}
          label="CPU 核数"
          value={host.ncpu ?? "-"}
          tone="blue"
        />
        <StatCard
          icon={<ContainerOutlined />}
          label="内存总量"
          value={bytes(host.mem_total ?? 0)}
          tone="purple"
        />
        <StatCard
          icon={<CheckCircleTwoTone twoToneColor="#52c41a" />}
          label="运行中容器"
          value={host.containers_running ?? 0}
          tone="green"
        />
        <StatCard
          icon={<ContainerOutlined />}
          label="容器总数"
          value={host.containers ?? 0}
          suffix={host.containers_stopped ? `停 ${host.containers_stopped}` : undefined}
          tone="cyan"
        />
      </div>

      <div className="slf-ops-info-grid">
        <InfoRow label="操作系统" value={host.os ?? "-"} />
        <InfoRow label="内核 / 架构" value={`${host.kernel ?? "-"} · ${host.arch ?? "-"}`} />
      </div>

      <div className="slf-ops-meta">
        Docker {host.server_version} · 主机名 {host.name} · 项目 {data.compose_project}
      </div>
    </Card>
  );
}

// ---------- containers -----------------------------------------------------

function ContainerSection({
  states,
  stats,
}: {
  states: OpsContainerState[];
  stats: OpsContainerStat[];
}) {
  // Merge state + stats by container name for a single table.
  const statByName: Record<string, OpsContainerStat> = {};
  for (const s of stats || []) {
    if (s.name) statByName[s.name] = s;
  }
  const rows = (states || []).map((s) => ({
    key: s.name || Math.random().toString(36),
    ...s,
    stat: s.name ? statByName[s.name] : undefined,
  }));

  return (
    <Card
      className="slf-ops-card slf-ops-card-flush"
      title={
        <span className="slf-ops-card-title">
          <ContainerOutlined /> 容器
        </span>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table
        className="slf-ops-table"
        dataSource={rows}
        size="middle"
        pagination={false}
        locale={{ emptyText: "未发现项目容器" }}
        rowClassName={() => "slf-ops-table-row"}
        columns={[
          {
            title: "状态",
            dataIndex: "state",
            width: 110,
            render: (state: string) => (
              <Space>
                <StateDot state={state} />
                <Tag
                  color={state === "running" ? "success" : state === "exited" ? "error" : "warning"}
                  className="slf-ops-state-tag"
                >
                  {state ?? "-"}
                </Tag>
              </Space>
            ),
          },
          {
            title: "名称",
            dataIndex: "name",
            render: (n: string) => <Typography.Text strong className="slf-ops-container-name">{n}</Typography.Text>,
          },
          {
            title: "镜像",
            dataIndex: "image",
            ellipsis: true,
            render: (v: string) => <span className="slf-ops-mono">{v}</span>,
          },
          {
            title: "运行时长",
            dataIndex: "running_for",
            width: 140,
          },
          {
            title: "CPU",
            width: 160,
            render: (_: unknown, r: any) => {
              const v = r.stat?.cpu_percent ?? 0;
              return (
                <Tooltip title={`${v.toFixed(2)} %`}>
                  <Progress
                    percent={Math.min(100, Math.round(v))}
                    size="small"
                    strokeColor={usageColor(v)}
                    className="slf-ops-progress"
                  />
                </Tooltip>
              );
            },
          },
          {
            title: "内存",
            width: 220,
            render: (_: unknown, r: any) => {
              const used = r.stat?.mem_used ?? 0;
              const limit = r.stat?.mem_limit ?? 0;
              const pct = r.stat?.mem_percent ?? 0;
              return (
                <Tooltip title={`${bytes(used)} / ${bytes(limit)}`}>
                  <Progress
                    percent={Math.min(100, Math.round(pct))}
                    size="small"
                    strokeColor={usageColor(pct)}
                    className="slf-ops-progress"
                  />
                </Tooltip>
              );
            },
          },
          {
            title: "端口",
            dataIndex: "ports",
            ellipsis: true,
            render: (v: string) => <span className="slf-ops-mono">{v ?? "-"}</span>,
          },
        ]}
      />
    </Card>
  );
}

// ---------- database -------------------------------------------------------

function DatabaseSection({ data }: { data: OpsOverview }) {
  const db = data.database || {};
  if (!db.name) {
    return (
      <Card
        className="slf-ops-card"
        title={
          <span className="slf-ops-card-title">
            <DatabaseOutlined /> 数据库
          </span>
        }
        style={{ height: "100%" }}
      >
        <Empty description="无法获取数据库指标" />
      </Card>
    );
  }
  const connPct =
    db.connections_max && db.connections_max > 0
      ? (100 * (db.connections_active || 0)) / db.connections_max
      : 0;
  return (
    <Card
      className="slf-ops-card"
      title={
        <span className="slf-ops-card-title">
          <DatabaseOutlined /> 数据库
        </span>
      }
      style={{ height: "100%" }}
    >
      <Row gutter={[12, 12]}>
        <Col span={12}>
          <StatCard icon={<DatabaseOutlined />} label="数据库" value={db.name} tone="blue" />
        </Col>
        <Col span={12}>
          <StatCard
            icon={<ContainerOutlined />}
            label="占用空间"
            value={bytes(db.size_bytes ?? 0)}
            tone="purple"
          />
        </Col>
        <Col span={24}>
          <div className="slf-ops-progress-block">
            <div className="slf-ops-progress-head">
              <span className="slf-ops-info-label">连接数</span>
              <span className="slf-ops-progress-val">
                {db.connections_active} / {db.connections_max}
              </span>
            </div>
            <Progress
              percent={Math.min(100, Math.round(connPct))}
              strokeColor={usageColor(connPct)}
              className="slf-ops-progress"
              showInfo={false}
            />
          </div>
        </Col>
        <Col span={24}>
          <div className="slf-ops-info-label" style={{ marginBottom: 8 }}>
            最大表（按总占用）
          </div>
          <Table
            className="slf-ops-table slf-ops-table-compact"
            size="small"
            pagination={false}
            dataSource={(db.top_tables || []).map((t: any, i: number) => ({ ...t, key: i }))}
            columns={[
              { title: "表", dataIndex: "table", render: (v: string) => <span className="slf-ops-mono">{v}</span> },
              { title: "行数", dataIndex: "rows", width: 100, align: "right" },
              {
                title: "大小",
                dataIndex: "size_bytes",
                width: 100,
                align: "right",
                render: (v: number) => bytes(v),
              },
            ]}
          />
        </Col>
        <Col span={24}>
          <div className="slf-ops-meta">{db.version}</div>
        </Col>
      </Row>
    </Card>
  );
}

// ---------- security -------------------------------------------------------

function SecuritySection({ data }: { data: OpsOverview }) {
  const sec = data.security || {};
  const failedHigh = (sec.failed_logins_24h ?? 0) > 5;
  return (
    <Card
      className="slf-ops-card"
      title={
        <span className="slf-ops-card-title">
          <SafetyCertificateOutlined /> 安全 &amp; 审计
        </span>
      }
      style={{ height: "100%" }}
    >
      <Row gutter={[12, 12]}>
        <Col span={8}>
          <StatCard
            icon={<SafetyCertificateOutlined />}
            label="活跃用户"
            value={sec.users_active ?? 0}
            suffix={`/ ${sec.users_total ?? 0}`}
            tone="green"
          />
        </Col>
        <Col span={8}>
          <StatCard
            icon={<SafetyCertificateOutlined />}
            label="管理员"
            value={sec.users_admin ?? 0}
            tone="blue"
          />
        </Col>
        <Col span={8}>
          <StatCard
            icon={<ExclamationCircleTwoTone twoToneColor={failedHigh ? "#ff4d4f" : "#faad14"} />}
            label="24h 登录失败"
            value={sec.failed_logins_24h ?? 0}
            tone={failedHigh ? "red" : "orange"}
          />
        </Col>
        <Col span={12}>
          <StatCard
            icon={<SafetyCertificateOutlined />}
            label="24h 审计事件"
            value={sec.audit_24h ?? 0}
            tone="cyan"
          />
        </Col>
        <Col span={12}>
          <StatCard
            icon={<SafetyCertificateOutlined />}
            label="7d 审计事件"
            value={sec.audit_7d ?? 0}
            tone="purple"
          />
        </Col>
        <Col span={24}>
          <div className="slf-ops-info-label" style={{ marginBottom: 8 }}>
            最近事件
          </div>
          {(sec.recent_audit ?? []).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />
          ) : (
            <Table
              className="slf-ops-table slf-ops-table-compact"
              size="small"
              pagination={false}
              dataSource={(sec.recent_audit || []).map((r: any) => ({ ...r, key: r.id }))}
              columns={[
                {
                  title: "时间",
                  dataIndex: "created_at",
                  width: 160,
                  render: (v: string) => (v ? new Date(v).toLocaleString() : "-"),
                },
                { title: "动作", dataIndex: "action", width: 120 },
                {
                  title: "对象",
                  render: (_: unknown, r: any) =>
                    `${r.target_type ?? "-"}${r.target_id ? "#" + r.target_id : ""}`,
                },
                { title: "操作者", dataIndex: "actor_id", width: 80 },
              ]}
            />
          )}
        </Col>
      </Row>
    </Card>
  );
}
