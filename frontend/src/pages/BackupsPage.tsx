import React from "react";
import {
  App as AntdApp,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CloudDownloadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";

import { dbBackups } from "@/api/client";
import type { BackupKind, DBBackup } from "@/api/types";
import { extractError, http } from "@/api/http";
import UserBadge from "@/components/UserBadge";
import { bytes, formatDate, fromNow } from "@/utils/format";

const KIND_LABEL: Record<BackupKind, { label: string; color: string }> = {
  manual: { label: "手动", color: "blue" },
  scheduled: { label: "定时", color: "purple" },
  pre_restore: { label: "回退快照", color: "orange" },
};

export default function BackupsPage() {
  const qc = useQueryClient();
  const { modal } = AntdApp.useApp();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [creating, setCreating] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<number | null>(null);

  const list = useQuery({
    queryKey: ["db-backups", page, pageSize],
    queryFn: () => dbBackups.list(page, pageSize),
    placeholderData: (prev) => prev,
  });

  const settings = useQuery({
    queryKey: ["db-backups", "settings"],
    queryFn: dbBackups.getSettings,
  });

  const createBackup = useMutation({
    mutationFn: (note?: string) => dbBackups.create(note),
    onSuccess: () => {
      message.success("已生成备份");
      qc.invalidateQueries({ queryKey: ["db-backups"] });
    },
    onError: (e) => message.error(extractError(e, "备份失败")),
    onSettled: () => setCreating(false),
  });

  const removeBackup = useMutation({
    mutationFn: (id: number) => dbBackups.remove(id),
    onSuccess: () => {
      message.success("已删除");
      qc.invalidateQueries({ queryKey: ["db-backups"] });
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  const restoreBackup = useMutation({
    mutationFn: (id: number) => dbBackups.restore(id),
    onSuccess: (r) => {
      message.success(r.message || "还原完成");
      qc.invalidateQueries({ queryKey: ["db-backups"] });
    },
    onError: (e) => message.error(extractError(e, "还原失败")),
    onSettled: () => setRestoringId(null),
  });

  const updateSettings = useMutation({
    mutationFn: dbBackups.updateSettings,
    onSuccess: () => {
      message.success("已保存");
      qc.invalidateQueries({ queryKey: ["db-backups", "settings"] });
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const downloadBackup = async (row: DBBackup) => {
    try {
      const resp = await http.get<Blob>(`/db-backups/${row.id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = row.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      message.error(extractError(e, "下载失败"));
    }
  };

  const handleUpload = async (file: File) => {
    try {
      await dbBackups.upload(file);
      message.success("上传成功");
      qc.invalidateQueries({ queryKey: ["db-backups"] });
    } catch (e) {
      message.error(extractError(e, "上传失败"));
    }
    return false; // tell antd Upload not to do anything itself
  };

  const handleRestore = (row: DBBackup) => {
    modal.confirm({
      title: `确认还原数据库到 ${row.filename}？`,
      content: (
        <div>
          <p>该操作将：</p>
          <ol style={{ paddingLeft: 18, marginTop: 4 }}>
            <li>先生成一份当前数据库的「回退快照」</li>
            <li>清空 public schema 并把这个备份导入</li>
          </ol>
          <Alert
            type="warning"
            showIcon
            message="还原期间所有连接将短暂中断，未保存的数据可能丢失"
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: "立即还原",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        setRestoringId(row.id);
        return restoreBackup.mutateAsync(row.id);
      },
    });
  };

  const columns: ColumnsType<DBBackup> = [
    { title: "ID", dataIndex: "id", width: 70 },
    {
      title: "文件",
      dataIndex: "filename",
      render: (v: string, r) => (
        <Tooltip title={r.sha256 ? `sha256: ${r.sha256}` : ""}>
          <code style={{ fontSize: 12 }}>{v}</code>
        </Tooltip>
      ),
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 110,
      render: (v: BackupKind) => {
        const k = KIND_LABEL[v];
        return <Tag color={k?.color || "default"}>{k?.label || v}</Tag>;
      },
    },
    {
      title: "大小",
      dataIndex: "size_bytes",
      width: 110,
      render: (v: number) => bytes(v),
    },
    {
      title: "创建者",
      width: 160,
      render: (_, r) =>
        r.creator ? (
          <UserBadge user={r.creator} size={22} />
        ) : (
          <Typography.Text type="secondary">
            {r.creator_username_at_event || "—"}
          </Typography.Text>
        ),
    },
    {
      title: "时间",
      dataIndex: "created_at",
      width: 160,
      render: (v: string) => (
        <Tooltip title={formatDate(v, "YYYY-MM-DD HH:mm:ss")}>
          {fromNow(v)}
        </Tooltip>
      ),
    },
    {
      title: "备注",
      dataIndex: "note",
      render: (v: string | null) =>
        v ? (
          <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
        ) : (
          "—"
        ),
    },
    {
      title: "操作",
      width: 280,
      render: (_, r) => (
        <Space size="small">
          <Button
            type="link"
            icon={<CloudDownloadOutlined />}
            onClick={() => downloadBackup(r)}
          >
            下载
          </Button>
          <Button
            type="link"
            icon={<RollbackOutlined />}
            loading={restoringId === r.id}
            onClick={() => handleRestore(r)}
            danger
          >
            还原
          </Button>
          <Popconfirm
            title="删除该备份？"
            description="文件和记录都会被删除，不可恢复"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => removeBackup.mutate(r.id)}
          >
            <Button type="link" icon={<DeleteOutlined />} danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <DatabaseOutlined /> 数据备份
        <span style={{ marginLeft: "auto" }}>
          <a onClick={() => list.refetch()} style={{ marginRight: 8 }}>
            <ReloadOutlined /> 刷新
          </a>
        </span>
      </h1>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}>
          <Card title="操作" bordered={false}>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={createBackup.isPending || creating}
                onClick={() => {
                  setCreating(true);
                  createBackup.mutate(undefined);
                }}
              >
                立即生成备份
              </Button>
              <Upload
                accept=".sql.gz,.gz"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUpload(file as File);
                  return false;
                }}
                multiple={false}
              >
                <Button icon={<UploadOutlined />}>上传 .sql.gz 文件</Button>
              </Upload>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                备份文件保存在容器内 <code>/app/backups</code>（命名卷 backups）
              </Typography.Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card
            title={
              <span>
                <HistoryOutlined /> 定时备份
              </span>
            }
            bordered={false}
          >
            {settings.isLoading ? null : settings.data ? (
              <Form
                layout="inline"
                size="small"
                initialValues={settings.data}
                onValuesChange={(_, all) => {
                  // debounce free-form changes via small useDeferred would be nicer;
                  // keep it simple: save on blur via the dedicated button.
                }}
              >
                <Form.Item label="启用" valuePropName="checked">
                  <Switch
                    checked={settings.data.enabled}
                    onChange={(v) =>
                      updateSettings.mutate({ enabled: v })
                    }
                  />
                </Form.Item>
                <Form.Item label="每">
                  <InputNumber
                    min={1}
                    max={720}
                    value={settings.data.interval_hours}
                    onChange={(v) =>
                      v != null && updateSettings.mutate({ interval_hours: Number(v) })
                    }
                    addonAfter="小时"
                    style={{ width: 130 }}
                  />
                </Form.Item>
                <Form.Item label="保留">
                  <InputNumber
                    min={1}
                    max={200}
                    value={settings.data.keep_count}
                    onChange={(v) =>
                      v != null && updateSettings.mutate({ keep_count: Number(v) })
                    }
                    addonAfter="份"
                    style={{ width: 120 }}
                  />
                </Form.Item>
                <Descriptions
                  column={1}
                  size="small"
                  style={{ marginTop: 12 }}
                  contentStyle={{ fontSize: 12 }}
                  labelStyle={{ fontSize: 12 }}
                >
                  <Descriptions.Item label="下次执行">
                    {settings.data.next_run_at
                      ? formatDate(settings.data.next_run_at, "YYYY-MM-DD HH:mm")
                      : "未启用"}
                  </Descriptions.Item>
                  <Descriptions.Item label="最近一次">
                    {settings.data.last_run_at ? (
                      <span>
                        {fromNow(settings.data.last_run_at)} ·{" "}
                        <Tag
                          color={
                            settings.data.last_run_status === "success"
                              ? "green"
                              : "red"
                          }
                        >
                          {settings.data.last_run_status || "—"}
                        </Tag>
                      </span>
                    ) : (
                      "尚未执行"
                    )}
                  </Descriptions.Item>
                  {settings.data.last_run_error && (
                    <Descriptions.Item label="错误">
                      <Typography.Text type="danger" style={{ fontSize: 12 }}>
                        {settings.data.last_run_error.slice(0, 200)}
                      </Typography.Text>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Form>
            ) : null}
          </Card>
        </Col>
      </Row>

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items || []}
          loading={list.isFetching}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total: list.data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ["20", "50", "100"],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (t) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <Empty description="尚无备份" /> }}
        />
      </Card>
    </div>
  );
}
