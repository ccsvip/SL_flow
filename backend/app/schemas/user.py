from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.user import UserRole


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_\-\.]+$")
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(default=None, max_length=128)
    role: UserRole = UserRole.user
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=4, max_length=72)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(default=None, max_length=128)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    # NOTE: `avatar` is intentionally NOT exposed here. It used to be, but a
    # round-trip footgun (FE submits the rewritten `/api/users/.../avatar?v=...`
    # URL back to PATCH and the URL string ends up stored as the on-disk
    # path) made it dangerous. Avatar mutations go through the dedicated
    # POST/DELETE /users/me/avatar endpoints only.


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    # On the wire `avatar` is the URL the frontend can fetch (with auth);
    # internally the User model stores the on-disk relative path. We rewrite
    # the value after construction so we never leak the real storage path.
    avatar: Optional[str] = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _avatar_to_url(self) -> "UserOut":
        if self.avatar:
            # Whatever the underlying value was (a storage path), present a
            # stable, predictable URL keyed by user id. The frontend's
            # AuthImage helper hits this through the JWT-bearing axios client.
            # The `?v=<updated_at_epoch_ms>` cache-buster forces the browser
            # AND our in-memory blob cache to refetch when the user changes
            # their avatar. We use millisecond precision because two uploads
            # can land within the same wall-clock second - second-precision
            # would produce identical URLs and a stale cached blob would
            # survive forever.
            ts_ms = int(self.updated_at.timestamp() * 1000)
            self.avatar = f"/api/users/{self.id}/avatar?v={ts_ms}"
        else:
            self.avatar = None
        return self


class UserMe(UserOut):
    pass


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4, max_length=72)


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
