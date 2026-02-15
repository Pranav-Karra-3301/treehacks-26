from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.twilio_client import TwilioClient


_TERMINAL_STATUSES = {"ended", "failed"}


def _utc_iso() -> str:
    return datetime.utcnow().isoformat()


class CallControlPolicy:
    """In-memory policy gate for IVR keypad and hangup actions per task."""

    def __init__(self) -> None:
        self._states: Dict[str, Dict[str, Any]] = {}
        self._global_cooldown_s = settings.CALL_CONTROL_GLOBAL_COOLDOWN_SECONDS
        self._duplicate_dtmf_window_s = settings.CALL_CONTROL_DUPLICATE_DTMF_SECONDS
        self._pending_timeout_s = settings.CALL_CONTROL_PENDING_TIMEOUT_SECONDS
        self._max_dtmf_attempts = settings.CALL_CONTROL_MAX_DTMF_ATTEMPTS
        self._ivr_budget_s = settings.CALL_CONTROL_IVR_BUDGET_SECONDS

    def start_session(self, task_id: str) -> Dict[str, Any]:
        now_mono = time.monotonic()
        now_iso = _utc_iso()
        state = {
            "task_id": task_id,
            "created_at": now_iso,
            "updated_at": now_iso,
            "ivr_started_at": now_iso,
            "ivr_started_monotonic": now_mono,
            "last_action_monotonic": 0.0,
            "last_dtmf_digits": "",
            "last_dtmf_monotonic": 0.0,
            "pending_action": None,
            "ended": False,
            "end_reason": "",
            "counters": {
                "dtmf_requests": 0,
                "dtmf_sent": 0,
                "dtmf_rejected": 0,
                "hangup_requests": 0,
                "hangup_sent": 0,
                "hangup_rejected": 0,
                "errors": 0,
            },
            "recent_denials": [],
            "last_decision": None,
        }
        self._states[task_id] = state
        return state

    def mark_task_ended(self, task_id: str, *, reason: str = "unknown") -> Dict[str, Any]:
        state = self._get_or_create(task_id)
        state["ended"] = True
        state["end_reason"] = reason
        state["pending_action"] = None
        state["updated_at"] = _utc_iso()
        return state

    def cleanup_task(self, task_id: str) -> None:
        """Remove task state from memory after session is fully torn down."""
        self._states.pop(task_id, None)

    def authorize_dtmf(
        self,
        task_id: str,
        digits: str,
        *,
        task_status: str,
        source: str,
        reason: str,
    ) -> Dict[str, Any]:
        normalized = TwilioClient.normalize_dtmf_digits(digits)
        state = self._get_or_create(task_id)
        state["counters"]["dtmf_requests"] += 1
        now = time.monotonic()
        self._clear_stale_pending(state, now=now)

        if state.get("ended") or task_status in _TERMINAL_STATUSES:
            return self._deny(
                state,
                action="dtmf",
                code="call_already_ended",
                message=f"Task call is already {task_status or 'ended'}.",
                details={"source": source},
            )

        pending = state.get("pending_action")
        if isinstance(pending, dict):
            return self._deny(
                state,
                action="dtmf",
                code="action_in_progress",
                message="Another call-control action is still in progress.",
                details={"pending_action": pending.get("action"), "source": source},
            )

        since_last_action = now - float(state.get("last_action_monotonic") or 0.0)
        if state.get("last_action_monotonic") and since_last_action < self._global_cooldown_s:
            return self._deny(
                state,
                action="dtmf",
                code="global_cooldown",
                message="Keypad action blocked by cooldown.",
                details={
                    "retry_after_seconds": round(self._global_cooldown_s - since_last_action, 3),
                    "source": source,
                },
            )

        last_digits = str(state.get("last_dtmf_digits") or "")
        since_last_dtmf = now - float(state.get("last_dtmf_monotonic") or 0.0)
        if last_digits == normalized and since_last_dtmf < self._duplicate_dtmf_window_s:
            return self._deny(
                state,
                action="dtmf",
                code="duplicate_digits",
                message="Duplicate keypad digits blocked (sent too recently).",
                details={
                    "digits": normalized,
                    "retry_after_seconds": round(self._duplicate_dtmf_window_s - since_last_dtmf, 3),
                    "source": source,
                },
            )

        sent = int(state["counters"].get("dtmf_sent") or 0)
        if sent >= self._max_dtmf_attempts:
            return self._deny(
                state,
                action="dtmf",
                code="dtmf_attempt_budget_exceeded",
                message="Keypad attempt budget exceeded for this call.",
                details={"attempts": sent, "max_attempts": self._max_dtmf_attempts, "source": source},
            )

        ivr_elapsed = now - float(state.get("ivr_started_monotonic") or now)
        if ivr_elapsed > self._ivr_budget_s:
            return self._deny(
                state,
                action="dtmf",
                code="ivr_budget_exhausted",
                message="IVR navigation budget exhausted for this call.",
                details={
                    "ivr_elapsed_seconds": round(ivr_elapsed, 3),
                    "ivr_budget_seconds": self._ivr_budget_s,
                    "source": source,
                },
            )

        state["pending_action"] = {
            "action": "dtmf",
            "digits": normalized,
            "source": source,
            "reason": reason[:240],
            "started_at": _utc_iso(),
            "started_monotonic": now,
        }
        state["updated_at"] = _utc_iso()
        decision = {
            "ok": True,
            "action": "dtmf",
            "code": "approved",
            "message": "DTMF action approved.",
            "digits": normalized,
            "source": source,
            "reason": reason,
            "timestamp": _utc_iso(),
        }
        state["last_decision"] = decision
        return decision

    def authorize_hangup(
        self,
        task_id: str,
        *,
        task_status: str,
        source: str,
        reason: str,
    ) -> Dict[str, Any]:
        state = self._get_or_create(task_id)
        state["counters"]["hangup_requests"] += 1
        now = time.monotonic()
        self._clear_stale_pending(state, now=now)

        if state.get("ended") or task_status in _TERMINAL_STATUSES:
            return self._deny(
                state,
                action="hangup",
                code="call_already_ended",
                message=f"Task call is already {task_status or 'ended'}.",
                details={"source": source},
            )

        pending = state.get("pending_action")
        if isinstance(pending, dict):
            return self._deny(
                state,
                action="hangup",
                code="action_in_progress",
                message="Another call-control action is still in progress.",
                details={"pending_action": pending.get("action"), "source": source},
            )

        since_last_action = now - float(state.get("last_action_monotonic") or 0.0)
        if state.get("last_action_monotonic") and since_last_action < self._global_cooldown_s:
            return self._deny(
                state,
                action="hangup",
                code="global_cooldown",
                message="Hangup action blocked by cooldown.",
                details={
                    "retry_after_seconds": round(self._global_cooldown_s - since_last_action, 3),
                    "source": source,
                },
            )

        state["pending_action"] = {
            "action": "hangup",
            "source": source,
            "reason": reason[:240],
            "started_at": _utc_iso(),
            "started_monotonic": now,
        }
        state["updated_at"] = _utc_iso()
        decision = {
            "ok": True,
            "action": "hangup",
            "code": "approved",
            "message": "Hangup action approved.",
            "source": source,
            "reason": reason,
            "timestamp": _utc_iso(),
        }
        state["last_decision"] = decision
        return decision

    def record_action_success(
        self,
        task_id: str,
        *,
        action: str,
        digits: str = "",
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        state = self._get_or_create(task_id)
        now = time.monotonic()
        state["pending_action"] = None
        state["last_action_monotonic"] = now
        state["updated_at"] = _utc_iso()
        if action == "dtmf":
            state["counters"]["dtmf_sent"] += 1
            state["last_dtmf_digits"] = digits
            state["last_dtmf_monotonic"] = now
        elif action == "hangup":
            state["counters"]["hangup_sent"] += 1
            state["ended"] = True
        state["last_decision"] = {
            "ok": True,
            "action": action,
            "code": "executed",
            "message": f"{action} action executed.",
            "details": details or {},
            "timestamp": _utc_iso(),
        }
        return state

    def record_action_failure(
        self,
        task_id: str,
        *,
        action: str,
        error: str,
    ) -> Dict[str, Any]:
        state = self._get_or_create(task_id)
        state["pending_action"] = None
        state["counters"]["errors"] += 1
        state["updated_at"] = _utc_iso()
        state["last_decision"] = {
            "ok": False,
            "action": action,
            "code": "execution_error",
            "message": error,
            "timestamp": _utc_iso(),
        }
        return state

    def export_state(
        self,
        task_id: str,
        *,
        task_status: str = "",
        call_sid: str = "",
        stream_sid: str = "",
        create_if_missing: bool = False,
    ) -> Optional[Dict[str, Any]]:
        state = self._states.get(task_id)
        if state is None and create_if_missing:
            state = self.start_session(task_id)
        if state is None:
            return None

        now = time.monotonic()
        started = float(state.get("ivr_started_monotonic") or now)
        ivr_elapsed = max(0.0, now - started)
        pending = state.get("pending_action")
        if isinstance(pending, dict):
            started_pending = float(pending.get("started_monotonic") or now)
            pending_age = max(0.0, now - started_pending)
            pending_public = {
                "action": pending.get("action"),
                "digits": pending.get("digits"),
                "source": pending.get("source"),
                "reason": pending.get("reason"),
                "started_at": pending.get("started_at"),
                "age_seconds": round(pending_age, 3),
            }
        else:
            pending_public = None

        snapshot = {
            "task_id": task_id,
            "task_status": task_status or "",
            "call_sid": call_sid or "",
            "stream_sid": stream_sid or "",
            "created_at": state.get("created_at"),
            "updated_at": state.get("updated_at"),
            "ended": bool(state.get("ended")),
            "end_reason": state.get("end_reason") or "",
            "ivr_budget_seconds": self._ivr_budget_s,
            "ivr_elapsed_seconds": round(ivr_elapsed, 3),
            "ivr_budget_remaining_seconds": max(0.0, round(self._ivr_budget_s - ivr_elapsed, 3)),
            "cooldowns": {
                "global_seconds": self._global_cooldown_s,
                "duplicate_dtmf_seconds": self._duplicate_dtmf_window_s,
                "pending_timeout_seconds": self._pending_timeout_s,
            },
            "limits": {"max_dtmf_attempts": self._max_dtmf_attempts},
            "pending_action": pending_public,
            "counters": dict(state.get("counters", {})),
            "last_decision": state.get("last_decision"),
            "recent_denials": list(state.get("recent_denials") or []),
        }
        return snapshot

    def _get_or_create(self, task_id: str) -> Dict[str, Any]:
        state = self._states.get(task_id)
        if state is None:
            state = self.start_session(task_id)
        return state

    def _clear_stale_pending(self, state: Dict[str, Any], *, now: float) -> None:
        pending = state.get("pending_action")
        if not isinstance(pending, dict):
            return
        started = float(pending.get("started_monotonic") or now)
        if (now - started) > self._pending_timeout_s:
            state["pending_action"] = None
            state["updated_at"] = _utc_iso()

    def _deny(
        self,
        state: Dict[str, Any],
        *,
        action: str,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if action == "dtmf":
            state["counters"]["dtmf_rejected"] += 1
        elif action == "hangup":
            state["counters"]["hangup_rejected"] += 1

        denial = {
            "ok": False,
            "action": action,
            "code": code,
            "message": message,
            "details": details or {},
            "timestamp": _utc_iso(),
        }
        recent_denials = list(state.get("recent_denials") or [])
        recent_denials.append(denial)
        state["recent_denials"] = recent_denials[-10:]
        state["last_decision"] = denial
        state["updated_at"] = _utc_iso()
        return denial
