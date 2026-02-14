from __future__ import annotations

import time

import pytest


@pytest.mark.benchmark
def test_health_timing_summary_records_fast_requests(client) -> None:
    for _ in range(8):
        start = time.perf_counter()
        response = client.get("/health")
        assert response.status_code == 200
        assert (time.perf_counter() - start) * 1000.0 < 2000

    summary = client.get("/api/telemetry/summary?component=http&action=healthcheck")
    assert summary.status_code == 200
    body = summary.json()
    assert body["event_count"] >= 8
    durations = body.get("durations_ms", {})
    assert durations.get("count") >= 8
    assert durations.get("avg_ms") is not None
