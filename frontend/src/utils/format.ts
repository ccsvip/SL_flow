import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function formatDate(d?: string | null, fmt = "YYYY-MM-DD HH:mm"): string {
  if (!d) return "—";
  return dayjs(d).format(fmt);
}

export function fromNow(d?: string | null): string {
  if (!d) return "—";
  return dayjs(d).fromNow();
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_ZH: Record<string, string> = {
  // user roles
  admin: "管理员",
  user: "普通用户",
  // project
  planning: "规划中",
  active: "进行中",
  on_hold: "已挂起",
  completed: "已完成",
  archived: "已归档",
  // story
  draft: "草稿",
  in_review: "评审中",
  accepted: "已验收",
  closed: "已关闭",
  // task
  todo: "待开始",
  in_progress: "进行中",
  review: "待评审",
  done: "已完成",
  cancelled: "已取消",
  // bug
  open: "未解决",
  resolved: "已解决",
  reopened: "重新打开",
  // severity / priority
  trivial: "轻微",
  minor: "次要",
  major: "重要",
  critical: "严重",
  blocker: "阻塞",
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
  // audit / db backup target types
  db_backup: "数据备份",
  backup_setting: "备份设置",
  prd: "PRD",
};

export function zh(value?: string | null): string {
  if (!value) return "—";
  return STATUS_ZH[value] ?? value;
}

const STATUS_COLORS: Record<string, string> = {
  // task / story / bug -> AntD tag colors
  active: "blue",
  planning: "default",
  on_hold: "orange",
  completed: "green",
  archived: "default",
  draft: "default",
  in_review: "purple",
  accepted: "green",
  closed: "default",
  todo: "default",
  in_progress: "blue",
  review: "purple",
  done: "green",
  cancelled: "default",
  open: "red",
  resolved: "green",
  reopened: "orange",
  // severity
  trivial: "default",
  minor: "blue",
  major: "orange",
  critical: "red",
  blocker: "magenta",
  // priority
  low: "default",
  medium: "blue",
  high: "orange",
  urgent: "red",
};

export function colorOf(value?: string | null): string {
  if (!value) return "default";
  return STATUS_COLORS[value] ?? "default";
}
