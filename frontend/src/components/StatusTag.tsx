import { Tag } from "antd";
import { zh, colorOf } from "@/utils/format";

export default function StatusTag({ value }: { value?: string | null }) {
  if (!value) return <span style={{ opacity: 0.5 }}>—</span>;
  return <Tag color={colorOf(value)}>{zh(value)}</Tag>;
}
