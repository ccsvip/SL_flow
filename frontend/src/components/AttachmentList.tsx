import React from "react";
import { App as AntdApp, Button, Modal, Tooltip, Upload, message } from "antd";
import {
  DeleteOutlined,
  PlayCircleFilled,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { attachments as api } from "@/api/client";
import type { Attachment, AttachmentTargetType } from "@/api/types";
import { bytes } from "@/utils/format";
import { extractError } from "@/api/http";

interface Props {
  targetType: AttachmentTargetType;
  targetId: number;
  /** Render upload control even with zero attachments. */
  allowUpload?: boolean;
  size?: number;
}

export default function AttachmentList({
  targetType,
  targetId,
  allowUpload = true,
  size = 96,
}: Props) {
  const qc = useQueryClient();
  const { modal } = AntdApp.useApp();

  const { data = [] } = useQuery({
    queryKey: ["attachments", targetType, targetId],
    queryFn: () => api.list(targetType, targetId),
    enabled: targetId > 0,
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

  const [previewing, setPreviewing] = React.useState<Attachment | null>(null);
  const [carouselIndex, setCarouselIndex] = React.useState(0);

  const open = (att: Attachment) => {
    const idx = data.findIndex((a) => a.id === att.id);
    setCarouselIndex(idx >= 0 ? idx : 0);
    setPreviewing(att);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {data.map((att) => (
          <div
            key={att.id}
            className="slf-att-tile"
            style={{ width: size, height: size }}
            onClick={() => open(att)}
          >
            {att.is_image ? (
              <img src={att.url} alt={att.filename} loading="lazy" />
            ) : (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <video src={att.url} muted playsInline />
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
              {att.is_image ? "IMG" : "VIDEO"} · {bytes(att.size)}
            </span>
            {allowUpload && (
              <span
                className="slf-att-rm"
                onClick={(e) => {
                  e.stopPropagation();
                  modal.confirm({
                    title: "删除该附件？",
                    content: att.filename,
                    okText: "删除",
                    okButtonProps: { danger: true },
                    cancelText: "取消",
                    onOk: () => remove.mutate(att.id),
                  });
                }}
              >
                <DeleteOutlined />
              </span>
            )}
          </div>
        ))}

        {allowUpload && (
          <Upload
            multiple
            accept="image/*,video/*"
            showUploadList={false}
            beforeUpload={() => false}
            onChange={(info) => {
              const files = info.fileList.map((f) => f.originFileObj as File).filter(Boolean);
              if (files.length > 0) upload.mutate(files);
            }}
          >
            <div
              className="slf-att-tile"
              style={{
                width: size,
                height: size,
                borderStyle: "dashed",
                color: "rgba(125,125,140,0.9)",
                background: "rgba(125,125,140,0.06)",
              }}
            >
              <div style={{ textAlign: "center", fontSize: 12 }}>
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
        open={!!previewing}
        onCancel={() => setPreviewing(null)}
        footer={null}
        width={Math.min(960, window.innerWidth - 80)}
        destroyOnClose
        title={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{data[carouselIndex]?.filename}</span>
            <span style={{ fontSize: 12, opacity: 0.6, marginRight: 32 }}>
              {data.length > 0 && `${carouselIndex + 1} / ${data.length}`}
            </span>
          </div>
        }
      >
        {previewing && data[carouselIndex] && (
          <div style={{ display: "grid", placeItems: "center" }}>
            {data[carouselIndex].is_image ? (
              <img
                src={data[carouselIndex].url}
                alt={data[carouselIndex].filename}
                style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
              />
            ) : (
              <video
                src={data[carouselIndex].url}
                controls
                autoPlay
                style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
              />
            )}
            {data.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button
                  disabled={carouselIndex === 0}
                  onClick={() => {
                    const i = carouselIndex - 1;
                    setCarouselIndex(i);
                    setPreviewing(data[i]);
                  }}
                >
                  上一张
                </Button>
                <Button
                  disabled={carouselIndex === data.length - 1}
                  onClick={() => {
                    const i = carouselIndex + 1;
                    setCarouselIndex(i);
                    setPreviewing(data[i]);
                  }}
                >
                  下一张
                </Button>
                <Tooltip title="下载原文件">
                  <Button
                    type="primary"
                    href={data[carouselIndex].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    下载
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
