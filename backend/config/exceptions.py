"""One error envelope for the whole API: {"detail": str, "code": str, "fields": {name: [msg]}}.

The frontend's lib/http.ts relies on this shape to map errors onto form fields. Nested
serializer errors use dotted paths ("variants.2.sku"), which react-hook-form understands.
"""

from django.db import DEFAULT_DB_ALIAS, connections
from django.http import HttpResponseNotFound, HttpResponseServerError, JsonResponse
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def _flatten(value) -> list[str]:
    if isinstance(value, (list, tuple)):
        return [str(v) for item in value for v in _flatten(item)]
    if isinstance(value, dict):
        return [str(v) for item in value.values() for v in _flatten(item)]
    return [str(value)]


def _field_errors(value, path: str, out: dict[str, list[str]]) -> None:
    """Collect nested DRF errors under dotted paths; a nested non_field_errors belongs to its parent."""
    if isinstance(value, dict):
        for key, item in value.items():
            child = path if key == "non_field_errors" else (f"{path}.{key}" if path else str(key))
            _field_errors(item, child, out)
    elif isinstance(value, (list, tuple)) and any(isinstance(item, (dict, list, tuple)) for item in value):
        # A list serializer: one entry per row, empty for rows without errors.
        for index, item in enumerate(value):
            if item:
                _field_errors(item, f"{path}.{index}", out)
    else:
        out.setdefault(path, []).extend(_flatten(value))


def _runs_outside_request_transaction(view) -> bool:
    return DEFAULT_DB_ALIAS in getattr(getattr(view, "dispatch", None), "_non_atomic_requests", ())


def _drf_response(exc, context):
    """DRF's response for `exc`. DRF also marks the request's transaction for rollback. A view that runs
    outside that transaction (checkout) has none, so the mark would land on whatever transaction encloses
    the request, such as a test's; keep those flags as they were."""
    if not _runs_outside_request_transaction(context.get("view")):
        return exception_handler(exc, context)
    flags = {db.alias: db.needs_rollback for db in connections.all() if db.in_atomic_block}
    response = exception_handler(exc, context)
    for alias, flag in flags.items():
        connections[alias].set_rollback(flag)
    return response


def api_exception_handler(exc, context):
    response = _drf_response(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        data = exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail}
        fields: dict[str, list[str]] = {}
        for key, value in data.items():
            if key != "non_field_errors":
                _field_errors(value, str(key), fields)
        general = _flatten(data.get("non_field_errors", []))
        body = {
            "detail": general[0] if general else "Please correct the highlighted fields.",
            "code": "invalid",
            "fields": fields,
        }
        return Response(body, status=status.HTTP_400_BAD_REQUEST, headers=response.headers)

    detail = getattr(exc, "detail", None)
    code = detail.code if hasattr(detail, "code") else getattr(exc, "default_code", "error")
    response.data = {"detail": str(detail or response.data), "code": str(code), "fields": {}}
    return response


def _is_api(request) -> bool:
    return request.path.startswith("/api/")


def not_found(request, exception=None):
    """handler404: an unknown API path gets the envelope; a missing asset gets a plain 404, never the SPA."""
    if _is_api(request):
        return JsonResponse({"detail": "Not found.", "code": "not_found", "fields": {}}, status=404)
    return HttpResponseNotFound("Not found.", content_type="text/plain")


def server_error(request):
    """handler500: no stack trace or settings leak to the client; the error is logged by django.request."""
    if _is_api(request):
        body = {"detail": "Something went wrong on the server. Please try again.", "code": "server_error", "fields": {}}
        return JsonResponse(body, status=500)
    return HttpResponseServerError("Something went wrong on the server. Please try again.", content_type="text/plain")
