import json
import re
import threading
from datetime import timedelta

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts import staff
from apps.accounts.models import AttemptGuard, Role, User
from apps.audit.models import AuditEntry

LINK = re.compile(r"^/set-password/(?P<uid>[\w-]+)/(?P<token>[\w-]+)$")


def _user(role=Role.CASHIER, email=None, password="s3cret-pass!", **extra):
    email = email or f"{role}-{User.objects.count()}@example.com"
    return User.objects.create_user(email=email, password=password, full_name=extra.pop("full_name", email.split("@")[0].title()), role=role, **extra)


def _client(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN, email="owner@example.com", full_name="Kiran Ramesh")


@pytest.fixture
def api(admin):
    return _client(admin)


def _create(api, email="new@example.com", role=Role.CASHIER, name="Meera Nair"):
    return api.post("/api/v1/staff/", {"email": email, "full_name": name, "role": role}, format="json")


def _link(response) -> tuple[str, str]:
    match = LINK.match(response.json()["setup_link"]["path"] if "setup_link" in response.json() else response.json()["path"])
    assert match, response.json()
    return match["uid"], match["token"]


def _set_password(uid, token, password="a-Strong-passphrase-9", client=None):
    return (client or APIClient()).post("/api/v1/auth/set-password/", {"uid": uid, "token": token, "password": password}, format="json")


def _audit_text() -> str:
    return json.dumps(list(AuditEntry.objects.values("target", "summary", "details")))


# --- Permissions ---


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER, None])
def test_only_admins_reach_staff_management(db, role):
    target = _user(Role.SENIOR_CASHIER, email="target@example.com")
    client = _client(_user(role)) if role else APIClient()
    calls = [
        client.get("/api/v1/staff/"),
        client.post("/api/v1/staff/", {"email": "x@example.com", "full_name": "X", "role": "admin"}, format="json"),
        client.get(f"/api/v1/staff/{target.pk}/"),
        client.patch(f"/api/v1/staff/{target.pk}/", {"role": "admin"}, format="json"),
        client.post(f"/api/v1/staff/{target.pk}/deactivate/"),
        client.put(f"/api/v1/staff/{target.pk}/pin/", {"pin": "1234"}, format="json"),
        client.delete(f"/api/v1/staff/{target.pk}/pin/"),
        client.post(f"/api/v1/staff/{target.pk}/setup-link/"),
    ]
    assert {r.status_code for r in calls} == {403}
    target.refresh_from_db()
    assert target.role == Role.SENIOR_CASHIER and target.is_active
    assert not User.objects.filter(email="x@example.com").exists()
    assert not AuditEntry.objects.exists()


# --- List ---


def test_list_shows_state_but_never_secrets(api, admin):
    senior = _user(Role.SENIOR_CASHIER, email="rahul@example.com", full_name="Rahul Menon")
    senior.set_approval_pin("2468")
    senior.save()
    _user(Role.CASHIER, email="gone@example.com", is_active=False)
    _create(api)
    body = api.get("/api/v1/staff/").json()
    assert body["count"] == 4
    rows = {r["email"]: r for r in body["results"]}
    assert rows["rahul@example.com"]["has_pin"] is True and rows["rahul@example.com"]["password_set"] is True
    assert rows["new@example.com"]["password_set"] is False and rows["new@example.com"]["setup_link_issued_at"]
    assert rows["gone@example.com"]["is_active"] is False
    assert body["results"][-1]["email"] == "gone@example.com"  # deactivated accounts sort last
    text = json.dumps(body)
    for secret in ("password\"", "pin_hash", "approval_pin", "token", "/set-password/"):
        assert secret not in text


def test_list_filters_by_status_role_and_search(api, admin):
    _user(Role.SENIOR_CASHIER, email="rahul@example.com", full_name="Rahul Menon")
    _user(Role.CASHIER, email="gone@example.com", is_active=False)
    _create(api)
    emails = lambda query: [r["email"] for r in api.get(f"/api/v1/staff/?{query}").json()["results"]]  # noqa: E731
    assert emails("status=pending") == ["new@example.com"]
    assert emails("status=inactive") == ["gone@example.com"]
    assert set(emails("status=active")) == {"owner@example.com", "rahul@example.com", "new@example.com"}
    assert emails("role=senior_cashier") == ["rahul@example.com"]
    assert emails("q=MENON") == ["rahul@example.com"]


# --- Adding staff and set-password links ---


