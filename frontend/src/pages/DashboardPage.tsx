import React from "react";
import { Card, Col, Empty, Row, Skeleton, Statistic, Tag, Typography } from "antd";
import {
  AppstoreOutlined,
  BugOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  ProjectOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { useQuery } from "@tanstack/react-query";

import { dashboard } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { useUIStore, ACCENT_PRESETS } from "@/store/ui";

function Stat({
  title,
  value,
  icon,
  color,
  suffix,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="slf-stat-card">
      <div className="slf-stat-glow" style={{ background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            background: color,
            color: "white",
            fontSize: 18,
            boxShadow: `0 6px 18px ${color}66`,
          }}
        >
          {icon}
        </span>
        <Typography.Text type="secondary">{title}</Typography.Text>
      </div>
      <Typography.Title level={2} style={{ margin: 0 }}>
        {value}
        {suffix && <span style={{ fontSize: 14, marginLeft: 6, opacity: 0.6 }}>{suffix}</span>}
      </Typography.Title>
    </div>
  );
}

const STATUS_LABEL_ZH: Record<string, string> = {
  todo: "待开始",
  in_progress: "进行中",
  review: "待评审",
  done: "已完成",
  cancelled: "已取消",
  open: "未解决",
  resolved: "已解决",
  closed: "已关闭",
  reopened: "重新打开",
  draft: "草稿",
  active: "进行中",
  in_review: "评审中",
  accepted: "已验收",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const accent = useUIStore((s) => s.accent);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: dashboard.overview,
    refetchInterval: 60_000,
  });

  const isDark = document.documentElement.dataset.theme === "dark";
  const textColor = isDark ? "#d4dae4" : "#222a36";

  const trendOption = React.useMemo(() => {
    const trend = data?.trend || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: { data: ["任务", "需求", "缺陷"], textStyle: { color: textColor } },
      grid: { left: 36, right: 16, top: 32, bottom: 28 },
      xAxis: {
        type: "category",
        data: trend.map((t) => t.date.slice(5)),
        axisLine: { lineStyle: { color: "rgba(125,125,140,0.4)" } },
        axisLabel: { color: textColor },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(125,125,140,0.15)" } },
        axisLabel: { color: textColor },
      },
      series: [
        {
          name: "任务",
          type: "line",
          smooth: true,
          data: trend.map((t) => t.tasks),
          itemStyle: { color: ACCENT_PRESETS[accent] },
          areaStyle: { opacity: 0.18 },
        },
        {
          name: "需求",
          type: "line",
          smooth: true,
          data: trend.map((t) => t.stories),
          itemStyle: { color: "#722ed1" },
        },
        {
          name: "缺陷",
          type: "line",
          smooth: true,
          data: trend.map((t) => t.bugs),
          itemStyle: { color: "#ff4d4f" },
        },
      ],
    };
  }, [data, accent, textColor]);

  const taskPieOption = React.useMemo(() => {
    const items =
      data?.task_status_pie.map((s) => ({ ...s, name: STATUS_LABEL_ZH[s.name] || s.name })) || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: textColor } },
      series: [
        {
          name: "任务状态",
          type: "pie",
          radius: ["48%", "72%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? "#161c25" : "#fff",
            borderWidth: 2,
          },
          label: { color: textColor },
          data: items,
        },
      ],
      color: ["#8c8c8c", "#1677ff", "#722ed1", "#52c41a", "#bfbfbf"],
    };
  }, [data, textColor, isDark]);

  const bugPieOption = React.useMemo(() => {
    const items =
      data?.bug_status_pie.map((s) => ({ ...s, name: STATUS_LABEL_ZH[s.name] || s.name })) || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: textColor } },
      series: [
        {
          name: "缺陷状态",
          type: "pie",
          radius: ["48%", "72%"],
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? "#161c25" : "#fff",
            borderWidth: 2,
          },
          label: { color: textColor },
          data: items,
        },
      ],
      color: ["#ff4d4f", "#fa8c16", "#52c41a", "#bfbfbf", "#fa541c"],
    };
  }, [data, textColor, isDark]);

  const projectBarOption = React.useMemo(() => {
    const breakdown = data?.project_breakdown || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: ["需求", "任务", "缺陷"], textStyle: { color: textColor } },
      grid: { left: 100, right: 16, top: 36, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: "rgba(125,125,140,0.15)" } },
      },
      yAxis: {
        type: "category",
        data: breakdown.map((p) => p.name),
        axisLabel: { color: textColor, interval: 0, width: 90, overflow: "truncate" },
      },
      series: [
        {
          name: "需求",
          type: "bar",
          stack: "total",
          data: breakdown.map((p) => p.stories),
          itemStyle: { color: "#722ed1" },
        },
        {
          name: "任务",
          type: "bar",
          stack: "total",
          data: breakdown.map((p) => p.tasks),
          itemStyle: { color: ACCENT_PRESETS[accent] },
        },
        {
          name: "缺陷",
          type: "bar",
          stack: "total",
          data: breakdown.map((p) => p.bugs),
          itemStyle: { color: "#ff4d4f" },
        },
      ],
    };
  }, [data, accent, textColor]);

  if (isLoading || !data) {
    return (
      <div className="slf-page">
        <Skeleton active />
      </div>
    );
  }

  const c = data.counts;

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <span>👋 你好，{user?.full_name || user?.username}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 400, opacity: 0.6 }}>
          实时概览 · 自动刷新
        </span>
      </h1>

      <div className="slf-grid" style={{ marginBottom: 20 }}>
        <Stat title="活跃项目" value={c.active_projects} suffix={`/ ${c.projects}`} icon={<ProjectOutlined />} color="#1677ff" />
        <Stat title="进行中需求" value={data.mine.stories} suffix="待我跟进" icon={<FileTextOutlined />} color="#722ed1" />
        <Stat title="未完成任务" value={c.open_tasks} suffix={`/ ${c.tasks}`} icon={<CheckSquareOutlined />} color="#13c2c2" />
        <Stat title="未解决缺陷" value={c.open_bugs} suffix={`/ ${c.bugs}`} icon={<BugOutlined />} color="#ff4d4f" />
        <Stat title="活跃用户" value={c.users} icon={<TeamOutlined />} color="#fa8c16" />
        <Stat title="我的待办" value={data.mine.tasks + data.mine.bugs} suffix="项" icon={<AppstoreOutlined />} color="#52c41a" />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="近 14 天动态" bordered={false}>
            <ReactECharts option={trendOption} style={{ height: 320 }} notMerge lazyUpdate />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="任务状态分布" bordered={false}>
            <ReactECharts option={taskPieOption} style={{ height: 320 }} notMerge lazyUpdate />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="缺陷状态分布" bordered={false}>
            <ReactECharts option={bugPieOption} style={{ height: 320 }} notMerge lazyUpdate />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="各项目工作量堆叠" bordered={false}>
            {data.project_breakdown.length === 0 ? (
              <Empty description="尚无项目" />
            ) : (
              <ReactECharts option={projectBarOption} style={{ height: 320 }} notMerge lazyUpdate />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
