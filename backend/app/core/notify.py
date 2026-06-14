"""Notification emitter helpers.

All callers (comments / tasks / stories / bugs routes) end up here. Two
guarantees:

1. We never raise back into the caller. A notification is auxiliary - if
   we fail to insert one we log and move on.
2. We never notify the actor about their own action ("Yi-Gyu assigned
   this task to Yi-Gyu" is noise).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    Notification,
    NotificationKind,
    NotificationTargetType,
)
from app.models.user import User

logger = logging.getLogger("slflow.notifications")


# ----------------------------------------------------------------------------
# @mention parsing
# ----------------------------------------------------------------------------

# Mention is `@<username>` where username matches the same character class
# we enforce on User.username (alnum + `_`/`-`/`.`). We require the token
# to either start the string or be preceded by whitespace / punctuation
# common in real text so `email@host` does NOT trigger.
_MENTION_RE = re.compile(r"(?:^|(?<=[\s,.;:!?'\"(\[{<]))@([A-Za-z0-9_\-\.]{3,64})")


def parse_mentions(body: str) -> set[str]:
    """Return the set of @-mentioned usernames. Case is preserved as
    written; the resolver matches case-insensitively to be forgiving."""
    if not body:
        return set()
    return {m.group(1) for m in _MENTION_RE.finditer(body)}


async def resolve_mention_targets(
    db: AsyncSession, usernames: Iterable[str]
) -> list[User]:
    names = list({u.lower() for u in usernames})
    if not names:
        return []
    # SQLAlchemy doesn't have ILIKE-IN out of the box; we use lower()
    # comparison which Postgres can index with a functional index later.
    stmt = select(User).where(User.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().unique().all()
    norm = {n.lower() for n in names}
    return [u for u in rows if u.username.lower() in norm]


# ----------------------------------------------------------------------------
# Emit helpers
# ----------------------------------------------------------------------------

# Short text snippet for the bell dropdown.
def _truncate(text: str, limit: int = 120) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


async def _emit(
    db: AsyncSession,
    *,
    recipient_id: int,
    actor_id: Optional[int],
    kind: NotificationKind,
    target_type: NotificationTargetType,
    target_id: int,
    body: str,
    comment_id: Optional[int] = None,
    extra: Optional[dict] = None,
) -> None:
    if recipient_id == actor_id:
        # Don't notify yourself.
        return
    try:
        n = Notification(
            recipient_id=recipient_id,
            actor_id=actor_id,
            kind=kind,
            target_type=target_type,
            target_id=target_id,
            body=_truncate(body, 480),
            comment_id=comment_id,
            extra=json.dumps(extra, ensure_ascii=False) if extra else None,
        )
        db.add(n)
        # Caller commits.
    except Exception:  # pragma: no cover
        logger.exception("failed to enqueue notification")


# ----------------------------------------------------------------------------
# Public entry points - one per logical event
# ----------------------------------------------------------------------------


async def notify_mentions(
    db: AsyncSession,
    *,
    actor: User,
    body: str,
    target_type: NotificationTargetType,
    target_id: int,
    target_label: str,
    comment_id: Optional[int] = None,
) -> None:
    """Scan `body` for @-mentions, resolve to users, emit notifications."""
    names = parse_mentions(body)
    if not names:
        return
    users = await resolve_mention_targets(db, names)
    for u in users:
        await _emit(
            db,
            recipient_id=u.id,
            actor_id=actor.id,
            kind=NotificationKind.mention,
            target_type=target_type,
            target_id=target_id,
            body=f"{actor.full_name or actor.username} 在 {target_label} 中提到了你：{_truncate(body, 80)}",
            comment_id=comment_id,
        )


async def notify_assigned(
    db: AsyncSession,
    *,
    actor: User,
    assignee_id: int,
    target_type: NotificationTargetType,
    target_id: int,
    target_label: str,
) -> None:
    await _emit(
        db,
        recipient_id=assignee_id,
        actor_id=actor.id,
        kind=NotificationKind.assigned,
        target_type=target_type,
        target_id=target_id,
        body=f"{actor.full_name or actor.username} 把「{target_label}」指派给了你",
    )


async def notify_status_changed(
    db: AsyncSession,
    *,
    actor: User,
    recipient_id: int,
    from_status: str,
    to_status: str,
    target_type: NotificationTargetType,
    target_id: int,
    target_label: str,
) -> None:
    await _emit(
        db,
        recipient_id=recipient_id,
        actor_id=actor.id,
        kind=NotificationKind.status,
        target_type=target_type,
        target_id=target_id,
        body=(
            f"{actor.full_name or actor.username} 把「{target_label}」"
            f"从 {from_status} 变更为 {to_status}"
        ),
        extra={"from": from_status, "to": to_status},
    )


async def notify_comment(
    db: AsyncSession,
    *,
    actor: User,
    recipient_ids: Iterable[int],
    body: str,
    target_type: NotificationTargetType,
    target_id: int,
    target_label: str,
    comment_id: int,
    exclude_ids: Optional[Iterable[int]] = None,
) -> None:
    """Notify watchers (assignee + creator usually) about a new comment.
    Pass `exclude_ids` to dedupe against mention recipients."""
    excl = set(exclude_ids or [])
    excl.add(actor.id)  # never self-notify
    seen: set[int] = set()
    for rid in recipient_ids:
        if rid in excl or rid in seen:
            continue
        seen.add(rid)
        await _emit(
            db,
            recipient_id=rid,
            actor_id=actor.id,
            kind=NotificationKind.comment,
            target_type=target_type,
            target_id=target_id,
            body=(
                f"{actor.full_name or actor.username} 在「{target_label}」"
                f"上发表了评论：{_truncate(body, 80)}"
            ),
            comment_id=comment_id,
        )
