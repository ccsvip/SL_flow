import { App as AntdApp, Button, Form, Input, Modal } from "antd";

import { auth } from "@/api/client";
import { extractError } from "@/api/http";
import { useAuthStore } from "@/store/auth";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const logout = useAuthStore((s) => s.logout);

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await auth.changePassword(values.current_password, values.new_password);
      message.success("密码已更新，请使用新密码重新登录");
      form.resetFields();
      onClose();
      setTimeout(() => {
        logout();
        window.location.href = "/login";
      }, 600);
    } catch (e) {
      message.error(extractError(e, "修改密码失败"));
    }
  };

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" onClick={submit}>
          确认修改
        </Button>,
      ]}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          label="当前密码"
          name="current_password"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password autoFocus autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="new_password"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 4, message: "至少 4 个字符" },
            { max: 72, message: "最多 72 个字符" },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="再次确认"
          name="confirm"
          dependencies={["new_password"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || value === getFieldValue("new_password")) return Promise.resolve();
                return Promise.reject(new Error("两次密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
