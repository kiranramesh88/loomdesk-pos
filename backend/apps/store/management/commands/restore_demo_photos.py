from pathlib import Path

from django.core.management.base import BaseCommand

from apps.store import demo_catalogue


class Command(BaseCommand):
    help = (
        "Put back the demo products' photo files if they're missing, as after a restart on a host with no "
        "persistent disk. Writes only missing files; never changes a record. Safe to run at every start."
    )

    def add_arguments(self, parser):
        parser.add_argument("--photos", type=Path, default=demo_catalogue.PHOTO_DIR, help="Folder of demo photos (default: seed/photos/).")

    def handle(self, *args, **options):
        restored, missing = demo_catalogue.restore_photos(options["photos"])
        self.stdout.write(f"Demo photos restored: {restored}.")
        if missing:
            self.stdout.write(self.style.WARNING(
                f"  {missing} product photo(s) are missing and can't be restored: uploaded photos need persistent storage."
            ))
