from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select, update

from app.api.deps import CurrentUser, DBSession
from app.models.notification import Notification, NotificationTargetType
from app.schemas.notification import (
    NotificationOut,
    NotificationsPage,
    UnreadCount,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsPage)
async def list_notifications(
    db: DBSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
) -> NotificationsPage:
    base = select(Notification).where(Notification.recipient_id == user.id)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))

    total = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.recipient_id == user.id
            )
            .where(*( [Notification.is_read.is_(False)] if unread_only else []))
        )
    ).scalar_one()

    unread = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.recipient_id == user.id,
                Notification.is_read.is_(False),
            )
        )
    ).scalar_one()

    rows = (
        await db.execute(
            base.order_by(Notification.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().unique().all()

    return NotificationsPage(
        items=[NotificationOut.model_validate(r) for r in rows],
        total=total,
        unread=unread,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(db: DBSession, user: CurrentUser) -> UnreadCount:
    n = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.recipient_id == user.id,
                Notification.is_read.is_(False),
            )
        )
    ).scalar_one()
    return UnreadCount(unread=n)


@router.post(
    "/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def mark_one_read(
    notification_id: int, db: DBSession, user: CurrentUser
):
    n = await db.get(Notification, notification_id)
    if not n or n.recipient_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not n.is_read:
        n.is_read = True
        await db.commit()


@router.post(
    "/mark-all-read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def mark_all_read(db: DBSession, user: CurrentUser):
    await db.execute(
        update(Notification)
        .where(
            Notification.recipient_id == user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_notification(
    notification_id: int, db: DBSession, user: CurrentUser
):
    n = await db.get(Notification, notification_id)
    if not n or n.recipient_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.delete(n)
    await db.commit()
