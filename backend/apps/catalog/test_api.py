"""Catalogue API: permissions, search/filter/sort, validation, variants and stock integrity."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.catalog.validators import gs1_check_digit_ok
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement

PRODUCTS_URL = "/api/v1/catalog/products/"


def _user(role):
    return User.objects.create_user(email=f"{role}@example.com", password="x", full_name=f"Test {role}", role=role)


def _client_as(role):
    client = APIClient()
    client.force_authenticate(_user(role))
    return client


@pytest.fixture
def admin(db):
    return _client_as(Role.ADMIN)


@pytest.fixture
def shirts(db):
    rule = TaxRule.objects.create(
        name="Garments", kind="price_band", threshold_paise=2_500_00, lower_rate_bp=500, upper_rate_bp=1800
    )
    return Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)


def _payload(cat, **overrides):
    body = {
        "name": "Classic Cotton Shirt",
        "sku": "SH-CT-001",
        "description": "",
        "category": cat.pk,
        "base_price_paise": 1199_00,
        "cost_price_paise": 620_00,
        "variants": [
            {"size": "M", "colour": "Blue", "sku": "SH-CT-001-M-BLU", "barcode": "8901000010018", "opening_stock": 4},
            {"size": "L", "colour": "Blue", "sku": "SH-CT-001-L-BLU", "barcode": "", "opening_stock": 0},
        ],
    }
    body.update(overrides)
    return body


def _create(client, cat, **overrides):
    response = client.post(PRODUCTS_URL, _payload(cat, **overrides), format="json")
    assert response.status_code == 201, response.json()
    return response.json()


def _fields(response):
    assert response.status_code == 400, response.json()
    body = response.json()
    assert body["code"] == "invalid"
    return body["fields"]


def test_gs1_check_digit():
    assert gs1_check_digit_ok("4006381333931")
    assert not gs1_check_digit_ok("4006381333932")
    assert gs1_check_digit_ok("96385074")  # EAN-8


# Authorization


def test_catalogue_requires_authentication(db):
    response = APIClient().get(PRODUCTS_URL)
    assert response.status_code == 403
    assert response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("role", [Role.SENIOR_CASHIER, Role.CASHIER])
@pytest.mark.parametrize(
    "method,url",
    [
        ("get", PRODUCTS_URL),
        ("post", PRODUCTS_URL),
        ("get", "/api/v1/catalog/categories/"),
        ("get", "/api/v1/catalog/tax-rules/"),
    ],
)
def test_catalogue_management_is_admin_only(shirts, role, method, url):
    client = _client_as(role)
    response = getattr(client, method)(url, _payload(shirts) if method == "post" else None, format="json")
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"
    assert not Product.objects.exists()


@pytest.mark.parametrize("role", [Role.SENIOR_CASHIER, Role.CASHIER])
def test_non_admins_cannot_read_edit_or_upload(admin, shirts, role):
    product = _create(admin, shirts)
    client = _client_as(role)
    url = f"{PRODUCTS_URL}{product['id']}/"
    assert client.get(url).status_code == 403
    assert client.patch(url, {"name": "Hacked"}, format="json").status_code == 403
    assert client.delete(f"{url}image/").status_code == 403
    assert Product.objects.get().name == "Classic Cotton Shirt"


def test_products_cannot_be_deleted(admin, shirts):
    product = _create(admin, shirts)
    assert admin.delete(f"{PRODUCTS_URL}{product['id']}/").status_code == 405
    assert Product.objects.count() == 1


def test_writes_still_require_csrf_with_session_auth(shirts):
    _user(Role.ADMIN)
    client = APIClient(enforce_csrf_checks=True)
    assert client.login(email="admin@example.com", password="x")
    response = client.post(PRODUCTS_URL, _payload(shirts), format="json")
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
    assert not Product.objects.exists()


# Create, read and list


def test_create_records_opening_stock_as_movements(admin, shirts):
    body = _create(admin, shirts, sku="sh-ct-001")
    assert body["sku"] == "SH-CT-001"  # normalised
    assert body["effective_hsn_code"] == "6205"
    assert body["effective_tax_rule"]["summary"] == "5% up to ₹2,500 per unit, 18% above"
    medium, large = body["variants"]
    assert (medium["on_hand"], medium["has_history"], medium["barcode"]) == (4, True, "8901000010018")
    assert (large["on_hand"], large["has_history"], large["barcode"]) == (0, False, None)
    movement = StockMovement.objects.get()
    assert (movement.type, movement.quantity_delta, movement.balance_after) == ("opening", 4, 4)
    assert movement.actor.role == Role.ADMIN
    assert body["recent_movements"][0]["variant_label"] == "M / Blue"


def test_list_summarises_active_variant_stock(admin, shirts):
    body = _create(admin, shirts)
    product = Product.objects.get(pk=body["id"])
    Variant.objects.create(
        product=product, size="XL", colour="Blue", sku="SH-CT-001-XL-BLU", price_override_paise=1299_00
    )
    Variant.objects.create(product=product, size="XS", colour="Blue", sku="SH-CT-001-XS-BLU", is_active=False)
    row = admin.get(PRODUCTS_URL).json()["results"][0]
    assert row["variant_count"] == 3  # the inactive XS is left out
    assert row["total_on_hand"] == 4
    assert (row["min_price_paise"], row["max_price_paise"]) == (1199_00, 1299_00)
    # L and XL are out, so the product as a whole is running low.
    assert row["stock_state"] == "low_stock"
    assert row["category"] == {"id": shirts.pk, "name": "Shirts"}


@pytest.fixture
def catalogue(admin, shirts):
    rule = TaxRule.objects.create(name="Std", kind="flat", flat_rate_bp=1800)
    bags = Category.objects.create(name="Accessories", slug="accessories", hsn_code="4202", tax_rule=rule)
    _create(admin, shirts)
    _create(
        admin,
        bags,
        name="Canvas Tote",
        sku="AC-TT-019",
        base_price_paise=599_00,
        variants=[
            {"size": "One size", "colour": "Sand", "sku": "AC-TT-019-SAN", "barcode": "4006381333931", "opening_stock": 9}
        ],
    )
    _create(
        admin,
        shirts,
        name="Relaxed Tee",
        sku="TS-RF-031",
        base_price_paise=799_00,
        status="inactive",
        variants=[{"size": "S", "colour": "Lilac", "sku": "TS-RF-031-S-LIL", "opening_stock": 0}],
    )
    return {"shirts": shirts, "bags": bags}


def _names(client, query=""):
    return [row["name"] for row in client.get(f"{PRODUCTS_URL}?{query}").json()["results"]]


@pytest.mark.parametrize(
    "query,expected",
    [
        ("", ["Canvas Tote", "Classic Cotton Shirt", "Relaxed Tee"]),
        ("q=tote", ["Canvas Tote"]),
        ("q=sh-ct", ["Classic Cotton Shirt"]),  # product SKU
        ("q=019-SAN", ["Canvas Tote"]),  # variant SKU
        ("q=4006381333931", ["Canvas Tote"]),  # barcode, exact
        ("q=400638", []),  # barcodes are matched whole, as a scanner sends them
        ("status=inactive", ["Relaxed Tee"]),
        ("stock=out_of_stock", ["Relaxed Tee"]),
        ("stock=in_stock", ["Canvas Tote"]),
        ("ordering=-price", ["Classic Cotton Shirt", "Relaxed Tee", "Canvas Tote"]),
        ("ordering=-stock", ["Canvas Tote", "Classic Cotton Shirt", "Relaxed Tee"]),
    ],
)
def test_search_filter_and_sort(catalogue, admin, query, expected):
    assert _names(admin, query) == expected


def test_category_filter_and_pagination(catalogue, admin):
    assert _names(admin, f"category={catalogue['bags'].pk}") == ["Canvas Tote"]
    page = admin.get(f"{PRODUCTS_URL}?page_size=2&page=2").json()
    assert page["count"] == 3
    assert [row["name"] for row in page["results"]] == ["Relaxed Tee"]


def test_search_matching_several_variants_returns_one_row(admin, shirts):
    _create(admin, shirts)
    body = admin.get(f"{PRODUCTS_URL}?q=SH-CT-001").json()
    assert body["count"] == 1
    assert body["results"][0]["total_on_hand"] == 4


def test_unknown_filter_values_are_rejected(catalogue, admin):
    assert _fields(admin.get(f"{PRODUCTS_URL}?status=archived")).keys() == {"status"}
    assert _fields(admin.get(f"{PRODUCTS_URL}?category=9999")).keys() == {"category"}


# Validation


@pytest.mark.parametrize(
    "overrides,field",
    [
        ({"name": "   "}, "name"),
        ({"base_price_paise": 0}, "base_price_paise"),
        ({"base_price_paise": -100}, "base_price_paise"),
        ({"base_price_paise": 10_00_00_000_01}, "base_price_paise"),
        ({"base_price_paise": "12.50"}, "base_price_paise"),
        ({"cost_price_paise": -1}, "cost_price_paise"),
        ({"sku": "bad sku!"}, "sku"),
        ({"hsn_code": "62"}, "hsn_code"),
        ({"category": 9999}, "category"),
        ({"variants": []}, "variants"),
    ],
)
def test_invalid_product_fields(admin, shirts, overrides, field):
    assert field in _fields(admin.post(PRODUCTS_URL, _payload(shirts, **overrides), format="json"))
    assert not Product.objects.exists()


def test_patched_variant_rows_are_validated_in_full(admin, shirts):
    body = _create(admin, shirts)
    fields = _fields(admin.patch(f"{PRODUCTS_URL}{body['id']}/", {"variants": [{"size": "XL"}]}, format="json"))
    assert {"variants.0.colour", "variants.0.sku"} <= fields.keys()


def test_variants_are_required_on_create(admin, shirts):
    body = _payload(shirts)
    del body["variants"]
    assert "variants" in _fields(admin.post(PRODUCTS_URL, body, format="json"))


@pytest.mark.parametrize(
    "row,field",
    [
        ({"opening_stock": -1}, "opening_stock"),
        ({"price_override_paise": 0}, "price_override_paise"),
        ({"barcode": "8901000010019"}, "barcode"),  # bad check digit
        ({"barcode": "ab"}, "barcode"),
        ({"sku": ""}, "sku"),
        ({"size": ""}, "size"),
        ({"reorder_level": -2}, "reorder_level"),
    ],
)
def test_invalid_variant_rows_point_at_the_field(admin, shirts, row, field):
    variants = _payload(shirts)["variants"]
    variants[1].update(row)
    fields = _fields(admin.post(PRODUCTS_URL, _payload(shirts, variants=variants), format="json"))
    assert f"variants.1.{field}" in fields
    assert not Product.objects.exists() and not StockMovement.objects.exists()


def test_duplicates_within_a_request(admin, shirts):
    variants = _payload(shirts)["variants"]
    variants[1].update(size="m", colour="blue", sku="sh-ct-001-m-blu", barcode="8901000010018")
    fields = _fields(admin.post(PRODUCTS_URL, _payload(shirts, variants=variants), format="json"))
    assert fields["variants.1.colour"] == ["Variant 1 already uses this size and colour."]
    assert fields["variants.1.sku"] == ["Variant 1 already uses this SKU."]
    assert fields["variants.1.barcode"] == ["Variant 1 already uses this barcode."]


def test_duplicate_product_sku(admin, shirts):
    _create(admin, shirts)
    fields = _fields(admin.post(PRODUCTS_URL, _payload(shirts, name="Copy"), format="json"))
    assert fields["sku"] == ["Another product already uses this SKU."]
    assert Product.objects.count() == 1


def test_product_and_variant_clashes_are_reported_together(admin, shirts):
    _create(admin, shirts)
    variants = [{"size": "S", "colour": "Red", "sku": "SH-CT-009-S-RED", "barcode": "8901000010018"}]
    fields = _fields(admin.post(PRODUCTS_URL, _payload(shirts, name="Copy", variants=variants), format="json"))
    assert fields.keys() == {"sku", "variants.0.barcode"}


def test_duplicates_across_products(admin, shirts):
    _create(admin, shirts)
    variants = [{"size": "S", "colour": "Red", "sku": "SH-CT-001-M-BLU", "barcode": "8901000010018"}]
    fields = _fields(admin.post(PRODUCTS_URL, _payload(shirts, sku="SH-CT-002", variants=variants), format="json"))
    assert fields["variants.0.sku"] == ["Classic Cotton Shirt already uses this SKU."]
    assert fields["variants.0.barcode"] == ["Classic Cotton Shirt already uses this barcode."]
    assert Product.objects.count() == 1


def test_active_product_needs_an_active_variant(admin, shirts):
    variants = [dict(row, is_active=False) for row in _payload(shirts)["variants"]]
    assert "variants" in _fields(admin.post(PRODUCTS_URL, _payload(shirts, variants=variants), format="json"))


# Updates and stock integrity


def _variants_for_update(body):
    keep = ["id", "size", "colour", "sku", "barcode", "price_override_paise", "reorder_level", "is_active"]
    return [{key: row[key] for key in keep} for row in body["variants"]]


def test_update_edits_details_without_touching_stock(admin, shirts):
    body = _create(admin, shirts)
    variants = _variants_for_update(body)
    variants[0]["price_override_paise"] = 1249_00
    variants.append({"size": "XL", "colour": "Blue", "sku": "SH-CT-001-XL-BLU", "opening_stock": 3})
    response = admin.patch(
        f"{PRODUCTS_URL}{body['id']}/",
        {"name": "Cotton Shirt", "base_price_paise": 1299_00, "variants": variants},
        format="json",
    )
    assert response.status_code == 200, response.json()
    updated = response.json()
    assert updated["name"] == "Cotton Shirt"
    assert [v["on_hand"] for v in updated["variants"]] == [4, 0, 3]
    assert [v["price_paise"] for v in updated["variants"]] == [1249_00, 1299_00, 1299_00]
    assert list(StockMovement.objects.order_by("id").values_list("quantity_delta", flat=True)) == [4, 3]


def test_update_ignores_on_hand_in_payload(admin, shirts):
    body = _create(admin, shirts)
    variants = _variants_for_update(body)
    variants[1]["on_hand"] = 500
    response = admin.patch(f"{PRODUCTS_URL}{body['id']}/", {"variants": variants}, format="json")
    assert response.status_code == 200
    assert Variant.objects.get(pk=variants[1]["id"]).on_hand == 0
    assert StockMovement.objects.count() == 1


def test_existing_variants_reject_opening_stock(admin, shirts):
    body = _create(admin, shirts)
    variants = _variants_for_update(body)
    variants[1]["opening_stock"] = 10
    fields = _fields(admin.patch(f"{PRODUCTS_URL}{body['id']}/", {"variants": variants}, format="json"))
    assert "variants.1.opening_stock" in fields
    assert Variant.objects.get(pk=variants[1]["id"]).on_hand == 0


def test_variant_with_history_keeps_options_and_cannot_be_removed(admin, shirts):
    body = _create(admin, shirts)
    url = f"{PRODUCTS_URL}{body['id']}/"
    variants = _variants_for_update(body)
    renamed = [dict(variants[0], size="S"), variants[1]]
    assert "variants.0.size" in _fields(admin.patch(url, {"variants": renamed}, format="json"))
    assert "variants" in _fields(admin.patch(url, {"variants": [variants[1]]}, format="json"))
    assert Variant.objects.filter(product_id=body["id"]).count() == 2


def test_variant_without_history_can_be_renamed_or_removed(admin, shirts):
    body = _create(admin, shirts)
    url = f"{PRODUCTS_URL}{body['id']}/"
    variants = _variants_for_update(body)
    response = admin.patch(url, {"variants": [variants[0], dict(variants[1], size="XL")]}, format="json")
    assert response.status_code == 200
    assert response.json()["variants"][1]["size"] == "XL"
    response = admin.patch(url, {"variants": [variants[0]]}, format="json")
    assert response.status_code == 200
    assert Variant.objects.filter(product_id=body["id"]).count() == 1


def test_removed_variant_frees_its_codes(admin, shirts):
    body = _create(admin, shirts)
    variants = _variants_for_update(body)
    replacement = {"size": "XL", "colour": "Blue", "sku": variants[1]["sku"]}
    response = admin.patch(f"{PRODUCTS_URL}{body['id']}/", {"variants": [variants[0], replacement]}, format="json")
    assert response.status_code == 200, response.json()


def test_variant_ids_from_another_product_are_rejected(admin, shirts):
    first = _create(admin, shirts)
    second = _create(
        admin, shirts, name="Other", sku="OT-001", variants=[{"size": "M", "colour": "Red", "sku": "OT-001-M-RED"}]
    )
    stolen = _variants_for_update(first)[1]
    fields = _fields(admin.patch(f"{PRODUCTS_URL}{second['id']}/", {"variants": [stolen]}, format="json"))
    assert "variants.0.id" in fields
    assert Variant.objects.get(pk=stolen["id"]).product_id == first["id"]


def test_failed_update_rolls_back_everything(admin, shirts):
    body = _create(admin, shirts)
    variants = _variants_for_update(body)
    variants.append({"size": "XL", "colour": "Blue", "sku": "SH-CT-001-XL-BLU", "opening_stock": 3})
    variants.append({"size": "XXL", "colour": "Blue", "sku": "SH-CT-001-XL-BLU"})
    response = admin.patch(f"{PRODUCTS_URL}{body['id']}/", {"name": "Changed", "variants": variants}, format="json")
    assert response.status_code == 400
    assert Product.objects.get().name == "Classic Cotton Shirt"
    assert Variant.objects.count() == 2 and StockMovement.objects.count() == 1


def test_race_on_unique_codes_is_a_clean_400(admin, shirts, monkeypatch):
    from django.db import IntegrityError

    def collide(*args, **kwargs):
        raise IntegrityError("UNIQUE constraint failed: catalog_variant.sku")

    monkeypatch.setattr(Variant.objects, "create", collide)
    response = admin.post(PRODUCTS_URL, _payload(shirts), format="json")
    assert response.status_code == 400
    assert "Reload and try again" in response.json()["detail"]
    assert not Product.objects.exists()


def test_deactivate_and_reactivate(admin, shirts):
    body = _create(admin, shirts)
    url = f"{PRODUCTS_URL}{body['id']}/"
    assert admin.patch(url, {"status": "inactive"}, format="json").json()["status"] == "inactive"
    Variant.objects.update(is_active=False)
    assert "variants" in _fields(admin.patch(url, {"status": "active"}, format="json"))


def test_stock_moved_elsewhere_survives_product_edits(admin, shirts):
    body = _create(admin, shirts)
    variant = Variant.objects.get(sku="SH-CT-001-M-BLU")
    record_movement(variant=variant, type=StockMovement.Type.SALE, quantity_delta=-3, reference="LD-1")
    response = admin.patch(f"{PRODUCTS_URL}{body['id']}/", {"variants": _variants_for_update(body)}, format="json")
    assert response.status_code == 200
    variant.refresh_from_db()
    # The client's stale copy (on_hand 4) is never written back.
    assert variant.on_hand == 1
    assert variant.on_hand == sum(variant.movements.values_list("quantity_delta", flat=True))


# Images


def _upload(fmt="PNG"):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "navy").save(buffer, fmt)
    return SimpleUploadedFile(f"photo.{fmt.lower()}", buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@pytest.fixture
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


def test_image_upload_replace_and_remove(admin, shirts, media):
    body = _create(admin, shirts)
    url = f"{PRODUCTS_URL}{body['id']}/image/"
    first = admin.post(url, {"image": _upload()}, format="multipart").json()["image_url"]
    assert first.startswith("/media/products/sh-ct-001") and first.endswith(".png")
    second = admin.post(url, {"image": _upload("JPEG")}, format="multipart").json()["image_url"]
    assert second != first
    assert len(list((media / "products").iterdir())) == 1  # the replaced photo is deleted
    assert admin.delete(url).json()["image_url"] is None
    assert not list((media / "products").iterdir())


def test_image_upload_rejects_non_images(admin, shirts, media):
    body = _create(admin, shirts)
    url = f"{PRODUCTS_URL}{body['id']}/image/"
    fake = SimpleUploadedFile("photo.png", b"not really a png", content_type="image/png")
    assert "image" in _fields(admin.post(url, {"image": fake}, format="multipart"))
    assert "image" in _fields(admin.post(url, {"image": _upload("GIF")}, format="multipart"))


def test_categories_include_tax_rule(admin, shirts):
    rows = admin.get("/api/v1/catalog/categories/").json()
    assert rows == [
        {
            "id": shirts.pk,
            "name": "Shirts",
            "hsn_code": "6205",
            "tax_rule": {
                "id": shirts.tax_rule.pk,
                "name": "Garments",
                "kind": "price_band",
                "flat_rate_bp": None,
                "threshold_paise": 2_500_00,
                "lower_rate_bp": 500,
                "upper_rate_bp": 1800,
                "summary": "5% up to ₹2,500 per unit, 18% above",
            },
        }
    ]
