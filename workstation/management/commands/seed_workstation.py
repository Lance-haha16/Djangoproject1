import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from workstation.models import LivingDevice, MusicPlaylist, MusicTrack, SiteAppearance


class Command(BaseCommand):
    help = "Seed living devices and music playlists from existing static JSON files."

    def handle(self, *args, **options):
        SiteAppearance.get_solo()
        self._seed_living()
        self._seed_music()
        self.stdout.write(self.style.SUCCESS("Workstation seed complete."))

    def _seed_living(self):
        path = Path(settings.BASE_DIR) / "static" / "living" / "devices.json"
        if not path.exists():
            self.stdout.write("devices.json missing, skip living.")
            return
        data = json.loads(path.read_text(encoding="utf-8"))
        for i, item in enumerate(data):
            LivingDevice.objects.update_or_create(
                slug=item.get("id") or f"device-{i}",
                defaults={
                    "name": item.get("name") or f"设备 {i}",
                    "tagline": item.get("tagline") or "",
                    "image": item.get("image") or "",
                    "specs": item.get("specs") or [],
                    "sort_order": i,
                    "is_published": True,
                },
            )
        self.stdout.write(f"Living devices: {len(data)}")

    def _seed_music(self):
        path = Path(settings.BASE_DIR) / "static" / "music" / "playlists.json"
        if not path.exists():
            self.stdout.write("playlists.json missing, skip music.")
            return
        data = json.loads(path.read_text(encoding="utf-8"))
        for i, playlist in enumerate(data):
            pl, _ = MusicPlaylist.objects.update_or_create(
                slug=playlist.get("id") or f"playlist-{i}",
                defaults={
                    "name": playlist.get("name") or f"歌单 {i}",
                    "sort_order": i,
                    "is_published": True,
                },
            )
            for j, track in enumerate(playlist.get("tracks") or []):
                MusicTrack.objects.update_or_create(
                    playlist=pl,
                    slug=track.get("id") or f"track-{j}",
                    defaults={
                        "title": track.get("title") or f"曲目 {j}",
                        "artist": track.get("artist") or "",
                        "src": track.get("src") or "",
                        "cover": track.get("cover") or "",
                        "lyrics": track.get("lyrics") or [],
                        "sort_order": j,
                        "is_published": True,
                    },
                )
        self.stdout.write(f"Music playlists: {len(data)}")
