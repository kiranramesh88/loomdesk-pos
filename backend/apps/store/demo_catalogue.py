"""The demo catalogue: products with variants and opening stock, and suppliers.

Shared by `seed_demo` (a development store, with its demo accounts) and `load_demo_catalogue` (a hosted
demo store, with no accounts). Nothing here creates a user, a password or a PIN.
"""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.utils.text import slugify

from apps.catalog.models import Product, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.store import seed_data
from apps.store.reference import ensure_reference_data
from apps.suppliers.models import Supplier

PHOTO_DIR = settings.BASE_DIR / "seed" / "photos"


def ean13(first12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(first12))
    return first12 + str((10 - total % 10) % 10)


def split_stock(total: int, parts: int) -> list[int]:
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


def attach_photo(product: Product, code: str, photo_dir: Path) -> bool:
    photo = photo_dir / f"{code}.jpg"
    if not photo.exists():
        return False
    old = product.image.name
    with photo.open("rb") as fh:
        product.image.save(f"{slugify(product.name)}.jpg", File(fh), save=True)
    # Like the image endpoint: a replaced file is deleted, not left behind in media/.
    if old and old != product.image.name:
        product.image.storage.delete(old)
    return True


def load_catalogue(*, actor=None, photo_dir: Path = PHOTO_DIR) -> int:
    """Create the demo products, their variants and opening stock. Returns how many have a photo."""
    _, categories = ensure_reference_data()
    photos = 0
    for p_index, (code, name, cat, sku, price, cost, stock, threshold, sizes, colours) in enumerate(
        seed_data.PRODUCTS, start=1
    ):
        product = Product.objects.create(
            name=name,
            sku=sku,
            category=categories[cat],
            base_price_paise=price * 100,
            cost_price_paise=cost * 100,
        )
        photos += attach_photo(product, code, photo_dir)

        combos = [(s, c) for s in sizes for c in colours]
        reorder = max(1, threshold // len(combos))
        for v_index, ((size, colour), qty) in enumerate(zip(combos, split_stock(stock, len(combos))), start=1):
            variant = Variant.objects.create(
                product=product,
                size=size,
                colour=colour,
                sku=f"{sku}-{slugify(size).upper()}-{colour[:3].upper()}",
                barcode=ean13(f"890100{p_index:03d}{v_index:03d}"),
                reorder_level=reorder,
            )
            if qty:
                record_movement(
                    variant=variant,
                    type=StockMovement.Type.OPENING,
                    quantity_delta=qty,
                    actor=actor,
                    reason="Demo opening stock",
                )
    return photos


def load_suppliers() -> None:
    for name, category, phone, email in seed_data.SUPPLIERS:
        Supplier.objects.create(name=name, category=category, phone=phone, email=email)


def restore_photos(photo_dir: Path = PHOTO_DIR) -> tuple[int, int]:
    """Put back the demo products' photo files where their records point, if the files are gone.

    For a host with no persistent disk, where media files vanish at each restart but the database keeps
    the paths. Only writes missing files; records, and products without a photo, are never changed.
    Returns (restored, still missing).
    """
    demo = {sku: code for code, _name, _cat, sku, *_rest in seed_data.PRODUCTS}
    restored = missing = 0
    for product in Product.objects.exclude(image=""):
        storage = product.image.storage
        if storage.exists(product.image.name):
            continue
        photo = photo_dir / f"{demo.get(product.sku, '')}.jpg"
        if product.sku in demo and photo.exists():
            with photo.open("rb") as fh:
                saved = storage.save(product.image.name, File(fh))
            if saved == product.image.name:
                restored += 1
                continue
            storage.delete(saved)  # never leave a stray copy under another name
        missing += 1
    return restored, missing
