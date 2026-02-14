from __future__ import annotations

import json
import logging
import statistics
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Sequence
from collections import deque

from app.core.config import settings


_LOGGER = logging.getLogger("negotiateai")
_METRICS_LOCK = threading.Lock()
_NOISY_METRIC_COUNTERS: Dict[str, int] = {}
_NOISY_ACTIONS = {"media_event", "save_audio_chunk", "send_media", "media_mark_received"}


def _metric_file() -> Path:
    settings.DATA_ROOT.mkdir(parents=True, exist_ok=True)
    return settings.DATA_ROOT / "telemetry_events.jsonl"


def _log_file() -> Path:
    return settings.DATA_ROOT / "service.log"


def _should_emit_console_log(action: str, status: str) -> bool:
    if status != "ok":
        return True
    if action not in _NOISY_ACTIONS:
        return True

    try:
        sample_every = max(1, int(settings.LOG_NOISY_EVENTS_EVERY_N))
    except (TypeError, ValueError):
        sample_every = 20

    key = f"noisy::{action}"
    with _METRICS_LOCK:
        count = _NOISY_METRIC_COUNTERS.get(key, 0) + 1
        _NOISY_METRIC_COUNTERS[key] = count
    return count % sample_every == 0


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def configure_logging() -> None:
    if getattr(_LOGGER, "_negotiateai_configured", False):
        return

    log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)
    _LOGGER.setLevel(log_level)

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        "%Y-%m-%dT%H:%M:%S%z",
    )

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(fmt)
    stream_handler.setLevel(log_level)
    _LOGGER.addHandler(stream_handler)

    log_path = _log_file()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(fmt)
    file_handler.setLevel(log_level)
    _LOGGER.addHandler(file_handler)

    _LOGGER._negotiateai_configured = True  # type: ignore[attr-defined]


def _append_jsonl(entry: Dict[str, Any]) -> None:
    with _METRICS_LOCK:
        with open(_metric_file(), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str))
            f.write("\n")


