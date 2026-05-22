import React from "react";
import {
  App as AntdApp,
  Button,
  Input,
  Modal,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ai } from "@/api/client";
import { extractError } from "@/api/http";
import type { AITargetType } from "@/api/types";

interface Props {
  targetType: AITargetType;
  targetId: number;
  /** Disable the entry button (e.g. when the entity has not been saved). */
  disabled?: boolean;
}

/**
 * Single-purpose entry point for the AI summary feature. Lives inside the
 * task / story / bug drawers as a small "✦ AI 摘要" pill.
 *
 * Behaviour:
 *  - Hidden entirely when the backend reports the AI feature is disabled
 *    (no API key configured).
 *  - Click opens a modal that runs `/ai/summarize` and shows the rendered
 *    result with copy/refresh/extra-instruction support.
 */
export default function AISummaryButton({ targetType, targetId, disabled }: Props) {
  const { message } = AntdApp.useApp();
  const [open, setOpen] = React.useState(false);
  const [instruction, setInstruction] = React.useState("");

  // The /ai/status check is shared across the SPA via the query key, so
  // many drawers don't each spawn a separate request.
  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: ai.status,
    staleTime: 60_000,
  });

  const summarize = useMutation({
    mutationFn: () => ai.summarize(targetType, targetId, instruction || undefined),
    onError: (e) => message.error(extractError(e, "AI 摘要失败")),
  });

  if (!status?.enabled) return null;

  const handleOpen = () => {
    setOpen(true);
    setInstruction("");
    // Auto-fire on first open. The user can still re-run with a custom
    // instruction afterwards.
    summarize.reset();
    summarize.mutate();
  };

  const handleCopy = async () => {
    if (!summarize.data) return;
    try {
      await navigator.clipboard.writeText(summarize.data.summary);
      message.success("已复制到剪贴板");
    } catch {
      message.warning("复制失败，请手动选中");
    }
  };

  return (
    <>
      <Tooltip
        title={
          disabled
            ? "请先保存条目"
            : `使用 ${status.model || "AI"} 生成摘要`
        }
      >
        <Button
          icon={<ThunderboltOutlined />}
          onClick={handleOpen}
          disabled={disabled}
        >
          AI 摘要
        </Button>
      </Tooltip>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={Math.min(720, window.innerWidth - 80)}
        title={
          <span>
            <ThunderboltOutlined style={{ color: "#722ed1" }} /> AI 摘要
            {status.model && (
              <Tag color="purple" style={{ marginLeft: 8 }}>
                {status.model}
              </Tag>
            )}
          </span>
        }
        destroyOnClose
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input
            placeholder="（可选）追加指令，例如：用英文输出 / 列出所有阻塞"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onPressEnter={() => summarize.mutate()}
            disabled={summarize.isPending}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={() => summarize.mutate()}
            loading={summarize.isPending}
          >
            重新生成
          </Button>
        </div>

        {summarize.isPending && (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        )}

        {!summarize.isPending && summarize.data && (
          <>
            <div
              style={{
                whiteSpace: "pre-wrap",
                background: "rgba(125,125,140,0.06)",
                padding: 16,
                borderRadius: 10,
                fontSize: 14,
                lineHeight: 1.7,
                maxHeight: "55vh",
                overflowY: "auto",
              }}
            >
              {summarize.data.summary}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Typography.Text type="secondary" style={{ fontSize: 11, marginRight: "auto" }}>
                AI 生成内容，请人工核对后再使用
              </Typography.Text>
              <Button onClick={handleCopy}>复制</Button>
            </div>
          </>
        )}

        {!summarize.isPending && summarize.isError && (
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: "rgba(255,77,79,0.08)",
              color: "var(--ant-color-error)",
              fontSize: 13,
            }}
          >
            {extractError(summarize.error, "AI 摘要失败")}
          </div>
        )}
      </Modal>
    </>
  );
}
