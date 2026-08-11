import React from "react";
import { useNavigate } from "react-router-dom";
import {
  App as AntdApp,
  Badge,
  Button,
  Card,
  Empty,
  List,
  Segmented,
  Tag,
  Typography,
} from "antd";
import {
  BellOutlined,
  CheckOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notifications } from "@/api/client";
import { extractError } from "@/api/http";
import UserBadge from "@/components/UserBadge";
import { fromNow } from "@/utils/format";
import type { NotificationItem, NotificationKind } from "@/api/types";

const KIND_LABEL: Record<NotificationKind, string> = {
  mention: "提到我",
  assigned: "指派",
  status: "状态变更",
  comment: "评论",
};

const KIND_COLOR: Record<NotificationKind, string> = {
  mention: "purple",
  assigned: "blue",
  status: "geekblue",
  comment: "default",
};

// Map a notification target onto the FE deep-link. We don't have dedicated
// detail pages for every entity, so we navigate to the list page and rely
// on the user clicking the row from there. (A drawer-aware deep link is a
// later improvement.)
function deepLinkOf(item: NotificationItem): string {
  switch (item.target_type) {
    case "task":
      return "/tasks";
    case "story":
      return "/stories";
    case "bug":
      return "/bugs";
    case "project":
      return `/projects/${item.target_id}`;
  }
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [filter, setFilter] = React.useState<"all" | "unread">("unread");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () =>
      notifications.list({
        page: 1,
        page_size: 100,
        unread_only: filter === "unread" || undefined,
      }),
  });

  const markRead = useMutation({
    mutationFn: notifications.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (e) => message.error(extractError(e, "操作失败")),
  });

  const markAll = useMutation({
    mutationFn: notifications.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      message.success("已全部标记为已读");
    },
    onError: (e) => message.error(extractError(e, "操作失败")),
  });

  const remove = useMutation({
    mutationFn: notifications.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  const handleClick = (n: NotificationItem) => {
    if (!n.is_read) {
      // Mark as read in the background, then navigate. We don't await so
      // the UI feels responsive.
      markRead.mutate(n.id);
    }
    navigate(deepLinkOf(n));
  };

  const items = data?.items ?? [];

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <BellOutlined /> 通知中心
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as "all" | "unread")}
            options={[
              { value: "unread", label: `未读 (${data?.unread ?? 0})` },
              { value: "all", label: `全部 (${data?.total ?? 0})` },
            ]}
          />
          <Button
            icon={<CheckOutlined />}
            disabled={(data?.unread ?? 0) === 0}
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
          >
            全部已读
          </Button>
        </span>
      </h1>

      <Card bordered={false}>
        <List
          dataSource={items}
          loading={isLoading}
          locale={{ emptyText: <Empty description="暂无通知" /> }}
          renderItem={(n) => (
            <List.Item
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                cursor: "pointer",
                background: n.is_read ? undefined : "rgba(22,119,255,0.05)",
                padding: "14px 12px",
                borderRadius: 8,
              }}
              actions={[
                !n.is_read && (
                  <Button
                    key="read"
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      markRead.mutate(n.id);
                    }}
                  >
                    标记已读
                  </Button>
                ),
                <Button
                  key="del"
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(n.id);
                  }}
                />,
              ].filter(Boolean) as React.ReactNode[]}
            >
              <List.Item.Meta
                avatar={
                  n.actor ? (
                    <UserBadge
                      user={{
                        id: n.actor.id,
                        username: n.actor.username,
                        full_name: n.actor.full_name,
                        email: null,
                        avatar: null,
                        role: "user",
                        is_active: true,
                        created_at: "",
                        updated_at: "",
                      }}
                      size={36}
                      showName={false}
                    />
                  ) : (
                    <Badge dot={!n.is_read}>
                      <BellOutlined style={{ fontSize: 22, opacity: 0.6 }} />
                    </Badge>
                  )
                }
                title={
                  <span>
                    <Tag color={KIND_COLOR[n.kind]}>{KIND_LABEL[n.kind]}</Tag>
                    <Typography.Text strong={!n.is_read}>{n.body}</Typography.Text>
                  </span>
                }
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {fromNow(n.created_at)}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
