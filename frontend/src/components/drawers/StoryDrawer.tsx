import React from "react";
import {
  App as AntdApp,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
} from "antd";
import { DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";

import { stories, attachments } from "@/api/client";
import { extractError } from "@/api/http";
import { useProjectOptions, useUserOptions } from "@/hooks/options";
import AISummaryButton from "@/components/AISummaryButton";
import AttachmentList from "@/components/AttachmentList";
import CommentsPanel from "@/components/CommentsPanel";
import type { Story } from "@/api/types";

interface Props {
  open: boolean;
  story?: Story;
  defaultProjectId?: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "进行中" },
  { value: "in_review", label: "评审中" },
  { value: "accepted", label: "已验收" },
  { value: "closed", label: "已关闭" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

export default function StoryDrawer({
  open,
  story,
  defaultProjectId,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [form] = Form.useForm();
  const { modal, message } = AntdApp.useApp();
  const isEdit = !!story;
  const projectOpts = useProjectOptions();
  const userOpts = useUserOptions();
  const [stagedFiles, setStagedFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (!open) return;
    form.resetFields();
    setStagedFiles([]);
    if (story) {
      form.setFieldsValue({ ...story, assignee_id: story.assignee?.id ?? null });
    } else {
      form.setFieldsValue({
        status: "draft",
        priority: "medium",
        estimate_points: 0,
        project_id: defaultProjectId,
      });
    }
  }, [open, story, defaultProjectId, form]);

  const save = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      if (isEdit && story) return stories.update(story.id, v);
      const created = await stories.create(v);
      if (stagedFiles.length > 0) {
        try {
          await attachments.upload("story", created.id, stagedFiles);
        } catch {
          message.warning("需求已创建，但部分附件上传失败，可在编辑页重新上传");
        }
      }
      return created;
    },
    onSuccess: () => {
      message.success(isEdit ? "需求已更新" : "需求已创建");
      onSaved();
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const remove = useMutation({
    mutationFn: () => (story ? stories.remove(story.id) : Promise.resolve(true)),
    onSuccess: () => {
      message.success("需求已删除");
      onDeleted?.();
      onClose();
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  return (
    <Drawer
      title={isEdit ? `需求 #${story?.id}` : "新建需求"}
      open={open}
      onClose={onClose}
      width={Math.min(720, window.innerWidth - 80)}
      destroyOnClose
      extra={
        <Space>
          {isEdit && story && (
            <AISummaryButton targetType="story" targetId={story.id} />
          )}
          {isEdit && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                modal.confirm({
                  title: "删除该需求？",
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
                  <Input />
                </Form.Item>
                <Form.Item label="需求描述" name="description">
                  <Input.TextArea rows={4} placeholder="作为…我希望…以便…" />
                </Form.Item>
                <Form.Item label="验收标准" name="acceptance_criteria">
                  <Input.TextArea rows={3} placeholder="给定…当…那么…" />
                </Form.Item>
                <Form.Item
                  label="所属项目"
                  name="project_id"
                  rules={[{ required: true, message: "必选" }]}
                >
                  <Select
                    options={projectOpts}
                    placeholder="选择项目"
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Space style={{ display: "flex", gap: 8 }}>
                  <Form.Item label="状态" name="status">
                    <Select options={STATUS_OPTIONS} style={{ width: 140 }} />
                  </Form.Item>
                  <Form.Item label="优先级" name="priority">
                    <Select options={PRIORITY_OPTIONS} style={{ width: 140 }} />
                  </Form.Item>
                  <Form.Item label="估点" name="estimate_points">
                    <InputNumber min={0} max={999} addonAfter="pt" style={{ width: 120 }} />
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
                targetType="story"
                targetId={story?.id ?? 0}
                stagedFiles={story ? undefined : stagedFiles}
                onStagedChange={story ? undefined : setStagedFiles}
              />
            ),
          },
          {
            key: "comments",
            label: "评论",
            disabled: !story,
            children: story ? <CommentsPanel targetType="story" targetId={story.id} /> : null,
          },
        ]}
      />
    </Drawer>
  );
}
