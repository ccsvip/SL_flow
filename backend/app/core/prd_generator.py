"""PRD generation pipeline.

We make a single call to the chat-completions endpoint asking the model to
return a JSON object with:

  * title - short PRD title (used as document name)
  * summary - 1-2 sentence executive summary
  * suggested_project_name / suggested_project_code - meta the FE shows
    so the user can promote the PRD to a real Project with one click
  * content - the full markdown body, using the template's section
    headings verbatim (model is instructed to keep them as-is)
  * requirements - the atomic requirement pool, each with title /
    description / acceptance_criteria / priority / category / tag

We then parse the JSON, validate the shape, and return it. On parse
failure we fall back to a markdown-only result with no requirements - the
user can still edit/use the doc, just without one-click conversion.

Per-section regenerate is a smaller call that returns just the markdown
fragment for one section; the route layer splices it back into the
document via the section markers we embed during generation.

Section markers
---------------
Generated content embeds HTML comments:

    <!-- prd:section:start:{slug} -->
    ## 4. 功能列表
    ...
    <!-- prd:section:end:{slug} -->

This lets per-section regenerate be a string-splice operation rather than
relying on heading parsing (which is brittle when the model paraphrases
heading text).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import List, Optional

from app.core.ai import (
    AIDisabledError,
    AIRequestError,
    AIRuntime,
    chat_completion,
    is_enabled,
)
from app.core.prd_templates import TemplateSpec, get_template
from app.models.prd import PRDPriority, PRDSourceType, PRDTemplate

logger = logging.getLogger("slflow.prd")


SECTION_START_TPL = "<!-- prd:section:start:{slug} -->"
SECTION_END_TPL = "<!-- prd:section:end:{slug} -->"


# --- Data ---------------------------------------------------------------


@dataclass
class GeneratedRequirement:
    title: str
    description: Optional[str]
    acceptance_criteria: Optional[str]
    priority: PRDPriority
    category: Optional[str]
    tag: Optional[str]


@dataclass
class GeneratedPRD:
    title: str
    summary: str
    suggested_project_name: Optional[str]
    suggested_project_code: Optional[str]
    content: str  # Full markdown body, including section markers.
    requirements: List[GeneratedRequirement]
    # True when we hit the JSON-parse fallback path (model output truncated
    # by the upstream's max_tokens, or otherwise malformed). Callers may
    # surface this to the user as a "regenerate or fill in manually" hint.
    truncated: bool = False


# --- Helpers ------------------------------------------------------------


SOURCE_TYPE_LABELS = {
    PRDSourceType.one_liner: "一句话需求",
    PRDSourceType.chat_log: "聊天记录（多轮对话，含口语化表达和反复修正）",
    PRDSourceType.customer_feedback: "客户反馈（来自客户的吐槽 / 建议 / 真实场景描述）",
    PRDSourceType.manual: "用户手写需求",
}


def _truncate(text: str, limit: int) -> str:
    """Trim from the *start* so the latest input survives - same heuristic
    we use in the summary feature."""
    if not text or len(text) <= limit:
        return text
    return "…(已截断较早内容)…\n\n" + text[-limit:]


def _wrap_section(slug: str, body: str) -> str:
    """Wrap a section's markdown with our start/end markers."""
    return (
        f"{SECTION_START_TPL.format(slug=slug)}\n"
        f"{body.strip()}\n"
        f"{SECTION_END_TPL.format(slug=slug)}"
    )


def _build_section_skeleton(spec: TemplateSpec) -> str:
    """The compact markdown skeleton we ask the model to fill. We send
    JUST slug + heading (no hints) - the hints are already in the system
    prompt's general guidance, and including them per-section nearly
    doubles the input prompt size, which hurts on TPM-rate-limited
    providers (Groq free tier is 6K tokens/min total). The heading is
    written with a leading `## ` so the model's output is a proper
    markdown heading and the FE renders it as such."""
    lines: List[str] = []
    for slug, title, _hint in spec.sections:
        lines.append(SECTION_START_TPL.format(slug=slug))
        lines.append(f"## {title}")
        lines.append("...")
        lines.append(SECTION_END_TPL.format(slug=slug))
    return "\n".join(lines)


