from django.db import models
from django.utils import timezone


class SiteAppearance(models.Model):
    """Singleton-ish site-wide look defaults for visitors."""

    background = models.CharField(max_length=255, blank=True, default="")
    blur = models.PositiveSmallIntegerField(default=0)
    season = models.BooleanField(default=False)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "站点外观"
        verbose_name_plural = "站点外观"

    def __str__(self):
        return "站点外观"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj


class SiteWallpaper(models.Model):
    """Uploaded wallpapers available for site-wide appearance."""

    title = models.CharField(max_length=80, blank=True)
    image = models.ImageField(upload_to="wallpapers/%Y%m/")
    created = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-created",)
        verbose_name = "上传壁纸"
        verbose_name_plural = "上传壁纸"

    def __str__(self):
        return self.title or self.image.name

    @property
    def url(self):
        return self.image.url if self.image else ""


class LivingDevice(models.Model):
    slug = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    tagline = models.CharField(max_length=200, blank=True)
    image = models.CharField(max_length=255, blank=True, help_text="静态路径或上传后的 URL")
    image_file = models.ImageField(upload_to="living/%Y%m/", blank=True)
    specs = models.JSONField(default=list, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "智能家居"
        verbose_name_plural = "智能家居"

    def __str__(self):
        return self.name

    def image_url(self):
        if self.image_file:
            return self.image_file.url
        return self.image or ""

    def to_public(self):
        return {
            "id": self.slug,
            "name": self.name,
            "tagline": self.tagline,
            "image": self.image_url(),
            "specs": self.specs or [],
        }


class IdeaNote(models.Model):
    title = models.CharField(max_length=160)
    body = models.TextField()
    is_published = models.BooleanField(default=True)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created",)
        verbose_name = "灵感"
        verbose_name_plural = "灵感"

    def __str__(self):
        return self.title


class MusicPlaylist(models.Model):
    slug = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    sort_order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "歌单"
        verbose_name_plural = "歌单"

    def __str__(self):
        return self.name

    def to_public(self):
        return {
            "id": self.slug,
            "name": self.name,
            "tracks": [
                t.to_public()
                for t in self.tracks.filter(is_published=True).order_by("sort_order", "id")
            ],
        }


class MusicTrack(models.Model):
    playlist = models.ForeignKey(
        MusicPlaylist, on_delete=models.CASCADE, related_name="tracks"
    )
    slug = models.SlugField(max_length=80)
    title = models.CharField(max_length=160)
    artist = models.CharField(max_length=120, blank=True)
    src = models.CharField(max_length=500, help_text="音频 URL 或 /static/ 路径")
    cover = models.CharField(max_length=500, blank=True)
    lyrics = models.JSONField(default=list, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "id")
        unique_together = (("playlist", "slug"),)
        verbose_name = "曲目"
        verbose_name_plural = "曲目"

    def __str__(self):
        return self.title

    def to_public(self):
        from .netease import extract_song_id_from_src, proxy_audio_path

        src = self.src or ""
        # 旧版官方 outer 外链已失效 → 走站内代理
        song_id = extract_song_id_from_src(src)
        if not song_id and (self.slug or "").startswith("netease-"):
            song_id = "".join(ch for ch in self.slug[8:] if ch.isdigit())
        if song_id:
            src = proxy_audio_path(song_id)
        return {
            "id": self.slug,
            "title": self.title,
            "artist": self.artist,
            "src": src,
            "cover": self.cover,
            "lyrics": self.lyrics or [],
        }


class ProjectShowcase(models.Model):
    repo_name = models.CharField(max_length=120, unique=True)
    display_name = models.CharField(max_length=160, blank=True)
    is_visible = models.BooleanField(default=True)
    is_pinned = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ("-is_pinned", "sort_order", "repo_name")
        verbose_name = "项目展示"
        verbose_name_plural = "项目展示"

    def __str__(self):
        return self.display_name or self.repo_name


class ArchiveEntry(models.Model):
    """Manual / AI-authored cards on the archive river."""

    KIND_MANUAL = "manual"
    KIND_ARTICLE = "article"
    KIND_MESSAGE = "message"
    KIND_PROJECT = "project"
    KIND_MUSIC = "music"
    KIND_IDEA = "idea"
    KIND_LIVING = "living"
    KIND_AI = "ai"
    KIND_CHOICES = (
        (KIND_MANUAL, "手写"),
        (KIND_ARTICLE, "文章"),
        (KIND_MESSAGE, "留言"),
        (KIND_PROJECT, "项目"),
        (KIND_MUSIC, "音乐"),
        (KIND_IDEA, "灵感"),
        (KIND_LIVING, "家居"),
        (KIND_AI, "AI 总结"),
    )

    SOURCE_MANUAL = "manual"
    SOURCE_AI = "ai"
    SOURCE_CHOICES = (
        (SOURCE_MANUAL, "手打"),
        (SOURCE_AI, "AI"),
    )

    AI_IDLE = "idle"
    AI_PENDING = "pending"
    AI_DONE = "done"
    AI_ERROR = "error"
    AI_STATUS_CHOICES = (
        (AI_IDLE, "未调用"),
        (AI_PENDING, "生成中"),
        (AI_DONE, "已完成"),
        (AI_ERROR, "失败"),
    )

    title = models.CharField(max_length=160)
    snippet = models.CharField(max_length=240, blank=True, help_text="卡片上的短摘要")
    body = models.TextField(blank=True, help_text="完整内容 / AI 总结正文")
    cover = models.CharField(max_length=500, blank=True)
    cover_file = models.ImageField(upload_to="archive/%Y%m/", blank=True)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_MANUAL)
    event_at = models.DateTimeField(default=timezone.now, help_text="时间线上的落点")
    url = models.CharField(max_length=500, blank=True)
    views = models.PositiveIntegerField(default=0)
    likes = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    ai_prompt = models.TextField(blank=True, help_text="给 AI 的提示词 / 素材说明")
    ai_status = models.CharField(max_length=20, choices=AI_STATUS_CHOICES, default=AI_IDLE)
    ai_raw = models.TextField(blank=True, help_text="AI 原始返回，便于排查")
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-event_at", "-id")
        verbose_name = "归档条目"
        verbose_name_plural = "归档条目"

    def __str__(self):
        return self.title

    def cover_url(self):
        if self.cover_file:
            return self.cover_file.url
        return self.cover or ""

    def to_public(self):
        return {
            "kind": self.kind,
            "id": f"e-{self.id}",
            "title": self.title,
            "snippet": self.snippet or (self.body[:42] + "…" if len(self.body) > 42 else self.body),
            "cover": self.cover_url(),
            "date": "",  # filled by builder with formatted event_at
            "ts": self.event_at.timestamp() if self.event_at else 0,
            "url": self.url or "#",
            "views": self.views,
            "likes": self.likes,
            "source": self.source,
        }
