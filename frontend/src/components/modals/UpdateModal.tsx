import { App as AntdApp, Alert, Button, Descriptions, Modal, Tag, Typography } from "antd";
import { CloudSyncOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { system } from "@/api/client";
import { extractError } from "@/api/http";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UpdateModal({ open, onClose }: Props) {
  const { modal, message } = AntdApp.useApp();
  const qc = useQueryClient();

  const { data: ver } = useQuery({
    queryKey: ["version"],
    queryFn: system.version,
    enabled: open,
  });

  const checkMutation = useMutation({
    mutationFn: system.checkUpdate,
    onSuccess: () => {
      message.success("已检查最新版本");
      qc.invalidateQueries({ queryKey: ["update-poll"] });
    },
    onError: (e) => message.error(extractError(e, "检查失败")),
  });

  const applyMutation = useMutation({
    mutationFn: system.applyUpdate,
    onSuccess: (r) => {
      message.success(r.message || "更新已开始，请稍后刷新页面");
      onClose();
    },
    onError: (e) => message.error(extractError(e, "更新失败")),
  });

  const info = checkMutation.data;
  const updateAvailable = !!info?.update_available;

  return (
    <Modal
      title={
        <span>
          <CloudSyncOutlined /> 版本与热更新
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="check"
          icon={<ReloadOutlined />}
          onClick={() => checkMutation.mutate()}
          loading={checkMutation.isPending}
        >
          检查更新
        </Button>,
        <Button
          key="apply"
          type="primary"
          icon={<DownloadOutlined />}
          disabled={!updateAvailable}
          loading={applyMutation.isPending}
          onClick={() =>
            modal.confirm({
              title: "确认应用更新？",
              content:
                "系统将拉取最新代码并通过 docker compose 重新构建容器。期间服务可能短暂不可用 (≈30-90 秒)。",
              okText: "立即更新",
              okButtonProps: { danger: true },
              onOk: () => applyMutation.mutate(),
            })
          }
        >
          {updateAvailable ? "立即更新" : "已是最新"}
        </Button>,
      ]}
      width={620}
    >
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="当前版本">
          <Tag color="blue">v{ver?.app_version || "—"}</Tag>
          {ver?.git?.branch && <Tag color="purple">{ver.git.branch}</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="本地提交">
          <code style={{ fontSize: 12 }}>{ver?.git?.local_commit?.slice(0, 12) || "—"}</code>
        </Descriptions.Item>
        <Descriptions.Item label="最近提交信息">
          {ver?.git?.local_message || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="热更新">
          {ver?.hot_reload_enabled ? <Tag color="green">已启用</Tag> : <Tag>已禁用</Tag>}
        </Descriptions.Item>
      </Descriptions>

      <div style={{ marginTop: 16 }}>
        {info ? (
          updateAvailable ? (
            <Alert
              type="warning"
              showIcon
              message={`检测到新版本: ${info.remote_commit?.slice(0, 12)}`}
              description={
                <div style={{ fontSize: 12 }}>
                  <div>
                    <strong>{info.remote_message}</strong>
                  </div>
                  <div style={{ opacity: 0.7 }}>
                    {info.remote_author} · {info.remote_date}
                  </div>
                  {info.incoming_commits && info.incoming_commits.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        maxHeight: 160,
                        overflow: "auto",
                        background: "rgba(125,125,140,0.08)",
                        padding: 8,
                        borderRadius: 6,
                      }}
                    >
                      {info.incoming_commits.map((line) => (
                        <div key={line} style={{ fontFamily: "monospace" }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              }
            />
          ) : (
            <Alert type="success" showIcon message="当前已是最新版本" />
          )
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            点击「检查更新」获取远端最新版本。需要服务器配置了 git 远端，并且 GIT_REPO_PATH 指向有效的工作目录。
          </Typography.Paragraph>
        )}
      </div>
    </Modal>
  );
}
