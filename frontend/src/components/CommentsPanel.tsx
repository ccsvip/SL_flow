import { App as AntdApp, Button, Empty, Input, Typography } from "antd";
import { DeleteOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { comments as api } from "@/api/client";
import type { CommentTargetType } from "@/api/types";
import { extractError } from "@/api/http";
import UserBadge from "@/components/UserBadge";
import { fromNow } from "@/utils/format";
import { useAuthStore } from "@/store/auth";

interface Props {
  targetType: CommentTargetType;
  targetId: number;
}

export default function CommentsPanel({ targetType, targetId }: Props) {
  const qc = useQueryClient();
  const { modal, message } = AntdApp.useApp();
  const me = useAuthStore((s) => s.user);
  const [body, setBody] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["comments", targetType, targetId],
    queryFn: () => api.list(targetType, targetId),
    enabled: targetId > 0,
  });

  const post = useMutation({
    mutationFn: () => api.create(targetType, targetId, body.trim()),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", targetType, targetId] });
    },
    onError: (e) => message.error(extractError(e, "发送失败")),
  });

  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", targetType, targetId] });
      message.success("已删除");
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <Input.TextArea
          placeholder="说点什么…"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            type="primary"
            icon={<SendOutlined />}
            disabled={!body.trim()}
            loading={post.isPending}
            onClick={() => post.mutate()}
          >
            发表评论
          </Button>
        </div>
      </div>

      {isLoading ? null : data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.map((c) => {
            const canDelete = c.author.id === me?.id || me?.role === "admin";
            return (
              <div
                key={c.id}
                style={{
                  borderRadius: 10,
                  padding: "12px 14px",
                  background: "rgba(125,125,140,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <UserBadge user={c.author} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {fromNow(c.created_at)}
                    {canDelete && (
                      <Button
                        size="small"
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          modal.confirm({
                            title: "删除此条评论？",
                            okText: "删除",
                            cancelText: "取消",
                            okButtonProps: { danger: true },
                            onOk: () => remove.mutate(c.id),
                          })
                        }
                      />
                    )}
                  </Typography.Text>
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{c.body}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
