from django.db import migrations, models


def fill_skus(apps, schema_editor):
    """Existing products get the style code their variant SKUs were built from, else P-<id>."""
    Product = apps.get_model("catalog", "Product")
    taken = set()
    for product in Product.objects.order_by("id"):
        first = product.variants.order_by("id").first()
        parts = first.sku.split("-") if first else []
        candidate = "-".join(parts[:-2]) if len(parts) > 2 else ""
        if not candidate or candidate in taken:
            candidate = f"P-{product.id:04d}"
        taken.add(candidate)
        product.sku = candidate
        product.save(update_fields=["sku"])


def rename_archived(apps, schema_editor):
    apps.get_model("catalog", "Product").objects.filter(status="archived").update(status="inactive")


def restore_archived(apps, schema_editor):
    apps.get_model("catalog", "Product").objects.filter(status="inactive").update(status="archived")


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]

    operations = [
        migrations.AddField(model_name="product", name="sku", field=models.CharField("SKU", max_length=40, null=True)),
        migrations.RunPython(fill_skus, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="product", name="sku", field=models.CharField("SKU", max_length=40, unique=True)
        ),
        migrations.AlterField(
            model_name="product",
            name="status",
            field=models.CharField(
                choices=[("active", "Active"), ("inactive", "Inactive")], default="active", max_length=10
            ),
        ),
        migrations.RunPython(rename_archived, restore_archived),
    ]
