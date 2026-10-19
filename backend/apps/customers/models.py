from django.db import models


class Customer(models.Model):
    """Minimal customer record attached to a bill. Walk-in sales have no customer."""

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.phone})"
