import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Calendar,
  Card,
  Checkbox,
  Empty,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs, { Dayjs } from "dayjs";
import type { CellRenderInfo } from "rc-picker/lib/interface";

import { calendar } from "@/api/client";
import type { CalendarEvent, CalendarKind } from "@/api/types";
import { useProjectOptions } from "@/hooks/options";
import StatusTag from "@/components/StatusTag";
import UserBadge from "@/components/UserBadge";
import TaskDrawer from "@/components/drawers/TaskDrawer";
import StoryDrawer from "@/components/drawers/StoryDrawer";
import BugDrawer from "@/components/drawers/BugDrawer";
import { tasks as tasksApi, stories as storiesApi, bugs as bugsApi } from "@/api/client";

// One-character Chinese label for each event kind. We render this as a small
// pill in the calendar cell so the user sees the type without expanding.
const KIND_LABEL: Record<CalendarKind, string> = {
  task: "任",
  story: "需",
  bug: "缺",
};

// AntD `Badge` status mapping per kind. We deliberately use 3 distinct dot
// colors so a packed day stays readable.
const KIND_BADGE: Record<
  CalendarKind,
  "success" | "warning" | "error" | "processing" | "default"
> = {
  task: "processing", // blue
  story: "success", // green
  bug: "error", // red
};

interface KindFilters {
  task: boolean;
  story: boolean;
  bug: boolean;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const projectOpts = useProjectOptions();
  const [cursor, setCursor] = React.useState<Dayjs>(() => dayjs().startOf("day"));
  const [projectId, setProjectId] = React.useState<number | undefined>();
  const [mine, setMine] = React.useState(false);
  const [kinds, setKinds] = React.useState<KindFilters>({
    task: true,
    story: true,
    bug: true,
  });

  // Open drawers — only one at a time. We re-fetch the entity when opening so
  // the user sees the freshest data even if the calendar cache is stale.
  const [openTaskId, setOpenTaskId] = React.useState<number | null>(null);
  const [openStoryId, setOpenStoryId] = React.useState<number | null>(null);
  const [openBugId, setOpenBugId] = React.useState<number | null>(null);

  // Pull a slightly wider window (one month either side) so the visible
  // calendar grid - which always shows leading/trailing days from adjacent
  // months - has its dots populated without a re-fetch on cell hover.
  const windowStart = cursor.startOf("month").subtract(1, "month").format("YYYY-MM-DD");
  const windowEnd = cursor.startOf("month").add(2, "month").format("YYYY-MM-DD");

  const { data, isLoading } = useQuery({
    queryKey: [
      "calendar",
      windowStart,
      windowEnd,
      projectId ?? null,
      mine,
    ],
    queryFn: () =>
      calendar.list({
        start: windowStart,
        end: windowEnd,
        project_id: projectId,
        mine: mine || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  // Index events by `YYYY-MM-DD` for O(1) cell lookup.
  const eventsByDay = React.useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    if (!data) return m;
    for (const ev of data.events) {
      if (!kinds[ev.kind]) continue;
      const list = m.get(ev.date);
      if (list) list.push(ev);
      else m.set(ev.date, [ev]);
    }
    return m;
  }, [data, kinds]);

  // Detail panel for the currently selected day.
  const [selected, setSelected] = React.useState<Dayjs>(() => dayjs());
  const selectedKey = selected.format("YYYY-MM-DD");
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const cellRender = (current: Dayjs, info: CellRenderInfo<Dayjs>) => {
    if (info.type !== "date") return info.originNode;
    const key = current.format("YYYY-MM-DD");
    const list = eventsByDay.get(key);
    if (!list || list.length === 0) return null;
    // Cap the per-day rendering to keep cells from blowing up; show a "+N"
    // hint when truncated. The detail panel below shows the full list.
    const VISIBLE = 3;
    const visible = list.slice(0, VISIBLE);
    const overflow = list.length - visible.length;
    return (
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          fontSize: 11,
          lineHeight: 1.3,
        }}
      >
        {visible.map((ev) => (
          <li
            key={`${ev.kind}-${ev.id}`}
            onClick={(e) => {
              e.stopPropagation();
              openEvent(ev);
            }}
            style={{
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              padding: "1px 0",
            }}
          >
            <Badge status={KIND_BADGE[ev.kind]} />
            <span style={{ opacity: 0.7, marginRight: 4 }}>
              {KIND_LABEL[ev.kind]}
            </span>
            <span>{ev.title}</span>
          </li>
        ))}
        {overflow > 0 && (
          <li style={{ opacity: 0.6, fontSize: 10 }}>+{overflow} 更多</li>
        )}
      </ul>
    );
  };

  const openEvent = (ev: CalendarEvent) => {
    if (ev.kind === "task") setOpenTaskId(ev.id);
    else if (ev.kind === "story") setOpenStoryId(ev.id);
    else setOpenBugId(ev.id);
  };

