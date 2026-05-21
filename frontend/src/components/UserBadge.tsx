import { Avatar, Tooltip } from "antd";
import { initials } from "@/utils/format";
import type { User } from "@/api/types";

interface Props {
  user?: User | null;
  size?: number;
  showName?: boolean;
}

const PALETTE = ["#1677ff", "#722ed1", "#eb2f96", "#fa8c16", "#13c2c2", "#52c41a"];

export default function UserBadge({ user, size = 26, showName = true }: Props) {
  if (!user)
    return showName ? (
      <span style={{ opacity: 0.5 }}>未指派</span>
    ) : (
      <Avatar size={size}>?</Avatar>
    );

  const color = PALETTE[user.id % PALETTE.length];
  const tip = `${user.full_name || user.username}${user.email ? ` · ${user.email}` : ""}`;

  return (
    <Tooltip title={tip}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Avatar
          size={size}
          style={{
            background: `linear-gradient(135deg, ${color}, #722ed1)`,
            color: "white",
            fontWeight: 700,
            fontSize: size > 32 ? 14 : 11,
          }}
        >
          {initials(user.full_name || user.username)}
        </Avatar>
        {showName && (
          <span style={{ fontSize: 13 }}>{user.full_name || user.username}</span>
        )}
      </span>
    </Tooltip>
  );
}