def get_metric_events(
    limit: int = 100,
    *,
    component: Optional[str] = None,
    action: Optional[str] = None,
    task_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> list[Dict[str, Any]]:
    path = _metric_file()
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        rows = deque(f, maxlen=limit)
    events: list[Dict[str, Any]] = []
    for line in rows:
        line = line.strip()
        if not line:
            continue
        events.append(json.loads(line))
    if component:
        events = [event for event in events if event.get("component") == component]
    if action:
        events = [event for event in events if event.get("action") == action]
    if task_id:
        events = [event for event in events if event.get("task_id") == task_id]
    if session_id:
        events = [event for event in events if event.get("session_id") == session_id]
    return events


def _parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed


def summarize_events(
    limit: int = 500,
    *,
    component: Optional[str] = None,
    action: Optional[str] = None,
    task_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    events = get_metric_events(
        limit=limit,
        component=component,
        action=action,
        task_id=task_id,
        session_id=session_id,
    )
    if not events:
        return {"event_count": 0, "components": {}, "actions": {}}

    def _percentile(values: Sequence[float], percentile: float) -> Optional[float]:
        if not values:
            return None
        if len(values) == 1:
            return values[0]
        idx = (len(values) - 1) * percentile
        lower = int(idx)
        upper = min(lower + 1, len(values) - 1)
        weight = idx - lower
        values_sorted = sorted(values)
        lower_value = values_sorted[lower]
        upper_value = values_sorted[upper]
        return lower_value + (upper_value - lower_value) * weight

    component_metrics: Dict[str, Dict[str, Any]] = {}
    action_metrics: Dict[str, Dict[str, Any]] = {}
    durations: list[float] = []

    for event in events:
        component = str(event.get("component", "unknown"))
        action = str(event.get("action", "unknown"))
        status = str(event.get("status", "ok"))
        duration_ms = _parse_float(event.get("duration_ms"))

        if duration_ms is not None:
            durations.append(duration_ms)

        comp_group = component_metrics.setdefault(
            component,
            {
                "count": 0,
                "ok": 0,
                "error": 0,
                "durations_ms": [],
            },
        )
        action_group = action_metrics.setdefault(
            action,
            {
                "count": 0,
                "ok": 0,
                "error": 0,
                "durations_ms": [],
            },
        )

        comp_group["count"] += 1
        action_group["count"] += 1
        if status == "error":
            comp_group["error"] += 1
            action_group["error"] += 1
        else:
            comp_group["ok"] += 1
            action_group["ok"] += 1
        if duration_ms is not None:
            comp_group["durations_ms"].append(duration_ms)
            action_group["durations_ms"].append(duration_ms)

    for group in (component_metrics, action_metrics):
        for stats in group.values():
            durations_for_group = stats.pop("durations_ms", [])
            stats["avg_ms"] = round(statistics.mean(durations_for_group), 3) if durations_for_group else None
            stats["min_ms"] = min(durations_for_group) if durations_for_group else None
            stats["max_ms"] = max(durations_for_group) if durations_for_group else None
            stats["p50_ms"] = _percentile(durations_for_group, 0.50) if durations_for_group else None
            stats["p95_ms"] = _percentile(durations_for_group, 0.95) if durations_for_group else None
            stats["p99_ms"] = _percentile(durations_for_group, 0.99) if durations_for_group else None

    return {
        "event_count": len(events),
        "component_count": len(component_metrics),
        "action_count": len(action_metrics),
        "slowest_events": sorted(
            [event for event in events if event.get("duration_ms") is not None],
            key=lambda item: item.get("duration_ms", 0),
            reverse=True,
        )[:20],
        "durations_ms": {
            "count": len(durations),
            "avg_ms": round(statistics.mean(durations), 3) if durations else None,
            "min_ms": min(durations) if durations else None,
            "max_ms": max(durations) if durations else None,
            "p50_ms": _percentile(durations, 0.50) if durations else None,
            "p95_ms": _percentile(durations, 0.95) if durations else None,
            "p99_ms": _percentile(durations, 0.99) if durations else None,
        },
        "components": component_metrics,
        "actions": action_metrics,
    }


def log_event(
    component: str,
    action: str,
    *,
    status: str = "ok",
    duration_ms: Optional[float] = None,
    task_id: Optional[str] = None,
    session_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    entry = {
        "timestamp": _timestamp(),
        "component": component,
        "action": action,
        "status": status,
        "task_id": task_id,
        "session_id": session_id,
        **(details or {}),
    }
    if duration_ms is not None:
        entry["duration_ms"] = round(duration_ms, 3)

    _append_jsonl(entry)
    if _should_emit_console_log(action, status):
        _LOGGER.info(
            "%s | %s | status=%s | duration_ms=%s | task_id=%s | session_id=%s | details=%s",
            component,
            action,
            status,
            round(duration_ms, 3) if duration_ms is not None else "n/a",
            task_id or "n/a",
            session_id or "n/a",
            details or {},
        )


@contextmanager
def timed_step(
    component: str,
    action: str,
    *,
    task_id: Optional[str] = None,
    session_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
):
    started = time.perf_counter()
    started_at = _timestamp()
    status = "ok"
    caught_error: Optional[str] = None
    try:
        yield
    except Exception as exc:
        status = "error"
        caught_error = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        event = {
            "started_at": started_at,
            "component": component,
            "action": action,
            "status": status,
            "task_id": task_id,
            "session_id": session_id,
            "duration_ms": round(elapsed_ms, 3),
            "details": details or {},
        }
        if caught_error:
            event["error"] = caught_error
        _append_jsonl(event)
    if _should_emit_console_log(action, status):
        _LOGGER.info(
            "%s | %s | %s | %.3f ms | task_id=%s session_id=%s | %s",
            component,
            action,
            status,
            elapsed_ms,
            task_id or "n/a",
            session_id or "n/a",
            details or {},
        )
