import React from "react";
import {
  Alert,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Skeleton,
  Statistic,
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

function StateDot({ state }: { state?: string | null }) {
  if (!state) return <CloseCircleTwoTone twoToneColor="#bfbfbf" />;
  const s = state.toLowerCase();
  if (s === "running") return <CheckCircleTwoTone twoToneColor="#52c41a" />;
  if (s === "exited" || s === "dead") return <CloseCircleTwoTone twoToneColor="#ff4d4f" />;
  return <ExclamationCircleTwoTone twoToneColor="#faad14" />;
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
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Title bar with refresh */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            运维看板
          </Typography.Title>
          <Typography.Text type="secondary">
            主机 · 容器 · 数据库 · 安全 · 每 15 秒自动刷新
            {data?.elapsed_ms != null && (
              <span style={{ marginLeft: 8 }}>耗时 {data.elapsed_ms} ms</span>
            )}
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()}>
          刷新
        </Button>
      </div>

      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
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
        </>
      )}
    </Space>
  );
}

// ---------- host -----------------------------------------------------------

function HostSection({ data }: { data: OpsOverview }) {
  const host = data.host;
  if (!host?.available) {
    return (
      <Card title={<><CloudServerOutlined /> 主机信息</>}>
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
    <Card title={<Space><CloudServerOutlined /><span>主机信息</span></Space>}>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6}>
          <Statistic title="CPU 核数" value={host.ncpu ?? "-"} />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Statistic title="内存总量" value={bytes(host.mem_total ?? 0)} />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Statistic title="运行中容器" value={host.containers_running ?? 0} />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Statistic
            title="容器总数"
            value={host.containers ?? 0}
            suffix={
              host.containers_stopped ? (
                <span style={{ fontSize: 12, color: "#999" }}>停 {host.containers_stopped}</span>
              ) : undefined
            }
          />
        </Col>
        <Col xs={24} md={12}>
          <Statistic title="操作系统" valueRender={() => <span>{host.os ?? "-"}</span>} />
        </Col>
        <Col xs={24} md={12}>
          <Statistic title="内核 / 架构" valueRender={() => <span>{host.kernel} · {host.arch}</span>} />
        </Col>
        <Col xs={24}>
          <Typography.Text type="secondary">
            Docker {host.server_version} · 主机名 {host.name} · 项目 {data.compose_project}
          </Typography.Text>
        </Col>
      </Row>
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
    <Card title={<Space><ContainerOutlined /><span>容器</span></Space>} bodyStyle={{ padding: 0 }}>
      <Table
        dataSource={rows}
        size="middle"
        pagination={false}
        locale={{ emptyText: "未发现项目容器" }}
        columns={[
          {
            title: "状态",
            dataIndex: "state",
            width: 90,
            render: (state: string) => (
              <Space>
                <StateDot state={state} />
                <Tag color={state === "running" ? "green" : state === "exited" ? "red" : "orange"}>
                  {state ?? "-"}
                </Tag>
              </Space>
            ),
          },
          {
            title: "名称",
            dataIndex: "name",
            render: (n: string) => <Typography.Text strong>{n}</Typography.Text>,
          },
          {
            title: "镜像",
            dataIndex: "image",
            ellipsis: true,
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
                    status={v > 80 ? "exception" : "normal"}
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
                    status={pct > 85 ? "exception" : "normal"}
                  />
                </Tooltip>
              );
            },
          },
          {
            title: "端口",
            dataIndex: "ports",
            ellipsis: true,
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
      <Card title={<Space><DatabaseOutlined /><span>数据库</span></Space>}>
        <Empty description="无法获取数据库指标" />
      </Card>
    );
  }
  const connPct =
    db.connections_max && db.connections_max > 0
      ? (100 * (db.connections_active || 0)) / db.connections_max
      : 0;
  return (
    <Card title={<Space><DatabaseOutlined /><span>数据库</span></Space>} style={{ height: "100%" }}>
      <Row gutter={[12, 12]}>
        <Col span={12}>
          <Statistic title="数据库" value={db.name} />
        </Col>
        <Col span={12}>
          <Statistic title="占用空间" value={bytes(db.size_bytes ?? 0)} />
        </Col>
        <Col span={24}>
          <Typography.Text type="secondary">连接数</Typography.Text>
          <Tooltip title={`${db.connections_active} / ${db.connections_max}`}>
            <Progress
              percent={Math.min(100, Math.round(connPct))}
              format={() => `${db.connections_active} / ${db.connections_max}`}
              status={connPct > 80 ? "exception" : "normal"}
            />
          </Tooltip>
        </Col>
        <Col span={24}>
          <Typography.Text type="secondary">最大表（按总占用）</Typography.Text>
          <Table
            size="small"
            pagination={false}
            dataSource={(db.top_tables || []).map((t: any, i: number) => ({ ...t, key: i }))}
            columns={[
              { title: "表", dataIndex: "table" },
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
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {db.version}
          </Typography.Text>
        </Col>
      </Row>
    </Card>
  );
}

// ---------- security -------------------------------------------------------

function SecuritySection({ data }: { data: OpsOverview }) {
  const sec = data.security || {};
  return (
    <Card
      title={<Space><SafetyCertificateOutlined /><span>安全 & 审计</span></Space>}
      style={{ height: "100%" }}
    >
      <Row gutter={[12, 12]}>
        <Col span={8}>
          <Statistic title="活跃用户" value={sec.users_active ?? 0} suffix={`/ ${sec.users_total ?? 0}`} />
        </Col>
        <Col span={8}>
          <Statistic title="管理员" value={sec.users_admin ?? 0} />
        </Col>
        <Col span={8}>
          <Statistic
            title="24h 登录失败"
            value={sec.failed_logins_24h ?? 0}
            valueStyle={{
              color: (sec.failed_logins_24h ?? 0) > 5 ? "#ff4d4f" : undefined,
            }}
          />
        </Col>
        <Col span={12}>
          <Statistic title="24h 审计事件" value={sec.audit_24h ?? 0} />
        </Col>
        <Col span={12}>
          <Statistic title="7d 审计事件" value={sec.audit_7d ?? 0} />
        </Col>
        <Col span={24}>
          <Typography.Text type="secondary">最近事件</Typography.Text>
          {(sec.recent_audit ?? []).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />
          ) : (
            <Table
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