def build_blank_skeleton(template: PRDTemplate) -> str:
    """Public helper: build the full template skeleton with section markers
    + headings + a one-line writing hint as a markdown comment under each
    heading. Used by the `manual` source path so the user gets a fillable
    structure even though no AI runs.

    Unlike `_build_section_skeleton` (which is built for the LLM and
    intentionally minimal), this version includes the human-readable
    `hint` so the user knows what each section should contain."""
    spec = get_template(template)
    lines: List[str] = []
    for slug, title, hint in spec.sections:
        lines.append(SECTION_START_TPL.format(slug=slug))
        lines.append(f"## {title}")
        lines.append("")
        lines.append(f"> 写作提示：{hint}")
        lines.append("")
        lines.append("(待补充)")
        lines.append("")
        lines.append(SECTION_END_TPL.format(slug=slug))
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _max_tokens_for_template(spec: TemplateSpec) -> int:
    """Scale the output token budget by section count.

    Each section averages ~150-220 Chinese tokens of body, plus headings
    and section markers. Add ~600 tokens for title/summary/project meta
    and ~700 tokens for the requirements pool (8 items × ~80 tokens).

    For a 17-section template (App, digital_human) this comes out to
    ~5000 output tokens; for a 13-section template (ToB) ~3700.

    Returns are clamped between 2500 (so trivial calls aren't wasteful)
    and 8000 (so we don't blow past sensible TPM caps on free tiers; the
    JSON-fallback path will still produce a usable markdown-only doc if
    the upstream truncates). Operators on Groq free tier (6K TPM) should
    be aware that 17-section templates may still hit the rate limit -
    paid tiers raise this automatically without code changes."""
    sections = len(spec.sections)
    # Per-section body budget, plus marker overhead, plus prelude+pool.
    estimated = 700 + sections * 220 + 700
    return max(2500, min(estimated, 8000))


def _parse_priority(raw: object) -> PRDPriority:
    if isinstance(raw, str):
        v = raw.strip().lower()
        # Common synonyms we accept from the model.
        if v in ("p0", "must", "must-have", "high+", "urgent", "紧急", "p0/必须"):
            return PRDPriority.urgent
        if v in ("p1", "high", "should", "should-have", "重要", "高"):
            return PRDPriority.high
        if v in ("p2", "medium", "中", "普通", "default"):
            return PRDPriority.medium
        if v in ("p3", "low", "could", "could-have", "低", "次要"):
            return PRDPriority.low
        # Direct enum value.
        try:
            return PRDPriority(v)
        except ValueError:
            return PRDPriority.medium
    return PRDPriority.medium


def _coerce_str(v: object, max_len: int) -> Optional[str]:
    """Stringify a value coming back from the LLM. We accept str, list and
    dict because the model occasionally returns acceptance_criteria as a
    JSON array (`["AC1", "AC2"]`) - render that as bullet lines so it
    displays cleanly instead of as a Python repr."""
    if v is None:
        return None
    if isinstance(v, str):
        out = v.strip()
    elif isinstance(v, list):
        # Render each item as a markdown bullet so the FE shows a list.
        rendered: List[str] = []
        for item in v:
            if isinstance(item, str):
                line = item.strip()
            elif isinstance(item, dict):
                line = json.dumps(item, ensure_ascii=False)
            else:
                line = str(item)
            if line:
                rendered.append(f"- {line}")
        out = "\n".join(rendered).strip()
    elif isinstance(v, dict):
        # Show as `key: value` lines for readability.
        rendered = [f"- {k}: {v_}" for k, v_ in v.items()]
        out = "\n".join(rendered).strip()
    else:
        out = str(v).strip()
    if not out:
        return None
    return out[:max_len]


# --- JSON extraction ----------------------------------------------------


