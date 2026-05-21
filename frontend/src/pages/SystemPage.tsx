import {
  App as AntdApp,
  Alert,
  Button,
  Card,
  Descriptions,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import {
  CloudSyncOutlined,
  DownloadOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { system } from "@/api/client";
import { extractError } from "@/api/http";
import { useAuthStore } from "@/store/auth";

export default function SystemPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "admin";
  const { modal, message } = AntdApp.useApp();
  const qc = useQueryClient();

  const { data: ver, isLoading } = useQuery({
    queryKey: ["version"],
    queryFn: system.version,
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
    onSuccess: (r) => message.success(r.message),
    onError: (e) => message.error(extractError(e, "更新失败")),
  });

  const { data: log, refetch: refetchLog } = useQuery({
    queryKey: ["update-log"],
    queryFn: system.updateLog,
    enabled: isAdmin,
    refetchInterval: 10_000,
  });

  if (isLoading || !ver) {
    return (
      <div className="slf-page">
        <Skeleton active />
      </div>
    );
  }

  const info = checkMutation.data;
  const updateAvailable = !!info?.update_available;

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <CloudSyncOutlined /> 版本与热更新
      </h1>

      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
          <Descriptions.Item label="应用版本">
            <Tag color="blue" style={{ fontSize: 13 }}>
              v{ver.app_version}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="分支">
            {ver.git?.branch ? <Tag color="purple">{ver.git.branch}</Tag> : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="热更新">
            {ver.hot_reload_enabled ? (
              <Tag color="green">已启用</Tag>
            ) : (
              <Tag>已禁用</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="本地提交" span={3}>
            <code style={{ fontSize: 12 }}>
              {ver.git?.local_commit?.slice(0, 12) || "—"}
            </code>{" "}
            {ver.git?.local_message && <span> · {ver.git.local_message}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="最近提交者">
            {ver.git?.local_author || "—"}
          </Descriptions.Item>
          <Descriptions.Item label="提交时间" span={2}>
            {ver.git?.local_date || "—"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {!isAdmin ? (
        <Alert
          type="info"
          showIcon
          message="只有管理员可以触发热更新"
          description="若需更新系统，请联系管理员。"
        />
      ) : (
        <>
          <Card
            bordered={false}
            title="检查更新"
            extra={
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => checkMutation.mutate()}
                loading={checkMutation.isPending}
              >
                检查
              </Button>
            }
            style={{ marginBottom: 16 }}
          >
            {info ? (
              updateAvailable ? (
                <>
                  <Alert
                    type="warning"
                    showIcon
                    message={`检测到新版本: ${info.remote_commit?.slice(0, 12)}`}
                    description={
                      <div>
                        <div>
                          <strong>{info.remote_message}</strong>
                        </div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>
                          {info.remote_author} · {info.remote_date}
                        </div>
                      </div>
                    }
                  />
                  {info.incoming_commits && info.incoming_commits.length > 0 && (
                    <Card type="inner" title="变更记录" style={{ marginTop: 12 }}>
                      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {info.incoming_commits.join("\n")}
                      </pre>
                    </Card>
                  )}
                  <div style={{ marginTop: 16 }}>
                    <Button
                      type="primary"
                      danger
                      size="large"
                      icon={<DownloadOutlined />}
                      loading={applyMutation.isPending}
                      onClick={() =>
                        modal.confirm({
                          title: "确认应用更新？",
                          content:
                            "系统将在后台执行 git pull 并触发 docker compose 重新构建。期间服务可能短暂不可用 (≈30-90 秒)。",
                          okText: "立即更新",
                          okButtonProps: { danger: true },
                          onOk: () => applyMutation.mutateAsync(),
                        })
                      }
                    >
                      立即应用更新
                    </Button>
                  </div>
                </>
              ) : (
                <Alert type="success" showIcon message="当前已是最新版本" />
              )
            ) : (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                点击右上角「检查」获取远端最新版本。
              </Typography.Paragraph>
            )}
          </Card>

          <Card
            bordered={false}
            title={
              <span>
                <HistoryOutlined /> 最近更新日志
              </span>
            }
            extra={
              <Button size="small" onClick={() => refetchLog()}>
                刷新
              </Button>
            }
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontSize: 12,
                maxHeight: 300,
                overflow: "auto",
                background: "rgba(125,125,140,0.06)",
                padding: 12,
                borderRadius: 8,
              }}
            >
              {log?.log || "暂无更新记录"}
            </pre>
          </Card>
        </>
      )}
    </div>
  );
}
