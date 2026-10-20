from .models import AuditEntry

# Keys that must never reach the log, whatever a caller passes.
_SECRET_KEYS = {"password", "pin", "approval_pin", "token", "link", "setup_url", "uid"}


def record(actor, action: str, target: str, summary: str, **details) -> AuditEntry:
    """Append one entry. Runs in the caller's transaction, so an action that rolls back leaves no entry."""
    leaked = _SECRET_KEYS.intersection(details)
    if leaked:
        raise ValueError(f"Credentials don't belong in the audit log: {sorted(leaked)}")
    return AuditEntry.objects.create(
        actor=actor,
        actor_name=getattr(actor, "full_name", "") or "",
        action=action,
        target=target[:120],
        summary=summary[:300],
        details=details,
    )
