import React from "react";
import {
  App as AntdApp,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Tag,
} from "antd";
import { DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";

import { tasks, attachments } from "@/api/client";
import { extractError } from "@/api/http";
import { useProjectOptions, useUserOptions } from "@/hooks/options";
import AttachmentList from "@/components/AttachmentList";
import CommentsPanel from "@/components/CommentsPanel";
import type { Task } from "@/api/types";

interface Props {
  open: boolean;
  task?: Task;
  defaultProjectId?: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const STATUS_OPTIONS = [
  { value: "todo", label: "待开始" },
  { value: "in_progress", label: "进行中" },
  { value: "review", label: "待评审" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

export default function TaskDrawer({
  open,
  task,
  defaultProjectId,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [form] = Form.useForm();
  const { modal, message } = AntdApp.useApp();
  const isEdit = !!task;
  const projectOpts = useProjectOptions();
  const userOpts = useUserOptions();
  const [stagedFiles, setStagedFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (!open) return;
    form.resetFields();
    setStagedFiles([]);
    if (task) {
      form.setFieldsValue({
        ...task,
        due_date: task.due_date ? dayjs(task.due_date) : null,
        assignee_id: task.assignee?.id ?? null,
      });
    } else {
      form.setFieldsValue({
        status: "todo",
        priority: "medium",
        estimate_hours: 0,
        consumed_hours: 0,
        project_id: defaultProjectId,
      });
    }
  }, [open, task, defaultProjectId, form]);

  const save = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      const payload = {
        ...v,
        due_date: v.due_date ? v.due_date.format("YYYY-MM-DD") : null,
      };
      if (isEdit && task) {
        return tasks.update(task.id, payload);
      }
      const created = await tasks.create(payload);
      // Submit any files staged before the parent existed.
      if (stagedFiles.length > 0) {
        try {
          await attachments.upload("task", created.id, stagedFiles);
        } catch {
          message.warning("任务已创建，但部分附件上传失败，可在编辑页重新上传");
        }
      }
      return created;
    },
    onSuccess: () => {
      message.success(isEdit ? "任务已更新" : "任务已创建");
      onSaved();
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const remove = useMutation({
    mutationFn: () => (task ? tasks.remove(task.id) : Promise.resolve(true)),
    onSuccess: () => {
      message.success("任务已删除");
      onDeleted?.();
      onClose();
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  return (
    <Drawer
      title={isEdit ? `任务 #${task?.id}` : "新建任务"}
      open={open}
      onClose={onClose}
      width={Math.min(720, window.innerWidth - 80)}
      destroyOnClose
      extra={
        <Space>
          {isEdit && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                modal.confirm({
                  title: "删除该任务？",
                  content: "删除后不可恢复。相关附件与评论一并保留但将变成孤立条目。",
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
                  <Input placeholder="任务标题" />
                </Form.Item>
                <Form.Item label="描述" name="description">
                  <Input.TextArea rows={4} placeholder="任务描述、上下文…" />
                </Form.Item>
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item
                    label="所属项目"
                    name="project_id"
                    rules={[{ required: true, message: "必选" }]}
                    style={{ flex: 1 }}
                  >
                    <Select options={projectOpts} placeholder="选择项目" showSearch optionFilterProp="label" />
                  </Form.Item>
                </Space.Compact>
                <Space.Compact style={{ width: "100%", display: "flex", gap: 8 }}>
                  <Form.Item label="状态" name="status" style={{ flex: 1 }}>
                    <Select options={STATUS_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="优先级" name="priority" style={{ flex: 1 }}>
                    <Select options={PRIORITY_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="负责人" name="assignee_id" style={{ flex: 1 }}>
                    <Select options={userOpts} allowClear placeholder="未指派" showSearch optionFilterProp="label" />
                  </Form.Item>
                </Space.Compact>
                <Space.Compact style={{ width: "100%", display: "flex", gap: 8 }}>
                  <Form.Item label="预计工时" name="estimate_hours" style={{ flex: 1 }}>
                    <InputNumber min={0} step={0.5} addonAfter="h" style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item label="已消耗" name="consumed_hours" style={{ flex: 1 }}>
                    <InputNumber min={0} step={0.5} addonAfter="h" style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item label="截止日期" name="due_date" style={{ flex: 1 }}>
                    <DatePicker style={{ width: "100%" }} />
                  </Form.Item>
                </Space.Compact>
              </Form>
            ),
          },
          {
            key: "attach",
            label: "附件",
            children: (
              <AttachmentList
                targetType="task"
                targetId={task?.id ?? 0}
                stagedFiles={task ? undefined : stagedFiles}
                onStagedChange={task ? undefined : setStagedFiles}
              />
            ),
          },
          {
            key: "comments",
            label: "评论",
            disabled: !task,
            children: task ? <CommentsPanel targetType="task" targetId={task.id} /> : null,
          },
        ]}
      />
    </Drawer>
  );
}
