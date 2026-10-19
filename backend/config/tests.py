import pytest


@pytest.fixture
def dist(tmp_path, settings):
    (tmp_path / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    settings.FRONTEND_DIST_DIR = tmp_path
    return tmp_path


@pytest.mark.parametrize("path", ["/admin/", "/admin/products/12", "/admin/mobile/", "/billing", "/login"])
def test_client_routes_get_the_spa_shell(client, dist, path):
    # Direct loads and refreshes of nested client routes must reach the SPA, not a Django 404.
    response = client.get(path)
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/html")
    assert b'<div id="root"></div>' in response.content


@pytest.mark.parametrize("path", ["/api/v1/not-a-route/", "/static/assets/missing.js"])
def test_api_and_static_paths_never_get_the_spa_shell(client, dist, path):
    # A missing script or API route must fail loudly, not return HTML that the browser can't run.
    response = client.get(path)
    assert response.status_code == 404
    assert b'<div id="root"></div>' not in response.content
