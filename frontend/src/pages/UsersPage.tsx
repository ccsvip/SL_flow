import React from "react";
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  KeyOutlined,
  PlusOutlined,
  StopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";

import { users } from "@/api/client";
import { extractError } from "@/api/http";
import UserBadge from "@/components/UserBadge";
import { fromNow, zh } from "@/utils/format";
import type { User, UserRole } from "@/api/types";
import { useAuthStore } from "@/store/auth";

function UserFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const isEdit = !!initial;

  React.useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (initial) {
      form.setFieldsValue(initial);
    } else {
      form.setFieldsValue({ role: "user", is_active: true });
    }
  }, [open, initial, form]);

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (isEdit && initial) {
        const { username: _u, password: _p, ...rest } = v;
        await users.update(initial.id, rest);
      } else {
        await users.create(v);
      }
      message.success(isEdit ? "用户已更新" : "用户已创建");
      onSaved();
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error(extractError(e, "保存失败"));
    }
  };

  return (
    <Modal
      title={isEdit ? "编辑用户" : "新建用户"}
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          label="账号"
          name="username"
          rules={[
            { required: true, min: 3, max: 64 },
            { pattern: /^[A-Za-z0-9_\-\.]+$/, message: "仅字母/数字/_-." },
          ]}
        >
          <Input disabled={isEdit} />
        </Form.Item>
        {!isEdit && (
          <Form.Item
            label="初始密码"
            name="password"
            rules={[
              { required: true, min: 4, max: 72, message: "4-72 个字符" },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
        <Form.Item label="姓名" name="full_name" rules={[{ max: 128 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="邮箱" name="email" rules={[{ type: "email" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="角色" name="role">
          <Select
            options={[
              { value: "admin", label: "管理员" },
              { value: "user", label: "普通用户" },
            ]}
          />
        </Form.Item>
        <Form.Item label="启用" name="is_active" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { modal, message } = AntdApp.useApp();
  const me = useAuthStore((s) => s.user);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | undefined>();

  const { data = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: users.list,
  });

  const remove = useMutation({
    mutationFn: users.remove,
    onSuccess: () => {
      message.success("用户已停用");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => message.error(extractError(e, "操作失败")),
  });

  const reset = useMutation({
    mutationFn: ({ id, pw }: { id: number; pw: string }) =>
      users.resetPassword(id, pw),
    onSuccess: () => message.success("密码已重置"),
    onError: (e) => message.error(extractError(e, "重置失败")),
  });

  const columns: ColumnsType<User> = [
    {
      title: "用户",
      render: (_, r) => <UserBadge user={r} />,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      render: (v) => v || <Typography.Text type="secondary">未设置</Typography.Text>,
    },
    {
      title: "角色",
      dataIndex: "role",
      width: 110,
      render: (v: UserRole) =>
        v === "admin" ? <Tag color="purple">{zh(v)}</Tag> : <Tag>{zh(v)}</Tag>,
    },
    {
      title: "状态",
      dataIndex: "is_active",
      width: 90,
      render: (v) => (v ? <Tag color="green">启用</Tag> : <Tag>已停用</Tag>),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 150,
      render: (v) => fromNow(v),
    },
    {
      title: "操作",
      width: 240,
      render: (_, r) => (
        <span>
          <Button type="link" onClick={() => setEditing(r)}>
            编辑
          </Button>
          <Button
            type="link"
            icon={<KeyOutlined />}
            onClick={() => {
              let pw = "";
              modal.confirm({
                title: `重置 ${r.username} 的密码`,
                content: (
                  <Input.Password
                    placeholder="新密码 (至少 4 位)"
                    onChange={(e) => (pw = e.target.value)}
                  />
                ),
                okText: "重置",
                cancelText: "取消",
                onOk: () => {
                  if (!pw || pw.length < 4) {
                    message.error("密码至少 4 位");
                    return Promise.reject();
                  }
                  return reset.mutateAsync({ id: r.id, pw });
                },
              });
            }}
          >
            重置密码
          </Button>
          <Button
            type="link"
            danger
            icon={<StopOutlined />}
            disabled={r.id === me?.id}
            onClick={() =>
              modal.confirm({
                title: `停用用户 ${r.username}？`,
                content: "停用后该用户无法登录，但保留其历史数据。",
                okText: "停用",
                cancelText: "取消",
                okButtonProps: { danger: true },
                onOk: () => remove.mutate(r.id),
              })
            }
          >
            停用
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="slf-page">
      <h1 className="slf-page-title">
        <TeamOutlined /> 用户管理
        <span style={{ marginLeft: "auto" }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建用户
          </Button>
        </span>
      </h1>

      <Card bordered={false}>
        <Table
          rowKey="id"
          dataSource={data}
          columns={columns}
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          size="middle"
        />
      </Card>

      <UserFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["users"] });
        }}
      />
      <UserFormModal
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          qc.invalidateQueries({ queryKey: ["users"] });
        }}
      />
    </div>
  );
}
