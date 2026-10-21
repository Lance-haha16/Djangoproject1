"""
Archive AI summarization hook.

Wire a real model later via settings:
  ARCHIVE_AI_PROVIDER = "openai" | "stub" (default)
  ARCHIVE_AI_API_KEY = "..."
  ARCHIVE_AI_MODEL = "gpt-4o-mini"

Public entry: generate_archive_summary(prompt, material) -> dict
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings


def collect_month_material(year: int, month: int) -> str:
    """Gather site content from a calendar month as AI context."""
    from datetime import datetime

    from django.utils import timezone

    from article.models import ArticlePost
    from message.models import Message

    start = timezone.make_aware(datetime(year, month, 1))
    if month == 12:
        end = timezone.make_aware(datetime(year + 1, 1, 1))
    else:
        end = timezone.make_aware(datetime(year, month + 1, 1))

    lines: list[str] = [f"时间范围：{year}年{month}月", ""]

    articles = ArticlePost.objects.filter(created__gte=start, created__lt=end).order_by("created")
    lines.append(f"【文章 {articles.count()} 篇】")
    for a in articles[:30]:
        lines.append(f"- {a.title}")
    lines.append("")

    messages = Message.objects.filter(
        parent__isnull=True, created__gte=start, created__lt=end
    ).order_by("created")
    lines.append(f"【留言 {messages.count()} 条】")
    for m in messages[:20]:
        body = (m.body or "").replace("\n", " ")[:80]
        lines.append(f"- {body}")
    lines.append("")

    try:
        from workstation.models import IdeaNote

        ideas = IdeaNote.objects.filter(created__gte=start, created__lt=end, is_published=True)
        lines.append(f"【灵感 {ideas.count()} 条】")
        for idea in ideas[:20]:
            lines.append(f"- {idea.title}")
    except Exception:
        pass

    return "\n".join(lines).strip()


def _stub_summary(prompt: str, material: str) -> dict[str, Any]:
    """Local fallback until a real provider is configured."""
    article_lines = [ln for ln in material.splitlines() if ln.startswith("- ")]
    highlight = "、".join(x[2:20] for x in article_lines[:3]) or "日常点滴"
    title = f"月度回顾（草稿）"
    if "年" in material and "月" in material:
        head = material.splitlines()[0]
        title = head.replace("时间范围：", "") + "回顾"
    snippet = f"本月留下了 {len(article_lines)} 条足迹，涉及：{highlight}…"
    body = (
        f"{title}\n\n"
        f"（此为本地草稿，尚未接入真实 AI。）\n\n"
        f"提示词：\n{prompt or '（无）'}\n\n"
        f"素材摘录：\n{material[:1200]}"
    )
    return {
        "ok": True,
        "provider": "stub",
        "title": title[:160],
        "snippet": snippet[:240],
        "body": body,
        "raw": json.dumps({"provider": "stub", "lines": len(article_lines)}, ensure_ascii=False),
        "error": "",
    }


def _openai_summary(prompt: str, material: str) -> dict[str, Any]:
    api_key = getattr(settings, "ARCHIVE_AI_API_KEY", "") or ""
    model = getattr(settings, "ARCHIVE_AI_MODEL", "gpt-4o-mini")
    if not api_key:
        return {
            "ok": False,
            "provider": "openai",
            "title": "",
            "snippet": "",
            "body": "",
            "raw": "",
            "error": "未配置 ARCHIVE_AI_API_KEY",
        }

    system = (
        "你是个人博客的归档编辑。根据素材写一条归档卡片："
        "返回 JSON，字段 title（短标题）、snippet（40字内摘要）、body（200-400字回顾）。"
        "语气真诚、简洁，不要营销腔。"
    )
    user = f"额外要求：\n{prompt or '无'}\n\n素材：\n{material}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return {
            "ok": True,
            "provider": "openai",
            "title": str(parsed.get("title") or "AI 月度回顾")[:160],
            "snippet": str(parsed.get("snippet") or "")[:240],
            "body": str(parsed.get("body") or content),
            "raw": content,
            "error": "",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
        return {
            "ok": False,
            "provider": "openai",
            "title": "",
            "snippet": "",
            "body": "",
            "raw": "",
            "error": str(exc),
        }


def generate_archive_summary(prompt: str = "", material: str = "") -> dict[str, Any]:
    """
    Main AI entry for archive drafts.

    Returns dict with keys: ok, provider, title, snippet, body, raw, error
    """
    provider = (getattr(settings, "ARCHIVE_AI_PROVIDER", "stub") or "stub").lower()
    material = (material or "").strip()
    prompt = (prompt or "").strip()
    if not material:
        return {
            "ok": False,
            "provider": provider,
            "title": "",
            "snippet": "",
            "body": "",
            "raw": "",
            "error": "没有可用于总结的素材",
        }
    if provider == "openai":
        return _openai_summary(prompt, material)
    return _stub_summary(prompt, material)