def test_adding_staff_gives_a_one_time_link_and_no_password(api, admin):
    response = _create(api, email="  Meera@Example.com ")
    assert response.status_code == 201
    body = response.json()
    assert body["staff"]["email"] == "meera@example.com" and body["staff"]["role"] == "cashier"
    assert body["staff"]["password_set"] is False
    expires = body["setup_link"]["expires_at"]
    user = User.objects.get(email="meera@example.com")
    assert not user.has_usable_password()
    assert user.setup_link_issued_at is not None
    assert expires.startswith((user.setup_link_issued_at + timedelta(days=3)).astimezone().date().isoformat()[:4])
    uid, token = _link(response)
    # The link isn't stored or logged anywhere.
    assert token not in _audit_text() and uid not in _audit_text()
    assert list(AuditEntry.objects.order_by("id").values_list("action", flat=True)) == ["staff.create", "staff.setup_link"]
    assert APIClient().get(f"/api/v1/staff/{user.pk}/").status_code == 403


def test_duplicate_email_is_refused_whatever_the_case(api, admin):
    response = _create(api, email="OWNER@example.com")
    assert response.status_code == 400
    assert response.json()["fields"] == {"email": ["An account with this email already exists."]}


def test_the_link_sets_a_password_once(api, admin):
    uid, token = _link(_create(api))
    check = APIClient().get(f"/api/v1/auth/set-password/{uid}/{token}/")
    assert check.status_code == 200 and check.json() == {"full_name": "Meera Nair", "email": "new@example.com"}

    assert _set_password(uid, token).status_code == 204
    login = APIClient().post("/api/v1/auth/login/", {"email": "new@example.com", "password": "a-Strong-passphrase-9"}, format="json")
    assert login.status_code == 200
    user = User.objects.get(email="new@example.com")
    assert user.setup_link_issued_at is None
    entry = AuditEntry.objects.get(action="staff.password_set")
    assert entry.actor == user and "Strong" not in _audit_text()

    again = APIClient().get(f"/api/v1/auth/set-password/{uid}/{token}/")
    assert again.status_code == 400 and again.json()["code"] == "invalid_link"
    assert _set_password(uid, token, "another-Strong-pass-1").json()["code"] == "invalid_link"
    user.refresh_from_db()
    assert user.check_password("a-Strong-passphrase-9")


def test_a_new_link_replaces_the_old_one(api, admin):
    created = _create(api)
    old = _link(created)
    new = _link(api.post(f"/api/v1/staff/{created.json()['staff']['id']}/setup-link/"))
    assert _set_password(*old).json()["code"] == "invalid_link"
    assert _set_password(*new).status_code == 204


def test_links_expire_after_three_days(api, admin, monkeypatch):
    uid, token = _link(_create(api))
    now = staff.setup_tokens._now()
    monkeypatch.setattr(staff.setup_tokens, "_now", lambda: now + timedelta(days=2, hours=23))
    assert APIClient().get(f"/api/v1/auth/set-password/{uid}/{token}/").status_code == 200
    monkeypatch.setattr(staff.setup_tokens, "_now", lambda: now + timedelta(days=3, minutes=1))
    assert APIClient().get(f"/api/v1/auth/set-password/{uid}/{token}/").json()["code"] == "invalid_link"
    assert _set_password(uid, token).json()["code"] == "invalid_link"


def test_deactivating_or_renaming_the_email_kills_the_link(api, admin):
    first = _create(api, email="a@example.com")
    second = _create(api, email="b@example.com")
    api.post(f"/api/v1/staff/{first.json()['staff']['id']}/deactivate/")
    api.patch(f"/api/v1/staff/{second.json()['staff']['id']}/", {"email": "b2@example.com"}, format="json")
    assert _set_password(*_link(first)).json()["code"] == "invalid_link"
    assert _set_password(*_link(second)).json()["code"] == "invalid_link"


@pytest.mark.parametrize("uid,token", [("MQ", "nope"), ("not-base64!", "x-y"), ("OTk5OTk", "abc-def"), ("", "")])
def test_made_up_links_are_refused_alike(api, admin, uid, token):
    _create(api)
    response = _set_password(uid, token)
    assert response.status_code == 400
    assert response.json()["code"] in {"invalid_link", "invalid"}


@pytest.mark.parametrize(
    "password,message",
    [("short1", "too short"), ("password123", "too common"), ("12345678901", "entirely numeric"), ("loomdesk-demo", "demo password")],
)
def test_weak_or_demo_passwords_are_refused(api, admin, password, message):
    uid, token = _link(_create(api))
    response = _set_password(uid, token, password)
    assert response.status_code == 400
    assert message in " ".join(response.json()["fields"]["password"])
    assert not User.objects.get(email="new@example.com").has_usable_password()
    # The link still works for a better password.
    assert _set_password(uid, token).status_code == 204


