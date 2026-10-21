"""NetEase Cloud Music helpers (metadata / lyric / playable audio)."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Referer": "https://music.163.com/",
}

# 官方 outer url 已大量 404；用 Meting 中转拿真实 CDN
METING_URL = "https://api.injahow.cn/meting/?type=url&id={id}"
# 元数据 + 歌词
PAUGRAM_URL = "https://api.paugram.com/netease/?id={id}"


def parse_lrc(lrc_text: str) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    if not lrc_text:
        return lines
    for raw in lrc_text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        matches = list(re.finditer(r"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]", raw))
        if not matches:
            continue
        text = re.sub(r"\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]", "", raw).strip()
        if not text:
            continue
        for m in matches:
            minute = int(m.group(1))
            second = int(m.group(2))
            frac = m.group(3) or "0"
            frac = (frac + "000")[:3]
            t = minute * 60 + second + int(frac) / 1000.0
            lines.append({"t": t, "text": text})
    lines.sort(key=lambda item: item["t"])
    return lines


def _get_json(url: str, timeout: float = 10.0) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def proxy_audio_path(song_id: str) -> str:
    return f"/workstation/api/netease/audio/{song_id}/"


def resolve_stream_url(song_id: str) -> str | None:
    """Resolve a playable CDN/audio URL for a NetEase song id."""
    song_id = re.sub(r"\D", "", str(song_id or ""))
    if not song_id:
        return None
    url = METING_URL.format(id=song_id)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            final = resp.geturl() or url
            ctype = (resp.headers.get("Content-Type") or "").lower()
            # 读一点确认是音频，避免落到 HTML 404
            peek = resp.read(64)
            if b"<html" in peek.lower() or "text/html" in ctype:
                return None
            if "audio" in ctype or "mpeg" in ctype or "octet" in ctype or "music.126.net" in final:
                return final
            # 部分 CDN 不带标准 content-type，但已跳转成功
            if final and "music.163.com/404" not in final:
                return final
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return None
    return None


def fetch_song(song_id: str) -> dict[str, Any]:
    song_id = re.sub(r"\D", "", str(song_id or ""))
    if not song_id:
        return {"ok": False, "error": "无效的歌曲 ID"}

    title = f"曲目 {song_id}"
    artist = "未知歌手"
    cover = ""
    lrc_text = ""

    # 1) 优先用 paugram 拿标题/封面/歌词
    try:
        data = _get_json(PAUGRAM_URL.format(id=song_id))
        title = data.get("title") or title
        artist = data.get("artist") or artist
        cover = data.get("cover") or ""
        lrc_text = data.get("lyric") or ""
    except Exception:
        # 2) 回退官方详情接口
        try:
            detail = _get_json(
                f"https://music.163.com/api/song/detail/?id={song_id}&ids=[{song_id}]"
            )
            song = (detail.get("songs") or [None])[0]
            if song:
                title = song.get("name") or title
                artists = song.get("artists") or []
                artist = (artists[0].get("name") if artists else "") or artist
                album = song.get("album") or {}
                cover = album.get("picUrl") or cover
            try:
                lrc_data = _get_json(
                    f"https://music.163.com/api/song/lyric?id={song_id}&lv=-1&kv=-1&tv=-1"
                )
                lrc_text = ((lrc_data.get("lrc") or {}).get("lyric")) or lrc_text
            except Exception:
                pass
        except Exception as exc:
            return {"ok": False, "error": str(exc), "id": song_id}

    # 探测是否可解析到音频（导入时提示；真正播放走代理实时解析）
    playable = resolve_stream_url(song_id) is not None

    return {
        "ok": True,
        "id": song_id,
        "title": title,
        "artist": artist,
        "cover": cover,
        "src": proxy_audio_path(song_id),
        "lrc": lrc_text,
        "lyrics": parse_lrc(lrc_text),
        "playable": playable,
        "warning": "" if playable else "暂未解析到试听源（可能需会员/版权限制）",
    }


def extract_song_id(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    m = re.search(r"[?&]id=(\d+)", raw)
    if m:
        return m.group(1)
    m = re.search(r"/song(?:\?|/)?.*?(\d{5,})", raw)
    if m:
        return m.group(1)
    return re.sub(r"\D", "", raw)


def extract_song_id_from_src(src: str) -> str:
    src = src or ""
    m = re.search(r"/api/netease/audio/(\d+)/?", src)
    if m:
        return m.group(1)
    m = re.search(r"music\.163\.com/song/media/outer/url\?id=(\d+)", src)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=(\d+)", src)
    if m:
        return m.group(1)
    return ""
