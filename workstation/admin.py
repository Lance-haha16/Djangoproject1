from django.contrib import admin

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


@admin.register(ArchiveEntry)
class ArchiveEntryAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "source", "event_at", "is_published", "ai_status")
    list_filter = ("kind", "source", "is_published", "ai_status")
    search_fields = ("title", "snippet", "body")


@admin.register(SiteWallpaper)
class SiteWallpaperAdmin(admin.ModelAdmin):
    list_display = ("title", "image", "created")


@admin.register(SiteAppearance)
class SiteAppearanceAdmin(admin.ModelAdmin):
    list_display = ("background", "blur", "season", "updated")


@admin.register(LivingDevice)
class LivingDeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "sort_order", "is_published", "updated")
    list_editable = ("sort_order", "is_published")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(IdeaNote)
class IdeaNoteAdmin(admin.ModelAdmin):
    list_display = ("title", "is_published", "created", "updated")
    list_filter = ("is_published",)
    search_fields = ("title", "body")


class MusicTrackInline(admin.TabularInline):
    model = MusicTrack
    extra = 1


@admin.register(MusicPlaylist)
class MusicPlaylistAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "sort_order", "is_published")
    list_editable = ("sort_order", "is_published")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [MusicTrackInline]


@admin.register(ProjectShowcase)
class ProjectShowcaseAdmin(admin.ModelAdmin):
    list_display = ("repo_name", "display_name", "is_visible", "is_pinned", "sort_order")
    list_editable = ("is_visible", "is_pinned", "sort_order")