def test_setting_a_password_needs_the_csrf_token(api, admin):
    uid, token = _link(_create(api))
    client = APIClient(enforce_csrf_checks=True)
    assert _set_password(uid, token, client=client).status_code == 403
    client.get("/api/v1/auth/csrf/")
    response = client.post(
        "/api/v1/auth/set-password/",
        {"uid": uid, "token": token, "password": "a-Strong-passphrase-9"},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    assert response.status_code == 204


def test_set_password_is_rate_limited(api, admin, monkeypatch):
    from django.core.cache import cache
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"set_password": "3/min"})
    cache.clear()
    client = APIClient()
    codes = [client.get("/api/v1/auth/set-password/MQ/x-y/").status_code for _ in range(4)]
    assert codes == [400, 400, 400, 429]
    cache.clear()


def test_issuing_a_link_for_a_deactivated_account_is_refused(api, admin):
    gone = _user(Role.CASHIER, is_active=False)
    response = api.post(f"/api/v1/staff/{gone.pk}/setup-link/")
    assert response.status_code == 409 and response.json()["code"] == "inactive_account"


# --- Roles, guardrails and deactivation ---


def test_role_and_detail_changes_are_audited(api, admin):
    senior = _user(Role.SENIOR_CASHIER, email="rahul@example.com", full_name="Rahul Menon")
    response = api.patch(f"/api/v1/staff/{senior.pk}/", {"role": "admin", "full_name": "Rahul K Menon"}, format="json")
    assert response.status_code == 200 and response.json()["role"] == "admin"
    entry = AuditEntry.objects.get(action="staff.update")
    assert entry.actor == admin and entry.target == "rahul@example.com"
    assert entry.details["changes"] == {"role": ["senior_cashier", "admin"], "full_name": ["Rahul Menon", "Rahul K Menon"]}
    assert "Senior cashier → Admin" in entry.summary


def test_an_unchanged_save_writes_nothing(api, admin):
    senior = _user(Role.SENIOR_CASHIER)
    assert api.patch(f"/api/v1/staff/{senior.pk}/", {"role": "senior_cashier"}, format="json").status_code == 200
    assert not AuditEntry.objects.exists()


def test_moving_to_cashier_removes_the_pin(api, admin):
    senior = _user(Role.SENIOR_CASHIER)
    senior.set_approval_pin("2468")
    senior.save()
    api.patch(f"/api/v1/staff/{senior.pk}/", {"role": "cashier"}, format="json")
    senior.refresh_from_db()
    assert senior.role == Role.CASHIER and senior.approval_pin_hash == ""
    assert AuditEntry.objects.get(action="staff.update").details["pin_cleared"] is True


def test_leaving_the_admin_role_removes_django_admin_access(api, admin):
    other = User.objects.create_superuser(email="root@example.com", password="s3cret-pass!", full_name="Root")
    api.patch(f"/api/v1/staff/{other.pk}/", {"role": "senior_cashier"}, format="json")
    other.refresh_from_db()
    assert other.role == Role.SENIOR_CASHIER and not other.is_staff and not other.is_superuser


def test_admins_cannot_demote_or_deactivate_themselves(api, admin):
    demote = api.patch(f"/api/v1/staff/{admin.pk}/", {"role": "cashier"}, format="json")
    deactivate = api.post(f"/api/v1/staff/{admin.pk}/deactivate/")
    assert demote.status_code == deactivate.status_code == 409
    assert demote.json()["code"] == deactivate.json()["code"] == "self_change"
    admin.refresh_from_db()
    assert admin.role == Role.ADMIN and admin.is_active
    # Their own name is still theirs to fix.
    assert api.patch(f"/api/v1/staff/{admin.pk}/", {"full_name": "Kiran R"}, format="json").status_code == 200


def test_a_demoted_admin_loses_admin_access_at_once(api, admin):
    other = _user(Role.ADMIN, email="devika@example.com")
    other_client = _client(other)
    assert other_client.get("/api/v1/staff/").status_code == 200
    api.patch(f"/api/v1/staff/{other.pk}/", {"role": "cashier"}, format="json")
    assert other_client.get("/api/v1/staff/").status_code == 403
    assert other_client.get("/api/v1/auth/me/").json()["role"] == "cashier"


def test_deactivation_ends_open_sessions_and_keeps_history(api, admin):
    cashier = _user(Role.CASHIER, email="anjali@example.com")
    till = _client(cashier)
    assert till.get("/api/v1/auth/me/").status_code == 200
    response = api.post(f"/api/v1/staff/{cashier.pk}/deactivate/")
    assert response.status_code == 200 and response.json()["is_active"] is False
    assert till.get("/api/v1/auth/me/").status_code == 403
    assert APIClient().post("/api/v1/auth/login/", {"email": cashier.email, "password": "s3cret-pass!"}, format="json").status_code == 400
    assert User.objects.filter(pk=cashier.pk).exists()

    assert api.post(f"/api/v1/staff/{cashier.pk}/reactivate/").json()["is_active"] is True
    assert APIClient().post("/api/v1/auth/login/", {"email": cashier.email, "password": "s3cret-pass!"}, format="json").status_code == 200
    assert list(AuditEntry.objects.order_by("id").values_list("action", flat=True)) == ["staff.deactivate", "staff.reactivate"]


