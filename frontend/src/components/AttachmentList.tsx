import React from "react";
import { App as AntdApp, Button, Modal, Tooltip, Upload, message } from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  PlayCircleFilled,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { attachments as api } from "@/api/client";
import type { Attachment, AttachmentTargetType } from "@/api/types";
import { bytes } from "@/utils/format";
import { extractError, http } from "@/api/http";
import { AuthImage, AuthVideo } from "@/components/AuthMedia";

interface Props {
  targetType: AttachmentTargetType;
  /** Pass 0 (or undefined) when the parent entity does not exist yet. In that
   * mode the component holds files in local memory and exposes them via the
   * `stagedFiles` controlled prop so the parent can flush after creation. */
  targetId: number;
  /** Render upload control even with zero attachments. */
  allowUpload?: boolean;
  size?: number;
  /** Controlled staged files (used when targetId is 0). The parent owns the
   * array and can submit it after creating the entity. */
  stagedFiles?: File[];
  onStagedChange?: (files: File[]) => void;
}

export default function AttachmentList({
  targetType,
  targetId,
  allowUpload = true,
  size = 96,
  stagedFiles,
  onStagedChange,
}: Props) {
  const qc = useQueryClient();
  const { modal } = AntdApp.useApp();

  const isStaging = !targetId || targetId <= 0;

  // Files staged in memory until the parent entity is created. When the parent
  // owns it (controlled mode), use that; otherwise local state.
  const [localStaged, setLocalStaged] = React.useState<File[]>([]);
  const staged = stagedFiles ?? localStaged;
  const setStaged = (next: File[]) => {
    if (onStagedChange) onStagedChange(next);
    else setLocalStaged(next);
  };

  const { data: serverData = [] } = useQuery({
    queryKey: ["attachments", targetType, targetId],
    queryFn: () => api.list(targetType, targetId),
    enabled: !isStaging,
  });

  const upload = useMutation({
    mutationFn: (files: File[]) => api.upload(targetType, targetId, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", targetType, targetId] });
    },
    onError: (e) => message.error(extractError(e, "上传失败")),
  });

  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", targetType, targetId] });
      message.success("已删除");
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  // Render a unified list: server-attachment shape OR a synthetic record
  // representing a staged File. We use a discriminator for the staged kind.
  type StagedItem = {
    kind: "staged";
    id: string;
    file: File;
    objectUrl: string;
    is_image: boolean;
    is_video: boolean;
  };
  type ServerItem = { kind: "server"; data: Attachment };
  type Item = StagedItem | ServerItem;

  const items: Item[] = React.useMemo(() => {
    if (isStaging) {
      return staged.map((f, i) => ({
        kind: "staged" as const,
        id: `staged-${i}-${f.name}`,
        file: f,
        objectUrl: URL.createObjectURL(f),
        is_image: f.type.startsWith("image/"),
        is_video: f.type.startsWith("video/"),
      }));
    }
    return serverData.map((a) => ({ kind: "server" as const, data: a }));
  }, [isStaging, staged, serverData]);

  // Cleanup object URLs when staged list changes.
  React.useEffect(() => {
    if (!isStaging) return;
    return () => {
      items.forEach((it) => {
        if (it.kind === "staged") URL.revokeObjectURL(it.objectUrl);
      });
    };
  }, [isStaging, items]);

  const [previewIdx, setPreviewIdx] = React.useState<number | null>(null);
  const previewing = previewIdx !== null ? items[previewIdx] : null;

  const handlePickFiles = (files: File[]) => {
    if (isStaging) {
      // Validate type client-side; backend uses the same allowlist.
      const ok = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
      if (ok.length < files.length) {
        message.warning("已忽略非图片/视频文件");
      }
      setStaged([...staged, ...ok]);
    } else {
      upload.mutate(files);
    }
  };

  const handleRemove = (it: Item, e: React.MouseEvent) => {
    e.stopPropagation();
    if (it.kind === "staged") {
      modal.confirm({
        title: "移除该文件？",
        content: it.file.name,
        okText: "移除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: () => {
          setStaged(staged.filter((f) => f !== it.file));
        },
      });
    } else {
      modal.confirm({
        title: "删除该附件？",
        content: it.data.filename,
        okText: "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: () => remove.mutate(it.data.id),
      });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {items.map((it, idx) => {
          const isImage = it.kind === "staged" ? it.is_image : it.data.is_image;
          const isVideo = it.kind === "staged" ? it.is_video : it.data.is_video;
          const filename = it.kind === "staged" ? it.file.name : it.data.filename;
          const sizeBytes = it.kind === "staged" ? it.file.size : it.data.size;
          const key = it.kind === "staged" ? it.id : it.data.id;
          return (
            <div
              key={key}
              className="slf-att-tile"
              style={{ width: size, height: size }}
              onClick={() => setPreviewIdx(idx)}
            >
              {isImage ? (
                it.kind === "staged" ? (
                  <img
                    src={it.objectUrl}
                    alt={filename}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <AuthImage
                    src={it.data.url}
                    alt={filename}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )
              ) : (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  {it.kind === "staged" ? (
                    <video
                      src={it.objectUrl}
                      muted
                      playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <AuthVideo
                      src={it.data.url}
                      muted
                      playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                  <PlayCircleFilled
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      fontSize: 28,
                      color: "rgba(255,255,255,0.95)",
                      textShadow: "0 2px 6px rgba(0,0,0,0.6)",
                    }}
                  />
                </div>
              )}
              <span className="slf-att-badge">
                {it.kind === "staged" ? "暂存" : isImage ? "IMG" : "VIDEO"} · {bytes(sizeBytes)}
              </span>
              {allowUpload && (
                <span
                  className="slf-att-rm"
                  onClick={(e) => handleRemove(it, e)}
                >
                  <DeleteOutlined />
                </span>
              )}
            </div>
          );
        })}

        {allowUpload && (
          <Upload
            multiple
            accept="image/*,video/*"
            showUploadList={false}
            beforeUpload={() => false}
            onChange={(info) => {
              const files = info.fileList.map((f) => f.originFileObj as File).filter(Boolean);
              if (files.length > 0) handlePickFiles(files);
            }}
          >
            <div
              className="slf-att-tile"
              style={{
                width: size,
                height: size,
                borderStyle: "dashed",
                background: "rgba(125,125,140,0.06)",
              }}
            >
              <div style={{ textAlign: "center", fontSize: 12, color: "currentColor" }}>
                {upload.isPending ? (
                  <>
                    <UploadOutlined style={{ fontSize: 22 }} />
                    <div>上传中…</div>
                  </>
                ) : (
                  <>
                    <PlusOutlined style={{ fontSize: 22 }} />
                    <div>添加图片/视频</div>
                  </>
                )}
              </div>
            </div>
          </Upload>
        )}
      </div>

      <Modal
        open={previewing !== null}
        onCancel={() => setPreviewIdx(null)}
        footer={null}
        width={Math.min(960, window.innerWidth - 80)}
        destroyOnClose
        title={
          previewing && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                {previewing.kind === "staged" ? previewing.file.name : previewing.data.filename}
              </span>
              <span style={{ fontSize: 12, opacity: 0.6, marginRight: 32 }}>
                {items.length > 0 && previewIdx !== null && `${previewIdx + 1} / ${items.length}`}
              </span>
            </div>
          )
        }
      >
        {previewing && (
          <div style={{ display: "grid", placeItems: "center" }}>
            {(previewing.kind === "staged" ? previewing.is_image : previewing.data.is_image) ? (
              previewing.kind === "staged" ? (
                <img
                  src={previewing.objectUrl}
                  alt={previewing.file.name}
                  style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
                />
              ) : (
                <AuthImage
                  src={previewing.data.url}
                  alt={previewing.data.filename}
                  style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
                />
              )
            ) : previewing.kind === "staged" ? (
              <video
                src={previewing.objectUrl}
                controls
                autoPlay
                style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
              />
            ) : (
              <AuthVideo
                src={previewing.data.url}
                controls
                autoPlay
                style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
              />
            )}
            {items.length > 1 && previewIdx !== null && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button
                  disabled={previewIdx === 0}
                  onClick={() => setPreviewIdx(previewIdx - 1)}
                >
                  上一张
                </Button>
                <Button
                  disabled={previewIdx === items.length - 1}
                  onClick={() => setPreviewIdx(previewIdx + 1)}
                >
                  下一张
                </Button>
                {previewing.kind === "server" && (
                  <Tooltip title="下载原文件">
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        if (previewing.kind !== "server") return;
                        const att = previewing.data;
                        try {
                          // Strip /api prefix because http.baseURL already adds it.
                          const path = att.url.startsWith("/api/") ? att.url.slice(4) : att.url;
                          const blob = (await http.get<Blob>(path, { responseType: "blob" })).data;
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = att.filename;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          setTimeout(() => URL.revokeObjectURL(url), 5000);
                        } catch (e) {
                          message.error(extractError(e, "下载失败"));
                        }
                      }}
                    >
                      下载
                    </Button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
