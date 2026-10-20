from django.conf import settings
from django.db import models


class AuditQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Audit entries are append-only.")

    def delete(self):
        raise TypeError("Audit entries are append-only.")


class AuditEntry(models.Model):
    """One sensitive action, who took it and when. Append-only: the application never edits or deletes
    an entry (`save` refuses an existing row, and the queryset refuses bulk changes).

    `details` holds facts about the change (old and new role, the void reason, amounts). Never put a
    password, PIN, token or set-password link in it.
    """

    class Action(models.TextChoices):
        SALE_VOID = "sale.void", "Sale voided"
        RETURN_CREATE = "return.create", "Return recorded"
        STAFF_CREATE = "staff.create", "Staff account added"
        STAFF_UPDATE = "staff.update", "Staff account changed"
        STAFF_DEACTIVATE = "staff.deactivate", "Staff account deactivated"
        STAFF_REACTIVATE = "staff.reactivate", "Staff account reactivated"
        STAFF_PIN_SET = "staff.pin_set", "Approval PIN set"
        STAFF_PIN_CLEAR = "staff.pin_clear", "Approval PIN removed"
        STAFF_SETUP_LINK = "staff.setup_link", "Set-password link issued"
        STAFF_PASSWORD_SET = "staff.password_set", "Password set from a link"
        SETTINGS_UPDATE = "settings.update", "Store settings changed"

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+")
    # As shown at the time, so renaming an account later doesn't rewrite the log.
    actor_name = models.CharField(max_length=120, blank=True)
    action = models.CharField(max_length=32, choices=Action.choices, db_index=True)
    # What was acted on: an invoice or return number, a staff email, "store".
    target = models.CharField(max_length=120)
    summary = models.CharField(max_length=300)
    details = models.JSONField(default=dict, blank=True)

    objects = AuditQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "audit entries"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise TypeError("Audit entries are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Audit entries are append-only.")

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.target}"
