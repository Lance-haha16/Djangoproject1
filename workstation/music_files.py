"""把拖进来的音频放进 static/music，并读出歌名、歌手、封面、歌词。"""

import hashlib
import re
from pathlib import Path
from urllib.parse import quote, unquote

from django.conf import settings
from django.utils.text import slugify

from .models import MusicTrack

AUDIO_EXTENSIONS = {".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg", ".opus"}
MAX_BYTES = 100 * 1024 * 1024
LRC_STAMP = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:\.\d+)?)\]")


def library_root():
    return Path(settings.BASE_DIR) / "static" / "music"


def _safe_name(original):
    name = Path(original or "").name.replace("\x00", "")
    name = re.sub(r'[\\/:*?"<>|\r\n]+', "_", name).strip().strip(".")
    return (name or "track")[:180]


def _unique_file(directory, filename):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / filename
    stem, suffix = path.stem, path.suffix
    n = 2
    while path.exists():
        path = directory / f"{stem}-{n}{suffix}"
        n += 1
    return path


def _public(path):
    rel = path.resolve().relative_to((Path(settings.BASE_DIR) / "static").resolve())
    return "/static/" + "/".join(quote(part) for part in rel.parts)


def _digest(path):
    hashed = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hashed.update(chunk)
    return hashed.hexdigest()


def _split_filename(filename):
    stem = Path(filename).stem
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        return title.strip() or stem, artist.strip()
    return stem, ""


def _as_text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return _as_text(value[0]) if value else ""
    text = getattr(value, "text", None)
    if text is not None and not isinstance(value, str):
        return _as_text(text)
    return str(value).strip()


def _lyrics_from_text(text):
    text = (text or "").strip()
    if not text:
        return []
    if LRC_STAMP.search(text):
        rows = []
        for raw in text.splitlines():
            stamps = list(LRC_STAMP.finditer(raw))
            if not stamps:
                continue
            line = LRC_STAMP.sub("", raw).strip()
            if not line:
                continue
            for stamp in stamps:
                seconds = int(stamp.group(1)) * 60 + float(stamp.group(2))
                rows.append({"t": round(seconds, 2), "text": line})
        rows.sort(key=lambda row: row["t"])
        return rows[:800]
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append({"t": len(rows) * 8, "text": line})
        if len(rows) >= 800:
            break
    return rows


def _title_artist_lyrics(audio, filename):
    title, artist = _split_filename(filename)
    tags = getattr(audio, "tags", None) if audio is not None else None
    if tags is None:
        return title[:160], artist[:120], []

    if hasattr(tags, "getall"):
        title = _as_text(tags.getall("TIT2")) or title
        artist = _as_text(tags.getall("TPE1")) or artist
        synced = tags.getall("SYLT")
        if synced and getattr(synced[0], "text", None):
            rows = []
            for line, stamp in synced[0].text:
                line = str(line).strip()
                if line:
                    rows.append({"t": round(float(stamp) / 1000, 2), "text": line})
            if rows:
                return title[:160], artist[:120], rows[:800]
        unsynced = tags.getall("USLT")
        lyrics = _lyrics_from_text(_as_text(unsynced) if unsynced else "")
        return title[:160], artist[:120], lyrics

    def grab(*keys):
        for key in keys:
            try:
                value = tags.get(key)
            except Exception:
                value = None
            text = _as_text(value)
            if text:
                return text
        return ""

    title = grab("title", "TIT2", "\xa9nam") or title
    artist = grab("artist", "TPE1", "\xa9ART") or artist
    lyrics = _lyrics_from_text(grab("lyrics", "unsyncedlyrics", "\xa9lyr"))
    return title[:160], artist[:120], lyrics


def _cover_bytes(audio):
    tags = getattr(audio, "tags", None)
    if tags is not None and hasattr(tags, "getall"):
        pics = tags.getall("APIC")
        if pics:
            return pics[0].data, getattr(pics[0], "mime", "") or "image/jpeg"
    pictures = getattr(audio, "pictures", None)
    if pictures:
        pic = pictures[0]
        return pic.data, getattr(pic, "mime", "") or "image/jpeg"
    if tags is not None:
        try:
            covers = tags.get("covr")
        except Exception:
            covers = None
        if covers:
            blob = covers[0]
            mime = "image/png" if getattr(blob, "imageformat", None) == 14 else "image/jpeg"
            return bytes(blob), mime
    return None, ""


def read_tags(path, filename):
    try:
        from mutagen import File as MutagenFile
    except ImportError:
        title, artist = _split_filename(filename)
        return {"title": title[:160], "artist": artist[:120], "lyrics": [], "cover": None, "cover_mime": ""}
    try:
        audio = MutagenFile(path)
    except Exception:
        audio = None
    title, artist, lyrics = _title_artist_lyrics(audio, filename)
    cover, mime = None, ""
    if audio is not None:
        try:
            cover, mime = _cover_bytes(audio)
        except Exception:
            cover, mime = None, ""
    return {
        "title": title or Path(filename).stem[:160],
        "artist": artist,
        "lyrics": lyrics,
        "cover": cover,
        "cover_mime": mime,
    }