def test_unknown_staff_is_404(api, admin):
    assert api.patch("/api/v1/staff/99999/", {"role": "admin"}, format="json").status_code == 404
    assert api.post("/api/v1/staff/99999/deactivate/").status_code == 404


# --- Approval PINs ---


def test_setting_a_pin_unlocks_and_never_echoes_it(api, admin):
    senior = _user(Role.SENIOR_CASHIER)
    AttemptGuard.objects.create(key=staff.pin_key(senior.pk), attempts=5)
    response = api.put(f"/api/v1/staff/{senior.pk}/pin/", {"pin": "246810"}, format="json")
    assert response.status_code == 200 and response.json()["has_pin"] is True
    assert "246810" not in response.content.decode()
    senior.refresh_from_db()
    assert senior.check_approval_pin("246810")
    assert AttemptGuard.objects.get(key=staff.pin_key(senior.pk)).attempts == 0
    entry = AuditEntry.objects.get(action="staff.pin_set")
    assert "246810" not in _audit_text() and entry.summary.startswith("Set the approval PIN")

    assert api.delete(f"/api/v1/staff/{senior.pk}/pin/").json()["has_pin"] is False
    senior.refresh_from_db()
    assert not senior.check_approval_pin("246810")
    assert AuditEntry.objects.filter(action="staff.pin_clear").count() == 1


@pytest.mark.parametrize("pin", ["123", "1234567", "12a4", ""])
def test_pins_must_be_4_to_6_digits(api, admin, pin):
    senior = _user(Role.SENIOR_CASHIER)
    response = api.put(f"/api/v1/staff/{senior.pk}/pin/", {"pin": pin}, format="json")
    assert response.status_code == 400 and "pin" in response.json()["fields"]


def test_cashiers_and_deactivated_accounts_get_no_pin(api, admin):
    cashier = _user(Role.CASHIER)
    gone = _user(Role.SENIOR_CASHIER, is_active=False)
    assert api.put(f"/api/v1/staff/{cashier.pk}/pin/", {"pin": "1234"}, format="json").status_code == 400
    assert api.put(f"/api/v1/staff/{gone.pk}/pin/", {"pin": "1234"}, format="json").json()["code"] == "inactive_account"
    assert not AuditEntry.objects.exists()


# --- Races (PostgreSQL row locks and real concurrent connections) ---

needs_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections"
)


def _race(*calls):
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(index, call):
        barrier.wait()
        try:
            results[index] = call()
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i, call)) for i, call in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


@pytest.fixture
def two_admins(transactional_db):
    return _user(Role.ADMIN, email="a@example.com"), _user(Role.ADMIN, email="b@example.com")


def _active_admins():
    return User.objects.filter(role=Role.ADMIN, is_active=True).count()


@needs_postgres
def test_two_admins_demoting_each_other_leave_one_admin(two_admins):
    a, b = two_admins
    results = _race(
        lambda: _client(a).patch(f"/api/v1/staff/{b.pk}/", {"role": "cashier"}, format="json"),
        lambda: _client(b).patch(f"/api/v1/staff/{a.pk}/", {"role": "cashier"}, format="json"),
    )
    assert sorted(r.status_code for r in results) == [200, 403]
    assert _active_admins() == 1


@needs_postgres
def test_two_admins_deactivating_each_other_leave_one_admin(two_admins):
    a, b = two_admins
    results = _race(
        lambda: _client(a).post(f"/api/v1/staff/{b.pk}/deactivate/"),
        lambda: _client(b).post(f"/api/v1/staff/{a.pk}/deactivate/"),
    )
    assert sorted(r.status_code for r in results) == [200, 403]
    assert _active_admins() == 1


@needs_postgres
def test_one_link_sets_one_password_even_when_submitted_twice_at_once(two_admins):
    a, _ = two_admins
    uid, token = _link(_create(_client(a)))
    results = _race(
        lambda: _set_password(uid, token, "first-Strong-pass-1"),
        lambda: _set_password(uid, token, "second-Strong-pass-2"),
    )
    assert sorted(r.status_code for r in results) == [204, 400]
    assert AuditEntry.objects.filter(action="staff.password_set").count() == 1
