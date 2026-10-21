"""Pixel-cat chat backend (Gemini-compatible, with local stub fallback)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from django.conf import settings

DEFAULT_PROMPT = (
    "你是一只名叫煤球的像素暹罗猫，住在博主的个人网站里。"
    "说话简短可爱，偶尔加「喵」，不要太长。"
)


def reply_as_cat(message: str) -> dict:
    message = (message or "").strip()
    if not message:
        return {"ok": False, "reply": "", "error": "空消息"}

    api_key = (
        getattr(settings, "GEMINI_API_KEY", "")
        or getattr(settings, "ARCHIVE_AI_API_KEY", "")
        or ""
    ).strip()
    provider = (getattr(settings, "CAT_AI_PROVIDER", "") or "").strip().lower()
    if not provider:
        provider = "gemini" if api_key else "stub"

    if provider == "stub" or not api_key:
        return {
            "ok": True,
            "reply": _stub_reply(message),
            "provider": "stub",
            "error": "",
        }

    if provider in ("gemini", "google"):
        return _gemini_reply(message, api_key)

    return {"ok": False, "reply": "", "error": f"未知 provider: {provider}"}


def _stub_reply(message: str) -> str:
    if "鱼" in message:
        return "嗷呜！小鱼干香哭了喵，铲屎官真好！"
    if len(message) < 8:
        return "喵？本喵听到了，再说详细一点喵~"
    return f"煤球思考了一下：关于「{message[:18]}…」，本喵觉得今天也要开心敲代码喵！"


def _gemini_reply(message: str, api_key: str) -> dict:
    model = getattr(settings, "CAT_AI_MODEL", "gemini-2.0-flash") or "gemini-2.0-flash"
    prompt = getattr(settings, "CAT_AI_SYSTEM_PROMPT", "") or DEFAULT_PROMPT
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {"temperature": 0.85, "maxOutputTokens": 256},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )
        if not text:
            return {"ok": False, "reply": "", "error": "空回复", "provider": "gemini"}
        return {"ok": True, "reply": text, "provider": "gemini", "error": ""}
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, IndexError, json.JSONDecodeError) as exc:
        return {"ok": False, "reply": "", "error": str(exc), "provider": "gemini"}
