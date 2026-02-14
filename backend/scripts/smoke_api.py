#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Any, Dict, List, Optional

import httpx
import websockets


async def _timed_request(
    method: str,
    client: httpx.AsyncClient,
    path: str,
    **kwargs: Any,
) -> tuple[httpx.Response, float]:
    start = time.perf_counter()
    response = await client.request(method, path, **kwargs)
    elapsed_ms = (time.perf_counter() - start) * 1000
    return response, elapsed_ms


async def _read_ws_message(ws, timeout: float = 2.0) -> Dict[str, Any]:
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            raise ValueError(f"Invalid websocket payload: {raw}") from exc
    return {"type": "raw", "data": raw.decode("utf-8", errors="ignore")}


def _print_result(name: str, ok: bool, detail: Optional[str] = None, ms: Optional[float] = None) -> None:
    icon = "✓" if ok else "✗"
    suffix = f" ({ms:.1f}ms)" if ms is not None else ""
    print(f"{icon} {name}{suffix}")
    if detail:
        print(f"  {detail}")


async def run_smoke(base_url: str, task_phone: str, with_ws: bool) -> None:
    base_url = base_url.rstrip("/")
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")

    async with httpx.AsyncClient(base_url=base_url, timeout=20.0) as client:
        response, ms = await _timed_request("GET", client, "/health")
        _print_result("GET /health", response.status_code == 200, f"status={response.status_code}", ms)

        list_start = time.perf_counter()
        response, ms = await _timed_request("GET", client, "/api/tasks")
        _print_result(
            "GET /api/tasks",
            response.status_code == 200,
            f"count={len(response.json()) if response.status_code == 200 else response.status_code}",
            ms,
        )

        payload = {
            "task_type": "custom",
            "target_phone": task_phone,
            "objective": "quick CLI smoke test",
            "context": "benchmarked by automated smoke script",
            "target_outcome": "Get a slightly better offer",
            "walkaway_point": "No worse than acceptable",
            "agent_persona": "calm and efficient",
            "opening_line": "Hello, calling about a rate adjustment.",
            "style": "collaborative",
        }
        response, ms = await _timed_request("POST", client, "/api/tasks", json=payload)
        task_payload = response.json() if response.status_code == 200 else {}
        task_id = task_payload.get("id", "")
        _print_result(
            "POST /api/tasks",
            response.status_code == 200 and bool(task_id),
            f"task_id={task_id or response.status_code}",
            ms,
        )
        if response.status_code != 200 or not task_id:
            return

        events: List[Dict[str, Any]] = []
        if with_ws:
            async with websockets.connect(f"{ws_url}/ws/call/{task_id}") as ws:
                events.append(await _read_ws_message(ws))

                response, ms = await _timed_request("POST", client, f"/api/tasks/{task_id}/call")
                _print_result(
                    "POST /api/tasks/{id}/call",
                    response.status_code == 200,
                    f"session_id={response.json().get('session_id') if response.status_code == 200 else response.status_code}",
                    ms,
                )

                for _ in range(2):
                    events.append(await _read_ws_message(ws))

                response, ms = await _timed_request("POST", client, f"/api/tasks/{task_id}/stop")
                _print_result(
                    "POST /api/tasks/{id}/stop",
                    response.status_code == 200,
                    f"ok={response.json().get('ok') if response.status_code == 200 else response.status_code}",
                    ms,
                )
                try:
                    events.append(await _read_ws_message(ws, timeout=2.5))
                except (TimeoutError, websockets.exceptions.ConnectionClosed):
                    pass
        else:
            response, ms = await _timed_request("POST", client, f"/api/tasks/{task_id}/call")
            _print_result(
                "POST /api/tasks/{id}/call",
                response.status_code == 200,
                f"session_id={response.json().get('session_id') if response.status_code == 200 else response.status_code}",
                ms,
            )
            response, ms = await _timed_request("POST", client, f"/api/tasks/{task_id}/stop")
            _print_result(
                "POST /api/tasks/{id}/stop",
                response.status_code == 200,
                f"ok={response.json().get('ok') if response.status_code == 200 else response.status_code}",
                ms,
            )

        response, ms = await _timed_request("GET", client, f"/api/tasks/{task_id}")
        got_status = response.json().get("status") if response.status_code == 200 else "error"
        _print_result(
            "GET /api/tasks/{id}",
            response.status_code == 200,
            f"status={got_status}",
            ms,
        )

        if with_ws:
            statuses = {event.get("data", {}).get("status") for event in events if event.get("type") == "call_status"}
            _print_result("WebSocket call lifecycle events", bool(statuses), f"statuses={sorted(s for s in statuses if s)}")
            if statuses:
                print(f"  received_events={len(events)}")

        response, ms = await _timed_request("GET", client, f"/api/tasks/{task_id}/analysis")
        _print_result(
            "GET /api/tasks/{id}/analysis",
            response.status_code == 200,
            f"status={response.status_code}",
            ms,
        )

        response, ms = await _timed_request(
            "GET",
            client,
            "/api/telemetry/summary?component=http&limit=10",
        )
        _print_result(
            "GET /api/telemetry/summary",
            response.status_code == 200,
            f"events={response.json().get('event_count') if response.status_code == 200 else response.status_code}",
            ms,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NegotiateAI backend CLI smoke test")
    parser.add_argument("--base-url", default="http://127.0.0.1:3001")
    parser.add_argument("--phone", default="+15550001111")
    parser.add_argument("--no-websocket", action="store_true", help="skip websocket lifecycle assertions")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    await run_smoke(args.base_url, args.phone, with_ws=not args.no_websocket)


if __name__ == "__main__":
    asyncio.run(main())
