"""audit_action reveal value

Revision ID: 0010_audit_action_reveal
Revises: 0009_managed_api_key_owner
Create Date: 2026-06-30

Why this exists:
    Some databases already contain `audit_logs.action = 'reveal'` rows written
    by an earlier version of the API-key routes (plaintext-reveal audit). That
    code path has since been removed, and no current route writes `reveal`.
    However the rows still exist, and the Python `AuditAction` enum must be
    able to deserialize them — otherwise `GET /audit-logs` raises
    `LookupError: 'reveal' is not among the defined enum values` (HTTP 500).

    A few dev databases also already had `reveal` added to the PG enum
    out-of-band (manual `ALTER TYPE`). This migration makes the schema
    definition match reality: it adds `reveal` to `audit_action` idempotently
    (`ADD VALUE IF NOT EXISTS`), so freshly-init'd databases stay consistent
    with the Python enum and existing rows deserialize cleanly.

Downgrade:
    PostgreSQL cannot remove a value from an enum cheaply/safely, so the
    value is left in place on downgrade (matches the convention used by
    migration 0008 for `managed_api_key`).
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0010_audit_action_reveal"
down_revision: Union[str, None] = "0009_managed_api_key_owner"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'reveal'")


def downgrade() -> None:
    # PG enum values cannot be removed cheaply; leave it in place.
    pass
