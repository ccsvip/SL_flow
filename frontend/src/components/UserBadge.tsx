import React from "react";
import { Avatar, Tooltip } from "antd";
import { initials } from "@/utils/format";
import { http } from "@/api/http";
import type { User } from "@/api/types";

interface Props {
  user?: User | null;
  size?: number;
  showName?: boolean;
}

const PALETTE = ["#1677ff", "#722ed1", "#eb2f96", "#fa8c16", "#13c2c2", "#52c41a"];

// Cache the resolved blob URL per avatar URL so we don't refetch it for every
// row in a table or every mention in the header. The cache is keyed by the
// `user.avatar` URL string (which itself encodes the user id) and persists
// for the lifetime of the SPA. Browsers don't expose a way to refcount
// object URLs, so we accept the tradeoff: a few stale URLs survive until
// page reload. In return: avatar images render instantly on tab switches.
const avatarBlobCache = new Map<string, string>();
const avatarFetchInflight = new Map<string, Promise<string | null>>();

function fetchAvatar(url: string): Promise<string | null> {
  const cached = avatarBlobCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = avatarFetchInflight.get(url);
  if (inflight) return inflight;
  const path = url.startsWith("/api/") ? url.slice(4) : url;
  const p = http
    .get<Blob>(path, { responseType: "blob" })
    .then((r) => {
      const objectUrl = URL.createObjectURL(r.data);
      avatarBlobCache.set(url, objectUrl);
      avatarFetchInflight.delete(url);
      return objectUrl;
    })
    .catch(() => {
      avatarFetchInflight.delete(url);
      return null;
    });
  avatarFetchInflight.set(url, p);
  return p;
}

function useAvatarBlob(avatarUrl: string | null | undefined): string | null {
  const [blob, setBlob] = React.useState<string | null>(() =>
    avatarUrl ? avatarBlobCache.get(avatarUrl) ?? null : null,
  );
  React.useEffect(() => {
    if (!avatarUrl) {
      setBlob(null);
      return;
    }
    let cancelled = false;
    const cached = avatarBlobCache.get(avatarUrl);
    if (cached) {
      setBlob(cached);
      return;
    }
    fetchAvatar(avatarUrl).then((url) => {
      if (!cancelled) setBlob(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);
  return blob;
}

export default function UserBadge({ user, size = 26, showName = true }: Props) {
  const blobUrl = useAvatarBlob(user?.avatar);

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
          src={blobUrl || undefined}
          style={{
            background: blobUrl ? undefined : `linear-gradient(135deg, ${color}, #722ed1)`,
            color: "white",
            fontWeight: 700,
            fontSize: size > 32 ? 14 : 11,
          }}
        >
          {blobUrl ? null : initials(user.full_name || user.username)}
        </Avatar>
        {showName && (
          <span style={{ fontSize: 13 }}>{user.full_name || user.username}</span>
        )}
      </span>
    </Tooltip>
  );
}
