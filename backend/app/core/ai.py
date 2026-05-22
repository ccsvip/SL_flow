"""AI summary helper.

Talks to any OpenAI-compatible /chat/completions endpoint. Settings are
loaded from the singleton `ai_settings` row at request time, with the
process-level `.env` values used as a fallback when the row is missing or
empty (legacy deploys that haven't been migrated to UI-managed config).

Hard guarantees:

  * Returns False from `is_enabled()` when no API key is configured →
    callers handle gracefully.
  * Per-request timeout (configurable, default 60s) so a stuck upstream
    can't hang an API thread forever.
  * Input length cap so a runaway comment thread can't blow the prompt.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_setting import AISetting

logger = logging.getLogger("slflow.ai")


class AIDisabledError(RuntimeError):
    """Raised when the AI feature is turned off."""


class AIRequestError(RuntimeError):
    """Wrapper for upstream-provider errors so the route can map cleanly."""


@dataclass
class AIRuntime:
    """Resolved settings used to make ONE upstream call.

    Built from the DB row when available; the env fallback path keeps
    pre-existing deployments working until the admin saves a config.
    """

    enabled: bool
    base_url: str
    api_key: str
    model: str
    timeout_seconds: int
    max_input_chars: int


async def load_runtime(db: AsyncSession) -> AIRuntime:
    row = (
        await db.execute(select(AISetting).where(AISetting.id == 1))
    ).scalar_one_or_none()

    # If the row exists, it is authoritative. We deliberately do NOT fall
    # back to env values when individual fields are empty - once an admin
    # has UI control, env values would silently override their "clear"
    # action. (Specifically: clearing the API key in the UI must actually
    # disable the feature even if AI_API_KEY is still set in the env.)
    if row is not None:
        return AIRuntime(
            enabled=bool(row.enabled),
            base_url=(row.base_url or "").strip(),
            api_key=(row.api_key or "").strip(),
            model=(row.model or "").strip(),
            timeout_seconds=int(row.timeout_seconds or 60),
            max_input_chars=int(row.max_input_chars or 12000),
        )

    # No row at all - bootstrap from env. This path is only hit on a fresh
    # DB BEFORE the 0005 migration ran; in normal operation the migration
    # always seeds id=1 so the branch above is taken.
    return AIRuntime(
        enabled=bool(settings.AI_ENABLED and settings.AI_API_KEY),
        base_url=settings.AI_BASE_URL.strip(),
        api_key=settings.AI_API_KEY.strip(),
        model=settings.AI_MODEL.strip(),
        timeout_seconds=int(settings.AI_TIMEOUT_SECONDS),
        max_input_chars=int(settings.AI_MAX_INPUT_CHARS),
    )


def is_enabled(rt: AIRuntime) -> bool:
    return bool(rt.enabled and rt.api_key)


def _truncate_input(text: str, limit: int) -> str:
    """Cap the prompt body. We trim from the *start* (oldest comments first)
    so the latest activity always survives - that's typically what the user
    cares about when asking for a summary."""
    if not text or len(text) <= limit:
        return text
    return "…(已截断)…\n\n" + text[-limit:]


SYSTEM_PROMPT = (
    "你是一个项目管理助手。用户会给你一条任务/需求/缺陷的标题、描述和评论历史。"
    "请用简洁的中文输出一段摘要，分三段：\n"
    "  1. 核心诉求（一句话）\n"
    "  2. 关键进展与决策（要点列表，最多 5 条）\n"
    "  3. 当前阻塞或待办（如无则写「无」）\n"
    "禁止编造未在原文出现的信息。如果原文信息不足，直接说明。"
)


async def chat_completion(
    rt: AIRuntime,
    *,
    system: str,
    user: str,
    temperature: float = 0.4,
    max_tokens: Optional[int] = None,
) -> str:
    """Low-level call. Used by both `summarize()` and the connectivity test
    route. Raises AIDisabledError / AIRequestError appropriately.

    `max_tokens` is forwarded to the upstream when provided. Most OpenAI-
    compatible providers default to a fairly small cap (4K) which is fine
    for chat summaries but truncates a full PRD generation - callers that
    need a long body pass an explicit value.
    """
    if not is_enabled(rt):
        raise AIDisabledError("AI feature is not configured")

    payload: dict = {
        "model": rt.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "stream": False,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    headers = {
        "Authorization": f"Bearer {rt.api_key}",
        "Content-Type": "application/json",
    }
    url = f"{rt.base_url.rstrip('/')}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=rt.timeout_seconds) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        raise AIRequestError("AI request timed out") from exc
    except httpx.HTTPError as exc:
        raise AIRequestError(f"AI transport error: {exc!s}") from exc

    if resp.status_code >= 400:
        body_excerpt = resp.text[:500]
        logger.warning(
            "AI provider returned %s: %s", resp.status_code, body_excerpt
        )
        raise AIRequestError(
            f"AI provider returned HTTP {resp.status_code}: {body_excerpt}"
        )

    try:
        data = resp.json()
        choice = data["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise AIRequestError(
            f"Unexpected AI response shape: {resp.text[:300]}"
        ) from exc

    if not isinstance(content, str) or not content.strip():
        raise AIRequestError("AI returned empty content")

    return content.strip()


async def summarize(
    rt: AIRuntime,
    *,
    title: str,
    body: str,
    comments_text: str,
    instruction: Optional[str] = None,
) -> str:
    """Run a chat-completion against the configured model and return the
    assistant text."""
    user_prompt_parts = [f"标题：{title}\n"]
    if body:
        user_prompt_parts.append(f"描述：\n{body}\n")
    if comments_text:
        user_prompt_parts.append(f"评论：\n{comments_text}\n")
    if instruction:
        user_prompt_parts.append(f"用户额外要求：{instruction}\n")
    user_prompt = _truncate_input("\n".join(user_prompt_parts), rt.max_input_chars)

    return await chat_completion(rt, system=SYSTEM_PROMPT, user=user_prompt)


def mask_key(key: Optional[str]) -> Optional[str]:
    """Return a `sk-…last4` masked form of an API key for display."""
    if not key:
        return None
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:3]}…{key[-4:]}"
