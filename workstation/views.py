import json

from datetime import datetime

from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.http import require_GET, require_http_methods

from article.models import ArticlePost
from message.models import Message

from .ai_archive import collect_month_material, generate_archive_summary
from .chat import reply_as_cat
from .decorators import staff_required
from .music_files import remove_library_files, resolve_track_src, store_uploaded_track
from .models import (
    ArchiveEntry,
    IdeaNote,
    LivingDevice,
    MusicPlaylist,
    MusicTrack,
    ProjectShowcase,
    SiteAppearance,
    SiteWallpaper,
)
from .netease import extract_song_id, fetch_song, resolve_stream_url


def _unique_slug(model, base, field="slug", exclude_pk=None):
    base = slugify(base, allow_unicode=True) or "item"
    candidate = base
    n = 2
    while True:
        qs = model.objects.filter(**{field: candidate})
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return candidate
        candidate = f"{base}-{n}"
        n += 1


@staff_required
def dashboard(request):
    return render(
        request,
        "workstation/dashboard.html",
        {
            "title": "站长工作台",
            "module": "dashboard",
            "counts": {
                "living": LivingDevice.objects.count(),
                "ideas": IdeaNote.objects.count(),
                "playlists": MusicPlaylist.objects.count(),
                "articles": ArticlePost.objects.count(),
                "messages": Message.objects.filter(parent__isnull=True).count(),
                "projects": ProjectShowcase.objects.count(),
                "archive": ArchiveEntry.objects.count(),
            },
        },
    )


