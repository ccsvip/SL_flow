import React from "react";
import {
  App as AntdApp,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Tabs,
} from "antd";
import { DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";

import { bugs, attachments } from "@/api/client";
import { extractError } from "@/api/http";
import { useProjectOptions, useUserOptions } from "@/hooks/options";
import AISummaryButton from "@/components/AISummaryButton";
import AttachmentList from "@/components/AttachmentList";
import CommentsPanel from "@/components/CommentsPanel";
import type { Bug } from "@/api/types";

interface Props {
  open: boolean;
  bug?: Bug;
  defaultProjectId?: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const STATUS_OPTIONS = [
  { value: "open", label: "未解决" },
  { value: "in_progress", label: "进行中" },
  { value: "resolved", label: "已解决" },
  { value: "closed", label: "已关闭" },
  { value: "reopened", label: "重新打开" },
];
const SEVERITY_OPTIONS = [
  { value: "trivial", label: "轻微" },
  { value: "minor", label: "次要" },
  { value: "major", label: "重要" },
  { value: "critical", label: "严重" },
  { value: "blocker", label: "阻塞" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

export default function BugDrawer({
  open,
  bug,
  defaultProjectId,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [form] = Form.useForm();
  const { modal, message } = AntdApp.useApp();
  const isEdit = !!bug;
  const projectOpts = useProjectOptions();
  const userOpts = useUserOptions();
  const [stagedFiles, setStagedFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (!open) return;
    form.resetFields();
    setStagedFiles([]);
    if (bug) {
      form.setFieldsValue({ ...bug, assignee_id: bug.assignee?.id ?? null });
    } else {
      form.setFieldsValue({
        status: "open",
        severity: "minor",
        priority: "medium",
        project_id: defaultProjectId,
      });
    }
  }, [open, bug, defaultProjectId, form]);

  const save = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      if (isEdit && bug) return bugs.update(bug.id, v);
      const created = await bugs.create(v);
      if (stagedFiles.length > 0) {
        try {
          await attachments.upload("bug", created.id, stagedFiles);
        } catch {
          message.warning("缺陷已创建，但部分附件上传失败，可在编辑页重新上传");
        }
      }
      return created;
    },
    onSuccess: () => {
      message.success(isEdit ? "缺陷已更新" : "缺陷已创建");
      onSaved();
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const remove = useMutation({
    mutationFn: () => (bug ? bugs.remove(bug.id) : Promise.resolve(true)),
    onSuccess: () => {
      message.success("缺陷已删除");
      onDeleted?.();
      onClose();
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  return (
    <Drawer
      title={isEdit ? `缺陷 #${bug?.id}` : "新建缺陷"}
      open={open}
      onClose={onClose}
      width={Math.min(760, window.innerWidth - 80)}
      destroyOnClose
      extra={
        <Space>
          {isEdit && bug && (
            <AISummaryButton targetType="bug" targetId={bug.id} />
          )}
          {isEdit && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                modal.confirm({
                  title: "删除该缺陷？",
                  okText: "删除",
                  okButtonProps: { danger: true },
                  cancelText: "取消",
                  onOk: () => remove.mutate(),
                })
              }
            >
              删除
            </Button>
          )}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: "form",
            label: "详情",
            children: (
              <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item
                  label="标题"
                  name="title"
                  rules={[{ required: true, message: "必填" }, { max: 255 }]}
                >
                  <Input placeholder="一句话描述问题" />
                </Form.Item>
                <Form.Item label="问题描述" name="description">
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item label="复现步骤" name="steps_to_reproduce">
                  <Input.TextArea rows={3} placeholder={"1. ...\n2. ...\n3. ..."} />
                </Form.Item>
                <Space style={{ display: "flex", gap: 8 }}>
                  <Form.Item label="期望结果" name="expected_result" style={{ flex: 1 }}>
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Form.Item label="实际结果" name="actual_result" style={{ flex: 1 }}>
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Space>
                <Form.Item label="环境" name="environment">
                  <Input placeholder="如 Chrome 124 / macOS 14 / 生产环境" />
                </Form.Item>
                <Form.Item
                  label="所属项目"
                  name="project_id"
                  rules={[{ required: true, message: "必选" }]}
                >
                  <Select options={projectOpts} showSearch optionFilterProp="label" />
                </Form.Item>
                <Space style={{ display: "flex", gap: 8 }}>
                  <Form.Item label="状态" name="status">
                    <Select options={STATUS_OPTIONS} style={{ width: 130 }} />
                  </Form.Item>
                  <Form.Item label="严重程度" name="severity">
                    <Select options={SEVERITY_OPTIONS} style={{ width: 130 }} />
                  </Form.Item>
                  <Form.Item label="优先级" name="priority">
                    <Select options={PRIORITY_OPTIONS} style={{ width: 130 }} />
                  </Form.Item>
                  <Form.Item label="负责人" name="assignee_id">
                    <Select
                      options={userOpts}
                      allowClear
                      placeholder="未指派"
                      style={{ width: 200 }}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                </Space>
              </Form>
            ),
          },
          {
            key: "attach",
            label: "附件",
            children: (
              <AttachmentList
                targetType="bug"
                targetId={bug?.id ?? 0}
                stagedFiles={bug ? undefined : stagedFiles}
                onStagedChange={bug ? undefined : setStagedFiles}
              />
            ),
          },
          {
            key: "comments",
            label: "评论",
            disabled: !bug,
            children: bug ? <CommentsPanel targetType="bug" targetId={bug.id} /> : null,
          },
        ]}
      />
    </Drawer>
  );
}
