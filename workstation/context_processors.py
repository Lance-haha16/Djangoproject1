from .models import SiteAppearance


def site_appearance(request):
    try:
        appearance = SiteAppearance.get_solo()
        return {
            "site_appearance": {
                "background": appearance.background or "",
                "blur": appearance.blur,
                "season": appearance.season,
            }
        }
    except Exception:
        return {
            "site_appearance": {
                "background": "",
                "blur": 0,
                "season": False,
            }
        }
