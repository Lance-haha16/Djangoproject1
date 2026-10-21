"""Build chronological archive river events for the 归档 page."""
from __future__ import annotations

import re
from datetime import datetime, timezone as dt_timezone
from typing import Any

from django.utils import timezone
from django.utils.html import strip_tags

from .models import ArticlePost


def _plain_snippet(text: str, limit: int = 42) -> str:
    text = strip_tags(text or "")
    text = re.sub(r"[#>*_`~\-\[\]\(\)!]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _fmt_datetime(dt) -> str:
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return f"{dt.year}.{dt.month}.{dt.day} {dt.hour:02d}:{dt.minute:02d}"


def build_archive_timeline() -> dict[str, Any]:
    """Return river events (articles first) + summary counts."""
    events: list[dict[str, Any]] = []

    for article in ArticlePost.objects.all().order_by("created"):
        cover = ""
        if article.avatar:
            cover = article.avatar.url
        events.append(
            {
                "kind": "article",
                "id": f"a-{article.id}",
                "title": article.title,
                "snippet": _plain_snippet(article.body),
                "cover": cover,
                "date": _fmt_datetime(article.created),
                "ts": article.created.timestamp(),
                "url": article.get_absolute_url(),
                "views": article.total_views,
                "likes": 0,
            }
        )

    try:
        from message.models import Message

        for msg in Message.objects.filter(parent__isnull=True).order_by("created"):
            events.append(
                {
                    "kind": "message",
                    "id": f"m-{msg.id}",
                    "title": "新留言",
                    "snippet": _plain_snippet(msg.body, 36),
                    "cover": "",
                    "date": _fmt_datetime(msg.created),
                    "ts": msg.created.timestamp(),
                    "url": "/message/message-list/",
                    "views": 0,
                    "likes": msg.likes.count(),
                }
            )
    except Exception:
        pass

    try:
        from .github_projects import fetch_recent_projects

        for project in fetch_recent_projects().get("projects") or []:
            raw = project.get("updated_at") or project.get("created_at") or ""
            if len(raw) < 10:
                continue
            try:
                # 2026-01-15T12:00:00Z
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=dt_timezone.utc)
            except ValueError:
                continue
            events.append(
                {
                    "kind": "project",
                    "id": f"p-{project.get('name')}",
                    "title": project.get("name") or "项目",
                    "snippet": _plain_snippet(project.get("description") or "", 40),
                    "cover": "",
                    "date": _fmt_datetime(dt),
                    "ts": dt.timestamp(),
                    "url": project.get("url") or "#",
                    "views": 0,
                    "likes": 0,
                }
            )
    except Exception:
        pass

    try:
        from workstation.models import ArchiveEntry

        for entry in ArchiveEntry.objects.filter(is_published=True):
            item = entry.to_public()
            item["date"] = _fmt_datetime(entry.event_at)
            item["ts"] = entry.event_at.timestamp()
            events.append(item)
    except Exception:
        pass

    events.sort(key=lambda item: item["ts"])

    article_count = sum(1 for e in events if e["kind"] == "article")
    message_count = sum(1 for e in events if e["kind"] == "message")
    project_count = sum(1 for e in events if e["kind"] == "project")
    manual_count = sum(1 for e in events if e["kind"] in ("manual", "ai", "idea", "music", "living"))

    return {
        "events": events,
        "article_count": article_count,
        "message_count": message_count,
        "project_count": project_count,
        "manual_count": manual_count,
        "total": len(events),
    }
