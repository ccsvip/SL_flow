import React from "react";
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PushpinOutlined,
  PushpinFilled,
  PlusOutlined,
  ReadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { memos } from "@/api/client";
import { extractError } from "@/api/http";
import MarkdownView from "@/components/MarkdownView";
import { fromNow } from "@/utils/format";
import type { MemoItem } from "@/api/types";

const ALL_CATEGORY = "__all__";
const UNCATEGORIZED = "__none__";

type ViewMode = "read" | "split" | "edit";

export default function MemoPage() {
  const qc = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  // --- Filter & selection state -------------------------------------------
  const [activeCategory, setActiveCategory] = React.useState<string>(ALL_CATEGORY);
  const [searchQ, setSearchQ] = React.useState("");
  const [activeMemoId, setActiveMemoId] = React.useState<number | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("read");

  // --- Editor local state (synced when active memo changes) --------------
  const [editTitle, setEditTitle] = React.useState("");
  const [editContent, setEditContent] = React.useState("");
  const [editCategory, setEditCategory] = React.useState("");
  const [dirty, setDirty] = React.useState(false);

  // --- New memo modal state ----------------------------------------------
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    title: "",
    content: "",
    category: "",
  });

  // --- Queries ------------------------------------------------------------
  const { data: categories = [] } = useQuery({
    queryKey: ["memo-categories"],
    queryFn: memos.categories,
    staleTime: 10_000,
  });

  const { data: allMemos = [], isLoading } = useQuery({
    queryKey: ["memos", { q: searchQ || undefined }],
    queryFn: () => memos.list({ q: searchQ || undefined }),
  });

  // Filter memos by selected category on the client (the backend supports
  // it too, but we want the sidebar counts to stay stable when switching).
  const filteredMemos = React.useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return allMemos;
    if (activeCategory === UNCATEGORIZED)
      return allMemos.filter((m) => !m.category);
    return allMemos.filter((m) => m.category === activeCategory);
  }, [allMemos, activeCategory]);

  const activeMemo = React.useMemo(
    () => filteredMemos.find((m) => m.id === activeMemoId) || null,
    [filteredMemos, activeMemoId],
  );

  // Auto-select first memo when the list changes and nothing is selected.
  React.useEffect(() => {
    if (filteredMemos.length > 0 && !activeMemo) {
      setActiveMemoId(filteredMemos[0].id);
    }
    if (filteredMemos.length === 0) {
      setActiveMemoId(null);
    }
  }, [filteredMemos, activeMemo]);

  // Sync editor fields when switching memo.
  React.useEffect(() => {
    if (activeMemo) {
      setEditTitle(activeMemo.title);
      setEditContent(activeMemo.content || "");
      setEditCategory(activeMemo.category || "");
      setDirty(false);
    }
  }, [activeMemo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Mutations ----------------------------------------------------------
  const createMut = useMutation({
    mutationFn: () =>
      memos.create({
        title: createForm.title.trim(),
        content: createForm.content || null,
        category: createForm.category.trim() || null,
      }),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["memos"] });
      qc.invalidateQueries({ queryKey: ["memo-categories"] });
      setCreateOpen(false);
      setCreateForm({ title: "", content: "", category: "" });
      setActiveMemoId(item.id);
      setActiveCategory(
        item.category
          ? categories.includes(item.category)
            ? item.category
            : ALL_CATEGORY
          : activeCategory,
      );
      setViewMode("edit");
      message.success("备忘录已创建");
    },
    onError: (e) => message.error(extractError(e, "创建失败")),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!activeMemo) throw new Error("No active memo");
      return memos.update(activeMemo.id, {
        title: editTitle.trim(),
        content: editContent,
        category: editCategory.trim() || null,
      });
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["memos"] });
      qc.invalidateQueries({ queryKey: ["memo-categories"] });
      setDirty(false);
      // Update local state from server response
      setEditTitle(item.title);
      setEditContent(item.content || "");
      setEditCategory(item.category || "");
      message.success("已保存");
    },
    onError: (e) => message.error(extractError(e, "保存失败")),
  });

  const togglePinMut = useMutation({
    mutationFn: (memo: MemoItem) =>
      memos.update(memo.id, { pinned: !memo.pinned }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memos"] });
    },
    onError: (e) => message.error(extractError(e, "操作失败")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => memos.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memos"] });
      qc.invalidateQueries({ queryKey: ["memo-categories"] });
      message.info("备忘录已删除");
    },
    onError: (e) => message.error(extractError(e, "删除失败")),
  });

  // --- Handlers -----------------------------------------------------------
  const handleSave = () => {
    if (!activeMemo) return;
    if (!editTitle.trim()) {
      message.warning("标题不能为空");
      return;
    }
    updateMut.mutate();
  };

  const handleDelete = (memo: MemoItem) => {
    modal.confirm({
      title: `删除备忘录「${memo.title}」？`,
      content: "删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => deleteMut.mutate(memo.id),
    });
  };

  const handleSelectMemo = (memo: MemoItem) => {
    if (dirty && activeMemo) {
      modal.confirm({
        title: "当前编辑未保存",
        content: "切换后将丢失未保存的修改，确定继续？",
        okText: "放弃修改",
        cancelText: "取消",
        onOk: () => {
          setDirty(false);
          setActiveMemoId(memo.id);
        },
      });
      return;
    }
    setActiveMemoId(memo.id);
  };

  // --- Category counts ----------------------------------------------------
  const categoryCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of allMemos) {
      const key = m.category || UNCATEGORIZED;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [allMemos]);

  // --- Render: left sidebar (categories) ----------------------------------
  const renderSidebar = () => (
    <aside className="slf-memo-sidebar">
      <div className="slf-memo-sidebar-header">
        <span className="slf-memo-sidebar-title">
          <FolderOpenOutlined /> 分类导航
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          新建
        </Button>
      </div>
      <div className="slf-memo-sidebar-search">
        <Input
          allowClear
          size="small"
          placeholder="搜索标题或内容..."
          prefix={<SearchOutlined />}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
      </div>
      <nav className="slf-memo-cat-list">
        <button
          className={`slf-memo-cat-item ${
            activeCategory === ALL_CATEGORY ? "is-active" : ""
          }`}
          onClick={() => setActiveCategory(ALL_CATEGORY)}
        >
          <span className="slf-memo-cat-label">
            <FileTextOutlined /> 全部备忘
          </span>
          <span className="slf-memo-cat-count">{allMemos.length}</span>
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`slf-memo-cat-item ${
              activeCategory === cat ? "is-active" : ""
            }`}
            onClick={() => setActiveCategory(cat)}
          >
            <span className="slf-memo-cat-label">
              <FolderOpenOutlined /> {cat}
            </span>
            <span className="slf-memo-cat-count">
              {categoryCounts[cat] || 0}
            </span>
          </button>
        ))}
        {allMemos.some((m) => !m.category) && (
          <button
            className={`slf-memo-cat-item ${
              activeCategory === UNCATEGORIZED ? "is-active" : ""
            }`}
            onClick={() => setActiveCategory(UNCATEGORIZED)}
          >
            <span className="slf-memo-cat-label">
              <FileTextOutlined /> 未分类
            </span>
            <span className="slf-memo-cat-count">
              {categoryCounts[UNCATEGORIZED] || 0}
            </span>
          </button>
        )}
      </nav>
    </aside>
  );

  // --- Render: middle list ------------------------------------------------
  const renderList = () => (
    <div className="slf-memo-list">
      <div className="slf-memo-list-header">
        <Typography.Text strong>
          {activeCategory === ALL_CATEGORY
            ? "全部备忘录"
            : activeCategory === UNCATEGORIZED
              ? "未分类"
              : activeCategory}
        </Typography.Text>
        <span className="slf-memo-list-count">{filteredMemos.length} 条</span>
      </div>
      <div className="slf-memo-list-body">
        {isLoading ? (
          <div style={{ padding: 16 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : filteredMemos.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无备忘录"
            style={{ marginTop: 40 }}
          />
        ) : (
          filteredMemos.map((memo) => {
            const isActive = memo.id === activeMemoId;
            return (
              <div
                key={memo.id}
                className={`slf-memo-card ${isActive ? "is-active" : ""}`}
                onClick={() => handleSelectMemo(memo)}
              >
                <div className="slf-memo-card-head">
                  {memo.pinned && (
                    <PushpinFilled className="slf-memo-card-pin" />
                  )}
                  <span className="slf-memo-card-title">{memo.title}</span>
                </div>
                {memo.content && (
                  <div className="slf-memo-card-excerpt">
                    {memo.content.replace(/[#*`>\-]/g, "").slice(0, 80)}
                  </div>
                )}
                <div className="slf-memo-card-meta">
                  {memo.category && (
                    <Tag className="slf-memo-card-tag">{memo.category}</Tag>
                  )}
                  <span className="slf-memo-card-time">
                    {fromNow(memo.updated_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // --- Render: right editor/preview ---------------------------------------
  const renderEditor = () => {
    if (!activeMemo) {
      return (
        <div className="slf-memo-editor-empty">
          <Empty
            image={<ReadOutlined style={{ fontSize: 48, color: "rgba(125,125,140,0.35)" }} />}
            description="选择一条备忘录开始阅读或编辑"
          />
        </div>
      );
    }

    return (
      <div className="slf-memo-editor">
        {/* Toolbar */}
        <div className="slf-memo-editor-toolbar">
          <div className="slf-memo-editor-toolbar-left">
            <Segmented
              size="small"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { label: "阅读", value: "read", icon: <EyeOutlined /> },
                { label: "双栏", value: "split", icon: <ReadOutlined /> },
                { label: "编辑", value: "edit", icon: <EditOutlined /> },
              ]}
            />
          </div>
          <div className="slf-memo-editor-toolbar-right">
            <Tooltip title={activeMemo.pinned ? "取消置顶" : "置顶"}>
              <Button
                size="small"
                type="text"
                icon={
                  activeMemo.pinned ? <PushpinFilled /> : <PushpinOutlined />
                }
                onClick={() => togglePinMut.mutate(activeMemo)}
                style={
                  activeMemo.pinned
                    ? { color: "var(--accent)" }
                    : undefined
                }
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(activeMemo)}
              />
            </Tooltip>
            <Button
              size="small"
              type="primary"
              loading={updateMut.isPending}
              disabled={!dirty}
              onClick={handleSave}
            >
              保存
            </Button>
          </div>
        </div>

        {/* Title + category row */}
        <div className="slf-memo-editor-meta">
          <Input
            value={editTitle}
            onChange={(e) => {
              setEditTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="备忘录标题"
            className="slf-memo-editor-title"
            size="large"
            variant="borderless"
          />
          <Input
            value={editCategory}
            onChange={(e) => {
              setEditCategory(e.target.value);
              setDirty(true);
            }}
            placeholder="分类"
            className="slf-memo-editor-category"
            style={{ width: 160 }}
          />
        </div>

        {/* Content area */}
        <div className="slf-memo-editor-body">
          {/* Editor pane */}
          {(viewMode === "edit" || viewMode === "split") && (
            <div
              className="slf-memo-editor-pane"
              style={{ flex: viewMode === "split" ? "1 1 50%" : "1 1 100%" }}
            >
              <Input.TextArea
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  setDirty(true);
                }}
                placeholder="在此输入 Markdown 内容..."
                autoSize={{ minRows: 20 }}
                className="slf-memo-editor-textarea"
                spellCheck={false}
              />
            </div>
          )}

          {/* Preview pane */}
          {(viewMode === "read" || viewMode === "split") && (
            <div
              className="slf-memo-editor-pane slf-memo-preview"
              style={{ flex: viewMode === "split" ? "1 1 50%" : "1 1 100%" }}
            >
              <div className="slf-memo-preview-inner">
                <MarkdownView markdown={editContent} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="slf-memo-editor-footer">
          <span>{editContent.length} 字符</span>
          <span>更新于 {fromNow(activeMemo.updated_at)}</span>
          {dirty && <span className="slf-memo-dirty">● 未保存</span>}
        </div>
      </div>
    );
  };

  // --- Render: create modal ----------------------------------------------
  const renderCreateModal = () => (
    <Modal
      title={
        <span>
          <PlusOutlined style={{ color: "var(--accent)" }} /> 新建备忘录
        </span>
      }
      open={createOpen}
      onCancel={() => setCreateOpen(false)}
      onOk={() => {
        if (!createForm.title.trim()) {
          message.warning("请输入标题");
          return;
        }
        createMut.mutate();
      }}
      confirmLoading={createMut.isPending}
      okText="创建"
      cancelText="取消"
      destroyOnHidden
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        <Input
          placeholder="标题"
          value={createForm.title}
          onChange={(e) =>
            setCreateForm((f) => ({ ...f, title: e.target.value }))
          }
          autoFocus
          onPressEnter={() => {
            if (createForm.title.trim()) createMut.mutate();
          }}
        />
        <Input
          placeholder="分类（可选）"
          value={createForm.category}
          onChange={(e) =>
            setCreateForm((f) => ({ ...f, category: e.target.value }))
          }
        />
        <Input.TextArea
          placeholder="正文内容（Markdown 格式，可留空稍后编辑）"
          value={createForm.content}
          onChange={(e) =>
            setCreateForm((f) => ({ ...f, content: e.target.value }))
          }
          rows={6}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
      </div>
    </Modal>
  );

  return (
    <div className="slf-memo-page">
      {renderSidebar()}
      {renderList()}
      {renderEditor()}
      {renderCreateModal()}
    </div>
  );
}