def _parse_event_at(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return timezone.now()
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return timezone.make_aware(dt) if timezone.is_naive(dt) else dt
        except ValueError:
            continue
    return timezone.now()


@staff_required
def archive_view(request):
    if request.method == "POST":
        action = request.POST.get("action", "save")

        if action == "delete":
            ArchiveEntry.objects.filter(pk=request.POST.get("id")).delete()
            messages.success(request, "归档条目已删除。")
            return redirect("workstation:archive")

        if action == "ai_draft":
            year = int(request.POST.get("year") or timezone.localdate().year)
            month = int(request.POST.get("month") or timezone.localdate().month)
            prompt = request.POST.get("ai_prompt", "").strip()
            extra = request.POST.get("ai_extra", "").strip()
            material = collect_month_material(year, month)
            if extra:
                material = material + "\n\n【补充素材】\n" + extra
            result = generate_archive_summary(prompt=prompt, material=material)
            entry = ArchiveEntry(
                title=result.get("title") or f"{year}年{month}月回顾",
                snippet=result.get("snippet") or "",
                body=result.get("body") or "",
                kind=ArchiveEntry.KIND_AI,
                source=ArchiveEntry.SOURCE_AI,
                event_at=timezone.make_aware(datetime(year, month, 15, 12, 0)),
                ai_prompt=prompt,
                ai_status=ArchiveEntry.AI_DONE if result.get("ok") else ArchiveEntry.AI_ERROR,
                ai_raw=result.get("raw") or result.get("error") or "",
                is_published=False,
            )
            entry.save()
            if result.get("ok"):
                messages.success(
                    request,
                    f"已生成 AI 草稿（provider={result.get('provider')}），默认未发布，可编辑后公开。",
                )
            else:
                messages.error(request, f"AI 生成失败：{result.get('error') or '未知错误'}（已留下草稿条目）")
            return redirect(reverse("workstation:archive") + f"?edit={entry.id}")

        title = request.POST.get("title", "").strip()
        if not title:
            messages.error(request, "标题不能为空。")
            return redirect("workstation:archive")

        pk = request.POST.get("id")
        existing = ArchiveEntry.objects.filter(pk=pk).first() if pk else None
        source = request.POST.get("source") or (
            existing.source if existing else ArchiveEntry.SOURCE_MANUAL
        )
        data = {
            "title": title,
            "snippet": request.POST.get("snippet", "").strip(),
            "body": request.POST.get("body", "").strip(),
            "cover": request.POST.get("cover", "").strip(),
            "kind": request.POST.get("kind") or ArchiveEntry.KIND_MANUAL,
            "event_at": _parse_event_at(request.POST.get("event_at", "")),
            "url": request.POST.get("url", "").strip(),
            "is_published": request.POST.get("is_published") == "on",
            "source": source,
            "ai_prompt": request.POST.get("ai_prompt", "").strip()
            if source == ArchiveEntry.SOURCE_AI
            else (existing.ai_prompt if existing else ""),
        }
        try:
            data["views"] = max(0, int(request.POST.get("views") or 0))
        except ValueError:
            data["views"] = 0
        try:
            data["likes"] = max(0, int(request.POST.get("likes") or 0))
        except ValueError:
            data["likes"] = 0

        if pk:
            entry = get_object_or_404(ArchiveEntry, pk=pk)
            for key, value in data.items():
                setattr(entry, key, value)
            if request.FILES.get("cover_file"):
                entry.cover_file = request.FILES["cover_file"]
            entry.save()
            messages.success(request, "归档条目已更新。")
        else:
            entry = ArchiveEntry(**data)
            if request.FILES.get("cover_file"):
                entry.cover_file = request.FILES["cover_file"]
            entry.save()
            messages.success(request, "归档条目已创建。")
        return redirect("workstation:archive")

    entries = ArchiveEntry.objects.all()
    edit_id = request.GET.get("edit")
    editing = ArchiveEntry.objects.filter(pk=edit_id).first() if edit_id else None
    today = timezone.localdate()
    return render(
        request,
        "workstation/archive.html",
        {
            "title": "归档",
            "entries": entries,
            "editing": editing,
            "module": "archive",
            "kind_choices": ArchiveEntry.KIND_CHOICES,
            "ai_year": today.year,
            "ai_month": today.month,
            "event_at_value": (
                timezone.localtime(editing.event_at).strftime("%Y-%m-%dT%H:%M")
                if editing and editing.event_at
                else timezone.localtime().strftime("%Y-%m-%dT%H:%M")
            ),
        },
    )


@staff_required
def appearance_view(request):
    appearance = SiteAppearance.get_solo()
    presets = [
        ("", "默认背景"),
        ("/static/wallpaper/asuka.jpg", "明日香"),
        ("/static/wallpaper/mitsuha.jpg", "三叶"),
        ("/static/wallpaper/rikka.jpg", "六花"),
        ("/static/wallpaper/mai.jpg", "麻衣学姐"),
        ("/static/wallpaper/yukino.jpg", "雪乃"),
        ("/static/wallpaper/yukino2.jpg", "雪乃 2"),
        ("/static/wallpaper/yukino3.jpg", "雪乃 3"),
    ]
    if request.method == "POST":
        action = request.POST.get("action", "save")
        if action == "upload":
            upload = request.FILES.get("wallpaper")
            if not upload:
                messages.error(request, "请选择要上传的图片。")
                return redirect("workstation:appearance")
            if upload.size > 100 * 1024 * 1024:
                messages.error(request, "壁纸需在 100MB 以内。")
                return redirect("workstation:appearance")
            content_type = getattr(upload, "content_type", "") or ""
            if content_type and not content_type.startswith("image/"):
                messages.error(request, "只支持图片文件。")
                return redirect("workstation:appearance")
            title = request.POST.get("title", "").strip() or upload.name.rsplit(".", 1)[0]
            paper = SiteWallpaper.objects.create(title=title[:80], image=upload)
            appearance.background = paper.url
            appearance.save(update_fields=["background", "updated"])
            messages.success(request, "壁纸已上传，并设为当前全站背景。")
            return redirect("workstation:appearance")

        if action == "delete_wallpaper":
            paper = SiteWallpaper.objects.filter(pk=request.POST.get("wallpaper_id")).first()
            if paper:
                url = paper.url
                if appearance.background == url:
                    appearance.background = ""
                    appearance.save(update_fields=["background", "updated"])
                paper.image.delete(save=False)
                paper.delete()
                messages.success(request, "已删除上传的壁纸。")
            return redirect("workstation:appearance")

        appearance.background = request.POST.get("background", "").strip()
        try:
            appearance.blur = max(0, min(20, int(request.POST.get("blur", 0))))
        except (TypeError, ValueError):
            appearance.blur = 0
        appearance.season = request.POST.get("season") == "on"
        appearance.save()
        messages.success(request, "全站外观已更新，访客将看到新的默认背景。")
        return redirect("workstation:appearance")

    uploads = SiteWallpaper.objects.all()
    return render(
        request,
        "workstation/appearance.html",
        {
            "title": "外观",
            "appearance": appearance,
            "presets": presets,
            "uploads": uploads,
            "module": "appearance",
        },
    )


@staff_required
def living_view(request):
    if request.method == "POST":
        action = request.POST.get("action", "save")
        if action == "delete":
            LivingDevice.objects.filter(pk=request.POST.get("id")).delete()
            messages.success(request, "已删除设备。")
            return redirect("workstation:living")

        pk = request.POST.get("id")
        name = request.POST.get("name", "").strip()
        if not name:
            messages.error(request, "设备名称不能为空。")
            return redirect("workstation:living")

        tagline = request.POST.get("tagline", "").strip()
        room = request.POST.get("room", "").strip() or "客厅"
        image = request.POST.get("image", "").strip()
        slug_in = request.POST.get("slug", "").strip()
        try:
            sort_order = int(request.POST.get("sort_order") or 0)
        except ValueError:
            sort_order = 0
        is_published = request.POST.get("is_published") == "on"
        specs_raw = request.POST.get("specs", "").strip()
        specs = []
        if specs_raw:
            try:
                parsed = json.loads(specs_raw)
                if isinstance(parsed, list):
                    specs = parsed
            except json.JSONDecodeError:
                for line in specs_raw.splitlines():
                    if ":" in line or "：" in line:
                        sep = "：" if "：" in line else ":"
                        label, value = line.split(sep, 1)
                        specs.append({"label": label.strip(), "value": value.strip()})

        if pk:
            device = get_object_or_404(LivingDevice, pk=pk)
            device.name = name
            device.tagline = tagline
            device.room = room
            device.image = image
            device.sort_order = sort_order
            device.is_published = is_published
            device.specs = specs
            if slug_in and slug_in != device.slug:
                device.slug = _unique_slug(LivingDevice, slug_in, exclude_pk=device.pk)
            if request.FILES.get("image_file"):
                device.image_file = request.FILES["image_file"]
            device.save()
            messages.success(request, "设备已更新。")
        else:
            device = LivingDevice(
                name=name,
                slug=_unique_slug(LivingDevice, slug_in or name),
                tagline=tagline,
                room=room,
                image=image,
                specs=specs,
                sort_order=sort_order,
                is_published=is_published,
            )
            if request.FILES.get("image_file"):
                device.image_file = request.FILES["image_file"]
            device.save()
            messages.success(request, "设备已添加。")
        return redirect("workstation:living")

    devices = LivingDevice.objects.all()
    edit_id = request.GET.get("edit")
    editing = LivingDevice.objects.filter(pk=edit_id).first() if edit_id else None
    return render(
        request,
        "workstation/living.html",
        {
            "title": "家居",
            "devices": devices,
            "editing": editing,
            "module": "living",
            "specs_text": json.dumps(editing.specs, ensure_ascii=False, indent=2)
            if editing
            else '[\n  {"label": "参数", "value": "数值"}\n]',
        },
    )


@staff_required
def ideas_view(request):
    if request.method == "POST":
        action = request.POST.get("action", "save")
        if action == "delete":
            IdeaNote.objects.filter(pk=request.POST.get("id")).delete()
            messages.success(request, "灵感已删除。")
            return redirect("workstation:ideas")

        pk = request.POST.get("id")
        title = request.POST.get("title", "").strip()
        body = request.POST.get("body", "").strip()
        is_published = request.POST.get("is_published") == "on"
        if not title or not body:
            messages.error(request, "标题和内容都不能为空。")
            return redirect("workstation:ideas")

        if pk:
            note = get_object_or_404(IdeaNote, pk=pk)
            note.title = title
            note.body = body
            note.is_published = is_published
            note.save()
            messages.success(request, "灵感已更新。")
        else:
            IdeaNote.objects.create(title=title, body=body, is_published=is_published)
            messages.success(request, "灵感已发布。")
        return redirect("workstation:ideas")

    notes = IdeaNote.objects.all()
    edit_id = request.GET.get("edit")
    editing = IdeaNote.objects.filter(pk=edit_id).first() if edit_id else None
    return render(
        request,
        "workstation/ideas.html",
        {"title": "灵感", "notes": notes, "editing": editing, "module": "ideas"},
    )


def _music_redirect(playlist_id=None):
    if playlist_id:
        return redirect(reverse("workstation:music") + f"?p={playlist_id}")
    return redirect("workstation:music")


@staff_required
def music_view(request):
    if request.method == "POST":
        action = request.POST.get("action", "save_playlist")
        focus_id = request.POST.get("playlist_id")

        if action == "delete_playlist":
            playlist = MusicPlaylist.objects.filter(pk=focus_id).first()
            urls = []
            if playlist:
                urls = [(track.src, track.cover) for track in playlist.tracks.all()]
                playlist.delete()
                for src, cover in urls:
                    remove_library_files(src, cover)
            messages.success(request, "歌单已删除。")
            return redirect("workstation:music")

        if action == "delete_track":
            track = MusicTrack.objects.filter(pk=request.POST.get("track_id")).select_related("playlist").first()
            pid = track.playlist_id if track else focus_id
            src = cover = ""
            if track:
                src, cover = track.src, track.cover
                track.delete()
                remove_library_files(src, cover)
            messages.success(request, "曲目已删除。")
            return _music_redirect(pid)

        if action == "upload_tracks":
            playlist = get_object_or_404(MusicPlaylist, pk=focus_id)
            uploads = request.FILES.getlist("files")
            wants_json = request.headers.get("X-Requested-With") == "fetch"
            if not uploads:
                if wants_json:
                    return JsonResponse({"ok": False, "added": [], "errors": ["没有收到文件。"]}, status=400)
                messages.error(request, "没有收到文件。")
                return _music_redirect(playlist.id)
            added, errors = [], []
            for uploaded in uploads:
                error, title = store_uploaded_track(playlist, uploaded)
                if error:
                    errors.append(error)
                else:
                    added.append(title)
            if added:
                messages.success(request, "已放入曲库：" + "、".join(added[:8]))
            if errors and (added or not wants_json):
                messages.error(request, "；".join(errors[:8]))
            if wants_json:
                return JsonResponse({"ok": bool(added), "added": added, "errors": errors})
            return _music_redirect(playlist.id)

        if action == "save_track":
            playlist = get_object_or_404(MusicPlaylist, pk=focus_id)
            title = request.POST.get("title", "").strip()
            src, src_error = resolve_track_src(request.POST.get("src", ""))
            if not title or src_error:
                messages.error(request, src_error or "歌名不能为空。")
                return _music_redirect(playlist.id)
            lyrics_raw = request.POST.get("lyrics", "").strip()
            lyrics = []
            if lyrics_raw:
                try:
                    lyrics = json.loads(lyrics_raw)
                except json.JSONDecodeError:
                    for i, line in enumerate(lyrics_raw.splitlines()):
                        line = line.strip()
                        if line:
                            lyrics.append({"t": i * 8, "text": line})
            base = slugify(title, allow_unicode=True) or "track"
            slug = base
            n = 2
            while playlist.tracks.filter(slug=slug).exists():
                slug = f"{base}-{n}"
                n += 1
            MusicTrack.objects.create(
                playlist=playlist,
                slug=slug,
                title=title,
                artist=request.POST.get("artist", "").strip(),
                src=src,
                cover=request.POST.get("cover", "").strip(),
                lyrics=lyrics,
                sort_order=playlist.tracks.count(),
                is_published=True,
            )
            messages.success(request, "曲目已添加。")
            return _music_redirect(playlist.id)

        if action == "import_netease":
            playlist = get_object_or_404(MusicPlaylist, pk=focus_id)
            raw_ids = request.POST.get("netease_ids", "")
            parts = [p.strip() for p in raw_ids.replace("，", ",").replace("\n", ",").split(",")]
            added = 0
            failed = []
            for part in parts:
                song_id = extract_song_id(part)
                if not song_id:
                    continue
                result = fetch_song(song_id)
                if not result.get("ok"):
                    failed.append(song_id)
                    continue
                slug = f"netease-{song_id}"
                if playlist.tracks.filter(slug=slug).exists():
                    continue
                MusicTrack.objects.create(
                    playlist=playlist,
                    slug=slug,
                    title=result["title"],
                    artist=result.get("artist") or "",
                    src=result["src"],
                    cover=result.get("cover") or "",
                    lyrics=result.get("lyrics") or [],
                    sort_order=playlist.tracks.count(),
                    is_published=True,
                )
                added += 1
                if result.get("warning"):
                    messages.warning(
                        request,
                        f"「{result['title']}」已导入，但{result['warning']}",
                    )
            if added:
                messages.success(request, f"已从网易云导入 {added} 首。")
            if failed:
                messages.error(request, f"导入失败 ID：{', '.join(failed[:8])}")
            if not added and not failed:
                messages.error(request, "没有可导入的歌曲（可能已存在或 ID 无效）。")
            return _music_redirect(playlist.id)

        if action == "toggle_playlist":
            playlist = get_object_or_404(MusicPlaylist, pk=focus_id)
            playlist.is_published = not playlist.is_published
            playlist.save(update_fields=["is_published"])
            messages.success(request, "展示状态已切换。")
            return _music_redirect(playlist.id)

        if action == "rename_playlist":
            playlist = get_object_or_404(MusicPlaylist, pk=focus_id)
            name = request.POST.get("name", "").strip()
            if name:
                playlist.name = name
                playlist.save(update_fields=["name"])
                messages.success(request, "歌单已重命名。")
            return _music_redirect(playlist.id)

        # create playlist
        name = request.POST.get("name", "").strip()
        if not name:
            messages.error(request, "歌单名称不能为空。")
            return redirect("workstation:music")
        playlist = MusicPlaylist.objects.create(
            slug=_unique_slug(MusicPlaylist, name),
            name=name,
            sort_order=MusicPlaylist.objects.count(),
            is_published=True,
        )
        messages.success(request, "歌单已创建。")
        return _music_redirect(playlist.id)

    playlists = list(MusicPlaylist.objects.prefetch_related("tracks").all())
    current_id = request.GET.get("p")
    current = None
    if current_id:
        current = next((p for p in playlists if str(p.id) == str(current_id)), None)
    if current is None and playlists:
        current = playlists[0]
    return render(
        request,
        "workstation/music.html",
        {
            "title": "歌单",
            "playlists": playlists,
            "current": current,
            "module": "music",
        },
    )


@staff_required
def content_view(request):
    if request.method == "POST":
        kind = request.POST.get("kind")
        pk = request.POST.get("id")
        if kind == "article":
            ArticlePost.objects.filter(pk=pk).delete()
            messages.success(request, "文章已删除。")
        elif kind == "message":
            Message.objects.filter(pk=pk).delete()
            messages.success(request, "留言已删除。")
        return redirect("workstation:content")

    articles = ArticlePost.objects.all()[:50]
    msgs = Message.objects.filter(parent__isnull=True)[:50]
    return render(
        request,
        "workstation/content.html",
        {
            "title": "内容清理",
            "articles": articles,
            "message_list": msgs,
            "module": "content",
        },
    )


@staff_required
def projects_view(request):
    from article.github_projects import fetch_recent_projects

    payload = fetch_recent_projects()
    remote = payload.get("projects") or []

    if request.method == "POST":
        action = request.POST.get("action", "save")
        if action == "sync":
            existing = {p.repo_name for p in ProjectShowcase.objects.all()}
            created = 0
            for repo in remote:
                name = repo.get("name") or ""
                if name and name not in existing:
                    ProjectShowcase.objects.create(
                        repo_name=name,
                        display_name=name,
                        is_visible=True,
                        sort_order=100,
                    )
                    created += 1
            messages.success(request, f"已同步，新增 {created} 个项目条目。")
            return redirect("workstation:projects")

        if action == "delete":
            ProjectShowcase.objects.filter(pk=request.POST.get("id")).delete()
            messages.success(request, "已移除展示配置。")
            return redirect("workstation:projects")

        pk = request.POST.get("id")
        item = get_object_or_404(ProjectShowcase, pk=pk)
        item.display_name = request.POST.get("display_name", "").strip()
        item.is_visible = request.POST.get("is_visible") == "on"
        item.is_pinned = request.POST.get("is_pinned") == "on"
        try:
            item.sort_order = int(request.POST.get("sort_order") or 0)
        except ValueError:
            item.sort_order = 0
        item.note = request.POST.get("note", "").strip()
        item.save()
        messages.success(request, f"「{item.repo_name}」已更新。")
        return redirect("workstation:projects")

    showcases = ProjectShowcase.objects.all()
    return render(
        request,
        "workstation/projects.html",
        {
            "title": "项目橱窗",
            "showcases": showcases,
            "remote_count": len(remote),
            "projects_error": payload.get("error", ""),
            "module": "projects",
        },
    )


# ---- public JSON APIs used by front pages ----

@require_GET
def api_living(request):
    data = [
        d.to_public()
        for d in LivingDevice.objects.filter(is_published=True)
    ]
    return JsonResponse(data, safe=False)


@require_GET
def api_music(request):
    data = [
        p.to_public()
        for p in MusicPlaylist.objects.filter(is_published=True).prefetch_related("tracks")
    ]
    return JsonResponse(data, safe=False)


@require_GET
def api_appearance(request):
    a = SiteAppearance.get_solo()
    return JsonResponse(
        {"background": a.background or "", "blur": a.blur, "season": a.season}
    )


@require_GET
def api_netease(request):
    """Public helper: resolve NetEase song ids → playable track payloads."""
    ids_raw = request.GET.get("ids") or request.GET.get("id") or ""
    ids = [extract_song_id(x) for x in ids_raw.replace("，", ",").split(",")]
    ids = [i for i in ids if i]
    if not ids:
        return JsonResponse({"error": "missing ids"}, status=400)
    results = [fetch_song(i) for i in ids[:20]]
    return JsonResponse(results, safe=False)


@require_GET
def api_netease_audio(request, song_id):
    """Resolve playable NetEase CDN URL (official outer url is broken)."""
    from django.http import HttpResponse

    song_id = extract_song_id(song_id)
    if not song_id:
        return HttpResponse("invalid id", status=400)

    stream_url = resolve_stream_url(song_id)
    if not stream_url:
        return HttpResponse(
            "暂无法获取试听（可能需会员或版权限制）",
            status=404,
            content_type="text/plain; charset=utf-8",
        )
    # 302 到真实音源，浏览器 audio 可跟随跳转
    return redirect(stream_url)


@require_http_methods(["POST"])
def api_chat(request):
    """Pixel-cat chat endpoint."""
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    message = payload.get("message") or request.POST.get("message") or ""
    result = reply_as_cat(message)
    status = 200 if result.get("ok") else 502
    return JsonResponse(
        {"reply": result.get("reply") or "", "error": result.get("error") or ""},
        status=status,
    )


@staff_required
@require_GET
def api_netease_preview(request):
    song_id = extract_song_id(request.GET.get("id") or "")
    if not song_id:
        return JsonResponse({"ok": False, "error": "请输入歌曲 ID 或链接"})
    return JsonResponse(fetch_song(song_id))