def _strip_thinking_blocks(text: str) -> str:
    """Reasoning models (qwen3, deepseek-r1, gpt-oss, etc.) emit a
    `<think>...</think>` block before the actual answer. Some endpoints
    surface that block in the response; some don't. We strip it so JSON
    extraction sees only the final answer.

    We also handle a stray opening `<think>` with no closing tag (rare,
    but observed when the model exhausts the budget mid-thought)."""
    if "<think>" not in text:
        return text
    # Drop every well-formed <think>...</think> block first.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # If an unclosed <think> remains (bad streaming), drop everything up
    # to the next blank line or `{`/`[` which usually marks the answer.
    if "<think>" in text:
        idx = text.find("<think>")
        rest = text[idx:]
        # Look for the next obvious answer boundary.
        for marker in ("\n\n{", "\n{", "\n\n[", "\n[", "\n```"):
            pos = rest.find(marker)
            if pos > 0:
                text = text[:idx] + rest[pos:]
                break
        else:
            text = text[:idx]
    return text


def _strip_code_fence(text: str) -> str:
    """Some providers wrap JSON in ```json ... ``` even when asked not to."""
    text = text.strip()
    fence = re.match(r"^```(?:json|JSON)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return text


def _extract_json(text: str) -> dict:
    """Best-effort: strip thinking blocks, try direct parse, fence strip,
    then first balanced `{...}` block. Raises ValueError on nothing
    parseable."""
    text = _strip_thinking_blocks(text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    cleaned = _strip_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Find the first balanced `{...}` block. Models occasionally prefix the
    # JSON with a chatty preamble despite our system prompt.
    start = cleaned.find("{")
    if start >= 0:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(cleaned)):
            ch = cleaned[i]
            if esc:
                esc = False
                continue
            if ch == "\\" and in_str:
                esc = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start : i + 1]
                    return json.loads(candidate)

    raise ValueError("Model did not return JSON")


# --- Section markers: enforce/repair -----------------------------------


def _ensure_markers(content: str, spec: TemplateSpec) -> str:
    """If the model produced markdown but stripped our markers, re-insert
    them by detecting the heading text. We never remove existing markers
    (so well-behaved output round-trips perfectly).

    We trigger only on `## ` (h2) headings, mirroring how the LLM and
    `build_blank_skeleton` emit section titles. h3+ headings are body
    content of whatever section they sit under and must NOT be treated
    as section boundaries.

    When we encounter an h2 that doesn't match the next expected template
    heading (e.g. the user hand-added `## 我的笔记`), we close any open
    template section BEFORE the unmatched heading so the user-added
    content lands OUTSIDE any template-section range. That way per-section
    regenerate's `_replace_section` won't silently swallow user content."""
    if not content:
        return content

    # If every expected section already has start+end markers, we're done.
    have_all = all(
        SECTION_START_TPL.format(slug=slug) in content
        and SECTION_END_TPL.format(slug=slug) in content
        for slug, _title, _hint in spec.sections
    )
    if have_all:
        return content

    lines = content.splitlines()
    rebuilt: List[str] = []
    section_index = 0
    expected = spec.sections
    in_section = False
    current_slug: Optional[str] = None

    def is_h2(line: str) -> bool:
        # Strict h2 detector. `## title` or `##title` (rare). h3+/h1 do
        # not count - those are body content under whatever h2 we're in.
        stripped = line.lstrip()
        if not stripped.startswith("##"):
            return False
        # Reject `###`, `####`, ...
        if len(stripped) > 2 and stripped[2] == "#":
            return False
        return True

    def heading_matches(line: str, title: str) -> bool:
        """Match `## 4. 功能列表` against template title `4. 功能列表`. We
        compare digit-stripped first words to be tolerant of model
        renumbering. Falling back to substring matching as a last resort."""
        line_clean = line.lstrip("# ").strip()
        if not line_clean:
            return False
        if line_clean.startswith(title.split(" ", 1)[-1].split(".", 1)[-1].strip()):
            return True
        # Substring of the trailing title text.
        body_part = title.split(".", 1)[-1].strip() if "." in title else title
        return bool(body_part) and body_part in line_clean

    for line in lines:
        if is_h2(line):
            matched = False
            if section_index < len(expected):
                slug, title, _hint = expected[section_index]
                if heading_matches(line, title):
                    # Close previous template section if open.
                    if in_section and current_slug is not None:
                        rebuilt.append(SECTION_END_TPL.format(slug=current_slug))
                    rebuilt.append(SECTION_START_TPL.format(slug=slug))
                    rebuilt.append(line)
                    in_section = True
                    current_slug = slug
                    section_index += 1
                    matched = True

            if not matched:
                # User-added (or out-of-order) h2. Close any currently
                # open template section so the unmatched heading + body
                # land outside template ranges. This is the critical
                # invariant for B6: per-section regenerate uses a
                # non-greedy `start...end` regex on the whole doc, so
                # any user content trapped inside a template section
                # would be silently overwritten on regenerate.
                if in_section and current_slug is not None:
                    rebuilt.append(SECTION_END_TPL.format(slug=current_slug))
                    in_section = False
                    current_slug = None
                rebuilt.append(line)
            continue

        # Non-heading line: belongs to whichever range we're in.
        rebuilt.append(line)

    if in_section and current_slug is not None:
        rebuilt.append(SECTION_END_TPL.format(slug=current_slug))

    return "\n".join(rebuilt)