  const headerRender = ({
    value,
    onChange,
  }: {
    value: Dayjs;
    onChange: (date: Dayjs) => void;
  }) => {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 4px 12px",
        }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          {value.format("YYYY年 M月")}
        </Typography.Title>
        <Space size="small">
          <a
            onClick={() => {
              const next = value.subtract(1, "month");
              onChange(next);
              setCursor(next);
            }}
          >
            上一月
          </a>
          <a
            onClick={() => {
              const today = dayjs().startOf("day");
              onChange(today);
              setCursor(today);
              setSelected(today);
            }}
          >
            今天
          </a>
          <a
            onClick={() => {
              const next = value.add(1, "month");
              onChange(next);
              setCursor(next);
            }}
          >
            下一月
          </a>
        </Space>
      </div>
    );
  };

  // The fetched task/story/bug for the open drawer. We use the existing
  // detail endpoints since the calendar response only has lightweight rows.
  const { data: openTask } = useQuery({
    queryKey: ["task", openTaskId],
    queryFn: () => tasksApi.get(openTaskId as number),
    enabled: !!openTaskId,
  });
  const { data: openStory } = useQuery({
    queryKey: ["story", openStoryId],
    queryFn: () => storiesApi.get(openStoryId as number),
    enabled: !!openStoryId,
  });
  const { data: openBug } = useQuery({
    queryKey: ["bug", openBugId],
    queryFn: () => bugsApi.get(openBugId as number),
    enabled: !!openBugId,
  });

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <CalendarOutlined /> 日历视图
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Select
            allowClear
            placeholder="项目"
            options={projectOpts}
            style={{ width: 200 }}
            value={projectId}
            onChange={(v) => setProjectId(v)}
            showSearch
            optionFilterProp="label"
          />
          <Checkbox checked={mine} onChange={(e) => setMine(e.target.checked)}>
            只看与我相关
          </Checkbox>
          <Space size={4}>
            <Checkbox
              checked={kinds.task}
              onChange={(e) =>
                setKinds((k) => ({ ...k, task: e.target.checked }))
              }
            >
              <Badge status={KIND_BADGE.task} text="任务" />
            </Checkbox>
            <Checkbox
              checked={kinds.story}
              onChange={(e) =>
                setKinds((k) => ({ ...k, story: e.target.checked }))
              }
            >
              <Badge status={KIND_BADGE.story} text="需求" />
            </Checkbox>
            <Checkbox
              checked={kinds.bug}
              onChange={(e) =>
                setKinds((k) => ({ ...k, bug: e.target.checked }))
              }
            >
              <Badge status={KIND_BADGE.bug} text="缺陷" />
            </Checkbox>
          </Space>
        </span>
      </h1>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <Card
          bordered={false}
          loading={isLoading && !data}
          bodyStyle={{ padding: 12 }}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Calendar
            value={cursor}
            onPanelChange={(d) => setCursor(d)}
            onSelect={(d) => {
              setSelected(d);
              setCursor(d);
            }}
            cellRender={cellRender}
            headerRender={headerRender}
          />
        </Card>

        <Card
          bordered={false}
          title={
            <span>
              <CalendarOutlined /> {selected.format("YYYY-MM-DD")} ·{" "}
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {selectedEvents.length} 项
              </Typography.Text>
            </span>
          }
          style={{ width: 360, flexShrink: 0 }}
        >
          {selectedEvents.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当日无事项"
            />
          ) : (
            <div style={{ maxHeight: 540, overflowY: "auto" }}>
              {selectedEvents.map((ev) => (
                <div
                  key={`${ev.kind}-${ev.id}`}
                  onClick={() => openEvent(ev)}
                  className="slf-cal-row"
                  style={{
                    padding: "10px 8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <Tag
                      color={
                        ev.kind === "task"
                          ? "blue"
                          : ev.kind === "story"
                          ? "green"
                          : "red"
                      }
                      style={{ marginRight: 0 }}
                    >
                      {KIND_LABEL[ev.kind]}
                    </Tag>
                    <Tooltip
                      title={
                        ev.anchor === "due_date" ? "截止日期" : "最近更新"
                      }
                    >
                      <Typography.Text strong style={{ flex: 1 }}>
                        {ev.title}
                      </Typography.Text>
                    </Tooltip>
                  </div>
                  <Space size={4} wrap>
                    <StatusTag value={ev.status} />
                    {ev.priority && <StatusTag value={ev.priority} />}
                    {ev.severity && <StatusTag value={ev.severity} />}
                    {ev.assignee && (
                      <UserBadge
                        user={{
                          id: ev.assignee.id,
                          username: ev.assignee.username,
                          full_name: ev.assignee.full_name,
                          email: null,
                          avatar: null,
                          role: "user",
                          is_active: true,
                          created_at: "",
                          updated_at: "",
                        }}
                        size={20}
                      />
                    )}
                  </Space>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <TaskDrawer
        open={!!openTaskId && !!openTask}
        task={openTask}
        onClose={() => setOpenTaskId(null)}
        onSaved={() => setOpenTaskId(null)}
        onDeleted={() => setOpenTaskId(null)}
      />
      <StoryDrawer
        open={!!openStoryId && !!openStory}
        story={openStory}
        onClose={() => setOpenStoryId(null)}
        onSaved={() => setOpenStoryId(null)}
        onDeleted={() => setOpenStoryId(null)}
      />
      <BugDrawer
        open={!!openBugId && !!openBug}
        bug={openBug}
        onClose={() => setOpenBugId(null)}
        onSaved={() => setOpenBugId(null)}
        onDeleted={() => setOpenBugId(null)}
      />
    </div>
  );
}
