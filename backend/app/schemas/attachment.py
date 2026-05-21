from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.attachment import AttachmentTarget
from app.schemas.user import UserOut


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    mime_type: str
    size: int
    target_type: AttachmentTarget
    target_id: int
    uploader: Optional[UserOut] = None
    created_at: datetime
    # Computed convenience URLs
    url: str = ""
    preview_url: str = ""
    is_image: bool = False
    is_video: bool = False