def _replace_section(content: str, slug: str, new_body: str) -> str:
    """Splice a regenerated section back into the document by markers."""
    start = SECTION_START_TPL.format(slug=slug)
    end = SECTION_END_TPL.format(slug=slug)
    pattern = re.compile(
        re.escape(start) + r".*?" + re.escape(end), re.DOTALL
    )
    new_block = f"{start}\n{new_body.strip()}\n{end}"
    if not pattern.search(content):
        # Marker missing - append the section to the end as a fallback.
        return content.rstrip() + "\n\n" + new_block + "\n"
    return pattern.sub(new_block, content, count=1)


def get_section_body(content: str, slug: str) -> Optional[str]:
    """Return the body of a section identified by slug, without markers."""
    start = SECTION_START_TPL.format(slug=slug)
    end = SECTION_END_TPL.format(slug=slug)
    m = re.search(
        re.escape(start) + r"\n?(.*?)\n?" + re.escape(end), content, re.DOTALL
    )
    if not m:
        return None
    return m.group(1).strip()


# --- Prompts ------------------------------------------------------------


_FULL_SYSTEM_PROMPT = """/no_think
你是经验丰富的产品经理。根据用户素材和模板输出 PRD。

输出严格 JSON，UTF-8，不要 code-fence。字段：
- title (str)
- summary (str, 1-2 句)
- suggested_project_name (str)
- suggested_project_code (str, 3-12 位 [A-Z0-9_-])
- content (str, 完整 markdown，保留每个 section 的 <!-- prd:section:start:SLUG --> 与 end 标记)
- requirements: [{title, description, acceptance_criteria(字符串), priority(low/medium/high/urgent), category, tag}, ...]

要求：
- 中文，专业克制；不要 emoji；表格优先 markdown 表格。
- content 的每个 section 必须以 markdown 二级标题开头（## 编号 标题），骨架里给出的标题保持主体词。
- acceptance_criteria 必须是一个字符串（多行用 \\n），不要返回数组；可用 Given-When-Then 或勾选列表风格。
- 缺信息直接写「待业务方确认」并在 risks 中列出。
- 直接输出 JSON，不要输出 <think> 推理过程。"""


_SECTION_SYSTEM_PROMPT = """/no_think
你是资深产品经理。重写 PRD 中指定的一个 section。
只输出该 section 的 markdown 内容（不含标题，不含 code-fence）。
中文专业克制，缺信息写「待业务方确认」。直接输出，不要 <think>。"""


def _build_user_prompt(
    spec: TemplateSpec,
    source_type: PRDSourceType,
    source_input: str,
    extra_instruction: Optional[str],
    rt: AIRuntime,
) -> str:
    skeleton = _build_section_skeleton(spec)
    parts: List[str] = []
    parts.append(f"模板：{spec.label}（{spec.tone}）")
    parts.append(f"素材类型：{SOURCE_TYPE_LABELS[source_type]}")
    parts.append("素材：")
    parts.append(_truncate(source_input or "(空)", min(rt.max_input_chars, 6000)))
    if extra_instruction:
        parts.append(f"额外要求：{extra_instruction}")
    parts.append("章节骨架（保留所有 HTML 注释标记，把 ... 替换为实际内容）：")
    parts.append(skeleton)
    parts.append("现在输出 JSON。")
    return "\n".join(parts)


