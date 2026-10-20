from django.contrib.admin.apps import AdminConfig


class LoomDeskAdminConfig(AdminConfig):
    """django.contrib.admin, with the sign-in-limited site in `config/admin_site.py` as `admin.site`."""

    default_site = "config.admin_site.LoomDeskAdminSite"
