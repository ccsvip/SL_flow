import React from "react";

export const handleTextAreaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = target.value;
    target.value = value.substring(0, start) + "  " + value.substring(end);
    target.selectionStart = target.selectionEnd = start + 2;
    // Trigger React's onChange
    const event = new Event("input", { bubbles: true });
    target.dispatchEvent(event);
  }
};

export const handleTextAreaPaste = (
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  stagedFiles: File[],
  setStagedFiles: (files: File[]) => void
) => {
  const files = Array.from(e.clipboardData.files).filter(
    (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
  );
  if (files.length > 0) {
    setStagedFiles([...stagedFiles, ...files]);
  }
};
