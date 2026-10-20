import io
import urllib.request

from django.conf import settings
from django.core.management.base import BaseCommand
from PIL import Image

from apps.store.seed_data import PHOTO_URLS

PHOTO_DIR = settings.BASE_DIR / "seed" / "photos"
MAX_BYTES = 8 * 1024 * 1024


class Command(BaseCommand):
    help = "Download the demo product photos into backend/seed/photos/ (re-encoded as JPEG)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Download again even if a file is already present.")

    def handle(self, *args, **options):
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        for code, url in PHOTO_URLS.items():
            target = PHOTO_DIR / f"{code}.jpg"
            if target.exists() and not options["force"]:
                self.stdout.write(f"{code}: already present")
                continue
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "loomdesk-seed/1.0"})
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError("file too large")
                # Decode and re-encode so only plain pixel data is stored.
                with Image.open(io.BytesIO(data)) as img:
                    img.load()
                    img.convert("RGB").save(target, "JPEG", quality=88)
                self.stdout.write(self.style.SUCCESS(f"{code}: saved"))
            except Exception as exc:  # noqa: BLE001 — report and carry on with the rest
                self.stderr.write(f"{code}: failed ({exc})")
