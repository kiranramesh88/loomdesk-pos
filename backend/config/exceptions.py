"""One error envelope for the whole API: {"detail": str, "code": str, "fields": {name: [msg]}}.

The frontend's lib/http.ts relies on this shape to map errors onto form fields. Nested
serializer errors use dotted paths ("variants.2.sku"), which react-hook-form understands.
"""

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


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
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
