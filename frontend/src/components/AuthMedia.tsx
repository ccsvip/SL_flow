import React from "react";
import { http } from "@/api/http";

/** Strip the `/api` prefix from absolute backend URLs because axios.baseURL
 * already adds it. The Attachment.url field on the wire is `/api/...` so we
 * normalize before passing to the http client. */
function strip(url: string): string {
  return url.startsWith("/api/") ? url.slice(4) : url;
}

/**
 * Image element that fetches the resource through axios so the JWT bearer
 * header is attached. Browsers do NOT send Authorization headers on plain
 * <img src=...> requests, so we must convert the response to an object URL.
 */
export function AuthImage({
  src,
  alt,
  style,
  onClick,
}: {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setError(false);
    setBlobUrl(null);
    http
      .get<Blob>(strip(src), { responseType: "blob" })
      .then((r) => {
        if (cancelled) return;
        url = URL.createObjectURL(r.data);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (error) {
    return (
      <div
        style={{
          ...style,
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          color: "rgba(125,125,140,0.8)",
        }}
      >
        加载失败
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div
        style={{
          ...style,
          background: "rgba(125,125,140,0.12)",
        }}
      />
    );
  }

  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />;
}

/**
 * Video element with auth-aware blob loading. Same reason as AuthImage.
 * `controls` is opt-in via the prop.
 */
export function AuthVideo({
  src,
  controls = false,
  autoPlay = false,
  muted = true,
  playsInline = true,
  style,
}: {
  src: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  style?: React.CSSProperties;
}) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    http
      .get<Blob>(strip(src), { responseType: "blob" })
      .then((r) => {
        if (cancelled) return;
        url = URL.createObjectURL(r.data);
        setBlobUrl(url);
      })
      .catch(() => {
        /* swallow; UI shows blank tile */
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (!blobUrl) {
    return (
      <div
        style={{
          ...style,
          background: "rgba(125,125,140,0.12)",
        }}
      />
    );
  }

  return (
    <video
      src={blobUrl}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      playsInline={playsInline}
      style={style}
    />
  );
}