def _cover_suffix(mime, blob):
    mime = (mime or "").lower()
    if "png" in mime or blob[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if "webp" in mime or blob[:4] == b"RIFF":
        return ".webp"
    return ".jpg"


def _unique_slug(playlist, title):
    base = (slugify(title, allow_unicode=True) or "track")[:70]
    slug = base
    n = 2
    while playlist.tracks.filter(slug=slug).exists():
        slug = f"{base[:60]}-{n}"
        n += 1
    return slug


def _write_upload(uploaded, directory, filename):
    directory.mkdir(parents=True, exist_ok=True)
    temp = _unique_file(directory, f".incoming-{filename}")
    try:
        with temp.open("wb") as handle:
            for chunk in uploaded.chunks():
                handle.write(chunk)
        candidate = directory / filename
        if (
            candidate.exists()
            and candidate.stat().st_size == temp.stat().st_size
            and _digest(candidate) == _digest(temp)
        ):
            temp.unlink()
            return candidate, False
        dest = candidate if not candidate.exists() else _unique_file(directory, filename)
        temp.replace(dest)
        return dest, True
    except Exception:
        if temp.exists():
            temp.unlink()
        raise


def store_uploaded_track(playlist, uploaded):
    """成功时返回 (None, 歌名)，失败时返回 (原因, None)。"""
    name = _safe_name(getattr(uploaded, "name", ""))
    suffix = Path(name).suffix.lower()
    if suffix == ".ncm":
        return "ncm 是加密文件，浏览器播不了。请换成 mp3、flac 或 m4a。", None
    if suffix not in AUDIO_EXTENSIONS:
        shown = suffix or "这个格式"
        return f"不支持 {shown}，请用 mp3、flac、m4a、wav、ogg。", None
    size = getattr(uploaded, "size", None)
    if size == 0:
        return "文件是空的。", None
    if size is not None and size > MAX_BYTES:
        return "文件超过 100MB，没有放进去。", None

    tracks_dir = library_root() / "tracks"
    try:
        dest, created = _write_upload(uploaded, tracks_dir, name)
    except Exception:
        return "写入曲库失败。", None

    public = _public(dest)
    if playlist.tracks.filter(src=public).exists():
        if created:
            dest.unlink(missing_ok=True)
        return f"「{Path(name).stem}」已经在这个歌单里。", None

    meta = read_tags(dest, dest.name)
    cover_url = ""
    cover_path = None
    blob = meta["cover"]
    if blob:
        cover_path = _unique_file(
            library_root() / "covers",
            f"{dest.stem[:80]}{_cover_suffix(meta['cover_mime'], blob)}",
        )
        try:
            cover_path.write_bytes(blob)
            cover_url = _public(cover_path)
        except Exception:
            cover_url = ""
            if cover_path.exists():
                cover_path.unlink()
            cover_path = None

    try:
        MusicTrack.objects.create(
            playlist=playlist,
            slug=_unique_slug(playlist, meta["title"]),
            title=meta["title"],
            artist=meta["artist"],
            src=public,
            cover=cover_url,
            lyrics=meta["lyrics"],
            sort_order=playlist.tracks.count(),
            is_published=True,
        )
    except Exception:
        if created:
            dest.unlink(missing_ok=True)
        if cover_path and cover_path.exists():
            cover_path.unlink()
        return "曲目写入失败。", None
    return None, meta["title"]


def resolve_track_src(src):
    """把工作台里填的文件名或路径收成浏览器能打开的地址。外链原样返回。"""
    src = (src or "").strip()
    if not src:
        return "", "音频地址不能为空。"
    lowered = src.lower()
    if lowered.startswith("http://") or lowered.startswith("https://") or src.startswith("/workstation/"):
        return src, None

    normalized = src.replace("\\", "/")
    marker = "static/music/tracks/"
    if marker in normalized:
        name = normalized.split(marker, 1)[1]
    elif normalized.startswith("/static/music/tracks/"):
        name = normalized.split("/static/music/tracks/", 1)[1]
    else:
        name = normalized
    name = unquote(name.split("?", 1)[0].split("#", 1)[0]).strip().strip("/")
    name = Path(name).name
    if not name or name in {".", ".."}:
        return "", "没有识别出文件名。"
    path = library_root() / "tracks" / name
    if not path.is_file():
        return "", f"曲库里没有「{name}」。把文件放到 static/music/tracks/ 后，填文件名即可。"
    return "/static/music/tracks/" + quote(name), None


def remove_library_files(*urls):
    root = library_root().resolve()
    for url in urls:
        if not url or "/static/music/" not in str(url):
            continue
        if MusicTrack.objects.filter(src=url).exists() or MusicTrack.objects.filter(cover=url).exists():
            continue
        rel = unquote(str(url).split("/static/music/", 1)[-1].split("?", 1)[0])
        target = (root / rel).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            continue
        if target.is_file():
            target.unlink()
