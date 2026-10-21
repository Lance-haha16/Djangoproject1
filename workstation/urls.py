from django.urls import path

from . import views

app_name = "workstation"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("appearance/", views.appearance_view, name="appearance"),
    path("living/", views.living_view, name="living"),
    path("ideas/", views.ideas_view, name="ideas"),
    path("music/", views.music_view, name="music"),
    path("content/", views.content_view, name="content"),
    path("projects/", views.projects_view, name="projects"),
    path("archive/", views.archive_view, name="archive"),
    path("api/living/", views.api_living, name="api_living"),
    path("api/music/", views.api_music, name="api_music"),
    path("api/appearance/", views.api_appearance, name="api_appearance"),
    path("api/netease/", views.api_netease, name="api_netease"),
    path("api/netease/preview/", views.api_netease_preview, name="api_netease_preview"),
    path(
        "api/netease/audio/<str:song_id>/",
        views.api_netease_audio,
        name="api_netease_audio",
    ),
    path("api/chat/", views.api_chat, name="api_chat"),
]
