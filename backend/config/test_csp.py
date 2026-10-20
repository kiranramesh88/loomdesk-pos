"""Content-Security-Policy headers (config/csp.py) on the responses Django builds."""

import re

import pytest

from apps.accounts.models import Role, User
from config.csp import policy_for

POLICY = "Content-Security-Policy"


@pytest.fixture
def dist(tmp_path, settings):
    (tmp_path / "index.html").write_text(
        '<!doctype html><html><head><script type="module" src="/static/assets/index-abc.js"></script></head>'
        '<body><div id="root"></div></body></html>',
        encoding="utf-8",
    )
    settings.FRONTEND_DIST_DIR = tmp_path
    return tmp_path


def _directives(header: str) -> dict[str, list[str]]:
    return {part.split()[0]: part.split()[1:] for part in header.split("; ")}


def _nonce(header: str) -> str:
    return re.search(r"'nonce-([^']+)'", header).group(1)


def test_the_app_shell_gets_a_strict_policy_and_its_nonce(client, dist):
    response = client.get("/admin/mobile/inventory")
    policy = _directives(response[POLICY])
    assert policy["script-src"] == ["'self'"]
    assert policy["style-src"][0] == "'self'" and policy["style-src"][1].startswith("'nonce-")
    assert policy["img-src"] == ["'self'", "blob:"]
    assert policy["connect-src"] == ["'self'"]
    assert policy["object-src"] == policy["base-uri"] == policy["frame-ancestors"] == ["'none'"]
    # The page carries the same nonce for the app to hand to injected styles.
    nonce = _nonce(response[POLICY])
    assert f'<head><meta name="csp-nonce" content="{nonce}" />' in response.content.decode()


def test_each_request_gets_a_new_nonce(client, dist):
    first, second = (_nonce(client.get("/billing")[POLICY]) for _ in range(2))
    assert first != second and len(first) >= 22


@pytest.mark.parametrize("path", ["/", "/api/v1/x/", "/api/v1/docs/", "/media/products/a.jpg", "/django-admin/"])
def test_no_policy_allows_inline_scripts_or_eval(path):
    header = policy_for(path, "n0nce")
    assert "unsafe-inline" not in header and "unsafe-eval" not in header and "*" not in header.split()


@pytest.mark.django_db
def test_api_responses_may_load_nothing(client):
    response = client.get("/api/v1/auth/session/")
    assert response.status_code == 200
    assert _directives(response[POLICY])["default-src"] == ["'none'"]


def test_uploaded_photos_are_images_only_and_sandboxed():
    policy = _directives(policy_for("/media/products/a.jpg", "n"))
    assert policy["default-src"] == ["'none'"] and policy["img-src"] == ["'self'"] and "sandbox" in policy


@pytest.mark.django_db
def test_swagger_ui_uses_the_nonce_and_no_inline_script(client):
    admin = User.objects.create_user(email="a@shop.example", password="x", full_name="A", role=Role.ADMIN)
    client.force_login(admin)
    response = client.get("/api/v1/docs/")
    assert response.status_code == 200
    html = response.content.decode()
    nonce = _nonce(response[POLICY])
    assert f'<style nonce="{nonce}">' in html
    assert all(" src=" in tag for tag in re.findall(r"<script[^>]*>", html))  # every script is a file
    assert _directives(response[POLICY])["script-src"] == ["'self'", "https://cdn.jsdelivr.net"]
    script = client.get("/api/v1/docs/?script=")
    assert script.status_code == 200 and "SwaggerUIBundle" in script.content.decode()


@pytest.mark.django_db
def test_django_admin_gets_its_own_policy(client):
    policy = _directives(client.get("/django-admin/login/")[POLICY])
    assert policy["script-src"] == ["'self'"] and policy["style-src"] == ["'self'"]


def test_report_only_and_disabled(client, dist, settings):
    settings.LOOMDESK_CSP_REPORT_ONLY = True
    response = client.get("/billing")
    assert POLICY not in response and "script-src 'self'" in response[f"{POLICY}-Report-Only"]
    settings.LOOMDESK_CSP_ENABLED = False
    response = client.get("/billing")
    assert POLICY not in response and f"{POLICY}-Report-Only" not in response