# --- Public API ---------------------------------------------------------


async def generate_full_prd(
    rt: AIRuntime,
    *,
    template: PRDTemplate,
    source_type: PRDSourceType,
    source_input: str,
    extra_instruction: Optional[str] = None,
) -> GeneratedPRD:
    """Single LLM call to produce the full PRD + requirement pool."""
    if not is_enabled(rt):
        raise AIDisabledError("AI feature is not configured")

    spec = get_template(template)
    user_prompt = _build_user_prompt(
        spec, source_type, source_input, extra_instruction, rt
    )

    raw = await chat_completion(
        rt,
        system=_FULL_SYSTEM_PROMPT,
        user=user_prompt,
        temperature=0.3,
        max_tokens=_max_tokens_for_template(spec),
    )
    logger.info(
        "PRD raw model output (template=%s len=%d, head=%s)",
        template.value,
        len(raw or ""),
        (raw or "")[:200].replace("\n", "\\n"),
    )

    try:
        data = _extract_json(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        # Fallback: strip thinking blocks, treat the rest as the markdown
        # body, no structured requirements. Better than failing the call.
        # Mark `truncated=True` so callers can surface "regenerate or fill
        # in manually" guidance to the user.
        logger.warning("PRD JSON parse failed, falling back to markdown-only: %s", exc)
        cleaned = _strip_thinking_blocks(raw or "")
        cleaned = _strip_code_fence(cleaned).strip() or cleaned
        return GeneratedPRD(
            title=_coerce_str(extra_instruction, 80) or f"{spec.label} 草稿",
            summary="",
            suggested_project_name=None,
            suggested_project_code=None,
            content=_ensure_markers(cleaned, spec),
            requirements=[],
            truncated=True,
        )

    title = _coerce_str(data.get("title"), 255) or f"{spec.label} 草稿"
    summary = _coerce_str(data.get("summary"), 2000) or ""
    spn = _coerce_str(data.get("suggested_project_name"), 128)
    spc = _coerce_str(data.get("suggested_project_code"), 32)
    if spc:
        # Constrain to [A-Z0-9_-] - the project code field is unique and we
        # don't want spaces / Chinese characters there.
        spc_norm = re.sub(r"[^A-Z0-9_-]", "", spc.upper())
        spc = spc_norm[:32] if spc_norm else None

    raw_content = data.get("content") or ""
    if not isinstance(raw_content, str):
        raw_content = str(raw_content)
    content = _ensure_markers(raw_content, spec)

    raw_reqs = data.get("requirements") or []
    requirements: List[GeneratedRequirement] = []
    if isinstance(raw_reqs, list):
        for idx, item in enumerate(raw_reqs):
            if not isinstance(item, dict):
                continue
            r_title = _coerce_str(item.get("title"), 255)
            if not r_title:
                continue
            requirements.append(
                GeneratedRequirement(
                    title=r_title,
                    description=_coerce_str(item.get("description"), 4000),
                    acceptance_criteria=_coerce_str(
                        item.get("acceptance_criteria"), 4000
                    ),
                    priority=_parse_priority(item.get("priority")),
                    category=_coerce_str(item.get("category"), 64),
                    tag=_coerce_str(item.get("tag"), 32),
                )
            )

    return GeneratedPRD(
        title=title,
        summary=summary,
        suggested_project_name=spn,
        suggested_project_code=spc,
        content=content,
        requirements=requirements,
    )


async def regenerate_section(
    rt: AIRuntime,
    *,
    template: PRDTemplate,
    section_slug: str,
    current_content: str,
    extra_instruction: Optional[str] = None,
) -> str:
    """Regenerate one section. Returns the *new full document* with the
    section spliced in."""
    if not is_enabled(rt):
        raise AIDisabledError("AI feature is not configured")

    spec = get_template(template)
    matched = next((s for s in spec.sections if s[0] == section_slug), None)
    if matched is None:
        raise AIRequestError(f"未知的 section: {section_slug}")
    slug, title, hint = matched

    # Provide the rest of the doc as context, with the target section
    # *removed* so the model knows what to generate.
    other_sections: List[str] = []
    for s_slug, s_title, _s_hint in spec.sections:
        body = get_section_body(current_content, s_slug)
        if body and s_slug != slug:
            other_sections.append(f"### {s_title}\n{body}")
    context_block = "\n\n".join(other_sections) or "(其他章节为空)"

    user_prompt = (
        f"PRD 模板：{spec.label}\n"
        f"目标章节：{title}\n"
        f"写作要求：{hint}\n\n"
        f"以下是 PRD 中其他章节的摘要供参考：\n\n{_truncate(context_block, rt.max_input_chars)}\n\n"
        + (f"用户额外要求：{extra_instruction}\n\n" if extra_instruction else "")
        + "请输出该章节的 markdown 内容（不要再写一遍章节标题，不要 code-fence 包裹整体）。"
    )

    body = await chat_completion(
        rt,
        system=_SECTION_SYSTEM_PROMPT,
        user=user_prompt,
        temperature=0.3,
        # Single section can run long for prose-heavy templates (App
        # 双端差异, 数字人 直播管线). 3500 keeps headroom even on tight
        # TPM caps; the user can always retry on truncation.
        max_tokens=3500,
    )

    body = _strip_code_fence(_strip_thinking_blocks(body)).strip()
    # Re-prepend the canonical section heading so the document keeps a
    # consistent structure even if the model omitted it (we asked it to,
    # but defensive coding wins).
    if not body.lstrip().startswith("#"):
        body = f"## {title}\n\n{body}"

    return _replace_section(current_content, slug, body)


# --- Requirements re-extraction ----------------------------------------


_REQ_EXTRACT_SYSTEM = """/no_think
你是一名资深产品经理。读完一份 PRD 后，提炼出可落地的原子需求池。

严格输出 JSON 数组，每条 { title, description, acceptance_criteria, priority(low/medium/high/urgent), category, tag }。
不要包裹 code-fence。需求颗粒度：一条需求 = 一个开发可独立估点的故事，避免「实现整个登录模块」这种过粗的写法。
直接输出 JSON 数组，不要输出 <think> 推理过程。"""


async def reextract_requirements(
    rt: AIRuntime,
    *,
    content: str,
) -> List[GeneratedRequirement]:
    """Re-run requirement extraction on a (possibly hand-edited) PRD body.
    Used when the user clicks 「重新提取需求」on the detail page."""
    if not is_enabled(rt):
        raise AIDisabledError("AI feature is not configured")

    user_prompt = (
        "以下是完整的 PRD markdown，请提炼需求池：\n\n"
        f"{_truncate(content, rt.max_input_chars)}\n\n"
        "输出 JSON 数组。"
    )
    raw = await chat_completion(
        rt,
        system=_REQ_EXTRACT_SYSTEM,
        user=user_prompt,
        temperature=0.2,
        max_tokens=4000,
    )
    raw_clean = _strip_code_fence(_strip_thinking_blocks(raw))
    try:
        data = json.loads(raw_clean)
    except json.JSONDecodeError:
        # Try to grab the first [...] block.
        start = raw_clean.find("[")
        end = raw_clean.rfind("]")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw_clean[start : end + 1])
            except json.JSONDecodeError as exc:
                raise AIRequestError(f"模型返回的不是合法 JSON 数组: {exc}") from exc
        else:
            raise AIRequestError("模型返回的不是合法 JSON 数组")

    if not isinstance(data, list):
        raise AIRequestError("模型返回的根节点不是数组")

    out: List[GeneratedRequirement] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        r_title = _coerce_str(item.get("title"), 255)
        if not r_title:
            continue
        out.append(
            GeneratedRequirement(
                title=r_title,
                description=_coerce_str(item.get("description"), 4000),
                acceptance_criteria=_coerce_str(item.get("acceptance_criteria"), 4000),
                priority=_parse_priority(item.get("priority")),
                category=_coerce_str(item.get("category"), 64),
                tag=_coerce_str(item.get("tag"), 32),
            )
        )
    return out
