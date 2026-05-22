"""prd_documents.last_generation_truncated

Revision ID: 0007_prd_truncated
Revises: 0006_prd
Create Date: 2026-05-22

Adds a persisted flag indicating whether the most recent AI generation
or regeneration hit the JSON-fallback path. The FE uses this to show a
"regenerate or extract requirements" banner so users know when a PRD is
partial - the previous heuristic (`requirements.length === 0`) had both
false positives (user manually emptied the pool) and false negatives
(partial pool of 1-2 reqs is still truncated).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_prd_truncated"
down_revision: Union[str, None] = "0006_prd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prd_documents",
        sa.Column(
            "last_generation_truncated",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("prd_documents", "last_generation_truncated")
